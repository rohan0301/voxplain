import React, { useState, useEffect } from 'react';
import { ScriptEditor } from './ScriptEditor';
import { TeleprompterDisplay } from './TeleprompterDisplay';
import { useRecorder } from '../../hooks/useRecorder';

import { Mic, CheckCircle2 } from 'lucide-react';
import clsx from 'clsx';

interface TeleprompterModeProps {
    onRecordingComplete: (file: File) => void;
}

export const TeleprompterMode: React.FC<TeleprompterModeProps> = ({ onRecordingComplete }) => {
    // Mode State
    const [view, setView] = useState<'editor' | 'prompter'>('editor');

    // Script State
    const [script, setScript] = useState('');

    // Prompter settings
    const [isPlaying, setIsPlaying] = useState(false);
    const [speed, setSpeed] = useState(30);
    const [fontSize, setFontSize] = useState(32);
    const [mirror, setMirror] = useState(false);
    const [focusMode, setFocusMode] = useState(false);

    // Load initial prefs
    useEffect(() => {
        const savedScript = localStorage.getItem('voxplain_saved_script');
        if (savedScript) setScript(savedScript);

        const savedSpeed = localStorage.getItem('voxplain_prompt_speed');
        if (savedSpeed) setSpeed(Number(savedSpeed));

        const savedSize = localStorage.getItem('voxplain_prompt_size');
        if (savedSize) setFontSize(Number(savedSize));
    }, []);

    // Save prefs
    useEffect(() => {
        localStorage.setItem('voxplain_prompt_speed', String(speed));
        localStorage.setItem('voxplain_prompt_size', String(fontSize));
    }, [speed, fontSize]);


    // Recorder Hook (We lift it here to coordinate "Start Both")
    // Wait, the Recorder component handles its own hook... 
    // To implement "Start Both", we ideally feed the control down or lift logic up.
    // The cleanest way given existing code is to Lift the hook usage HERE, 
    // and pass the state/methods DOWN to a "StatelessRecorder" or just render custom UI here.
    // 
    // HOWEVER, modifying `Recorder.tsx` to accept external control is invasive.
    // A better approach for this specialized mode matches the requirement "reuse existing recorder UI if possible".
    // 
    // Let's instantiate `useRecorder` HERE, and create a custom side-panel UI that behaves similar to the main one,
    // OR try to pass control props to `Recorder`.
    // 
    // Let's use `useRecorder` here directly and build a compact recorder UI for the right panel. 
    // This gives us full control for the "Start Both" button.

    const recorder = useRecorder();

    // Coordinate Start Both
    const handleStartBoth = async () => {
        setIsPlaying(true);
        await recorder.startRecording();
    };

    const handleStopBoth = () => {
        setIsPlaying(false);
        recorder.stopRecording();
    };

    // Forward the file
    const handleAnalyze = () => {
        if (recorder.audioBlob) {
            const file = new File([recorder.audioBlob], "teleprompter_recording.webm", { type: recorder.audioBlob.type || 'audio/webm' });
            onRecordingComplete(file);
        }
    };


    return (
        <div className="flex flex-col lg:flex-row h-[calc(100vh-140px)] gap-6">

            {/* LEFT COLUMN: Teleprompter / Editor */}
            <div className="flex-1 min-h-[400px] h-full transition-all">
                {view === 'editor' ? (
                    <ScriptEditor
                        value={script}
                        onChange={setScript}
                        onSwitchToPrompter={() => setView('prompter')}
                    />
                ) : (
                    <TeleprompterDisplay
                        script={script}
                        onBackToEditor={() => {
                            setIsPlaying(false);
                            setView('editor');
                        }}
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
                )}
            </div>

            {/* RIGHT COLUMN: Recorder & Actions */}
            <div className="w-full lg:w-96 flex flex-col space-y-4">

                {/* Status Card */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 flex flex-col items-center justify-center min-h-[200px]">
                    {/* Timer Display */}
                    <div className={clsx(
                        "text-5xl font-mono font-bold tracking-wider mb-2",
                        recorder.isRecording ? "text-red-500 animate-pulse" : "text-slate-800"
                    )}>
                        {Math.floor(recorder.recordingTime / 60)}:{(recorder.recordingTime % 60).toString().padStart(2, '0')}
                    </div>
                    <div className="text-sm text-slate-500 uppercase tracking-widest font-medium mb-6">
                        {recorder.isRecording ? "Recording Live" : "Ready"}
                    </div>

                    {/* Custom Controls for Teleprompter Mode */}
                    {!recorder.audioUrl ? (
                        !recorder.isRecording ? (
                            <div className="flex flex-col items-center space-y-3 w-full">
                                {/* Start BOTH Button */}
                                {view === 'prompter' && (
                                    <button
                                        onClick={handleStartBoth}
                                        disabled={recorder.isInitializing}
                                        className="w-full py-4 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold shadow-lg shadow-red-200 transaction-all hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center space-x-2"
                                    >
                                        <Mic className="w-5 h-5" />
                                        <span>Start Both</span>
                                    </button>
                                )}

                                {/* Start Recording Only */}
                                <button
                                    onClick={recorder.startRecording}
                                    disabled={recorder.isInitializing}
                                    className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium transition-colors"
                                >
                                    Record Audio Only
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={handleStopBoth}
                                className="w-20 h-20 bg-slate-900 hover:bg-black text-white rounded-full flex items-center justify-center shadow-xl transition-all hover:scale-110 active:scale-95"
                            >
                                <div className="w-8 h-8 bg-white rounded-sm" />
                            </button>
                        )
                    ) : (
                        <div className="w-full flex flex-col space-y-4 animate-fade-in">
                            <div className="p-4 bg-green-50 rounded-xl border border-green-100 flex items-center space-x-3">
                                <CheckCircle2 className="w-6 h-6 text-green-600" />
                                <div>
                                    <p className="font-medium text-green-900">Recording Saved</p>
                                    <p className="text-xs text-green-700">Ready to analyze</p>
                                </div>
                            </div>

                            <audio src={recorder.audioUrl} controls className="w-full h-10 rounded" />

                            <div className="flex space-x-3">
                                <button
                                    onClick={recorder.resetRecording}
                                    className="flex-1 py-3 bg-white border border-slate-300 text-slate-600 rounded-xl font-medium hover:bg-slate-50 transition-colors"
                                >
                                    Retry
                                </button>
                                <button
                                    onClick={handleAnalyze}
                                    className="flex-[2] py-3 bg-brand-600 text-white rounded-xl font-medium hover:bg-brand-700 shadow-md transition-colors"
                                >
                                    Analyze Report
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Instructions / Tips */}
                <div className="bg-blue-50 text-blue-800 p-4 rounded-xl text-sm leading-relaxed border border-blue-100">
                    <strong>Pro Tip:</strong> Place your camera lens near the top of the text to maintain better eye contact while reading.
                </div>

            </div>
        </div>
    );
};
