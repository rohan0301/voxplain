import React, { useEffect } from 'react';
import { WritingEditor } from '../components/WritingStudio/WritingEditor';
import { AnalysisPanel } from '../components/WritingStudio/AnalysisPanel';
import { useTextAnalysis } from '../components/WritingStudio/useTextAnalysis';
import type { AudienceLevel } from '../types/Project';

interface WritingStudioPageProps {
    onSwitchToPrompter: () => void;
    script: string;
    setScript: (s: string) => void;
    audienceLevel?: AudienceLevel;
    domain?: string;
    projectId?: string | null;
}

export const WritingStudioPage: React.FC<WritingStudioPageProps> = ({
    onSwitchToPrompter,
    script,
    setScript,
    audienceLevel = 1,
    domain = 'general',
    projectId = null
}) => {
    const { analysis, isAnalyzing, analyzeText, error } = useTextAnalysis();

    const handleAnalyze = () => {
        analyzeText(script, audienceLevel, domain);
    };

    // Autosave effect (debounced slightly via timeout or just on every change? LocalStorage is fast)
    useEffect(() => {
        localStorage.setItem('voxplain_saved_script', script);
    }, [script]);

    return (
        <div className="animate-fade-in w-full h-full flex flex-col min-h-0">
            <div className="mb-4 flex items-center justify-between shrink-0">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">Writing Studio</h1>
                    <p className="text-slate-500 mt-1">Draft, analyze, and refine your speech before recording.</p>
                </div>
                <div className="text-right">
                    <span className="inline-flex items-center rounded-md bg-slate-50 px-2 py-1 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-500/10">
                        {['Novice', 'Familiar', 'Strong', 'Expert'][audienceLevel]} Audience
                    </span>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1 min-h-0 pb-0">

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
                    />
                </div>
            </div>
        </div>
    );
}
