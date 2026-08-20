import type { Project } from '../types/Project';
import { X } from 'lucide-react';
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAudienceInference, AudienceInferenceNote } from './AudienceInference';

interface EditProjectModalProps {
    project: Project;
    onClose: () => void;
    onSave: (projectId: string, updates: Partial<Project>) => void;
}

export const EditProjectModal = ({ project, onClose, onSave }: EditProjectModalProps) => {
    // Form State (Initialized from project)
    const [name, setName] = useState(project.name);
    const [audience, setAudience] = useState(project.audience || '');
    const [type, setType] = useState(project.presentationType || 'Presentation');
    const [speechText, setSpeechText] = useState(project.speechText || '');

    // Parse initial time input
    const initialTimeInput = project.requiredTimeSec
        ? `${Math.floor(project.requiredTimeSec / 60)}:${(project.requiredTimeSec % 60).toString().padStart(2, '0')}`
        : '';
    const [timeInput, setTimeInput] = useState(initialTimeInput);

    const [audienceLevel, setAudienceLevel] = useState<0 | 1 | 2 | 3>(project.audienceLevel ?? 1);
    const [domain, setDomain] = useState(project.domain || 'general');
    const { inferred, isInferring, infer, clear } = useAudienceInference();

    // Lock Body Scroll
    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, []);

    // Constants
    const presentationTypes = [
        'Presentation',
        'Speech',
        'Business Proposal',
        'Pitch Deck',
        'Class Report',
        'Interview Answer',
        'Other'
    ];

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        // 1. Process Name
        let finalName = name.trim();
        if (!finalName) {
            const typeToNameMap: Record<string, string> = {
                'Presentation': 'Untitled Presentation',
                'Speech': 'Untitled Speech',
                'Business Proposal': 'Untitled Business Proposal',
                'Pitch Deck': 'Untitled Pitch Deck',
                'Class Report': 'Untitled Report',
                'Interview Answer': 'Untitled Interview',
            };
            finalName = typeToNameMap[type] || 'Untitled Project';
        }

        // 2. Process Time Input (Simple parsing)
        let requiredTimeSec: number | null = null;
        if (timeInput.trim()) {
            if (timeInput.includes(':')) {
                // Parse mm:ss
                const [mins, secs] = timeInput.split(':').map(Number);
                if (!isNaN(mins)) {
                    requiredTimeSec = (mins * 60) + (isNaN(secs) ? 0 : secs);
                }
            } else {
                // Parse minutes
                const mins = parseFloat(timeInput);
                if (!isNaN(mins)) {
                    requiredTimeSec = Math.floor(mins * 60);
                }
            }
        }

        // 3. Estimate Speech Time (if text provided)
        // Rule: 130 WPM standard
        let estimatedTimeSec = 0;
        if (speechText.trim()) {
            const wordCount = speechText.trim().split(/\s+/).length;
            estimatedTimeSec = Math.floor((wordCount / 130) * 60);
        } else {
            // Keep existing estimate if text hasn't changed? 
            // Logic says "Recompute estimatedTimeSec if speechText changed". 
            // If speechText matches original, maybe keep original estimate? 
            // But recomputing is safer to ensure consistency.
            estimatedTimeSec = 0;
        }

        // 4. Submit
        onSave(project.id, {
            name: finalName,
            audience: audience.trim(),
            presentationType: type,
            speechText: speechText.trim(),
            requiredTimeSec,
            estimatedTimeSec,
            audienceLevel,
            domain: domain as any
        });
    };

    return createPortal(
        <div className="fixed inset-0 z-[100] flex justify-center items-start pt-16 sm:pt-24 p-4">
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-slate-900/20 backdrop-blur-[2px] transition-opacity"
                onClick={onClose}
            ></div>

            {/* Modal Card */}
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[85vh] animate-fade-in-up border border-slate-100 z-[101]">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex-shrink-0">
                    <h3 className="text-lg font-bold text-slate-800">Edit Project</h3>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Form Content - Scrollable */}
                <div className="p-6 overflow-y-auto">
                    <form id="edit-project-form" onSubmit={handleSubmit} className="space-y-6">

                        {/* 1. Project Name */}
                        <div className="space-y-2">
                            <label className="text-sm font-semibold text-slate-700">Project Name</label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Untitled Presentation"
                                className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all font-medium text-slate-900 placeholder:text-slate-400"
                                autoFocus
                            />
                        </div>

                        {/* 2. Type & Time (Row) */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-slate-700">Type</label>
                                <div className="relative">
                                    <select
                                        value={type}
                                        onChange={(e) => setType(e.target.value)}
                                        className="w-full px-4 py-2 appearance-none rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all text-slate-700 bg-white"
                                    >
                                        {presentationTypes.map(t => (
                                            <option key={t} value={t}>{t}</option>
                                        ))}
                                    </select>
                                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                                        <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-slate-700 flex items-center justify-between">
                                    Time Requirement
                                    <span className="text-xs font-normal text-slate-400">Optional</span>
                                </label>
                                <input
                                    type="text"
                                    value={timeInput}
                                    onChange={(e) => setTimeInput(e.target.value)}
                                    placeholder="e.g. 5 or 5:00"
                                    className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all text-slate-900"
                                />
                                <p className="text-xs text-slate-500">Target duration in minutes (e.g. 5) or mm:ss.</p>
                            </div>
                        </div>

                        {/* 3. Audience & Level */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-slate-700">Audience Description</label>
                                <textarea
                                    value={audience}
                                    onChange={(e) => setAudience(e.target.value)}
                                    onBlur={(e) => infer(e.target.value)}
                                    placeholder="Who are you presenting to?"
                                    rows={2}
                                    className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all text-slate-900 placeholder:text-slate-400 resize-none"
                                />
                                <AudienceInferenceNote
                                    inferred={inferred}
                                    isInferring={isInferring}
                                    currentLevel={audienceLevel}
                                    currentDomain={domain}
                                    onApply={(level, inferredDomain) => {
                                        if (level !== null) setAudienceLevel(level);
                                        if (inferredDomain) setDomain(inferredDomain);
                                        clear();
                                    }}
                                    onDismiss={clear}
                                />
                            </div>
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700">Audience Technical Level</label>
                                    <select
                                        value={audienceLevel}
                                        onChange={(e) => setAudienceLevel(Number(e.target.value) as any)}
                                        className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all text-slate-700 bg-white"
                                    >
                                        <option value={0}>Novice (Non-technical)</option>
                                        <option value={1}>Some Familiarity</option>
                                        <option value={2}>Strong Knowledge</option>
                                        <option value={3}>Expert / Peer</option>
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700">Domain</label>
                                    <select
                                        value={domain}
                                        onChange={(e) => setDomain(e.target.value as any)}
                                        className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all text-slate-700 bg-white"
                                    >
                                        <option value="general">General</option>
                                        <option value="tech">Tech / Engineering</option>
                                        <option value="finance">Finance</option>
                                        <option value="healthcare">Healthcare</option>
                                        <option value="other">Other</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* 4. Speech Text */}
                        <div className="space-y-2">
                            <label className="text-sm font-semibold text-slate-700 flex items-center justify-between">
                                Paste Speech
                                <span className="text-xs font-normal text-slate-400">Optional</span>
                            </label>
                            <textarea
                                value={speechText}
                                onChange={(e) => setSpeechText(e.target.value)}
                                placeholder="Paste your speech here to auto-calculate time..."
                                rows={6}
                                className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all text-slate-900 placeholder:text-slate-400"
                            />
                        </div>

                    </form>
                </div>

                {/* Footer Actions */}
                <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between flex-shrink-0">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-5 py-2.5 rounded-xl text-slate-600 font-medium hover:bg-slate-200/50 hover:text-slate-900 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        form="edit-project-form"
                        type="submit"
                        className="px-6 py-2.5 rounded-xl bg-brand-600 text-white font-bold hover:bg-brand-700 hover:shadow-lg hover:shadow-brand-500/20 active:scale-95 transition-all text-sm"
                    >
                        Save Changes
                    </button>
                </div>

            </div>
        </div>,
        document.body
    );
};
