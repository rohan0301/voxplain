import React, { useEffect, useMemo, useState } from 'react';
import { WritingEditor } from '../components/WritingStudio/WritingEditor';
import { AnalysisPanel } from '../components/WritingStudio/AnalysisPanel';
import { AudienceCompare } from '../components/WritingStudio/AudienceCompare';
import { useTextAnalysis } from '../components/WritingStudio/useTextAnalysis';
import type { AudienceLevel } from '../types/Project';
import { Clock, FileText, Save, Trash2 } from 'lucide-react';

interface WritingStudioPageProps {
    onSwitchToPrompter: () => void;
    script: string;
    setScript: (s: string) => void;
    audienceLevel?: AudienceLevel;
    domain?: string;
    projectId?: string | null;
    projectName?: string;
    /** Opens the audience picker when no level has been chosen. */
    onSetAudience?: () => void;
}

interface SavedSpeech {
    id: string;
    title: string;
    content: string;
    wordCount: number;
    createdAt: string;
}

const formatSavedSpeechDate = (isoDate: string) =>
    new Date(isoDate).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });

const getSavedSpeechesKey = (projectId?: string | null) =>
    `voxplain_saved_speeches:${projectId || 'general'}`;

const loadLocalSavedSpeeches = (projectId?: string | null): SavedSpeech[] => {
    const raw = localStorage.getItem(getSavedSpeechesKey(projectId));
    if (!raw) return [];

    try {
        return JSON.parse(raw) as SavedSpeech[];
    } catch (err) {
        console.warn('Failed to load saved speeches', err);
        return [];
    }
};

const persistLocalSavedSpeeches = (projectId: string | null | undefined, speeches: SavedSpeech[]) => {
    localStorage.setItem(getSavedSpeechesKey(projectId), JSON.stringify(speeches));
};

