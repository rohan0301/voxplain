import { ArrowRight } from 'lucide-react';

interface LandingHeroProps {
    onGetStarted: () => void;
    onLogin: () => void;
}

export const LandingHero = ({ onGetStarted, onLogin }: LandingHeroProps) => {
    return (
        <div className="relative min-h-[calc(100vh-64px)] w-full flex flex-col items-center justify-between bg-[#111111] overflow-hidden font-sans">
            {/* Background Image & Overlay */}
            <div className="absolute inset-0 z-0">
                <img 
                    src="/bg-hero.png" 
                    alt="Stage Background" 
                    className="absolute w-full h-full object-cover opacity-30 mix-blend-overlay"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#111111] via-[#111111]/80 to-[#111111]/40" />
                <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-orange-500/10 blur-[120px] rounded-full pointer-events-none" />
            </div>

            {/* Main Content Area */}
            <div className="relative z-10 flex flex-col items-center justify-center flex-1 w-full max-w-5xl mx-auto px-6 text-center pt-20 pb-16">
                
                {/* Headline */}
                <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-[5rem] font-black leading-[1.05] tracking-tight mb-8 text-white uppercase">
                    Master the<br />
                    stage<br />
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-orange-600">
                        today.
                    </span>
                </h1>

                {/* Subtitle */}
                <p className="text-slate-400 text-base md:text-lg max-w-2xl mx-auto mb-10 leading-relaxed font-medium">
                    Elevate your public speaking with real-time teleprompting, recording, and AI-driven insights on your pacing, clarity, and delivery.
                </p>

                {/* CTA Buttons */}
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4 w-full sm:w-auto">
                    <button
                        onClick={onGetStarted}
                        className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-4 rounded bg-[#f97316] hover:bg-[#ea580c] text-white font-bold transition-all"
                    >
                        Get Started
                        <ArrowRight className="w-5 h-5" />
                    </button>

                    <button
                        onClick={onLogin}
                        className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-4 rounded border border-white/20 hover:bg-white/5 text-white font-bold transition-all"
                    >
                        Log in
                    </button>
                </div>
            </div>

            {/* Bottom Stats Bar */}
            <div className="relative z-10 w-full border-t border-white/10 bg-black/40 backdrop-blur-md">
                <div className="max-w-7xl mx-auto px-6 py-6 md:py-8">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-4 divide-y md:divide-y-0 md:divide-x divide-white/10">
                        {/* Stat 1 */}
                        <div className="flex flex-col items-center justify-center pt-4 md:pt-0">
                            <div className="flex items-baseline gap-1">
                                <span className="text-4xl font-black text-white">10K</span>
                                <span className="text-orange-500 font-bold text-xl">+</span>
                            </div>
                            <span className="text-[10px] text-slate-400 font-bold tracking-widest uppercase mt-2 text-center max-w-[120px]">
                                Speeches Analyzed
                            </span>
                        </div>
                        
                        {/* Stat 2 */}
                        <div className="flex flex-col items-center justify-center pt-4 md:pt-0">
                            <div className="flex items-baseline gap-1">
                                <span className="text-4xl font-black text-white">50</span>
                                <span className="text-orange-500 font-bold text-xl">+</span>
                            </div>
                            <span className="text-[10px] text-slate-400 font-bold tracking-widest uppercase mt-2 text-center max-w-[120px]">
                                Metrics Tracked
                            </span>
                        </div>

                        {/* Stat 3 */}
                        <div className="flex flex-col items-center justify-center pt-4 md:pt-0">
                            <div className="flex items-baseline gap-1">
                                <span className="text-4xl font-black text-white">99</span>
                                <span className="text-orange-500 font-bold text-xl">%</span>
                            </div>
                            <span className="text-[10px] text-slate-400 font-bold tracking-widest uppercase mt-2 text-center max-w-[120px]">
                                Improvement Rate
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
