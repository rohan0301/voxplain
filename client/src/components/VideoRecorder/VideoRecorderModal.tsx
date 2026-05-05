import React, { useState } from 'react';
import { useRecorder } from '../../hooks/useRecorder';
import { TeleprompterDisplay } from '../Teleprompter/TeleprompterDisplay';
import { X, Mic, Trash2, Wand2, Download } from 'lucide-react';
import clsx from 'clsx';

interface VideoRecorderModalProps {
    onClose: () => void;
    onAnalyze: (file: File) => void;
    script: string;
}

export const VideoRecorderModal: React.FC<VideoRecorderModalProps> = ({ onClose, onAnalyze, script }) => {
    const {
        isRecording,
        isInitializing,
        recordingTime,
        audioUrl,
        audioBlob,
        startRecording,
        stopRecording,
        resetRecording,
    } = useRecorder();

    const [showPrompter] = useState(true);
    const [prompterMode, setPrompterMode] = useState<'overlay' | 'side-by-side'>('side-by-side');
    const [opacity, setOpacity] = useState(70);

    const [isPlaying, setIsPlaying] = useState(false);
    const [speed, setSpeed] = useState(30);
    const [fontSize, setFontSize] = useState(32);
    const [mirror, setMirror] = useState(false);
    const [focusMode, setFocusMode] = useState(false);

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const handleStartBoth = async () => {
        setIsPlaying(true);
        await startRecording();
    };

    const handleStopBoth = () => {
        setIsPlaying(false);
        stopRecording();
    };

    const handleAnalyze = () => {
        if (!audioBlob) return;
        const ext = audioBlob.type.includes('mp4') ? 'mp4' : 'webm';
        const file = new File([audioBlob], `audio_recording.${ext}`, { type: audioBlob.type });
        onAnalyze(file);
    };

    const handleDownload = () => {
        if (audioUrl) {
            const a = document.createElement('a');
            a.href = audioUrl;
            a.download = `voxplain-recording-${new Date().toISOString()}.webm`;
            a.click();
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-black flex flex-col text-white animate-fade-in">

            {/* Header */}
            <div className="h-16 px-6 flex items-center justify-between border-b border-white/10 bg-black/50 backdrop-blur-sm z-50 relative">
                <div className="flex items-center space-x-3">
                    <div className="bg-red-600 p-1.5 rounded-full">
                        <Mic className="w-4 h-4 text-white" />
                    </div>
                    <span className="font-bold text-lg">Practice Recording</span>
                </div>

                <div className="flex items-center space-x-4">
                    <div className={clsx(
                        "font-mono text-xl font-bold px-4 py-1 rounded-full text-white/90 border border-white/10",
                        isRecording && "bg-red-500/20 text-red-500 border-red-500/50 animate-pulse"
                    )}>
                        {formatTime(recordingTime)}
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                        <X className="w-6 h-6" />
                    </button>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 flex overflow-hidden relative">

                {/* Audio / Main Area */}
                <div className={clsx(
                    "relative bg-black transition-all flex items-center justify-center",
                    prompterMode === 'side-by-side' && showPrompter && !audioUrl ? "w-2/3" : "w-full"
                )}>
                    {!audioUrl ? (
                        <div className="flex flex-col items-center justify-center space-y-4">
                            <div className={clsx(
                                "w-24 h-24 rounded-full flex items-center justify-center border-2 transition-all",
                                isRecording
                                    ? "bg-red-500/20 border-red-500 animate-pulse"
                                    : "bg-white/5 border-white/20"
                            )}>
                                <Mic className={clsx("w-10 h-10", isRecording ? "text-red-400" : "text-white/40")} />
                            </div>
                            <p className="text-white/40 text-sm">
                                {isRecording ? "Recording..." : "Ready to record"}
                            </p>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center space-y-4">
                            <audio src={audioUrl} controls className="w-80" />
                        </div>
                    )}

                    {/* Overlay Teleprompter */}
                    {showPrompter && prompterMode === 'overlay' && !audioUrl && script && (
                        <div
                            className="absolute inset-x-0 top-10 bottom-24 mx-auto max-w-2xl rounded-xl overflow-hidden pointer-events-auto"
                            style={{ backgroundColor: `rgba(0, 0, 0, ${opacity / 100})` }}
                        >
                            <TeleprompterDisplay
                                script={script}
                                onBackToEditor={() => { }}
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
                    )}

                    {/* Controls (Bottom Center) */}
                    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center space-x-6 z-30">
                        {!audioUrl ? (
                            !isRecording ? (
                                <button
                                    onClick={handleStartBoth}
                                    disabled={isInitializing}
                                    className="flex items-center justify-center w-20 h-20 bg-red-600 rounded-full shadow-lg shadow-red-900/50 hover:bg-red-700 hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
                                >
                                    <div className="w-8 h-8 bg-white rounded-full" />
                                </button>
                            ) : (
                                <button
                                    onClick={handleStopBoth}
                                    className="flex items-center justify-center w-20 h-20 bg-white rounded-full shadow-lg hover:bg-slate-200 hover:scale-105 active:scale-95 transition-all"
                                >
                                    <div className="w-8 h-8 bg-red-600 rounded-md" />
                                </button>
                            )
                        ) : (
                            <div className="flex space-x-4 bg-black/50 backdrop-blur-md p-2 rounded-2xl border border-white/10">
                                <button onClick={resetRecording} className="flex flex-col items-center justify-center w-16 h-16 rounded-xl hover:bg-white/10 text-white/80 hover:text-white transition-all">
                                    <Trash2 className="w-6 h-6 mb-1" />
                                    <span className="text-xs">Delete</span>
                                </button>
                                <button onClick={handleDownload} className="flex flex-col items-center justify-center w-16 h-16 rounded-xl hover:bg-white/10 text-white/80 hover:text-white transition-all">
                                    <Download className="w-6 h-6 mb-1" />
                                    <span className="text-xs">Download</span>
                                </button>

                                <div className="w-px h-12 bg-white/20 mx-2" />

                                <button
                                    onClick={handleAnalyze}
                                    className="flex flex-col items-center justify-center w-32 h-16 bg-brand-600 hover:bg-brand-500 rounded-xl text-white shadow-lg transition-all border border-brand-500"
                                >
                                    <Wand2 className="w-6 h-6 mb-1 text-white" />
                                    <span className="text-[10px] font-bold uppercase tracking-wide">Analyze</span>
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Side Panel: Teleprompter */}
                {showPrompter && prompterMode === 'side-by-side' && !audioUrl && (
                    <div className="w-1/3 border-l border-white/10 bg-slate-900 flex flex-col">
                        <div className="flex-1 overflow-hidden relative">
                            <TeleprompterDisplay
                                script={script}
                                onBackToEditor={() => { }}
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
                    </div>
                )}
            </div>

            {/* Bottom Config Bar */}
            {!isRecording && !audioUrl && (
                <div className="h-14 bg-black border-t border-white/10 flex items-center justify-between px-6 z-40">
                    <div className="flex items-center space-x-4">
                        <span className="text-xs text-slate-400 font-medium uppercase tracking-wider">View Mode:</span>
                        <div className="flex bg-white/10 rounded-lg p-1">
                            <button
                                onClick={() => setPrompterMode('side-by-side')}
                                className={clsx("px-3 py-1 rounded text-xs transition-colors", prompterMode === 'side-by-side' ? "bg-white text-black font-bold" : "text-slate-300 hover:text-white")}
                            >
                                Side-by-Side
                            </button>
                            <button
                                onClick={() => setPrompterMode('overlay')}
                                className={clsx("px-3 py-1 rounded text-xs transition-colors", prompterMode === 'overlay' ? "bg-white text-black font-bold" : "text-slate-300 hover:text-white")}
                            >
                                Overlay
                            </button>
                        </div>
                    </div>

                    {prompterMode === 'overlay' && (
                        <div className="flex items-center space-x-3 w-48">
                            <span className="text-xs text-slate-400">Opacity</span>
                            <input
                                type="range" min="10" max="90" value={opacity}
                                onChange={(e) => setOpacity(Number(e.target.value))}
                                className="w-full accent-brand-500 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer"
                            />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
