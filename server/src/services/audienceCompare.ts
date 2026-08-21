/**
 * Fix #6 — score one script against several audiences at once.
 *
 * The product claim is "the same script that lands with engineers gets
 * rewritten before you take it to the board". Until now the audience level
 * lived on the project, so comparing meant editing the project and losing the
 * previous result. Analysis is already stateless with respect to audience —
 * `audienceLevel` is just a parameter — so this is mostly a matter of asking
 * the same question several times and diffing the answers.
 *
 * ## What actually differs between audiences today, and what does not
 *
 * This matters, because a compare view that implies more audience-sensitivity
 * than the scorer has would be lying, and the first person to notice would be
 * the owner.
 *
 * **Differs:**
 *  - `audienceThreshold` — the ladder at technicality.ts (20/40/60/80).
 *  - `technicalLoadScore` — but only through the ML half, which scales by
 *    `1 - level/4` in metrics.py. With the ML service down, the score is
 *    identical at every level and only the threshold moves.
 *  - `hotspots[].replacements` — `substitutionsFor()` is level-aware and
 *    refuses to hand an expert audience a novice's wording (Fix #5 Stage A).
 *    This is the one genuinely per-sentence, per-audience signal available
 *    without the model.
 *
 * **Does not differ:** which sentences are flagged. Hotspot selection reads
 * term counts and explanation markers, never the audience level. So the
 * "these sentences work for engineers but lose the board" list is derived
 * below from *required wording*, not from the flag set — that is the honest
 * version of it today.
 *
 * When Phase 2 turns on and `predict()` conditions on `AUDIENCE=`, the score
 * itself becomes audience-sensitive per sentence and the flag set will move
 * too. This endpoint is the intended smoke test for that: if the model is
 * doing real work, these columns diverge more than they do now.
 */
import { scoreForAudience, type AnalysisMode } from './audienceScoring.js';
import type { AudienceLevel, TechnicalityResult } from '../types.js';
import type { MlDegradation } from './mlHealth.js';

/** 0 = novice … 3 = expert. Ordered, because the UI reads left to right. */
export const ALL_AUDIENCE_LEVELS: AudienceLevel[] = [0, 1, 2, 3];

export const AUDIENCE_LABELS: Record<AudienceLevel, string> = {
    0: 'Novice',
    1: 'Familiar',
    2: 'Strong',
    3: 'Expert',
};

export interface CompareInput {
    transcriptText: string;
    levels: AudienceLevel[];
    domain: string;
    words?: Array<{ text: string; startSec: number; endSec: number }> | undefined;
    requiredTimeSec?: number | null | undefined;
}

/**
 * A sentence whose required plain-language wording is not the same for every
 * audience being compared. This is the list the product promises: say it this
 * way for the board, leave it alone for the engineers.
 */
export interface DivergentSentence {
    sentence: string;
    /** Technical terms detected in the sentence, as they were normalised. */
    terms: string[];
    /**
     * Level (as a string key, so it survives JSON) → the swaps that audience
     * needs. An empty array means this sentence is fine as written for them.
     */
    byLevel: Record<string, Array<{ term: string; plain: string }>>;
    /** Levels needing at least one swap — the audiences this sentence loses. */
    losesLevels: AudienceLevel[];
    /** Levels needing none — the audiences it already lands with. */
    landsLevels: AudienceLevel[];
}

export interface CompareOutput {
    /** Level (string key) → the full result computed for that audience. */
    results: Record<string, TechnicalityResult>;
    divergence: {
        sentences: DivergentSentence[];
        /** True when every compared audience gets the same status verdict. */
        statusAgrees: boolean;
        /**
         * True when the scores are identical across levels — which is what
         * happens with the ML service down, since the Node half is
         * audience-independent. Worth saying out loud rather than letting the
         * user conclude the audience setting does nothing.
         */
        scoresIdentical: boolean;
    };
    analysis: {
        mode: AnalysisMode;
        degraded: MlDegradation[];
        levels: AudienceLevel[];
        domain: string;
        modelVersion: string | null;
    };
}

/**
 * Normalise a requested level list.
 *
 * Throws on garbage rather than quietly substituting defaults: unlike a single
 * analysis, where defaulting to "Familiar" beats refusing the request (Fix
 * #4), a comparison against levels the caller did not ask for is meaningless.
 */
