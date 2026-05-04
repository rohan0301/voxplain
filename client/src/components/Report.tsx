import React from 'react';
import type { TranscriptionResult } from '../api';
import { Clock, AlignLeft, AlertTriangle, Gauge } from 'lucide-react';
import clsx from 'clsx';

interface ReportProps {
    data: TranscriptionResult;
    onReset: () => void;
}

export const Report: React.FC<ReportProps> = ({ data }) => {
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

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <MetricCard
                    label="WPM"
                    value={metrics.wpm}
                    subtext="Target: 110-160"
                    icon={<Gauge className="w-4 h-4 text-indigo-500" />}
                />
                <MetricCard
                    label="Adverbs/Fillers"
                    value={metrics.fillerCount}
                    subtext="Total count"
                    icon={<AlertTriangle className="w-4 h-4 text-orange-500" />}
                    critical={metrics.fillerCount > 5}
                />
                <MetricCard
                    label="Word Count"
                    value={metrics.wordCount}
                    icon={<AlignLeft className="w-4 h-4 text-slate-500" />}
                />
                <MetricCard
                    label="Duration"
                    value={`${Math.round(metrics.durationSeconds)}s`}
                    icon={<Clock className="w-4 h-4 text-slate-500" />}
                />
            </div>

            <div className="space-y-6">
                {/* Transcript */}
                <div className="space-y-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Transcript</h4>
                    <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 max-h-[300px] overflow-y-auto text-base leading-relaxed text-slate-700">
                        {highlightFillers(text, metrics.fillerWordsFound)}
                    </div>
                </div>

                {/* Tips */}
                <div className="space-y-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">AI Feedback</h4>
                    <div className="grid gap-3">
                        {tips.map(tip => (
                            <div
                                key={tip.id}
                                className={clsx(
                                    "p-3 rounded-lg border flex items-start space-x-3 text-sm",
                                    tip.type === 'improvement' ? "bg-amber-50 border-amber-200 text-amber-900" : "bg-emerald-50 border-emerald-200 text-emerald-900"
                                )}
                            >
                                <div className={clsx("mt-0.5 w-2 h-2 rounded-full flex-shrink-0", tip.type === 'improvement' ? "bg-amber-400" : "bg-emerald-400")} />
                                <span>{tip.message}</span>
                            </div>
                        ))}
                        {tips.length === 0 && (
                            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-500 text-sm italic">
                                No specific tips. Great job!
                            </div>
                        )}
                    </div>
                </div>
            </div>

        </div>
    );
};

const MetricCard = ({ label, value, icon, subtext, critical = false }: any) => (
    <div className={clsx("bg-gray-50/50 p-4 rounded-xl border shadow-sm transition-all hover:shadow-md", critical ? "border-red-200 bg-red-50/30" : "border-slate-100")}>
        <div className="flex justify-between items-center mb-2">
            <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">{label}</span>
            {icon}
        </div>
        <div className="text-2xl font-bold text-slate-900 leading-none">
            {value}
        </div>
        {subtext && <div className="text-[10px] text-slate-400 mt-1.5 font-medium">{subtext}</div>}
    </div>
);
