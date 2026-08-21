import React, { useCallback, useMemo, useState } from 'react';
import { ArrowRight, Columns2, Info, Loader2, Users } from 'lucide-react';
import { compareAudiences } from '../../api';
import type { AudienceComparison } from '../../api';
import { AnalysisModeBanner } from '../AnalysisModeBanner';
import type { AudienceLevel } from '../../types/Project';

/**
 * Fix #6 — the same script, graded against two audiences at once.
 *
 * The headline promise is "the script that lands with engineers gets rewritten
 * before you take it to the board". Until now the audience level lived on the
 * project, so seeing the difference meant editing the project and losing the
 * previous result. Analysis is stateless with respect to audience, so this is
 * almost entirely a matter of asking twice and showing both answers.
 *
 * ## What this is careful not to overclaim
 *
 * With the model switched off (plan Phase 2), the parts of the score that
 * respond to audience are the threshold ladder and the ML half's
 * `1 - level/4` factor. Which *sentences* get flagged does not move at all —
 * hotspot selection reads term counts, never the audience. So the per-sentence
 * column below is built from the plain-language wording each audience needs,
 * which genuinely does differ, and the component says plainly when the scores
 * came out identical rather than letting that read as "audience does nothing".
 */

const AUDIENCE_LABELS: Record<AudienceLevel, string> = {
    0: 'Novice',
    1: 'Familiar',
    2: 'Strong',
    3: 'Expert',
};

const ALL_LEVELS: AudienceLevel[] = [0, 1, 2, 3];

const STATUS_STYLES: Record<string, { chip: string; label: string }> = {
    below: { chip: 'text-blue-700 bg-blue-50 border-blue-200', label: 'Accessible' },
    near: { chip: 'text-green-700 bg-green-50 border-green-200', label: 'On target' },
    above: { chip: 'text-red-700 bg-red-50 border-red-200', label: 'Too technical' },
};

interface AudienceCompareProps {
    script: string;
    domain?: string;
    /** Pre-selects the project's own audience as one side of the comparison. */
    audienceLevel?: AudienceLevel;
}

