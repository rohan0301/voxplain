import clsx from 'clsx';
import { Mic, BarChart2, Type, Mic2, Lock, User, LogIn, UserPlus, FolderOpen, LogOut } from 'lucide-react';
import { useState } from 'react';

interface TopNavProps {
    currentMode: string;
    onModeChange: (mode: string) => void;
    isLoggedIn: boolean;
    onLoginClick: () => void;
    onLogoutClick: () => void;
    userEmail?: string | null;
    onLogoClick?: () => void; // Optional to prevent breaking if not passed immediately, but we will pass it.
}

export const TopNav = ({ currentMode, onModeChange, isLoggedIn, onLoginClick, onLogoutClick, userEmail, onLogoClick }: TopNavProps) => {
    const [showUserMenu, setShowUserMenu] = useState(false);

    const modes = [
        { id: 'projects', label: 'Projects', icon: FolderOpen },
        { id: 'transcribe', label: 'Transcribe', icon: Mic2 },
        { id: 'practice', label: 'Practice', icon: Type },
        { id: 'analyze', label: 'Analyze', icon: BarChart2 },
        // History removed/merged into Projects
    ];

    const isHome = currentMode === '';
    const userInitials = userEmail
        ? userEmail
            .split('@')[0]
            .split(/[._-]/)
            .filter(Boolean)
            .slice(0, 2)
            .map(part => part[0]?.toUpperCase())
            .join('') || 'U'
        : 'U';

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
                        const isLocked = !isLoggedIn;
                        const isActive = currentMode === mode.id && isLoggedIn;

                        return (
                            <div key={mode.id} className="relative group">
                                <button
                                    onClick={() => isLoggedIn && onModeChange(mode.id)}
                                    disabled={isLocked}
                                    className={clsx(
                                        "px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200 flex items-center gap-2",
                                        isActive
                                            ? (isHome ? "bg-white/20 text-white shadow-sm ring-1 ring-white/10" : "bg-white text-brand-700 shadow-sm ring-1 ring-slate-100")
                                            : (isHome ? "text-slate-400" : "text-slate-500"),
                                        isLocked
                                            ? "opacity-60 cursor-not-allowed hover:bg-transparent"
                                            : (isHome ? "hover:text-white hover:bg-white/10" : "hover:text-slate-900 hover:bg-slate-200/50")
                                    )}
                                >
                                    {isLocked && <Lock className="w-3 h-3" />}
                                    <span>{mode.label}</span>
                                </button>

                                {/* Tooltip for locked state */}
                                {isLocked && (
                                    <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[10px] px-2 py-1 rounded shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                                        Log in to access
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Right: User Action */}
                <div className="flex items-center relative">
                    {isLoggedIn ? (
                        <div className="relative">
                            <button
                                onClick={() => setShowUserMenu(!showUserMenu)}
                                className={clsx(
                                    "w-9 h-9 rounded-full border flex items-center justify-center font-bold text-xs transition-colors focus:outline-none focus:ring-2",
                                    isHome
                                        ? "bg-white/10 hover:bg-white/20 border-white/10 text-white focus:ring-white/20"
                                        : "bg-brand-100 hover:bg-brand-200 border-brand-200 text-brand-700 focus:ring-brand-500/20"
                                )}
                                title="Account menu"
                            >
                                {userInitials}
                            </button>

                            {showUserMenu && (
                                <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden transform origin-top-right transition-all animate-fade-in z-50">
                                    <div className="px-3 py-2 border-b border-slate-100">
                                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Signed in</p>
                                        {userEmail && <p className="text-sm text-slate-700 truncate">{userEmail}</p>}
                                    </div>
                                    <div className="p-1">
                                        <button
                                            onClick={() => {
                                                onLogoutClick();
                                                setShowUserMenu(false);
                                            }}
                                            className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg flex items-center gap-2 font-medium"
                                        >
                                            <LogOut className="w-4 h-4" />
                                            Log out
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="relative">
                            <button
                                onClick={() => setShowUserMenu(!showUserMenu)}
                                className={clsx(
                                    "w-9 h-9 rounded-full flex items-center justify-center transition-colors focus:outline-none focus:ring-2",
                                    isHome 
                                        ? "bg-white/10 hover:bg-white/20 border-transparent text-white focus:ring-white/20" 
                                        : "bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-600 focus:ring-brand-500/20 border"
                                )}
                                title="Log in"
                            >
                                <User className="w-5 h-5" />
                            </button>

                            {/* Dropdown Menu */}
                            {showUserMenu && (
                                <div className="absolute right-0 top-full mt-2 w-40 bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden transform origin-top-right transition-all animate-fade-in z-50">
                                    <div className="p-1">
                                        <button
                                            onClick={() => {
                                                onLoginClick();
                                                setShowUserMenu(false);
                                            }}
                                            className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-lg flex items-center gap-2 font-medium"
                                        >
                                            <LogIn className="w-4 h-4 text-slate-400" />
                                            Log in
                                        </button>
                                        <button
                                            onClick={() => {
                                                onLoginClick();
                                                setShowUserMenu(false);
                                            }}
                                            className="w-full text-left px-3 py-2 text-sm text-brand-600 hover:bg-brand-50 rounded-lg flex items-center gap-2 font-medium"
                                        >
                                            <UserPlus className="w-4 h-4" />
                                            Sign up
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </nav>
    );
};
