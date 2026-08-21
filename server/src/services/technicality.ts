import type { TechnicalityResult, TechnicalityHotspot, AudienceLevel } from '../types.js';
import { termsForDomain, substitutionsFor } from './jargon.js';

interface AnalyzeInput {
    transcriptText: string;
    audienceLevel?: AudienceLevel;
    /**
     * Selects the jargon vocabulary. Omitted or 'general'/'other' means every
     * domain's terms at once. Before Fix #2 this parameter did not exist and
     * the seed glossary was always the tech list.
     */
    domain?: string;

    /**
     * Accepted and ignored. Callers already send both, and they are what a
     * pacing check would need, so they are kept on the interface rather than
     * ripped out of the request path. Nothing in this file reads them today —
     * do not assume timing affects the score.
     */
    words?: Array<{ text: string; startSec: number; endSec: number }> | undefined;
    requiredTimeSec?: number | null | undefined;
}

/**
 * SCORING — the constants that decide what gets flagged.
 *
 * Measured 2026-08-19 on 607 labelled rows (ml/tune_cv.py, 5-fold CV,
 * out-of-fold). With the domain-aware glossary (Fix #2) and the ambiguous
 * terms removed, what ships below scores accuracy 0.845, precision 0.933,
 * recall 0.488, F1 0.641 once blended with /analyze/metrics in
 * server/src/index.ts.
 *
 * Read that as: when it flags a sentence it is right ~93% of the time, and it
 * still stays quiet about half the sentences a human called confusing.
 *
 * For reference, before Fix #2 the same measurement gave accuracy 0.799,
 * precision 0.847, recall 0.355, F1 0.500 — the domain vocabularies bought
 * more than any threshold change ever did.
 *
 * Refitting the ladder was measured twice, before and after Fix #2, and does
 * not beat it either time; see ml/THRESHOLD_RETUNE_FINDINGS.md and
 * ml/tune_operating_points.py.
 *
 * Before changing any number here, re-run ml/tune_cv.py. These are not
 * arbitrary any more, and the obvious "improvements" have been tried.
 */
const SCORING = {
    densityWeight: 300,        // technical-term density -> points (10% -> 30)
    clumpWeight: 4,            // per term in the longest consecutive run
    criticalClumpSize: 5,      // runs longer than this take an extra penalty
    criticalClumpPenalty: 15,
    explainedDiscount: 0.3,    // max reduction when every term is explained
    statusBand: 15,            // +/- around the threshold that counts as "near"
} as const;

/**
 * Exported because index.ts re-derives status after blending in the metrics
 * signal, and the two must agree. One definition, two readers.
 */
export const STATUS_BAND = SCORING.statusBand;

/**
 * Score above which content is "above" the audience, per audience level.
 * 0 = novice, 3 = expert.
 *
 * NOTE: /analyze/metrics already scales its half of the blend by
 * (1 - level/4) in ml/app/metrics.py:391, so audience is accounted for twice
 * in the blended path — once in that factor and once here. The Node score
 * below is audience-independent, so this ladder is the only adjustment it
 * gets. Removing the double discount and refitting was measured and did not
 * beat this; see the SCORING note above.
 */
const AUDIENCE_THRESHOLDS: Record<number, number> = {
    0: 20, // Novice (VERY strict)
    1: 40, // Familiar
    2: 60, // Strong
    3: 80, // Expert
};

/** Used when audienceLevel is absent or out of range — same as level 1. */
const DEFAULT_THRESHOLD = 40;