export function parseLevels(raw: unknown): AudienceLevel[] {
    if (!Array.isArray(raw)) {
        throw new Error('levels must be an array of audience levels (0-3)');
    }

    const seen = new Set<number>();
    for (const entry of raw) {
        if (typeof entry !== 'number' || !Number.isInteger(entry) || entry < 0 || entry > 3) {
            throw new Error(`Invalid audience level: ${JSON.stringify(entry)}. Expected integers 0-3.`);
        }
        seen.add(entry);
    }

    const levels = [...seen].sort((a, b) => a - b) as AudienceLevel[];
    if (levels.length < 2) {
        throw new Error('Comparing needs at least two distinct audience levels');
    }
    return levels;
}

/**
 * Which audiences need a plain-language swap for each flagged sentence.
 *
 * Built from the per-level results rather than recomputed, so it can never
 * disagree with the hotspots the same response is showing.
 */
function buildDivergence(
    levels: AudienceLevel[],
    results: Record<string, TechnicalityResult>
): DivergentSentence[] {
    // Hotspot selection is audience-independent (see the note at the top), so
    // any level's list has the same sentences. Using the first keeps the order
    // stable — they are sorted by severity.
    const reference = results[String(levels[0])];
    if (!reference) return [];

    const divergent: DivergentSentence[] = [];

    for (const hotspot of reference.hotspots) {
        const byLevel: Record<string, Array<{ term: string; plain: string }>> = {};
        const losesLevels: AudienceLevel[] = [];
        const landsLevels: AudienceLevel[] = [];

        for (const level of levels) {
            const levelResult = results[String(level)];
            const match = levelResult?.hotspots.find(h => h.sentence === hotspot.sentence);
            const swaps = match?.replacements ?? [];
            byLevel[String(level)] = swaps;
            (swaps.length > 0 ? losesLevels : landsLevels).push(level);
        }

        // Only sentences that treat the compared audiences differently belong
        // in a diff. A sentence every audience needs rewritten, or none does,
        // is already in the ordinary hotspot list.
        if (losesLevels.length > 0 && landsLevels.length > 0) {
            divergent.push({
                sentence: hotspot.sentence,
                terms: hotspot.terms,
                byLevel,
                losesLevels,
                landsLevels,
            });
        }
    }

    return divergent;
}

/**
 * Score `transcriptText` against every requested audience.
 *
 * The levels are scored concurrently. Each one is an independent call to the
 * ML service — the audience factor is applied inside metrics.py before the
 * score is rounded to two decimals, so deriving the other levels from one call
 * would be arithmetic on an already-rounded number. Four small local requests
 * cost less than an explanation of why the numbers are half a point off.
 */
export async function compareAudiences(input: CompareInput): Promise<CompareOutput> {
    const { transcriptText, levels, domain, words, requiredTimeSec } = input;

    const scored = await Promise.all(
        levels.map(async level => ({
            level,
            ...(await scoreForAudience({
                transcriptText,
                audienceLevel: level,
                domain,
                words,
                requiredTimeSec,
            })),
        }))
    );

    const results: Record<string, TechnicalityResult> = {};
    const degraded = new Set<MlDegradation>();
    // Every column scored the same text against the same weights, so the
    // versions agree; the first non-null is the answer. Stays null while
    // MODEL_SCORING is off, which is the default.
    let modelVersion: string | null = null;
    // The comparison is only as informed as its least informed column: calling
    // it 'metrics' when one level fell back to the heuristic would put two
    // incomparable numbers side by side under one label.
    let mode: AnalysisMode = 'metrics';

    for (const entry of scored) {
        results[String(entry.level)] = entry.result;
        entry.degraded.forEach(d => degraded.add(d));
        if (entry.mode === 'heuristic') mode = 'heuristic';
        if (entry.mode === 'model' && mode !== 'heuristic') mode = 'model';
        modelVersion ??= entry.modelVersion;
    }

    const statuses = new Set(scored.map(s => s.result.status));
    const scores = new Set(scored.map(s => s.result.technicalLoadScore));

    return {
        results,
        divergence: {
            sentences: buildDivergence(levels, results),
            statusAgrees: statuses.size === 1,
            scoresIdentical: scores.size === 1,
        },
        analysis: {
            mode,
            degraded: [...degraded],
            levels,
            domain,
            modelVersion,
        },
    };
}
