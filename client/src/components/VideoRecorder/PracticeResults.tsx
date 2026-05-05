import React from 'react';
import { Mic } from 'lucide-react';
import { Report as SpeechReport } from '../../components/Report';
import type { PracticeAnalysisResult } from '../../types/PracticeResult';

interface PracticeResultsProps {
    data: PracticeAnalysisResult;
    onReset: () => void;
}

export const PracticeResults: React.FC<PracticeResultsProps> = ({ data, onReset }) => {
    return (
        <div className="w-full bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col min-h-[600px]">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                <div className="flex items-center space-x-2">
                    <Mic className="w-5 h-5 text-brand-600" />
                    <span className="font-semibold text-slate-800">Speech Analysis</span>
                </div>
                <button onClick={onReset} className="text-xs font-medium text-slate-500 hover:text-brand-600 uppercase tracking-wide">
                    Start New Session
                </button>
            </div>

            <div className="flex-1 bg-slate-50/30">
                <SpeechReport data={data.speech} onReset={() => { }} />
            </div>
        </div>
    );
};
