import React, { useState } from 'react';
import { TeleprompterDisplay } from '../components/Teleprompter/TeleprompterDisplay';

// Reusing TeleprompterMode logic which effectively acts as the page container for the reading view
// Actually, TeleprompterMode previously contained the Script Editor + Display switch.
// We need to refactor TeleprompterMode to be JUST the reading/recording view now, 
// since the "Editor" part is now the "Writing Studio".
// 
// Let's create a NEW TeleprompterPage wrapper that uses the Display + Recorder side-by-side.

import { useRecorder } from '../hooks/useRecorder';
import { Mic, CheckCircle2, ArrowLeft } from 'lucide-react';
import clsx from 'clsx';


interface TeleprompterPageProps {
    script: string;
    onBackToStudio: () => void;
    onRecordingComplete: (file: File) => void;
}

export const TeleprompterPage: React.FC<TeleprompterPageProps> = ({ script, onBackToStudio, onRecordingComplete }) => {
    // Prompter State
    const [isPlaying, setIsPlaying] = useState(false);

    // We can pull prefs from localstorage here or inside Display as before.
    // Display handles its own props, so we lift state here.
    const [speed, setSpeed] = useState(() => Number(localStorage.getItem('voxplain_prompt_speed') || 30));
    const [fontSize, setFontSize] = useState(() => Number(localStorage.getItem('voxplain_prompt_size') || 42));
    const [mirror, setMirror] = useState(false);
    const [focusMode, setFocusMode] = useState(false);

    // Save prefs
    React.useEffect(() => {
        localStorage.setItem('voxplain_prompt_speed', String(speed));
        localStorage.setItem('voxplain_prompt_size', String(fontSize));
    }, [speed, fontSize]);


    // Recorder Logic
    const recorder = useRecorder();

    const handleStartBoth = async () => {
        setIsPlaying(true);
        await recorder.startRecording();
    };

    const handleStopBoth = () => {
        setIsPlaying(false);
        recorder.stopRecording();
    };

    const handleAnalyze = () => {
        if (recorder.audioBlob) {
            const file = new File([recorder.audioBlob], "teleprompter_rec.webm", { type: recorder.audioBlob.type || 'audio/webm' });
            onRecordingComplete(file);
        }
    };


    return (
        <div className="animate-fade-in w-full h-[calc(100vh-140px)] flex flex-col lg:flex-row gap-6">

            {/* Screen 1: Teleprompter Display */}
            <div className="flex-1 h-full min-h-[400px]">
                <TeleprompterDisplay
                    script={script}
                    onBackToEditor={onBackToStudio}
                    isPlaying={isPlaying}
                    onTogglePlay={() => setIsPlaying(!isPlaying)}
                    speed={speed}
                    setSpeed={setSpeed}
                    fontSize={fontSize}
                    setFontSize={setFontSize}
                    mirror={mirror}
                    setMirror={setMirror}
                    focusMode={focusMode}
                    setFocusMode={setFocusMode}
                />
            </div>

            {/* Screen 2: Controls / Recorder */}
            <div className="w-full lg:w-96 flex flex-col space-y-4">

                {/* Back Button */}
                <button
                    onClick={onBackToStudio}
                    className="flex items-center text-slate-500 hover:text-slate-800 mb-2 font-medium transition-colors"
                >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Studio
                </button>

                {/* Recorder Card */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 flex flex-col items-center justify-center flex-1 max-h-[400px]">
                    <div className={clsx(
                        "text-5xl font-mono font-bold tracking-wider mb-2",
                        recorder.isRecording ? "text-red-500 animate-pulse" : "text-slate-800"
                    )}>
                        {Math.floor(recorder.recordingTime / 60)}:{(recorder.recordingTime % 60).toString().padStart(2, '0')}
                    </div>
                    <div className="text-sm text-slate-500 uppercase tracking-widest font-medium mb-8">
                        {recorder.isRecording ? "Recording Live" : "Teleprompter Ready"}
                    </div>

                    {!recorder.audioUrl ? (
                        !recorder.isRecording ? (
                            <div className="flex flex-col items-center space-y-3 w-full">
                                <button
                                    onClick={handleStartBoth}
                                    disabled={recorder.isInitializing}
                                    className="w-full py-4 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold shadow-lg shadow-red-200 transaction-all hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center space-x-2"
                                >
                                    <Mic className="w-5 h-5" />
                                    <span>Start Both</span>
                                </button>

                                <button
                                    onClick={recorder.startRecording}
                                    disabled={recorder.isInitializing}
                                    className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium transition-colors"
                                >
                                    Record Only
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={handleStopBoth}
                                className="w-24 h-24 bg-slate-900 hover:bg-black text-white rounded-full flex items-center justify-center shadow-xl transition-all hover:scale-110 active:scale-95"
                            >
                                <div className="w-8 h-8 bg-white rounded-sm" />
                            </button>
                        )
                    ) : (
                        <div className="w-full flex flex-col space-y-4 animate-fade-in w-full">
                            <div className="p-4 bg-green-50 rounded-xl border border-green-100 flex items-center space-x-3">
                                <CheckCircle2 className="w-6 h-6 text-green-600" />
                                <div>
                                    <p className="font-medium text-green-900">Recording Saved</p>
                                </div>
                            </div>

                            <audio src={recorder.audioUrl} controls className="w-full h-10 rounded" />

                            <button
                                onClick={handleAnalyze}
                                className="w-full py-3 bg-brand-600 text-white rounded-xl font-bold shadow-md hover:bg-brand-700 transition-colors"
                            >
                                Transcribe & Analyze
                            </button>
                            <button
                                onClick={recorder.resetRecording}
                                className="w-full py-3 text-slate-500 hover:text-slate-800 font-medium"
                            >
                                Discard & Retry
                            </button>
                        </div>
                    )}
                </div>

                {/* Tip */}
                <div className="bg-slate-100 p-4 rounded-xl text-xs text-slate-500 text-center">
                    Adjust speed with Up/Down arrows. Space to pause.
                </div>
            </div>
        </div>
    );
};