export function analyzeTechnicality(input: AnalyzeInput): TechnicalityResult {
    const { transcriptText, audienceLevel = 1, domain } = input;

    // Per call, not module level: two projects in one process can target
    // different domains.
    const glossary = termsForDomain(domain);

    // --- A. Segmentation ---
    // Improved segmentation: handle abbreviations (e.g., e.g., i.e.) roughly, but split mainly by .!?
    // Also handle trailing punctuations in tokens
    const sentences = transcriptText.match(/[^.!?\n]+[.!?\n]+/g) || [transcriptText];

    // Improved Tokenization:
    // 1. Lowercase for comparison (but keep original for stats?) - better to normalize map
    // 2. Strip standard punctuation
    // 3. Keep hyphens inside words (CI/CD, chain-of-thought)
    const normalizeToken = (t: string) => t.toLowerCase().replace(/^['"(\[]+|['")\]?!.,]+$/g, '');

    // --- B. Technical Term Detection ---
    const isTechnical = (token: string, originalToken: string): boolean => {
        const clean = normalizeToken(token);
        if (clean.length < 2) return false;

        // 1. Check Seed Glossary (case-insensitive)
        if (glossary.has(clean)) return true;

        // 2. ALL CAPS acronyms (length >= 2) -> API, LLM, ANN, etc.
        // Must be originally upper case, and contain no lowercase letters
        if (/^[A-Z0-9]+s?$/.test(originalToken.replace(/[^a-zA-Z0-9]/g, '')) && !/[a-z]/.test(originalToken)) {
            return true;
        }

        // 3. Mixed Case / CamelCase (must have meaningful separation)
        // e.g. OpenTelemetry, TensorFlow (has upper in middle)
        // Heuristic: starts with upper or lower, has upper in middle
        if (/[a-z]+[A-Z]/.test(originalToken) && /^[a-zA-Z0-9]+$/.test(clean)) return true;

        // 4. Letters + Digits (e.g. 5nm, gpt4, k8s)
        if (/[a-z]/.test(clean) && /[0-9]/.test(clean)) return true;

        return false;
    };

    let globalTechCount = 0;
    const globalTechTerms = new Set<string>();

    const analyzedSentences = sentences.map(sent => {
        const tokens = sent.trim().split(/\s+/);
        const terms = tokens.filter(t => isTechnical(normalizeToken(t), t));
        const cleanTerms = terms.map(normalizeToken);

        terms.forEach(t => {
            globalTechCount++;
            globalTechTerms.add(normalizeToken(t));
        });

        return { sent, tokens, terms, cleanTerms };
    });

    const wordCount = analyzedSentences.reduce((acc, s) => acc + s.tokens.length, 0) || 1;

    // --- C. Clumping Detection (Sliding Window on Full Text) ---
    // Window 15 words, Step 3
    const allTokens = analyzedSentences.flatMap(s => s.tokens);
    const WINDOW_SIZE = 15;
    const STEP = 5; // User suggested 3-5, let's go 5 for efficiency
    let maxClump = 0;

    for (let i = 0; i < allTokens.length; i += STEP) {
        const windowTokens = allTokens.slice(i, i + WINDOW_SIZE);
        const windowTech = windowTokens.filter(t => isTechnical(normalizeToken(t), t)).length;
        if (windowTech > maxClump) maxClump = windowTech;
    }

    // --- D. Explanation Coverage ---
    // Explanations: look for markers in current, next, or previous sentence
    const explanationMarkers = [
        ' is ', ' means ', ' refers to ', 'by ', ' mean ',
        'in other words', 'basically', 'for example', 'like', 'imagine',
        'called ', 'known as ', 'defined as', 'stands for', 'concept of'
    ];

    let explainedCount = 0;

    const sentenceIsExplanatory = (idx: number) => {
        if (idx < 0 || idx >= analyzedSentences.length || !analyzedSentences[idx]) return false;
        const txt = analyzedSentences[idx].sent.toLowerCase();
        return explanationMarkers.some(m => txt.includes(m)) || txt.includes('(');
    };

    analyzedSentences.forEach((s, idx) => {
        // If this sentence, prev, or next has explanation markers, we assume TERMS within THIS sentence are potentially explained contextually.
        // This is a heuristic. A robust one would check proximity.
        const hasContext = sentenceIsExplanatory(idx) || sentenceIsExplanatory(idx - 1) || sentenceIsExplanatory(idx + 1);

        if (hasContext) {
            explainedCount += s.terms.length;
        }
    });

    const explainedRate = globalTechCount > 0 ? explainedCount / globalTechCount : 1;

    // --- E. Scoring ---
    // See SCORING at the top of this file for what these constants are and
    // what is known about whether they are any good.

    const density = globalTechCount / wordCount; // e.g. 0.05

    let rawScore = density * SCORING.densityWeight;
    rawScore += maxClump * SCORING.clumpWeight;
    if (maxClump > SCORING.criticalClumpSize) rawScore += SCORING.criticalClumpPenalty;
    rawScore = rawScore * (1 - explainedRate * SCORING.explainedDiscount);

    const threshold = AUDIENCE_THRESHOLDS[audienceLevel] ?? DEFAULT_THRESHOLD;

    const technicalLoadScore = Math.max(1, Math.min(100, Math.round(rawScore)));

    // Ensure "Too Simple" is rare: if score < 10 and threshold > 30
    // Actually we adjust status labeling logic instead of score here.

    // --- F. Hotspots ---
    const hotspots: TechnicalityHotspot[] = [];

    analyzedSentences.forEach((s) => {
        // Hotspot logic:
        // 1. High term count (> 3)
        // 2. Or > 2 terms and NOT explained
        // 3. Or really long sentence with > 1 term

        const termCount = s.terms.length;
        if (termCount <= 1) return;

        const reasons: string[] = [];
        const suggestions: string[] = [];

        if (termCount >= 4) {
            reasons.push("Dense jargon cluster");
            suggestions.push("Split into multiple sentences");
        } else if (termCount >= 2) {
            // Check if dense relative to length
            const sWords = s.tokens.length;
            if (sWords < 15) {
                reasons.push("High density in short sentence");
                suggestions.push("Define terms immediately");
            }
        }

        // Check for specific terms that are "hard" and not in a glossary context
        // This effectively repeats the "global explained" check but locally
        if (termCount > 0 && !sentenceIsExplanatory(analyzedSentences.indexOf(s)) && !sentenceIsExplanatory(analyzedSentences.indexOf(s) + 1)) {
            reasons.push("Terms likely undefined");
            suggestions.push("Add an explanation or easier synonym");
        }

        if (reasons.length > 0) {
            // Fix #5 Stage A: where we know a plain-language equivalent, say
            // what to use instead. A concrete replacement beats "add an
            // explanation" — that was advice, not a fix. Generic suggestions
            // stay as the fallback for terms with no entry.
            const replacements = substitutionsFor(s.cleanTerms, audienceLevel);
            const concrete = replacements.map(
                r => `Replace "${r.term}" with "${r.plain}"`
            );

            hotspots.push({
                sentence: s.sent.trim(),
                terms: s.cleanTerms,
                reasons: [...new Set(reasons)], // dedup
                // Concrete first: it is the one worth reading.
                suggestions: [...new Set([...concrete, ...suggestions])],
                replacements
            });
        }
    });

    // Sort hotspots by severity (term count)
    hotspots.sort((a, b) => b.terms.length - a.terms.length);
    const topHotspots = hotspots.slice(0, 5); // Return top 5

    // --- G. Status Determination ---
    let status: "below" | "near" | "above" = "near";
    if (technicalLoadScore < threshold - SCORING.statusBand) status = "below";
    else if (technicalLoadScore > threshold + SCORING.statusBand) status = "above";

    // Summary Text
    let summary = "";
    if (status === "above") {
        summary = "Your content is significantly more technical than your target audience level. Jargon density is high.";
    } else if (status === "near") {
        summary = "You are generally on target, but watch out for specific dense clusters identified below.";
    } else {
        summary = "Your content is very accessible. Ensure you aren't over-simplifying key concepts if the audience expects depth.";
    }

    return {
        technicalLoadScore,
        audienceThreshold: threshold,
        status,
        summary,
        hotspots: topHotspots,
        termStats: {
            totalTerms: globalTechCount,
            uniqueTerms: globalTechTerms.size,
            maxClump,
            explainedRate
        }
    };
}
