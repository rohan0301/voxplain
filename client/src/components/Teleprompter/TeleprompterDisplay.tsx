import React, { useRef, useEffect, useCallback } from 'react';
import { Play, Pause, RotateCcw, Monitor, MoveVertical } from 'lucide-react';
import clsx from 'clsx';

interface TeleprompterDisplayProps {
    script: string;
    onBackToEditor: () => void;
    // External control hooks
    isPlaying: boolean;
    onTogglePlay: () => void;
    speed: number;
    setSpeed: (s: number) => void;
    fontSize: number;
    setFontSize: (s: number) => void;
    mirror: boolean;
    setMirror: (b: boolean) => void;
    focusMode: boolean;
    setFocusMode: (b: boolean) => void;
}

export const TeleprompterDisplay: React.FC<TeleprompterDisplayProps> = ({
    script,
    onBackToEditor,
    isPlaying,
    onTogglePlay,
    speed,
    setSpeed,
    fontSize,
    setFontSize,
    mirror,
    setMirror,
    focusMode,
    setFocusMode
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const requestRef = useRef<number | undefined>(undefined);
    const lastTimeRef = useRef<number | undefined>(undefined);

    // Scroll Logic
    const animate = useCallback((time: number) => {
        if (!isPlaying || !containerRef.current) return;

        if (lastTimeRef.current !== undefined) {
            // const deltaTime = time - lastTimeRef.current;
            // Speed factor: 1 = slow crop, 100 = fast
            // Pixels per second approximation
            // Let's say max speed 100 = 200px/sec?

            const pixelsPerFrame = (speed / 10) * 0.5; // Tuning
            containerRef.current.scrollTop += pixelsPerFrame;
        }

        lastTimeRef.current = time;
        requestRef.current = requestAnimationFrame(animate);
    }, [isPlaying, speed]);

    useEffect(() => {
        if (isPlaying) {
            requestRef.current = requestAnimationFrame(animate);
        } else {
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
            lastTimeRef.current = undefined; // Reset delta tracking on pause
        }
        return () => {
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
        };
    }, [isPlaying, animate]);


    // Handle Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.code === 'Space') {
                e.preventDefault(); // Prevent page scroll
                onTogglePlay();
            } else if (e.code === 'ArrowUp') {
                e.preventDefault();
                setSpeed(Math.min(100, speed + 5));
            } else if (e.code === 'ArrowDown') {
                e.preventDefault();
                setSpeed(Math.max(1, speed - 5));
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onTogglePlay, speed, setSpeed]);


    const resetScroll = () => {
        if (containerRef.current) {
            containerRef.current.scrollTop = 0;
        }
    };

    return (
        <div className="flex flex-col h-full bg-slate-900 rounded-2xl shadow-xl border border-slate-700 overflow-hidden text-white relative group">

            {/* Top Controls Overlay (Visible on hover) */}
            <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity z-20 flex justify-between items-start">
                <button
                    onClick={onBackToEditor}
                    className="text-xs bg-white/10 hover:bg-white/20 px-3 py-1 rounded backdrop-blur-sm"
                >
                    &larr; Edit Script
                </button>

                <div className="flex space-x-2">
                    <button onClick={() => setMirror(!mirror)} className={clsx("p-2 rounded hover:bg-white/20", mirror && "bg-brand-500/50 text-brand-300")} title="Mirror Mode">
                        <Monitor className="w-5 h-5" />
                    </button>
                    <button onClick={() => setFocusMode(!focusMode)} className={clsx("p-2 rounded hover:bg-white/20", focusMode && "bg-brand-500/50 text-brand-300")} title="Focus Line">
                        <MoveVertical className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* Focus Mode Overlay Component - MOVED OUTSIDE of scroll container so it stays fixed */}
            {focusMode && (
                <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 h-24 border-y-2 border-red-500/30 bg-white/5 z-10" />
            )}

            {/* Main Display Area */}
            <div
                ref={containerRef}
                className="flex-1 overflow-y-auto no-scrollbar relative scroll-smooth z-0"
                style={{ scrollBehavior: 'auto' }} // Disable smooth scroll for JS animation
            >
                {/* Padding to allow scrolling text fully in/out */}
                <div style={{ height: '40%' }} />

                <div
                    ref={contentRef}
                    className={clsx(
                        "px-8 md:px-12 max-w-3xl mx-auto font-medium transition-all duration-300",
                        mirror && "scale-x-[-1]"
                    )}
                    style={{
                        fontSize: `${fontSize}px`,
                        lineHeight: 1.5
                    }}
                >
                    <div className={clsx("relative z-10 whitespace-pre-wrap", focusMode && "opacity-90")}>
                        {script}
                    </div>
                </div>

                <div style={{ height: '40%' }} />
            </div>

            {/* Speed / Font Controls (Bottom) */}
            <div className="p-4 bg-slate-800 border-t border-slate-700 flex flex-wrap items-center gap-4 z-20">

                {/* Play/Pause */}
                <button
                    onClick={onTogglePlay}
                    className="w-12 h-12 flex items-center justify-center bg-brand-600 hover:bg-brand-500 rounded-full shadow-lg transition-transform hover:scale-105 active:scale-95"
                >
                    {isPlaying ? <Pause className="fill-current text-white" /> : <Play className="fill-current text-white ml-1" />}
                </button>

                <button onClick={resetScroll} className="w-12 h-12 flex items-center justify-center bg-slate-700 hover:bg-slate-600 rounded-full shadow-lg transition-transform hover:scale-105 active:scale-95" title="Reset to Top">
                    <RotateCcw className="w-5 h-5 text-white" />
                </button>

                {/* Speed Slider */}
                <div className="flex flex-col flex-1 min-w-[120px]">
                    <div className="flex justify-between text-xs text-slate-400 mb-1">
                        <span>Speed</span>
                        <span>{speed}</span>
                    </div>
                    <input
                        type="range" min="1" max="100" value={speed}
                        onChange={(e) => setSpeed(Number(e.target.value))}
                        className="w-full accent-brand-500 h-1.5 bg-slate-600 rounded-lg appearance-none cursor-pointer"
                    />
                </div>

                {/* Font Size Slider */}
                <div className="flex flex-col flex-1 min-w-[120px]">
                    <div className="flex justify-between text-xs text-slate-400 mb-1">
                        <span>Text Size</span>
                        <span>{fontSize}px</span>
                    </div>
                    <input
                        type="range" min="20" max="80" value={fontSize}
                        onChange={(e) => setFontSize(Number(e.target.value))}
                        className="w-full accent-brand-500 h-1.5 bg-slate-600 rounded-lg appearance-none cursor-pointer"
                    />
                </div>
            </div>
        </div>
    );
};
