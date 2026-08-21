/**
 * One definition of "score this text for this audience".
 *
 * The blend used to live inline in the `/api/analyze-technicality` handler.
 * Fix #6 adds a second caller — the compare endpoint scores the same text
 * against several audiences at once — and two hand-maintained copies of a
 * weighted renormalising blend would drift within a week. Everything about
 * how a score is produced now lives here; the routes only decide what to ask
 * for and how to shape the response.
 *
 * Extracted verbatim: the weights, the renormalisation, the status band and
 * the summary strings are unchanged, so `/api/analyze-technicality` returns
 * exactly what it returned before.
 */
import { analyzeTechnicality, STATUS_BAND } from './technicality.js';
import {
    fetchSentenceScores,
    getMlStatus,
    mlServiceUrl,
    modelScoringEnabled,
    noteMlReachable,
    type MlDegradation,
    type SentenceScores,
} from './mlHealth.js';
import type { AudienceLevel, TechnicalityResult } from '../types.js';

/**
 * Analysis provenance, returned alongside every technicality result.
 *
 * 'model'     the trained model contributed (plan Phase 2, not wired yet)
 * 'metrics'   heuristic + /analyze/metrics — the normal state today
 * 'heuristic' the Node heuristic alone, because the ML service did not answer
 */
export type AnalysisMode = 'model' | 'metrics' | 'heuristic';

export interface ScoreInput {
    transcriptText: string;
    audienceLevel: AudienceLevel;
    domain: string;
    // Explicitly `| undefined`: the project builds with
    // exactOptionalPropertyTypes, and these are forwarded straight to
    // analyzeTechnicality, which declares them the same way.
    words?: Array<{ text: string; startSec: number; endSec: number }> | undefined;
    requiredTimeSec?: number | null | undefined;
}

export interface ScoreOutput {
    result: TechnicalityResult;
    mode: AnalysisMode;
    degraded: MlDegradation[];
    /** The raw ML metrics payload, when the service answered. */
    metrics: { technicality_score: number } | null;
    /**
     * Which weights version produced the model signal, or null when the
     * model did not contribute — because MODEL_SCORING is off (the
     * default), or because the model is not serving.
     */
    modelVersion: string | null;
}

/**
 * Ask the ML service for its half of the blend.
 *
 * Returns null rather than throwing on every failure path: a missing signal is
 * a degradation to report, not a request to fail. The caller records it in
 * `degraded` so the user is told the score is less informed than usual.
 */
async function fetchMetrics(
    text: string,
    audienceLevel: AudienceLevel,
    domain: string
): Promise<{ technicality_score: number } | null> {
    try {
        const response = await fetch(`${mlServiceUrl()}/analyze/metrics`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, audience_level: audienceLevel, domain }),
        });

        if (!response.ok) {
            console.warn(`Metrics enrichment failed: HTTP ${response.status}`);
            noteMlReachable(false);
            return null;
        }

        noteMlReachable(true);
        return await response.json() as { technicality_score: number };
    } catch (err) {
        console.warn('Metrics enrichment failed, using base score:', err);
        noteMlReachable(false);
        return null;
    }
}

/**
 * Score `transcriptText` for one audience.
 *
 * The score is a weighted mean of whichever signals answered, renormalised by
 * the weights that actually contributed — so a missing signal lowers the
 * score's confidence rather than silently deflating the number.
 */
export async function scoreForAudience(input: ScoreInput): Promise<ScoreOutput> {
    const { transcriptText, audienceLevel, domain, words, requiredTimeSec } = input;

    const result = analyzeTechnicality({
        transcriptText,
        words,
        audienceLevel,
        requiredTimeSec,
        // Before Fix #2 this half of the blend ignored domain entirely.
        domain,
    });

    const signals: Array<{ score: number; weight: number }> = [
        { score: result.technicalLoadScore, weight: 0.5 },
    ];
    const degraded: MlDegradation[] = [];
    let mode: AnalysisMode = 'heuristic';

    // Third signal: the trained model, scored per sentence.
    //
    // Gated behind MODEL_SCORING and off by default. The endpoint is built
    // and exercised, but the model available today was trained on 95%
    // synthetic data and calls almost everything "clear", so giving it
    // weight would quietly degrade real scores. Turn it on only after the
    // gate passes on human labels — see mlHealth.ts.
    //
    // Requested concurrently with the metrics half: they are independent
    // calls to the same service, and the compare endpoint runs this whole
    // function once per audience level.
    const [metrics, sentenceScores] = await Promise.all([
        fetchMetrics(transcriptText, audienceLevel, domain),
        modelScoringEnabled()
            ? fetchSentenceScores(transcriptText, audienceLevel, domain)
            : Promise.resolve<SentenceScores | null>(null),
    ]);

    if (metrics) {
        // Metrics are more sensitive to modern jargon and complexity.
        signals.push({ score: metrics.technicality_score * 100, weight: 0.5 });
        mode = 'metrics';
        // The model is not wired into scoring yet (plan Phase 2). When it is,
        // push it here with the larger weight and set mode = 'model'; the
        // renormalisation below already handles a third signal.
        degraded.push(
            ...getMlStatus().degraded.filter(d => d !== 'ml_service_unreachable')
        );
    } else {
        // Domain is used *only* by the metrics half, so without it domain has
        // no effect on the score at all. That is the thing the banner has to
        // tell the user about.
        degraded.push('ml_service_unreachable');
    }

    if (sentenceScores) {
        // The model gets the largest weight once it has earned it; the
        // heuristic and metrics halves are renormalised around it below.
        signals.push({ score: sentenceScores.documentScore * 100, weight: 1.0 });
        mode = 'model';
    }

    const totalWeight = signals.reduce((sum, s) => sum + s.weight, 0);
    const blended = Math.round(
        signals.reduce((sum, s) => sum + s.score * s.weight, 0) / totalWeight
    );
    result.technicalLoadScore = Math.max(1, Math.min(100, blended));

    // Status and summary follow the score that was actually produced,
    // whichever signals went into it.
    const threshold = result.audienceThreshold;
    if (result.technicalLoadScore < threshold - STATUS_BAND) {
        result.status = 'below';
    } else if (result.technicalLoadScore > threshold + STATUS_BAND) {
        result.status = 'above';
    } else {
        result.status = 'near';
    }

    if (result.status === 'above') {
        result.summary = 'Your content is significantly more technical than your target audience level. Jargon density is high.';
    } else if (result.status === 'below') {
        result.summary = "Your content is very accessible. Ensure you aren't over-simplifying key concepts if the audience expects depth.";
    } else {
        result.summary = 'You are generally on target, but watch out for specific dense clusters identified below.';
    }

    if (metrics) (result as any).metrics = metrics;

    return {
        result,
        mode,
        degraded,
        metrics,
        modelVersion: sentenceScores?.modelVersion ?? null,
    };
}