export const AudienceCompare: React.FC<AudienceCompareProps> = ({
    script,
    domain = 'general',
    audienceLevel,
}) => {
    // Default to the widest contrast — novice against expert — unless the
    // project has an audience, in which case one side is already decided and
    // the interesting question is how it reads to the furthest audience from it.
    const [selected, setSelected] = useState<AudienceLevel[]>(() => {
        if (audienceLevel === undefined) return [0, 3];
        return audienceLevel <= 1 ? [audienceLevel, 3] : [0, audienceLevel];
    });
    const [comparison, setComparison] = useState<AudienceComparison | null>(null);
    const [isComparing, setIsComparing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const trimmed = script.trim();
    const canCompare = trimmed.length > 0 && selected.length >= 2 && !isComparing;

    const toggleLevel = useCallback((level: AudienceLevel) => {
        setSelected(prev => {
            if (prev.includes(level)) {
                // Never let the selection fall below a comparison. Silently
                // refusing beats an error message for a rule the UI can
                // simply enforce.
                if (prev.length <= 2) return prev;
                return prev.filter(l => l !== level);
            }
            return [...prev, level].sort((a, b) => a - b);
        });
    }, []);

    const runComparison = useCallback(async () => {
        if (!trimmed || selected.length < 2) return;

        setIsComparing(true);
        setError(null);
        try {
            const result = await compareAudiences({
                transcriptText: trimmed,
                levels: selected,
                domain,
            });
            setComparison(result);
        } catch (err) {
            console.error('Audience comparison failed:', err);
            setError(err instanceof Error ? err.message : 'Comparison failed.');
            // Stale results would describe a different set of audiences.
            setComparison(null);
        } finally {
            setIsComparing(false);
        }
    }, [trimmed, selected, domain]);

    const shownLevels = comparison?.analysis.levels ?? [];

    // The one line worth reading first: how many sentences the audiences
    // actually disagree about.
    const headline = useMemo(() => {
        if (!comparison) return null;
        const { sentences } = comparison.divergence;
        if (sentences.length === 0) return null;

        const strictest = Math.min(...sentences.flatMap(s => s.losesLevels));
        const easiest = Math.max(...sentences.flatMap(s => s.landsLevels));
        return {
            count: sentences.length,
            strictest: AUDIENCE_LABELS[strictest as AudienceLevel],
            easiest: AUDIENCE_LABELS[easiest as AudienceLevel],
        };
    }, [comparison]);

    return (
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/70">
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide flex items-center gap-2">
                    <Columns2 className="w-4 h-4 text-brand-600" />
                    Compare Audiences
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                    Grade this script against two or more audiences at once, without changing your project.
                </p>
            </div>

            <div className="p-4 space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide mr-1">
                        Audiences
                    </span>
                    {ALL_LEVELS.map(level => {
                        const active = selected.includes(level);
                        return (
                            <button
                                key={level}
                                type="button"
                                onClick={() => toggleLevel(level)}
                                aria-pressed={active}
                                className={`rounded-full px-3 py-1 text-xs font-semibold border transition-colors ${
                                    active
                                        ? 'bg-brand-600 text-white border-brand-600'
                                        : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                                }`}
                            >
                                {AUDIENCE_LABELS[level]}
                            </button>
                        );
                    })}
                    <button
                        type="button"
                        onClick={runComparison}
                        disabled={!canCompare}
                        className="ml-auto inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {isComparing
                            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Comparing…</>
                            : <><Users className="w-3.5 h-3.5" /> Compare</>}
                    </button>
                </div>

                {!trimmed && (
                    <p className="text-sm text-slate-400">Write something first, then compare.</p>
                )}

                {error && (
                    <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                        {error}
                    </p>
                )}

                {comparison && (
                    <>
                        <AnalysisModeBanner
                            analysis={{
                                mode: comparison.analysis.mode,
                                degraded: comparison.analysis.degraded,
                                // The banner only reads mode/degraded/domain;
                                // a comparison has no single audience level, and
                                // every column names its own below.
                                audienceLevel: shownLevels[0] ?? 1,
                                audienceLevelSource: 'project',
                                domain: comparison.analysis.domain,
                                modelVersion: comparison.analysis.modelVersion,
                            }}
                        />

                        <div
                            className="grid gap-3"
                            style={{ gridTemplateColumns: `repeat(${Math.max(shownLevels.length, 1)}, minmax(0, 1fr))` }}
                        >
                            {shownLevels.map(level => {
                                const result = comparison.results[String(level)];
                                if (!result) return null;
                                const style = STATUS_STYLES[result.status] ?? STATUS_STYLES.near!;

                                return (
                                    <div
                                        key={level}
                                        className="rounded-xl border border-slate-200 p-3 min-w-0"
                                    >
                                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                            {AUDIENCE_LABELS[level]}
                                        </p>
                                        <p className="mt-1 text-3xl font-bold text-slate-900 tabular-nums">
                                            {result.technicalLoadScore}
                                        </p>
                                        <p className="text-xs text-slate-500">
                                            budget {result.audienceThreshold}
                                        </p>
                                        <span
                                            className={`mt-2 inline-block rounded-md border px-2 py-0.5 text-xs font-semibold ${style.chip}`}
                                        >
                                            {style.label}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>

                        {/*
                          * Said explicitly, because the alternative is the user
                          * concluding the audience setting is decorative. It is
                          * the expected reading when the ML service is down: the
                          * Node half of the blend does not vary by audience, so
                          * only the budget each audience allows moves.
                          */}
                        {comparison.divergence.scoresIdentical && (
                            <p className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                                <span>
                                    The score is the same for every audience here — what changes is
                                    the budget each one allows. The audience-sensitive half of the
                                    score comes from the analysis service, which did not contribute
                                    to this run.
                                </span>
                            </p>
                        )}

                        <div>
                            <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">
                                What you&apos;d have to change
                            </h4>

                            {headline ? (
                                <p className="mt-1 text-sm text-slate-700">
                                    <strong className="font-semibold">{headline.count}</strong>{' '}
                                    {headline.count === 1 ? 'sentence works' : 'sentences work'} for a{' '}
                                    <strong className="font-semibold">{headline.easiest}</strong> audience but
                                    needs rewording for a{' '}
                                    <strong className="font-semibold">{headline.strictest}</strong> one.
                                </p>
                            ) : (
                                <p className="mt-1 text-sm text-slate-500">
                                    {comparison.divergence.statusAgrees
                                        ? 'These audiences read this script the same way — no sentence needs different wording for one than the other.'
                                        : 'The overall verdict differs, but no individual sentence has a known plain-language alternative that only one of these audiences needs.'}
                                </p>
                            )}

                            <ul className="mt-3 space-y-3">
                                {comparison.divergence.sentences.map((entry, index) => (
                                    <li
                                        key={`${entry.sentence}-${index}`}
                                        className="rounded-xl border border-slate-200 p-3"
                                    >
                                        <p className="text-sm text-slate-800">{entry.sentence}</p>
                                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
                                            {shownLevels.map(level => {
                                                const swaps = entry.byLevel[String(level)] ?? [];
                                                return (
                                                    <div key={level} className="min-w-0">
                                                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                                                            {AUDIENCE_LABELS[level]}
                                                        </p>
                                                        {swaps.length === 0 ? (
                                                            <p className="text-xs text-green-700">Fine as written</p>
                                                        ) : (
                                                            <ul className="text-xs text-slate-700 space-y-0.5">
                                                                {swaps.map(swap => (
                                                                    <li key={swap.term} className="flex items-center gap-1">
                                                                        <span className="font-medium">{swap.term}</span>
                                                                        <ArrowRight className="h-3 w-3 shrink-0 text-slate-400" aria-hidden="true" />
                                                                        <span>{swap.plain}</span>
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </>
                )}
            </div>
        </section>
    );
};
