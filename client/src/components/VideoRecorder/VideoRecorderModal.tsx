import React, { useRef, useEffect, useState } from 'react';
import { useVideoRecorder } from '../../hooks/useVideoRecorder';
import { TeleprompterDisplay } from '../Teleprompter/TeleprompterDisplay';
import { X, Video, RefreshCw, Wand2, Download, AlertTriangle, ScanFace, Eye, Smile, Activity } from 'lucide-react';
import clsx from 'clsx';
import { detectLandmarks } from '../../video/faceLandmarks';
import { analyzeVideoMetrics } from '../../video/faceMetrics';
import type { VideoAnalysisResult } from '../../types/PracticeResult';

interface VideoRecorderModalProps {
    onClose: () => void;
    onAnalyze: (file: File, metrics?: VideoAnalysisResult) => void;
    script: string;
}

export const VideoRecorderModal: React.FC<VideoRecorderModalProps> = ({ onClose, onAnalyze, script }) => {
    const {
        isRecording,
        isInitializing,
        recordingTime,
        videoUrl,
        videoBlob,
        startRecording,
        stopRecording,
        resetRecording,
        previewStream,
        error,
        hasCameraPermission
    } = useVideoRecorder();

    // Teleprompter Controls
    const [showPrompter] = useState(true);
    const [prompterMode, setPrompterMode] = useState<'overlay' | 'side-by-side'>('side-by-side');
    const [opacity, setOpacity] = useState(70);

    // Teleprompter Engine State
    const [isPlaying, setIsPlaying] = useState(false);
    const [speed, setSpeed] = useState(30);
    const [fontSize, setFontSize] = useState(32);
    const [mirror, setMirror] = useState(false);
    const [focusMode, setFocusMode] = useState(false);

    // Analysis State
    const [isAnalyzingFace, setIsAnalyzingFace] = useState(false);
    const [faceAnalysisResult, setFaceAnalysisResult] = useState<VideoAnalysisResult | null>(null);
    const [analysisProgress, setAnalysisProgress] = useState(0);

    const videoRef = useRef<HTMLVideoElement>(null);

    // Attach stream to video element
    useEffect(() => {
        if (videoRef.current && previewStream && !videoUrl) {
            videoRef.current.srcObject = previewStream;
        }
    }, [previewStream, videoUrl]);

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

    const handleAnalyze = async () => {
        if (!videoBlob) return;

        setIsAnalyzingFace(true);
        setAnalysisProgress(0);

        try {
            const videoEl = document.querySelector('video[src^="blob:"]') as HTMLVideoElement;
            let metrics: VideoAnalysisResult | undefined;

            if (videoEl) {
                const frames = await detectLandmarks(videoEl, (pct) => setAnalysisProgress(pct), recordingTime);
                metrics = analyzeVideoMetrics(frames);
                setFaceAnalysisResult(metrics);
            }

            const file = new File([videoBlob], "video_recording.webm", { type: videoBlob.type });
            onAnalyze(file, metrics);

        } catch (err) {
            console.error("Face analysis failed", err);
            // Proceed with audio only
            const file = new File([videoBlob], "video_recording.webm", { type: videoBlob.type });
            onAnalyze(file);
        } finally {
            setIsAnalyzingFace(false);
        }
    };

    const handleDownload = () => {
        if (videoUrl) {
            const a = document.createElement('a');
            a.href = videoUrl;
            a.download = `voxplain-recording-${new Date().toISOString()}.webm`;
            a.click();
        }
    };

    // Helper for reliability badge
    const getQualityBadge = (q?: string) => {
        if (!q || q === 'low') return <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded text-xs font-bold uppercase">Low Quality</span>;
        if (q === 'medium') return <span className="bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded text-xs font-bold uppercase">Medium</span>;
        return <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded text-xs font-bold uppercase">High Quality</span>;
    };

    return (
        <div className="fixed inset-0 z-50 bg-black flex flex-col text-white animate-fade-in">

            {/* Header */}
            <div className="h-16 px-6 flex items-center justify-between border-b border-white/10 bg-black/50 backdrop-blur-sm z-50 relative">
                <div className="flex items-center space-x-3">
                    <div className="bg-red-600 p-1.5 rounded-full">
                        <Video className="w-4 h-4 text-white" />
                    </div>
                    <span className="font-bold text-lg">Practice Recording</span>
                </div>

                <div className="flex items-center space-x-4">
                    {/* Recording Timer */}
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

                {/* Video Area */}
                <div className={clsx(
                    "relative bg-black transition-all flex items-center justify-center",
                    prompterMode === 'side-by-side' && showPrompter ? "w-2/3" : "w-full"
                )}>
                    {videoUrl ? (
                        <video
                            src={videoUrl}
                            controls
                            className="max-h-full max-w-full rounded-lg shadow-2xl"
                        />
                    ) : (
                        <video
                            ref={videoRef}
                            autoPlay
                            muted
                            playsInline
                            className={clsx(
                                "max-h-full max-w-full object-cover transform scale-x-[-1] rounded-lg shadow-2xl", // Mirror camera preview by default for better UX
                                !hasCameraPermission && "hidden"
                            )}
                        />
                    )}

                    {/* Permissions Error */}
                    {error && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-20">
                            <div className="bg-red-900/50 border border-red-500 text-red-200 p-6 rounded-xl max-w-md text-center">
                                <p className="font-bold mb-2">Camera Access Error</p>
                                <p>{error}</p>
                            </div>
                        </div>
                    )}

                    {/* Overlay Teleprompter */}
                    {showPrompter && prompterMode === 'overlay' && !videoUrl && script && (
                        <div
                            className="absolute inset-x-0 top-10 bottom-24 mx-auto max-w-2xl rounded-xl overflow-hidden pointer-events-auto"
                            style={{ backgroundColor: `rgba(0, 0, 0, ${opacity / 100})` }}
                        >
                            <TeleprompterDisplay
                                script={script}
                                onBackToEditor={() => { }} // No-op in overlay
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

                    {/* Controls Overlay (Bottom Center) if Overlay Mode or Full Screen */}
                    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center space-x-6 z-30">
                        {!videoUrl ? (
                            !isRecording ? (
                                <button
                                    onClick={handleStartBoth}
                                    disabled={!hasCameraPermission || isInitializing}
                                    className="group flex flex-col items-center justify-center w-20 h-20 bg-red-600 rounded-full shadow-lg shadow-red-900/50 hover:bg-red-700 hover:scale-105 active:scale-95 transition-all"
                                >
                                    <div className="w-8 h-8 rounded-sm bg-white mask mask-circle" />
                                    {/* Actually just big red button style */}
                                    <div className="w-8 h-8 bg-white rounded-full" />
                                </button>
                            ) : (
                                <button
                                    onClick={handleStopBoth}
                                    className="group flex items-center justify-center w-20 h-20 bg-white rounded-full shadow-lg hover:bg-slate-200 hover:scale-105 active:scale-95 transition-all"
                                >
                                    <div className="w-8 h-8 bg-red-600 rounded-md" />
                                </button>
                            )
                        ) : (
                            <div className="flex space-x-4 bg-black/50 backdrop-blur-md p-2 rounded-2xl border border-white/10">
                                <button onClick={resetRecording} className="flex flex-col items-center justify-center w-16 h-16 rounded-xl hover:bg-white/10 text-white/80 hover:text-white transition-all">
                                    <RefreshCw className="w-6 h-6 mb-1" />
                                    <span className="text-xs">Retake</span>
                                </button>
                                <button onClick={handleDownload} className="flex flex-col items-center justify-center w-16 h-16 rounded-xl hover:bg-white/10 text-white/80 hover:text-white transition-all">
                                    <Download className="w-6 h-6 mb-1" />
                                    <span className="text-xs">Save</span>
                                </button>

                                {/* New Action Buttons */}
                                <div className="w-px h-12 bg-white/20 mx-2" />

                                <button
                                    onClick={handleAnalyze}
                                    disabled={isAnalyzingFace}
                                    className="flex flex-col items-center justify-center w-32 h-16 bg-brand-600 hover:bg-brand-500 rounded-xl text-white shadow-lg transition-all border border-brand-500 disabled:opacity-50"
                                >
                                    {isAnalyzingFace ? (
                                        <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin mb-1" />
                                    ) : (
                                        <Wand2 className="w-6 h-6 mb-1 text-white" />
                                    )}
                                    <span className="text-[10px] font-bold uppercase tracking-wide">
                                        {isAnalyzingFace ? `${Math.round(analysisProgress)}%` : "Analyze"}
                                    </span>
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Side Panel: Results OR Teleprompter */}
                {/* Logic: If we have results, show results overlay or replace side panel? 
                    Let's replace side panel or overlay it. */}
                {faceAnalysisResult ? (
                    <div className="w-96 border-l border-white/10 bg-slate-900 flex flex-col overflow-y-auto animate-slide-in-right">
                        <div className="p-6">
                            <h3 className="text-xl font-bold mb-6 flex items-center">
                                <ScanFace className="w-6 h-6 mr-2 text-blue-400" />
                                Face Analysis
                            </h3>

                            <div className="space-y-6">
                                {/* Tracking Quality */}
                                <div className="bg-slate-800 p-4 rounded-xl border border-white/5">
                                    <div className="flex justify-between items-center mb-2">
                                        <span className="text-slate-400 text-sm font-medium uppercase">Tracking Confidence</span>
                                        {getQualityBadge(faceAnalysisResult.trackingQuality)}
                                    </div>
                                    <p className="text-xs text-slate-500">
                                        {faceAnalysisResult.trackingQuality === 'low'
                                            ? "We couldn't see your face clearly. Try improving lighting or centering yourself."
                                            : "Good face visibility detected."}
                                    </p>
                                </div>

                                {faceAnalysisResult.trackingQuality !== 'low' ? (
                                    <>
                                        {/* Eye Contact */}
                                        <div className="bg-slate-800 p-4 rounded-xl border border-white/5">
                                            <div className="flex items-center gap-3 mb-4">
                                                <div className="p-2 bg-blue-500/20 text-blue-400 rounded-lg">
                                                    <Eye className="w-5 h-5" />
                                                </div>
                                                <div>
                                                    <div className="text-2xl font-bold">{faceAnalysisResult.eyeContactScore}%</div>
                                                    <div className="text-xs text-slate-400">Eye Contact</div>
                                                </div>
                                            </div>
                                            {/* Progress Bar */}
                                            <div className="h-1.5 w-full bg-slate-700 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-blue-500 rounded-full transition-all duration-1000"
                                                    style={{ width: `${faceAnalysisResult.eyeContactScore}%` }}
                                                />
                                            </div>
                                        </div>

                                        {/* Smile */}
                                        <div className="bg-slate-800 p-4 rounded-xl border border-white/5">
                                            <div className="flex items-center gap-3 mb-4">
                                                <div className="p-2 bg-green-500/20 text-green-400 rounded-lg">
                                                    <Smile className="w-5 h-5" />
                                                </div>
                                                <div>
                                                    <div className="text-2xl font-bold">{faceAnalysisResult.smilePct}%</div>
                                                    <div className="text-xs text-slate-400">Smile Frequency</div>
                                                </div>
                                            </div>
                                            <div className="h-1.5 w-full bg-slate-700 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-green-500 rounded-full transition-all duration-1000"
                                                    style={{ width: `${faceAnalysisResult.smilePct}%` }}
                                                />
                                            </div>
                                        </div>

                                        {/* Expressiveness */}
                                        <div className="bg-slate-800 p-4 rounded-xl border border-white/5">
                                            <div className="flex items-center gap-3 mb-2">
                                                <div className="p-2 bg-purple-500/20 text-purple-400 rounded-lg">
                                                    <Activity className="w-5 h-5" />
                                                </div>
                                                <div>
                                                    <div className="text-lg font-bold capitalize">{faceAnalysisResult.expressivenessLevel}</div>
                                                    <div className="text-xs text-slate-400">Expressiveness</div>
                                                </div>
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <div className="p-4 bg-red-900/20 border border-red-500/30 rounded-xl text-red-200 text-sm flex gap-3">
                                        <AlertTriangle className="w-5 h-5 shrink-0" />
                                        <p>Analysis metrics unavailable due to low tracking quality.</p>
                                    </div>
                                )}

                                <button
                                    onClick={() => setFaceAnalysisResult(null)}
                                    className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-medium transition-colors"
                                >
                                    Close Results
                                </button>
                            </div>
                        </div>
                    </div>
                ) : (
                    // Side Panel Teleprompter
                    showPrompter && prompterMode === 'side-by-side' && !videoUrl && (
                        <div className="w-1/3 border-l border-white/10 bg-slate-900 flex flex-col">
                            <div className="flex-1 overflow-hidden relative">
                                <TeleprompterDisplay
                                    script={script}
                                    onBackToEditor={() => { }} // No-op here
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
                    )
                )}
            </div>

            {/* Bottom Config Bar (Only useful if prep-stage) */}
            {!isRecording && !videoUrl && (
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
