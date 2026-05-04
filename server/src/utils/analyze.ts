import type { AnalysisMetrics, ActionableTip } from '../types.js';

const FILLER_WORDS = [
    'um', 'uh', 'hmm', 'ah', 'like', 'you know',
    'basically', 'literally', 'actually', 'totally', 'seriously',
    'sort of', 'kind of', 'i mean', 'right', 'okay', 'so'
];

const HEDGE_PHRASES = [
    'i think', 'maybe', 'sort of', 'kind of', 'i guess',
    'just', 'possibly', 'probably', 'it seems like',
    'i\'m not sure', 'potentially', 'perhaps'
];

const APOLOGY_PHRASES = [
    'sorry', 'apologize', 'my mistake', 'my bad', 'pardon me',
    'i shouldn\'t have', 'forgive me'
];

export function analyzeTranscript(
    text: string, 
    durationSeconds: number, 
    words: Array<{ text: string; start: number; end: number; confidence: number }> = []
): { metrics: AnalysisMetrics; tips: ActionableTip[] } {
    const rawWords = text.trim().split(/\s+/).filter(w => w.length > 0);
    const wordCount = rawWords.length;

    // Calculate WPM
    const durationMin = durationSeconds > 0 ? durationSeconds / 60 : 1;
    const wpm = Math.round(wordCount / durationMin);

    // 1. Fillers
    const fillerWordsFound: Record<string, number> = {};
    let totalFillers = 0;
    FILLER_WORDS.forEach(filler => {
        const regex = new RegExp(`\\b${filler}\\b`, 'gi');
        const matches = text.match(regex);
        if (matches && matches.length > 0) {
            fillerWordsFound[filler] = matches.length;
            totalFillers += matches.length;
        }
    });

    // 2. Confidence Suite (Hedges & Apologies)
    const hedgesFound: string[] = [];
    HEDGE_PHRASES.forEach(hedge => {
        if (text.toLowerCase().includes(hedge)) {
            hedgesFound.push(hedge);
        }
    });

    const apologiesFound: string[] = [];
    APOLOGY_PHRASES.forEach(apology => {
        if (text.toLowerCase().includes(apology)) {
            apologiesFound.push(apology);
        }
    });

    // 3. I-Tax (Sentences starting with "I")
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    let iStartCount = 0;
    sentences.forEach(s => {
        if (s.trim().toLowerCase().startsWith('i ')) {
            iStartCount++;
        }
    });
    const iTax = sentences.length > 0 ? Math.round((iStartCount / sentences.length) * 100) : 0;

    // 4. Advanced Pacing (Good vs Bad Pauses)
    let goodPauses = 0;
    let badPauses = 0;
    let totalPauseTime = 0;
    const PAUSE_THRESHOLD = 500; // ms

    for (let i = 0; i < words.length - 1; i++) {
        const gap = words[i+1].start - words[i].end;
        if (gap > PAUSE_THRESHOLD) {
            totalPauseTime += gap;
            // Check if word[i] ended with punctuation
            if (/[.!?]$/.test(words[i].text.trim())) {
                goodPauses++;
            } else if (/,$/.test(words[i].text.trim())) {
                goodPauses++; // Commas are also good boundaries
            } else {
                badPauses++;
            }
        }
    }

    const metrics: AnalysisMetrics = {
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
            wpmSpikes: 0 // Placeholder until window analysis implemented
        }
    };

    // Generate Tips
    const tips: ActionableTip[] = [];

    // WPM Tips
    if (wpm > 160) {
        tips.push({ id: 'slow-down', type: 'improvement', message: 'Speaking rate is high (>160 WPM). Slow down for impact.' });
    } else if (wpm < 110) {
        tips.push({ id: 'speed-up', type: 'improvement', message: 'Speaking rate is a bit slow (<110 WPM). Keep the energy up.' });
    }

    // Confidence Tips
    if (hedgesFound.length > 3) {
        tips.push({ 
            id: 'too-many-hedges', 
            type: 'improvement', 
            message: 'You used a lot of hedging language ("maybe", "I think"). Try making more direct statements to sound more authoritative.' 
        });
    }

    if (apologiesFound.length > 0) {
        tips.push({ 
            id: 'stop-apologizing', 
            type: 'improvement', 
            message: 'Avoid apologetic preambles. They can undermine your expertise before you even start.' 
        });
    }

    if (iTax > 40) {
        tips.push({ 
            id: 'high-i-tax', 
            type: 'improvement', 
            message: `High "I" Tax (${iTax}%). You start many sentences with "I". Try shifting focus to the audience or the content.` 
        });
    }

    // Pacing Tips
    if (badPauses > goodPauses && badPauses > 3) {
        tips.push({ 
            id: 'mid-sentence-pauses', 
            type: 'improvement', 
            message: 'You have many pauses in the middle of thoughts. Try to finish your sentence before pausing for effect.' 
        });
    } else if (goodPauses > 5) {
        tips.push({ 
            id: 'good-pausing', 
            type: 'positive', 
            message: 'Excellent use of strategic pausing at sentence boundaries!' 
        });
    }

    return { metrics, tips };
}
