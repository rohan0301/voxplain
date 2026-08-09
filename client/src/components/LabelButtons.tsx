import React, { useState } from 'react';
import { Check } from 'lucide-react';
import { saveLabel } from '../api';
import type { AudienceLevel } from '../types/Project';

interface LabelButtonsProps {
    sentence: string;
    /**
     * The audience level this sentence is being judged against. Must be the
     * level the user actually chose — a label recorded against a silently
     * defaulted level is a mislabeled training row, and the contamination is
     * permanent. When this is undefined we prompt instead of labeling.
     */
    audienceLevel?: AudienceLevel;
    domain?: string;
    projectId?: string | null;
    /** Rendered when there is no audience level set, e.g. a link to project settings. */
    onSetAudience?: () => void;
    className?: string;
}

/**
 * 👍/👎 on a single sentence, writing a training row to the labels table.
 *
 * Optimistic: the confirmed state shows immediately and reverts on failure.
 * Labeling must never block the user's actual work.
 */
export const LabelButtons: React.FC<LabelButtonsProps> = ({
    sentence,
    audienceLevel,
    domain = 'general',
    projectId,
    onSetAudience,
    className = '',
}) => {
    const [label, setLabel] = useState<0 | 1 | null>(null);
    const [error, setError] = useState<string | null>(null);

    if (audienceLevel === undefined) {
        return (
            <span className={`text-[11px] text-slate-400 ${className}`}>
                {onSetAudience ? (
                    <>
                        <button onClick={onSetAudience} className="text-brand-600 underline hover:text-brand-700">
                            Set an audience level
                        </button>
                        {' '}to help train the model
                    </>
                ) : (
                    'Set an audience level on this project to help train the model'
                )}
            </span>
        );
    }

    const handleLabel = async (value: 0 | 1) => {
        const previous = label;
        setError(null);
        setLabel(value);
        try {
            await saveLabel({ text: sentence, label: value, audienceLevel, domain, projectId });
        } catch (err) {
            console.error('[Label] save failed', err);
            setLabel(previous);
            setError('Could not save');
        }
    };

    if (label !== null) {
        return (
            <div className={`flex items-center gap-2 ${className}`}>
                <span className="text-xs font-medium text-green-600 flex items-center bg-green-50 px-2 py-1 rounded">
                    <Check className="w-3 h-3 mr-1" />
                    Saved ({label === 0 ? 'Clear' : 'Confusing'})
                </span>
                <button
                    onClick={() => setLabel(null)}
                    className="text-[10px] text-slate-400 underline hover:text-slate-600"
                >
                    Change
                </button>
            </div>
        );
    }

    return (
        <div className={`flex items-center gap-2 ${className}`}>
            <button
                onClick={() => handleLabel(0)}
                className="px-2 py-1 text-xs bg-slate-100 text-slate-600 rounded hover:bg-slate-200 border border-slate-200 font-medium transition-colors"
            >
                Clear
            </button>
            <button
                onClick={() => handleLabel(1)}
                className="px-2 py-1 text-xs bg-slate-100 text-slate-700 rounded hover:bg-slate-200 border-b-2 border-slate-300 font-medium transition-colors"
            >
                Confusing
            </button>
            {error && <span className="text-[10px] text-red-500">{error}</span>}
        </div>
    );
};
