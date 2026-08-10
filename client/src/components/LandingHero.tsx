interface LandingHeroProps {
    onGetStarted: () => void;
}

const features = [
    {
        title: 'Set your audience',
        description:
            'Tell us who is in the room — from non-technical to expert peers — and the field you are speaking in.',
    },
    {
        title: 'Find what loses them',
        description:
            'Every sentence is checked against that audience, and the ones carrying too much jargon get flagged with a fix.',
    },
    {
        title: 'Practice the rest',
        description:
            'Teleprompter, recording, and pacing and filler-word feedback on each run-through.',
    },
];

export const LandingHero = ({ onGetStarted }: LandingHeroProps) => {
    return (
        <div className="min-h-[calc(100vh-64px)] flex flex-col justify-center bg-slate-50">
            <div className="max-w-3xl mx-auto px-6 py-20 w-full text-center">
                <p className="text-sm font-semibold uppercase tracking-wider text-brand-600">
                    Audience-aware speech coaching
                </p>

                <h1 className="mt-4 text-4xl sm:text-5xl font-bold tracking-tight text-slate-900">
                    Your talk isn't too technical. It's too technical <em className="not-italic text-brand-600">for them</em>.
                </h1>

                <p className="mt-5 text-lg text-slate-600 max-w-xl mx-auto leading-relaxed">
                    Most presentation coaches grade your delivery. Voxplain grades your talk against
                    the people hearing it — so the same script that lands with engineers gets rewritten
                    before you take it to the board.
                </p>

                <button
                    onClick={onGetStarted}
                    className="mt-8 px-6 py-3 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-semibold transition-colors"
                >
                    Get started
                </button>

                <div className="mt-20 grid gap-8 sm:grid-cols-3 border-t border-slate-200 pt-10 text-left">
                    {features.map(({ title, description }) => (
                        <div key={title}>
                            <h2 className="font-semibold text-slate-900">{title}</h2>
                            <p className="mt-2 text-sm text-slate-600 leading-relaxed">{description}</p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
