import { useCallback, useState } from 'react';
import { Wand2 } from 'lucide-react';
import { inferAudienceProfile } from '../api';
import type { InferredAudienceProfile } from '../api';
import type { AudienceLevel, ProjectDomain } from '../types/Project';

/**
 * Reads the free-text audience description and suggests a level and domain.
 *
 * The description field used to be decoration: three files collected and
 * persisted it and no analyzer ever read it, so "board of directors,
 * non-technical" changed nothing about the score.
 *
 * The suggestion is never applied automatically. Silently rewriting the user's
 * selections from a keyword match would recreate the problem Fix #4 just
 * closed — a score computed against an audience nobody chose. It suggests, the
 * user applies.
 */

/**
 * The inference is free text in, keywords out; it can only ever return one of
 * the product's own domains, but nothing in the type system says so. Narrow it
 * here rather than casting at each call site.
 */
const PROJECT_DOMAINS: ProjectDomain[] = ['general', 'tech', 'finance', 'healthcare', 'other'];

const asProjectDomain = (domain: string | null): ProjectDomain | null =>
    domain !== null && (PROJECT_DOMAINS as string[]).includes(domain)
        ? domain as ProjectDomain
        : null;

const LEVEL_LABELS: Record<number, string> = {
    0: 'Novice',
    1: 'Some Familiarity',
    2: 'Strong Knowledge',
    3: 'Expert / Peer',
};

const DOMAIN_LABELS: Record<string, string> = {
    general: 'General',
    tech: 'Tech / Engineering',
    finance: 'Finance',
    healthcare: 'Healthcare',
    other: 'Other',
};

export function useAudienceInference() {
    const [inferred, setInferred] = useState<InferredAudienceProfile | null>(null);
    const [isInferring, setIsInferring] = useState(false);

    const infer = useCallback(async (description: string) => {
        if (!description.trim()) {
            setInferred(null);
            return;
        }
        setIsInferring(true);
        try {
            const profile = await inferAudienceProfile(description);
            // Nothing recognised is not worth a line of UI.
            setInferred(profile.audienceLevel === null && profile.domain === null
                ? null
                : profile);
        } finally {
            setIsInferring(false);
        }
    }, []);

    const clear = useCallback(() => setInferred(null), []);

    return { inferred, isInferring, infer, clear };
}

interface AudienceInferenceNoteProps {
    inferred: InferredAudienceProfile | null;
    isInferring: boolean;
    /** Current form values, so an already-matching suggestion stays quiet. */
    currentLevel: AudienceLevel;
    currentDomain: string;
    onApply: (level: AudienceLevel | null, domain: ProjectDomain | null) => void;
    onDismiss: () => void;
}

export const AudienceInferenceNote = ({
    inferred,
    isInferring,
    currentLevel,
    currentDomain,
    onApply,
    onDismiss,
}: AudienceInferenceNoteProps) => {
    if (isInferring) {
        return <p className="text-xs text-slate-400">Reading your description…</p>;
    }
    if (!inferred) return null;

    const levelDiffers = inferred.audienceLevel !== null && inferred.audienceLevel !== currentLevel;
    const domainDiffers = inferred.domain !== null && inferred.domain !== currentDomain;

    // Already what they picked — say nothing rather than nag.
    if (!levelDiffers && !domainDiffers) return null;

    return (
        <div className="rounded-lg border border-brand-100 bg-brand-50/60 px-3 py-2 space-y-1">
            <p className="text-xs text-slate-700 flex flex-wrap items-center gap-1">
                <Wand2 className="h-3 w-3 shrink-0 text-brand-600" aria-hidden="true" />
                <span>
                    From your description:{' '}
                    {inferred.audienceLevel !== null && (
                        <strong className="font-semibold">
                            {LEVEL_LABELS[inferred.audienceLevel]}
                        </strong>
                    )}
                    {inferred.audienceLevel !== null && inferred.domain ? ' · ' : null}
                    {inferred.domain && (
                        <strong className="font-semibold">
                            {DOMAIN_LABELS[inferred.domain] ?? inferred.domain}
                        </strong>
                    )}
                </span>
            </p>
            {inferred.matched.length > 0 && (
                <p className="text-[11px] text-slate-500">
                    Matched: {inferred.matched.join(', ')}
                </p>
            )}
            <div className="flex items-center gap-3 pt-0.5">
                <button
                    type="button"
                    onClick={() => onApply(inferred.audienceLevel, asProjectDomain(inferred.domain))}
                    className="text-xs font-semibold text-brand-600 hover:text-brand-700 underline underline-offset-2"
                >
                    Use this
                </button>
                <button
                    type="button"
                    onClick={onDismiss}
                    className="text-xs text-slate-400 hover:text-slate-600"
                >
                    Keep mine
                </button>
            </div>
        </div>
    );
};
