import React, { useState } from 'react';
import { Video, Mic, AlertCircle, Smile, Eye, BookOpen, Activity } from 'lucide-react';

import { Report as SpeechReport } from '../../components/Report';

// Shared Types
import type { PracticeAnalysisResult } from '../../types/PracticeResult';


interface PracticeResultsProps {
    data: PracticeAnalysisResult;
    onReset: () => void;
}

export const PracticeResults: React.FC<PracticeResultsProps> = ({ data, onReset }) => {
    const [activeTab, setActiveTab] = useState<'speech' | 'video'>('speech');

    return (
        <div className="w-full bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col min-h-[600px]">
            {/* Header / Tabs */}
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                <div className="flex space-x-1 bg-white p-1.5 rounded-xl border border-slate-200 shadow-sm">
                    <button
                        onClick={() => setActiveTab('speech')}
                        className={`flex items-center px-4 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === 'speech' ? 'bg-brand-50 text-brand-700 shadow-sm ring-1 ring-brand-200' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        <Mic className="w-4 h-4 mr-2" />
                        Speech Analysis
                    </button>
                    <button
                        onClick={() => setActiveTab('video')}
                        className={`flex items-center px-4 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === 'video' ? 'bg-brand-50 text-brand-700 shadow-sm ring-1 ring-brand-200' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        <Video className="w-4 h-4 mr-2" />
                        Video Inights
                    </button>
                </div>

                <div className="flex items-center space-x-4">
                    <button onClick={onReset} className="text-xs font-medium text-slate-500 hover:text-brand-600 uppercase tracking-wide">
                        Start New Session
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 bg-slate-50/30">
                {activeTab === 'speech' ? (
                    <SpeechReport data={data.speech} onReset={() => { }} />
                ) : (
                    <div className="p-8 space-y-8 animate-fade-in">
                        <div className="flex items-start p-4 bg-blue-50 border border-blue-100 text-blue-800 rounded-xl">
                            <AlertCircle className="w-5 h-5 mr-3 mt-0.5 shrink-0" />
                            <div>
                                <p className="font-semibold text-sm">Local Video Analysis</p>
                                <p className="text-sm mt-1">Video processing runs entirely in your browser. Results are immediate but depend on lighting and camera quality.</p>
                            </div>
                        </div>

                        {data.video.trackingQuality === 'low' && (
                            <div className="flex items-start p-4 bg-red-50 border border-red-100 text-red-800 rounded-xl">
                                <AlertCircle className="w-5 h-5 mr-3 mt-0.5 shrink-0" />
                                <div>
                                    <p className="font-semibold text-sm">Poor Tracking Quality</p>
                                    <p className="text-sm mt-1">We couldn't see your face clearly. Metrics might be inaccurate. Try improving lighting or framing.</p>
                                </div>
                            </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            {/* Card 1: Eye Contact */}
                            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center text-center">
                                <div className="p-3 bg-blue-50 text-blue-600 rounded-full mb-4">
                                    <Eye className="w-6 h-6" />
                                </div>
                                <h4 className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-1">Eye Contact</h4>
                                <div className="text-3xl font-extrabold text-slate-900 mb-2">{data.video.eyeContactScore}%</div>
                                <div className={`text-xs px-2 py-1 rounded-full font-medium ${data.video.eyeContactScore > 70 ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                    {data.video.eyeContactScore > 70 ? 'Excellent' : 'Needs Improvement'}
                                </div>
                            </div>

                            {/* Card 2: Note Usage (Looking Down) */}
                            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center text-center">
                                <div className="p-3 bg-indigo-50 text-indigo-600 rounded-full mb-4">
                                    <BookOpen className="w-6 h-6" />
                                </div>
                                <h4 className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-1">Reading Notes</h4>
                                <div className="text-3xl font-extrabold text-slate-900 mb-2">{data.video.lookingDownPct ?? 0}%</div>
                                <div className="text-xs text-slate-400">Time looking down</div>
                            </div>

                            {/* Card 3: Smile / Engagement */}
                            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center text-center">
                                <div className="p-3 bg-green-50 text-green-600 rounded-full mb-4">
                                    <Smile className="w-6 h-6" />
                                </div>
                                <h4 className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-1">Smiling</h4>
                                <div className="text-3xl font-extrabold text-slate-900 mb-2">{data.video.smilePct ?? 0}%</div>
                                <div className="text-xs text-slate-400">Frequency</div>
                            </div>

                            {/* Card 4: Expressiveness */}
                            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center text-center">
                                <div className="p-3 bg-pink-50 text-pink-600 rounded-full mb-4">
                                    <Activity className="w-6 h-6" />
                                </div>
                                <h4 className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-1">Expressiveness</h4>
                                <div className="text-xl font-bold text-slate-900 mb-2 mt-1 capitalize">{data.video.expressivenessLevel ?? 'Balanced'}</div>
                                <div className="text-xs text-slate-400">Facial movement</div>
                            </div>
                        </div>

                        {data.video.notes && data.video.notes.length > 0 && (
                            <div className="bg-slate-50 rounded-xl p-6 border border-slate-200">
                                <h4 className="text-sm font-bold text-slate-800 mb-3">Analysis Notes</h4>
                                <ul className="space-y-2">
                                    {data.video.notes.map((note, idx) => (
                                        <li key={idx} className="flex items-start text-sm text-slate-600">
                                            <span className="w-1.5 h-1.5 bg-slate-400 rounded-full mt-2 mr-2 shrink-0" />
                                            {note}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                    </div>
                )}
            </div>
        </div>
    );
};