export const WritingStudioPage: React.FC<WritingStudioPageProps> = ({
    onSwitchToPrompter,
    script,
    setScript,
    audienceLevel,
    domain = 'general',
    projectId = null,
    projectName = 'Untitled Project',
    onSetAudience
}) => {
    const { analysis, isAnalyzing, analyzeText, error, provenance } = useTextAnalysis();
    const [savedSpeeches, setSavedSpeeches] = useState<SavedSpeech[]>([]);
    const [isLoadingSpeeches, setIsLoadingSpeeches] = useState(false);
    const [isSavingSpeech, setIsSavingSpeech] = useState(false);
    const [speechHistoryError, setSpeechHistoryError] = useState<string | null>(null);

    const trimmedScript = script.trim();

    const handleSaveSpeech = () => {
        if (!trimmedScript) return null;

        setIsSavingSpeech(true);
        setSpeechHistoryError(null);

        try {
            const saved: SavedSpeech = {
                id: typeof crypto !== 'undefined' && 'randomUUID' in crypto
                    ? crypto.randomUUID()
                    : `speech-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                title: projectName || 'Untitled Speech',
                content: trimmedScript,
                wordCount: trimmedScript.split(/\s+/).length,
                createdAt: new Date().toISOString(),
            };

            setSavedSpeeches(prev => {
                const next = [saved, ...prev];
                persistLocalSavedSpeeches(projectId, next);
                return next;
            });
            return saved;
        } catch (err) {
            console.error(err);
            setSpeechHistoryError('Could not save this speech yet.');
            return null;
        } finally {
            setIsSavingSpeech(false);
        }
    };

    const handleAnalyze = async () => {
        const result = await analyzeText(script, audienceLevel, domain);
        if (result) {
            handleSaveSpeech();
        }
    };

    // Autosave effect (debounced slightly via timeout or just on every change? LocalStorage is fast)
    useEffect(() => {
        localStorage.setItem('voxplain_saved_script', script);
    }, [script]);

    useEffect(() => {
        setIsLoadingSpeeches(true);
        setSpeechHistoryError(null);
        setSavedSpeeches(loadLocalSavedSpeeches(projectId));
        setIsLoadingSpeeches(false);
    }, [projectId]);

    const handleOpenSpeech = (speech: SavedSpeech) => {
        setScript(speech.content);
    };

    const handleDeleteSpeech = (speechId: string) => {
        try {
            setSavedSpeeches(prev => {
                const next = prev.filter(speech => speech.id !== speechId);
                persistLocalSavedSpeeches(projectId, next);
                return next;
            });
        } catch (err) {
            console.error(err);
            setSpeechHistoryError('Could not delete that saved speech.');
        }
    };

    const speechCountLabel = useMemo(() => {
        if (isLoadingSpeeches) return 'Loading...';
        return `${savedSpeeches.length} saved`;
    }, [isLoadingSpeeches, savedSpeeches.length]);

    return (
        <div className="animate-fade-in w-full h-full flex flex-col min-h-0 overflow-y-auto pr-1">
            <div className="mb-4 flex items-center justify-between shrink-0">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">Writing Studio</h1>
                    <p className="text-slate-500 mt-1">Draft, analyze, and refine your speech before recording.</p>
                </div>
                <div className="text-right">
                    {audienceLevel === undefined ? (
                        <button
                            type="button"
                            onClick={onSetAudience}
                            className="inline-flex items-center rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-500/20 hover:bg-amber-100"
                        >
                            Audience not set
                        </button>
                    ) : (
                        <span className="inline-flex items-center rounded-md bg-slate-50 px-2 py-1 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-500/10">
                            {['Novice', 'Familiar', 'Strong', 'Expert'][audienceLevel]} Audience
                        </span>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-[560px] shrink-0 pb-0">

                {/* Editor Area (Span 8) */}
                <div className="lg:col-span-8 h-full min-h-0">
                    <WritingEditor
                        value={script}
                        onChange={setScript}
                        onOpenPrompter={onSwitchToPrompter}
                        onAnalyze={handleAnalyze}
                        isAnalyzing={isAnalyzing}
                    />
                </div>

                {/* Analysis Area (Span 4) */}
                <div className="lg:col-span-4 h-full min-h-0">
                    <AnalysisPanel
                        analysis={analysis}
                        isAnalyzing={isAnalyzing}
                        onAnalyze={handleAnalyze}
                        hasText={script.length > 0}
                        error={error}
                        script={script}
                        projectId={projectId}
                        audienceLevel={audienceLevel}
                        domain={domain}
                        provenance={provenance}
                        onSetAudience={onSetAudience}
                    />
                </div>
            </div>

            {/*
              * Fix #6. Full width rather than inside the analysis column: the
              * point of the view is several audiences side by side, which does
              * not fit a four-column sidebar. Independent of the main analysis
              * — it runs its own request, so comparing does not disturb the
              * result the user is already looking at.
              */}
            <div className="mt-4 shrink-0">
                <AudienceCompare
                    script={script}
                    domain={domain}
                    audienceLevel={audienceLevel}
                />
            </div>

            <div className="mt-4 shrink-0 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide flex items-center gap-2">
                            <FileText className="w-4 h-4 text-brand-600" />
                            Past Speeches
                        </h3>
                        <p className="text-xs text-slate-500">
                            Analyzed speeches are saved in this browser.
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="text-xs font-semibold text-slate-400">{speechCountLabel}</span>
                        <button
                            onClick={handleSaveSpeech}
                            disabled={!trimmedScript || isSavingSpeech}
                            className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            <Save className="w-3.5 h-3.5" />
                            {isSavingSpeech ? 'Saving...' : 'Save Speech'}
                        </button>
                    </div>
                </div>

                <div className="p-4">
                    {speechHistoryError && (
                        <div className="mb-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs font-medium text-red-600">
                            {speechHistoryError}
                        </div>
                    )}

                    {savedSpeeches.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
                            Saved speeches for this project will appear here.
                        </div>
                    ) : (
                        <div className="grid gap-3">
                            {savedSpeeches.map(speech => (
                                <div
                                    key={speech.id}
                                    className="rounded-xl border border-slate-200 bg-white p-4 hover:border-brand-200 transition-colors"
                                >
                                    <div className="flex items-start justify-between gap-4">
                                        <button
                                            onClick={() => handleOpenSpeech(speech)}
                                            className="min-w-0 flex-1 text-left"
                                        >
                                            <div className="font-semibold text-slate-900 truncate">{speech.title}</div>
                                            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                                                <span className="inline-flex items-center gap-1">
                                                    <Clock className="w-3 h-3" />
                                                    {formatSavedSpeechDate(speech.createdAt)}
                                                </span>
                                                <span>{speech.wordCount} words</span>
                                            </div>
                                            <p className="mt-2 text-sm text-slate-500 line-clamp-2">
                                                {speech.content}
                                            </p>
                                        </button>
                                        <button
                                            onClick={() => handleDeleteSpeech(speech.id)}
                                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                                            title="Delete speech"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
