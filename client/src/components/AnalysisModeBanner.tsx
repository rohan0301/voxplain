import React from 'react';
import { CloudOff, Users } from 'lucide-react';
import type { AnalysisProvenance } from '../api';

/**
 * Tells the user when a score was computed without the full analyzer.
 *
 * The ML service is a separate process, and when it is unreachable the score
 * still comes back looking completely normal — computed from a different set
 * of signals, on a different scale, with the chosen domain having had no
 * effect at all. Silently showing that as a regular result is the bug this
 * component exists to close.
 *
 * Deliberately silent in the healthy state. A banner the user sees on every
 * single analysis is a banner they stop reading.
 */

interface AnalysisModeBannerProps {
    analysis?: AnalysisProvenance | null;
    className?: string;
}

export const AnalysisModeBanner: React.FC<AnalysisModeBannerProps> = ({ analysis, className }) => {
    if (!analysis) return null;

    const offline = analysis.degraded.includes('ml_service_unreachable');

    // 'model_disabled' is the expected state until the model is wired into
    // scoring, so it is not worth interrupting anyone over. Once Phase 2
    // lands and the model is meant to be serving, promote it.
    if (!offline) return null;

    return (
        <div
            className={`flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm ${className ?? ''}`}
            role="status"
        >
            <CloudOff className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
            <div className="space-y-1">
                <p className="font-medium text-amber-900">
                    Scored with fallback heuristics
                </p>
                <p className="text-amber-800">
                    The analysis service is unavailable, so domain-specific terms and
                    audience modeling aren&apos;t being applied
                    {analysis.domain && analysis.domain !== 'general'
                        ? <> — your <span className="font-medium">{analysis.domain}</span> vocabulary is not affecting this score</>
                        : null}
                    . The score below is still meaningful, but it is less informed than usual.
                </p>
            </div>
        </div>
    );
};

/**
 * Names the audience a score was computed for.
 *
 * Every technicality score is relative to an audience level, and a bare number
 * invites the reader to supply their own. Worse, the level silently defaults
 * to "Familiar" when no project is selected — so without this the product
 * grades against an audience the user never chose and never says so.
 *
 * When the level was defaulted, this says so and offers to fix it.
 */
const AUDIENCE_LABELS: Record<number, string> = {
    0: 'Novice',
    1: 'Familiar',
    2: 'Strong',
    3: 'Expert',
};

interface AudienceScopeNoteProps {
    analysis?: AnalysisProvenance | null;
    /** Opens the audience picker. Omit and the prompt becomes plain text. */
    onSetAudience?: () => void;
    className?: string;
}

export const AudienceScopeNote: React.FC<AudienceScopeNoteProps> = ({
    analysis,
    onSetAudience,
    className,
}) => {
    if (!analysis) return null;

    const label = AUDIENCE_LABELS[analysis.audienceLevel] ?? AUDIENCE_LABELS[1];
    const defaulted = analysis.audienceLevelSource === 'default';

    return (
        <p className={`flex flex-wrap items-center gap-1 text-sm ${defaulted ? 'text-amber-700' : 'text-slate-500'} ${className ?? ''}`}>
            <Users className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
                Scored for a <strong className="font-semibold">{label}</strong> audience
                {analysis.domain && analysis.domain !== 'general'
                    ? <> in <strong className="font-semibold">{analysis.domain}</strong></>
                    : null}
            </span>
            {defaulted && (
                <span>
                    — you haven&apos;t set one, so this is a default.{' '}
                    {onSetAudience ? (
                        <button
                            type="button"
                            onClick={onSetAudience}
                            className="font-semibold text-brand-600 underline underline-offset-2 hover:text-brand-700"
                        >
                            Set your audience
                        </button>
                    ) : (
                        <span className="font-semibold">Set your audience</span>
                    )}{' '}
                    for accurate results.
                </span>
            )}
        </p>
    );
};
