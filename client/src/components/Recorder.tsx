import React from 'react';
import { Mic, Square, RotateCcw, ArrowRight, Loader2 } from 'lucide-react';
import { useRecorder } from '../hooks/useRecorder';
import clsx from 'clsx';

interface RecorderProps {
    onRecordingComplete: (file: File) => void;
}

export const Recorder: React.FC<RecorderProps> = ({ onRecordingComplete }) => {
    // Destructure isInitializing
    const { isRecording, isInitializing, recordingTime, audioUrl, audioBlob, startRecording, stopRecording, resetRecording } = useRecorder();

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const handleAnalyze = () => {
        if (audioBlob) {
            // Use the generic type since we handle mime in hook, but for file constructor 'audio/webm' is usually safe or empty
            const file = new File([audioBlob], "recording.webm", { type: audioBlob.type || 'audio/webm' });
            onRecordingComplete(file);
        }
    };

    return (
        <div className="flex flex-col items-center justify-center w-full">

            {/* Timer / Status */}
            <div className="mb-8 text-center">
                <div className={clsx(
                    "text-5xl font-mono font-semibold tracking-wider transition-colors",
                    isRecording ? "text-red-500" : "text-slate-700",
                    isInitializing && "opacity-50"
                )}>
                    {formatTime(recordingTime)}
                </div>
                <p className="mt-2 text-slate-500 text-sm">
                    {isInitializing ? 'Starting microphone...' :
                        isRecording ? 'Recording is live...' : 'Ready to record'}
                </p>
            </div>

            {/* Visualizer Placeholder */}
            <div className="h-24 w-full max-w-xs flex items-center justify-center space-x-1 mb-8">
                {isRecording ? (
                    Array.from({ length: 12 }).map((_, i) => (
                        <div
                            key={i}
                            className="w-2 bg-red-400 rounded-full animate-pulse"
                            style={{ height: `${Math.random() * 100}%`, animationDelay: `${i * 0.1}s` }}
                        />
                    ))
                ) : (
                    <div className="w-full h-1 bg-slate-100 rounded-full" />
                )}
            </div>

            {/* Controls */}
            <div className="flex items-center space-x-6">
                {!audioUrl ? (
                    !isRecording ? (
                        <button
                            onClick={startRecording}
                            disabled={isInitializing}
                            className={clsx(
                                "group flex flex-col items-center justify-center w-20 h-20 rounded-full shadow-lg transition-all",
                                isInitializing ? "bg-slate-200 cursor-not-allowed" : "bg-red-500 hover:bg-red-600 hover:scale-105 active:scale-95"
                            )}
                        >
                            {isInitializing ? (
                                <Loader2 className="w-8 h-8 text-slate-500 animate-spin" />
                            ) : (
                                <Mic className="w-8 h-8 text-white" />
                            )}
                        </button>
                    ) : (
                        <button
                            onClick={stopRecording}
                            className="group flex flex-col items-center justify-center w-20 h-20 bg-slate-800 rounded-full shadow-lg hover:bg-slate-900 transition-all hover:scale-105 active:scale-95"
                        >
                            <Square className="w-8 h-8 text-white fill-current" />
                        </button>
                    )
                ) : (
                    <div className="flex flex-col items-center space-y-4">
                        <div className="flex items-center space-x-4">
                            <button onClick={resetRecording} className="p-3 text-slate-500 hover:bg-slate-100 rounded-full transition-colors" title="Record Again">
                                <RotateCcw className="w-6 h-6" />
                            </button>

                            <audio src={audioUrl} controls className="h-10 rounded-full" />

                            <button
                                onClick={handleAnalyze}
                                className="flex items-center space-x-1 px-5 py-3 bg-brand-600 text-white rounded-full font-medium shadow-md hover:bg-brand-700 transition-colors"
                            >
                                <span>Analyze</span>
                                <ArrowRight className="w-4 h-4" />
                            </button>
                        </div>
                        <p className="text-xs text-slate-400">Review your audio before analyzing</p>
                    </div>
                )}
            </div>

        </div>
    );
};
