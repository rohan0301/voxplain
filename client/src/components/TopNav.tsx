import clsx from 'clsx';
import { Mic, Type, Mic2, FolderOpen } from 'lucide-react';

interface TopNavProps {
    currentMode: string;
    onModeChange: (mode: string) => void;
    onLogoClick?: () => void;
}

export const TopNav = ({ currentMode, onModeChange, onLogoClick }: TopNavProps) => {
    const modes = [
        { id: 'projects', label: 'Projects', icon: FolderOpen },
        { id: 'transcribe', label: 'Transcribe', icon: Mic2 },
        { id: 'practice', label: 'Practice', icon: Type },
    ];

    const isHome = currentMode === '';

    return (
        <nav className={clsx(
            "fixed top-0 left-0 right-0 z-50 transition-all duration-300 border-b",
            isHome 
                ? "bg-black/40 backdrop-blur-md border-white/10" 
                : "bg-white/80 backdrop-blur-md border-slate-200/50"
        )}>
            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                {/* Left: Logo */}
                <div
                    onClick={onLogoClick}
                    className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity group"
                >
                    <div className={clsx("p-1.5 rounded-lg shadow-sm transition-all", isHome ? "bg-orange-500" : "bg-brand-600 group-hover:shadow-md")}>
                        <Mic className="w-5 h-5 text-white" />
                    </div>
                    <span className={clsx("font-bold text-lg tracking-tight transition-colors", isHome ? "text-white" : "text-slate-900 group-hover:text-brand-700")}>Voxplain</span>
                </div>

                {/* Center: Mode Selector */}
                <div className={clsx(
                    "hidden md:flex items-center p-1 rounded-full border",
                    isHome ? "bg-white/5 border-white/10" : "bg-slate-100/80 border-slate-200/50"
                )}>
                    {modes.map((mode) => {
                        const isActive = currentMode === mode.id;

                        return (
                            <div key={mode.id} className="relative group">
                                <button
                                    onClick={() => onModeChange(mode.id)}
                                    className={clsx(
                                        "px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200 flex items-center gap-2",
                                        isActive
                                            ? (isHome ? "bg-white/20 text-white shadow-sm ring-1 ring-white/10" : "bg-white text-brand-700 shadow-sm ring-1 ring-slate-100")
                                            : (isHome ? "text-slate-400" : "text-slate-500"),
                                        isHome ? "hover:text-white hover:bg-white/10" : "hover:text-slate-900 hover:bg-slate-200/50"
                                    )}
                                >
                                    <span>{mode.label}</span>
                                </button>
                            </div>
                        );
                    })}
                </div>

                <div className="w-[92px]" />
            </div>
        </nav>
    );
};
