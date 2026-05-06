import React from 'react';
import type { TranscriptionResult } from '../api';
import { Clock, AlertTriangle, Gauge, ShieldCheck, Zap, Volume2, Download } from 'lucide-react';
import clsx from 'clsx';

interface ReportProps {
    data: TranscriptionResult;
    audioSrc?: string;
    recordedAt?: string;
    onDownloadAudio?: () => void;
}

export const Report: React.FC<ReportProps> = ({ data, audioSrc, recordedAt, onDownloadAudio }) => {
    const { metrics, tips, text } = data;

    const highlightFillers = (text: string, fillers: Record<string, number>) => {
        const fillerKeys = Object.keys(fillers);
        if (fillerKeys.length === 0) return text;
        const regex = new RegExp(`\\b(${fillerKeys.join('|')})\\b`, 'gi');
        const parts = text.split(regex);
        return parts.map((part, i) => {
            if (fillerKeys.some(k => k.toLowerCase() === part.toLowerCase())) {
                return (
                    <span key={i} className="bg-red-100 text-red-700 px-1 rounded font-medium border-b border-red-200">
                        {part}
                    </span>
                );
            }
            return part;
        });
    };

    return (
        <div className="w-full space-y-8 animate-in fade-in duration-500">

            {audioSrc && (
                <div className="bg-slate-50 rounded-2xl border border-slate-200 p-5 flex flex-col md:flex-row md:items-center gap-4 justify-between">
                    <div className="flex-1">
                        <div className="flex items-center gap-2 text-slate-800 font-bold text-sm uppercase tracking-tight mb-3">
                            <Volume2 className="w-4 h-4 text-brand-600" />
                            <span>Your Recording</span>
                        </div>
                        <audio src={audioSrc} controls className="w-full max-w-xl" />
                        {recordedAt && (
                            <p className="text-xs text-slate-500 mt-2">
                                Recorded {new Date(recordedAt).toLocaleString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric',
                                    hour: 'numeric',
                                    minute: '2-digit',
                                })}
                            </p>
                        )}
                    </div>
                    {onDownloadAudio && (
                        <button
                            onClick={onDownloadAudio}
                            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50"
                        >
                            <Download className="w-4 h-4" />
                            Download Audio
                        </button>
                    )}
                </div>
            )}

            {/* Main Metrics Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <MetricCard
                    label="WPM"
                    value={metrics.wpm}
                    subtext="Target: 110-160"
                    icon={<Gauge className="w-4 h-4 text-indigo-500" />}
                />
                <MetricCard
                    label="Fillers"
                    value={metrics.fillerCount}
                    subtext="Um, Like, You Know"
                    icon={<AlertTriangle className="w-4 h-4 text-orange-500" />}
                    critical={metrics.fillerCount > 5}
                />
                <MetricCard
                    label="Confidence"
                    value={`${100 - (metrics.hedges.length * 10 + metrics.apologies.length * 20)}%`}
                    subtext="Based on hedges/apologies"
                    icon={<ShieldCheck className="w-4 h-4 text-emerald-500" />}
                />
                <MetricCard
                    label="Pacing Quality"
                    value={`${Math.round((metrics.pacing.goodPauses / (metrics.pacing.goodPauses + metrics.pacing.badPauses || 1)) * 100)}%`}
                    subtext="Boundary vs Mid-sentence"
                    icon={<Zap className="w-4 h-4 text-amber-500" />}
                />
            </div>

            {/* Detailed Analysis Sections */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Confidence Details */}
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                    <div className="flex items-center space-x-2 text-slate-800 font-bold text-sm uppercase tracking-tight">
                        <ShieldCheck className="w-4 h-4 text-emerald-600" />
                        <span>Confidence Suite</span>
                    </div>
                    <div className="space-y-3">
                        <DetailRow label="I-Tax (% of sentences)" value={`${metrics.iTax}%`} status={metrics.iTax > 40 ? 'warning' : 'good'} />
                        <DetailRow label="Hedges (maybe, I think)" value={metrics.hedges.length} status={metrics.hedges.length > 3 ? 'warning' : 'good'} />
                        <DetailRow label="Apologies found" value={metrics.apologies.length} status={metrics.apologies.length > 0 ? 'warning' : 'good'} />
                    </div>
                </div>

                {/* Pacing Details */}
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                    <div className="flex items-center space-x-2 text-slate-800 font-bold text-sm uppercase tracking-tight">
                        <Clock className="w-4 h-4 text-indigo-600" />
                        <span>Pacing Insights</span>
                    </div>
                    <div className="space-y-3">
                        <DetailRow label="Good Pauses" value={metrics.pacing.goodPauses} status="good" />
                        <DetailRow label="Flow Interruptions" value={metrics.pacing.badPauses} status={metrics.pacing.badPauses > 3 ? 'warning' : 'good'} />
                        <DetailRow label="Silence Time" value={`${(metrics.pacing.totalPauseTime / 1000).toFixed(1)}s`} />
                    </div>
                </div>

                {/* Vocal Quality */}
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                    <div className="flex items-center space-x-2 text-slate-800 font-bold text-sm uppercase tracking-tight">
                        <Volume2 className="w-4 h-4 text-blue-600" />
                        <span>Vocal Patterns</span>
                    </div>
                    <div className="space-y-3">
                        <DetailRow 
                            label="Sentence Trail-offs" 
                            value={metrics.volumeDecay?.sentenceEndDropoffs ?? 0} 
                            status={(metrics.volumeDecay?.sentenceEndDropoffs ?? 0) > 2 ? 'warning' : 'good'} 
                        />
                        <DetailRow label="Avg Volume Drop" value={`${metrics.volumeDecay?.averageDropoffDb ?? 0} dB`} />
                    </div>
                </div>
            </div>

            <div className="space-y-6">
                {/* Transcript */}
                <div className="space-y-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Transcript Highlights</h4>
                    <div className="bg-slate-50 rounded-2xl border border-slate-200 p-6 max-h-[300px] overflow-y-auto text-base leading-relaxed text-slate-700 font-medium">
                        {text.trim() ? (
                            highlightFillers(text, metrics.fillerWordsFound)
                        ) : (
                            <span className="text-slate-400">No speech detected in this recording.</span>
                        )}
                    </div>
                </div>

                {/* Tips */}
                <div className="space-y-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Coach's Actionable Tips</h4>
                    <div className="grid gap-3">
                        {tips.map(tip => (
                            <div
                                key={tip.id}
                                className={clsx(
                                    "p-4 rounded-xl border flex items-start space-x-4 text-sm transition-all hover:translate-x-1",
                                    tip.type === 'improvement' ? "bg-amber-50 border-amber-200 text-amber-900 shadow-sm shadow-amber-100/50" : "bg-emerald-50 border-emerald-200 text-emerald-900 shadow-sm shadow-emerald-100/50"
                                )}
                            >
                                <div className={clsx("mt-1.5 w-2 h-2 rounded-full flex-shrink-0", tip.type === 'improvement' ? "bg-amber-400" : "bg-emerald-400")} />
                                <span className="font-medium">{tip.message}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

        </div>
    );
};

const DetailRow = ({ label, value, status }: { label: string, value: string | number, status?: 'good' | 'warning' | 'neutral' }) => (
    <div className="flex justify-between items-center text-sm">
        <span className="text-slate-500">{label}</span>
        <span className={clsx(
            "font-bold",
            status === 'good' && "text-emerald-600",
            status === 'warning' && "text-amber-600",
            !status && "text-slate-700"
        )}>
            {value}
        </span>
    </div>
);

const MetricCard = ({ label, value, icon, subtext, critical = false }: any) => (
    <div className={clsx("bg-white p-5 rounded-2xl border shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5", critical ? "border-red-200 bg-red-50/10" : "border-slate-200")}>
        <div className="flex justify-between items-center mb-3">
            <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">{label}</span>
            <div className="p-1.5 bg-slate-50 rounded-lg border border-slate-100">
                {icon}
            </div>
        </div>
        <div className="text-3xl font-extrabold text-slate-900 leading-none tracking-tight">
            {value}
        </div>
        {subtext && <div className="text-[10px] text-slate-400 mt-2.5 font-semibold tracking-tight">{subtext}</div>}
    </div>
);
