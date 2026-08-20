import React, { useState } from 'react';
import type { TextAnalysis } from './useTextAnalysis';
import { Sparkles, AlertCircle, BrainCircuit, Target, CheckCircle2, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import { LabelButtons } from '../LabelButtons';
import { AnalysisModeBanner, AudienceScopeNote } from '../AnalysisModeBanner';
import type { AnalysisProvenance } from '../../api';
import type { AudienceLevel } from '../../types/Project';

interface AnalysisPanelProps {
    analysis: TextAnalysis | null;
    isAnalyzing: boolean;
    onAnalyze: () => void;
    hasText: boolean;
    error: string | null;
    script: string;
    projectId?: string | null;
    audienceLevel?: AudienceLevel;
    domain?: string;
    /** Which signals produced `analysis`; drives the degradation banner. */
    provenance?: AnalysisProvenance | null;
    /** Opens the audience picker when the level was defaulted. */
    onSetAudience?: () => void;
}

export const AnalysisPanel: React.FC<AnalysisPanelProps> = ({
    analysis,
    isAnalyzing,
    onAnalyze,
    hasText,
    error,
    script,
    projectId,
    // Deliberately NOT defaulted: a label saved against an assumed level is a
    // permanently mislabeled training row. LabelButtons prompts when it's unset.
    audienceLevel,
    domain = 'general',
    provenance,
    onSetAudience
}) => {
    const [showMoreLabels, setShowMoreLabels] = useState(false);

    // Helper for score color and label
    const getStatusInfo = (status: "below" | "near" | "above") => {
        if (status === 'near') return { color: 'text-green-600 bg-green-50 border-green-100', label: 'Borderline / On Target' };
        if (status === 'below') return { color: 'text-blue-600 bg-blue-50 border-blue-100', label: 'Accessible' };
        return { color: 'text-red-600 bg-red-50 border-red-100', label: 'Too Technical' };
    };

    // Derived list of sentences (simple split)
    // Filter to remove empty/short ones
    const allSentences = React.useMemo(() => {
        if (!script) return [];
        return (script.match(/[^.!?]+[.!?]+/g) || [script])
            .map(s => s.trim())
            .filter(s => s.length > 20); // only reasonably long sentences
    }, [script]);

    // Find sentences that are NOT in hotspots
    const nonHotspotSentences = React.useMemo(() => {
        if (!analysis) return [];
        const hotspotTexts = new Set(analysis.hotspots.map(h => h.sentence.trim()));
        return allSentences.filter(s => !hotspotTexts.has(s));
    }, [allSentences, analysis]);

    const focusRiskSentence = React.useMemo(() => {
        if (!analysis) return null;

        const scoreSentence = (sentence: string, termCount = 0, reasonCount = 0) => {
            const wordCount = sentence.trim().split(/\s+/).filter(Boolean).length;
            const lengthPenalty = wordCount > 28 ? 3 : wordCount > 20 ? 2 : wordCount > 14 ? 1 : 0;
            return termCount * 4 + reasonCount * 3 + lengthPenalty;
        };

        if (analysis.hotspots.length > 0) {
            return analysis.hotspots
                .map(hotspot => ({
                    sentence: hotspot.sentence.trim(),
                    reasons: hotspot.reasons,
                    score: scoreSentence(hotspot.sentence, hotspot.terms.length, hotspot.reasons.length),
                }))
                .sort((a, b) => b.score - a.score)[0];
        }

        if (allSentences.length === 0) return null;

        return allSentences
            .map(sentence => ({
                sentence,
                reasons: ['This is the longest dense stretch in the draft, so it may need an extra pause or clearer setup.'],
                score: scoreSentence(sentence),
            }))
            .sort((a, b) => b.score - a.score)[0];
    }, [allSentences, analysis]);


    return (
        <div className="h-full bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center shrink-0">
                <h3 className="font-semibold text-slate-800 flex items-center">
                    <Sparkles className="w-4 h-4 mr-2 text-brand-500" />
                    Audience Analysis
                </h3>
            </div>

            <div className="flex-1 p-6 relative overflow-y-auto min-h-0">
                {error ? (
                    <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
                        <div className="bg-red-50 p-4 rounded-full">
                            <AlertTriangle className="w-8 h-8 text-red-500" />
                        </div>
                        <p className="text-red-600 text-sm font-medium">{error}</p>
                        <button
                            onClick={onAnalyze}
                            className="px-4 py-2 bg-white border border-slate-200 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50 transition-all"
                        >
                            Try Again
                        </button>
                    </div>
                ) : !analysis ? (
                    <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
                        <div className="bg-slate-50 p-4 rounded-full">
                            <BrainCircuit className="w-8 h-8 text-slate-300" />
                        </div>
                        <p className="text-slate-500 text-sm max-w-[200px]">
                            Run analysis to see technicality score, jargon hotspots, and audience fit.
                        </p>
                        <button
                            onClick={onAnalyze}
                            disabled={!hasText || isAnalyzing}
                            className="px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        >
                            {isAnalyzing ? "Analyzing..." : "Analyze Text"}
                        </button>
                    </div>
                ) : (
                    <div className="space-y-6 animate-fade-in pb-4">

                        {/* Degradation notice — silent unless something is wrong */}
                        <AnalysisModeBanner analysis={provenance} />

                        {/* Every score names the audience it was computed for */}
                        <AudienceScopeNote analysis={provenance} onSetAudience={onSetAudience} />

                        {/* Summary Card (Primary Metric) */}
                        <div className={`p-4 rounded-xl border ${getStatusInfo(analysis.status).color}`}>
                            <div className="flex items-center justify-between mb-2">
                                <div className="text-xs font-bold uppercase tracking-wider opacity-80">Technical Load Score</div>
                                <div className="text-xs font-bold bg-white/60 px-2 py-0.5 rounded text-current">
                                    {getStatusInfo(analysis.status).label}
                                </div>
                            </div>
                            <div className="flex items-baseline gap-2 mb-3">
                                <span className="text-4xl font-bold">{analysis.technicalLoadScore}</span>
                                <span className="text-sm opacity-70">/ {analysis.audienceThreshold}</span>
                            </div>
                            <p className="text-sm opacity-90 leading-relaxed">
                                {analysis.summary}
                            </p>

                            {/* Metrics Details (under main score) */}
                            {analysis.metrics && (
                                <div className="mt-4 pt-4 border-t border-current border-opacity-10 space-y-2">
                                    <div className="grid grid-cols-2 gap-2 text-sm">
                                        <div>
                                            <div className="text-[11px] opacity-70 font-medium">Reading Level</div>
                                            <div className="text-lg font-bold">{analysis.metrics.readability.flesch_kincaid_grade}</div>
                                        </div>
                                        <div>
                                            <div className="text-[11px] opacity-70 font-medium">Jargon Density</div>
                                            <div className="text-lg font-bold">{(analysis.metrics.jargon.jargon_density * 100).toFixed(0)}%</div>
                                        </div>
                                    </div>

                                    {analysis.metrics.jargon.jargon_terms.length > 0 && (
                                        <div className="pt-2">
                                            <div className="text-[10px] opacity-70 font-semibold mb-1.5">Terms: {analysis.metrics.jargon.jargon_count}</div>
                                            <div className="flex flex-wrap gap-1">
                                                {analysis.metrics.jargon.jargon_terms.slice(0, 5).map(term => (
                                                    <span key={term} className="px-1.5 py-0.5 bg-white/50 opacity-80 text-current text-[9px] font-medium rounded border border-current border-opacity-20">
                                                        {term}
                                                    </span>
                                                ))}
                                                {analysis.metrics.jargon.jargon_terms.length > 5 && (
                                                    <span className="px-1.5 py-0.5 text-[9px] opacity-60">+{analysis.metrics.jargon.jargon_terms.length - 5}</span>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Focus Risk Sentence */}
                        {focusRiskSentence && (
                            <div className="p-4 rounded-xl border border-amber-200 bg-amber-50">
                                <div className="flex items-center text-sm font-bold text-amber-900 mb-2">
                                    <AlertTriangle className="w-4 h-4 mr-2 text-amber-600" />
                                    Audience Focus Risk
                                </div>
                                <p className="text-sm text-amber-950 leading-relaxed italic border-l-2 border-amber-300 pl-3">
                                    "{focusRiskSentence.sentence}"
                                </p>
                                <p className="text-xs text-amber-800 mt-2 leading-relaxed">
                                    This is the sentence where listeners are most likely to lose focus. Break it up, define terms earlier, or add a quick example before it.
                                </p>
                            </div>
                        )}

                        {/* Stats Grid */}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                                <div className="text-xs text-slate-500 font-medium mb-1">Unique Terms</div>
                                <div className="text-xl font-bold text-slate-900">{analysis.termStats.uniqueTerms}</div>
                            </div>
                            <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                                <div className="text-xs text-slate-500 font-medium mb-1">Max Clump</div>
                                <div className="text-xl font-bold text-slate-900">{analysis.termStats.maxClump}</div>
                            </div>
                        </div>

                        {/* Hotspots */}
                        <div>
                            <div className="flex items-center text-sm font-medium text-slate-800 mb-3">
                                <Target className="w-4 h-4 mr-1.5 text-brand-500" />
                                Review Needed ({analysis.hotspots.length})
                            </div>
                            {analysis.hotspots.length > 0 ? (
                                <div className="space-y-3">
                                    {analysis.hotspots.map((h, i) => (
                                        <div key={i} className="p-3 bg-white border border-slate-200 rounded-lg shadow-sm">
                                            <div className="flex flex-wrap gap-1 mb-2">
                                                {h.terms.map(t => (
                                                    <span key={t} className="px-1.5 py-0.5 bg-red-50 text-red-600 text-[10px] font-bold uppercase rounded border border-red-100">
                                                        {t}
                                                    </span>
                                                ))}
                                            </div>
                                            <p className="text-xs text-slate-600 italic mb-2 border-l-2 border-slate-200 pl-2">
                                                "{h.sentence}"
                                            </p>
                                            <div className="space-y-1">
                                                {h.reasons.map(r => (
                                                    <div key={r} className="flex items-start text-xs text-slate-500">
                                                        <AlertCircle className="w-3 h-3 mr-1.5 mt-0.5 shrink-0 text-orange-400" />
                                                        {r}
                                                    </div>
                                                ))}
                                                {h.suggestions.map(s => (
                                                    <div key={s} className="flex items-start text-xs text-brand-600">
                                                        <CheckCircle2 className="w-3 h-3 mr-1.5 mt-0.5 shrink-0" />
                                                        Try: {s}
                                                    </div>
                                                ))}
                                            </div>

                                            {/* Labeling Buttons */}
                                            <div className="pt-2 mt-2 border-t border-slate-100">
                                                <div className="flex justify-between items-center">
                                                    <span className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">Help us verify</span>
                                                    <LabelButtons
                                                        sentence={h.sentence.trim()}
                                                        audienceLevel={audienceLevel}
                                                        domain={domain}
                                                        projectId={projectId}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="p-4 bg-green-50 border border-green-100 rounded-lg flex items-center text-green-700 text-sm">
                                    <CheckCircle2 className="w-5 h-5 mr-3 text-green-500" />
                                    No major technicality issues found!
                                </div>
                            )}
                        </div>

                        {/* Label More Sentences Section */}
                        {nonHotspotSentences.length > 0 && (
                            <div className="border border-slate-200 rounded-xl overflow-hidden">
                                <button
                                    onClick={() => setShowMoreLabels(!showMoreLabels)}
                                    className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
                                >
                                    <span className="text-sm font-semibold text-slate-700">Label more sentences</span>
                                    {showMoreLabels ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
                                </button>

                                {showMoreLabels && (
                                    <div className="p-4 bg-white space-y-4 max-h-[400px] overflow-y-auto">
                                        <p className="text-xs text-slate-500 mb-2">
                                            Mark sentences as "Clear" or "Confusing" to improve our AI.
                                        </p>
                                        {nonHotspotSentences.slice(0, 30).map((s, idx) => (
                                            <div key={idx} className="pb-3 border-b border-slate-100 last:border-0 last:pb-0">
                                                <p className="text-sm text-slate-700 mb-1 leading-relaxed">"{s}"</p>
                                                <div className="flex justify-end">
                                                    <LabelButtons
                                                        sentence={s}
                                                        audienceLevel={audienceLevel}
                                                        domain={domain}
                                                        projectId={projectId}
                                                    />
                                                </div>
                                            </div>
                                        ))}
                                        {nonHotspotSentences.length > 30 && (
                                            <p className="text-xs text-center text-slate-400 pt-2">
                                                And {nonHotspotSentences.length - 30} more...
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Re-Analyze Button */}
                        <button
                            onClick={onAnalyze}
                            className="w-full py-2 bg-white border border-slate-200 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50 transition-all"
                        >
                            Re-Analyze
                        </button>

                    </div>
                )}
            </div>
        </div>
    );
};
