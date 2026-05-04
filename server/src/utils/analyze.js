const FILLER_WORDS = [
    'um', 'uh', 'hmm', 'ah', 'like', 'you know',
    'basically', 'literally', 'actually', 'totally', 'seriously',
    'sort of', 'kind of', 'i mean', 'right', 'okay', 'so'
];
export function analyzeTranscript(text, durationSeconds) {
    const words = text.trim().split(/\s+/).filter(w => w.length > 0);
    const wordCount = words.length;
    // Calculate WPM
    // Avoid division by zero
    const durationMin = durationSeconds > 0 ? durationSeconds / 60 : 1;
    const wpm = Math.round(wordCount / durationMin);
    // Count Fillers
    const fillerWordsFound = {};
    let totalFillers = 0;
    const lowerText = text.toLowerCase();
    // Simple regex matching for fillers (can be improved to avoid partial matches in words, but good for MVP)
    // \b ensures word boundaries
    FILLER_WORDS.forEach(filler => {
        const regex = new RegExp(`\\b${filler}\\b`, 'gi');
        const matches = text.match(regex);
        if (matches && matches.length > 0) {
            fillerWordsFound[filler] = matches.length;
            totalFillers += matches.length;
        }
    });
    // Pause estimation (Mock/Heuristic based on punctuation for now if audio data isn't deep analyzed)
    // Assuming ~1 pause per sentence or comma
    const pausesEstimate = (text.match(/[.,;?!]/g) || []).length;
    const metrics = {
        wordCount,
        durationSeconds,
        wpm,
        fillerCount: totalFillers,
        fillerWordsFound,
        pausesEstimate
    };
    // Generate Tips
    const tips = [];
    // WPM Tips
    if (wpm > 160) {
        tips.push({
            id: 'slow-down',
            type: 'improvement',
            message: 'You are speaking quite fast (>160 WPM). Try to slow down to make your points land better.'
        });
    }
    else if (wpm < 110) {
        tips.push({
            id: 'speed-up',
            type: 'improvement',
            message: 'Your pace is a bit slow (<110 WPM). Try to keep the energy up.'
        });
    }
    else {
        tips.push({
            id: 'good-pace',
            type: 'positive',
            message: 'Great pacing! You are within the conversational range (110-160 WPM).'
        });
    }
    // Filler Tips
    const fillerRatio = totalFillers / wordCount;
    if (totalFillers > 0 && fillerRatio > 0.05) { // >5% fillers
        tips.push({
            id: 'reduce-fillers',
            type: 'improvement',
            message: `We found ${totalFillers} fillers (${(fillerRatio * 100).toFixed(1)}% of speech). Try pausing silently instead.`
        });
    }
    else if (totalFillers > 0) {
        tips.push({
            id: 'few-fillers',
            type: 'positive',
            message: `Good job limiting fillers! Only ${totalFillers} found.`
        });
    }
    else if (totalFillers === 0) {
        tips.push({
            id: 'no-fillers',
            type: 'positive',
            message: 'Amazing! No filler words detected.'
        });
    }
    // Duration Tips (Assumed generic presentation ~2-5 mins, but user didn't specify target)
    // Just informative for now.
    return { metrics, tips };
}
//# sourceMappingURL=analyze.js.map