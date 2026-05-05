const FILLER_WORDS = [
    'um', 'uh', 'hmm', 'ah', 'like', 'you know',
    'basically', 'literally', 'actually', 'totally', 'seriously',
    'sort of', 'kind of', 'i mean', 'right', 'okay', 'so'
];

const HEDGE_PHRASES = [
    'i think', 'maybe', 'sort of', 'kind of', 'i guess',
    'just', 'possibly', 'probably', 'it seems like',
    "i'm not sure", 'potentially', 'perhaps'
];

const APOLOGY_PHRASES = [
    'sorry', 'apologize', 'my mistake', 'my bad', 'pardon me',
    "i shouldn't have", 'forgive me'
];

export function analyzeTranscript(text, durationSeconds, words = []) {
    const rawWords = text.trim().split(/\s+/).filter(w => w.length > 0);
    const wordCount = rawWords.length;

    const durationMin = durationSeconds > 0 ? durationSeconds / 60 : 1;
    const wpm = Math.round(wordCount / durationMin);

    // Fillers
    const fillerWordsFound = {};
    let totalFillers = 0;
    FILLER_WORDS.forEach(filler => {
        const regex = new RegExp(`\\b${filler}\\b`, 'gi');
        const matches = text.match(regex);
        if (matches && matches.length > 0) {
            fillerWordsFound[filler] = matches.length;
            totalFillers += matches.length;
        }
    });

    // Confidence Suite
    const hedgesFound = [];
    HEDGE_PHRASES.forEach(hedge => {
        if (text.toLowerCase().includes(hedge)) hedgesFound.push(hedge);
    });

    const apologiesFound = [];
    APOLOGY_PHRASES.forEach(apology => {
        if (text.toLowerCase().includes(apology)) apologiesFound.push(apology);
    });

    // I-Tax
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    let iStartCount = 0;
    sentences.forEach(s => {
        if (s.trim().toLowerCase().startsWith('i ')) iStartCount++;
    });
    const iTax = sentences.length > 0 ? Math.round((iStartCount / sentences.length) * 100) : 0;

    // Pacing
    let goodPauses = 0;
    let badPauses = 0;
    let totalPauseTime = 0;
    const PAUSE_THRESHOLD = 500;

    for (let i = 0; i < words.length - 1; i++) {
        const gap = words[i + 1].start - words[i].end;
        if (gap > PAUSE_THRESHOLD) {
            totalPauseTime += gap;
            if (/[.!?]$/.test(words[i].text.trim())) {
                goodPauses++;
            } else if (/,$/.test(words[i].text.trim())) {
                goodPauses++;
            } else {
                badPauses++;
            }
        }
    }

    const metrics = {
        wordCount,
        durationSeconds,
        wpm,
        fillerCount: totalFillers,
        fillerWordsFound,
        pausesEstimate: goodPauses + badPauses,
        hedges: hedgesFound,
        apologies: apologiesFound,
        iTax,
        pacing: {
            goodPauses,
            badPauses,
            totalPauseTime,
            wpmSpikes: 0
        }
    };

    const tips = [];

    if (wpm > 160) {
        tips.push({ id: 'slow-down', type: 'improvement', message: 'Speaking rate is high (>160 WPM). Slow down for impact.' });
    } else if (wpm < 110) {
        tips.push({ id: 'speed-up', type: 'improvement', message: 'Speaking rate is a bit slow (<110 WPM). Keep the energy up.' });
    }

    if (hedgesFound.length > 3) {
        tips.push({ id: 'too-many-hedges', type: 'improvement', message: 'You used a lot of hedging language ("maybe", "I think"). Try making more direct statements to sound more authoritative.' });
    }

    if (apologiesFound.length > 0) {
        tips.push({ id: 'stop-apologizing', type: 'improvement', message: 'Avoid apologetic preambles. They can undermine your expertise before you even start.' });
    }

    if (iTax > 40) {
        tips.push({ id: 'high-i-tax', type: 'improvement', message: `High "I" Tax (${iTax}%). You start many sentences with "I". Try shifting focus to the audience or the content.` });
    }

    if (badPauses > goodPauses && badPauses > 3) {
        tips.push({ id: 'mid-sentence-pauses', type: 'improvement', message: 'You have many pauses in the middle of thoughts. Try to finish your sentence before pausing for effect.' });
    } else if (goodPauses > 5) {
        tips.push({ id: 'good-pausing', type: 'positive', message: 'Excellent use of strategic pausing at sentence boundaries!' });
    }

    if (totalFillers > 5) {
        tips.push({ id: 'too-many-fillers', type: 'improvement', message: `You used ${totalFillers} filler words (um, like, you know…). Replace them with a brief deliberate pause — silence is more powerful than filler.` });
    } else if (totalFillers > 2) {
        tips.push({ id: 'some-fillers', type: 'improvement', message: `You used ${totalFillers} filler words. Try to pause instead of filling silence — it sounds more confident.` });
    } else if (totalFillers === 0) {
        tips.push({ id: 'no-fillers', type: 'positive', message: 'Zero filler words detected. Clean, confident delivery.' });
    }

    if (tips.length === 0) {
        tips.push({ id: 'all-clear', type: 'positive', message: 'Great overall delivery! Pacing, confidence, and clarity are all on point.' });
    }

    return { metrics, tips };
}
