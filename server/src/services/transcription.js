import fs from 'fs';
import { analyzeTranscript } from '../utils/analyze.js';
import { getAudioDuration } from '../utils/file_info.js';
import { analyzeVolumeDecay } from '../utils/audio_analysis.js';

const MOCK_TRANSCRIPT = "So, um, today I want to talk about, like, presentation skills. It is, you know, really important to be clear. Basically, if you practice enough, you will sort of get better at it naturally. I mean, it takes time, but literally anyone can do it.";

const MOCK_WORDS = [
    { text: "So,", start: 100, end: 400, confidence: 0.99 },
    { text: "um,", start: 500, end: 800, confidence: 0.99 },
    { text: "today", start: 900, end: 1200, confidence: 0.99 },
    { text: "I", start: 1300, end: 1400, confidence: 0.99 },
    { text: "want", start: 1500, end: 1700, confidence: 0.99 },
    { text: "to", start: 1800, end: 1900, confidence: 0.99 },
    { text: "talk", start: 2000, end: 2300, confidence: 0.99 },
    { text: "about,", start: 2400, end: 2700, confidence: 0.99 },
    { text: "like,", start: 2800, end: 3100, confidence: 0.99 },
    { text: "presentation", start: 3200, end: 3800, confidence: 0.99 },
    { text: "skills.", start: 3900, end: 4400, confidence: 0.99 }
];

function createNoSpeechResult(durationSeconds) {
    return {
        text: '',
        metrics: {
            wordCount: 0,
            durationSeconds,
            wpm: 0,
            fillerCount: 0,
            fillerWordsFound: {},
            pausesEstimate: 0,
            hedges: [],
            apologies: [],
            iTax: 0,
            pacing: {
                goodPauses: 0,
                badPauses: 0,
                totalPauseTime: 0,
                wpmSpikes: 0,
            },
            volumeDecay: {
                sentenceEndDropoffs: 0,
                averageDropoffDb: 0,
            },
        },
        tips: [
            {
                id: 'no-speech-detected',
                type: 'improvement',
                message: 'No speech was detected in this recording. Try another take when you are ready to practice aloud.',
            },
            {
                id: 'no-fillers',
                type: 'positive',
                message: 'Zero filler words detected.',
            },
        ],
        words: [],
    };
}

export async function processAudio(filePath) {
    let text = '';
    let duration = 0;
    let words = [];

    duration = await getAudioDuration(filePath);
    const fileSize = fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;

    if (fileSize === 0) {
        return createNoSpeechResult(duration);
    }

    if (process.env.ASSEMBLYAI_API_KEY) {
        try {
            const { AssemblyAI } = await import('assemblyai');
            const client = new AssemblyAI({ apiKey: process.env.ASSEMBLYAI_API_KEY });

            const transcript = await client.transcripts.transcribe({ audio: filePath });

            if (transcript.text) {
                text = transcript.text;
                words = transcript.words || [];
            }

            if (duration === 0 && transcript.audio_duration) {
                duration = transcript.audio_duration;
            }
        } catch (e) {
            console.error("AssemblyAI transcription failed:", e);
            return createNoSpeechResult(duration);
        }
    } else {
        await new Promise(r => setTimeout(r, 1500));
        text = MOCK_TRANSCRIPT;
        words = MOCK_WORDS;
        if (duration === 0) duration = 15;
    }

    if (!text.trim() || words.length === 0) {
        return createNoSpeechResult(duration);
    }

    let volumeStats = { sentenceEndDropoffs: 0, averageDropoffDb: 0 };
    if (fs.existsSync(filePath) && words.length > 0) {
        try {
            volumeStats = await analyzeVolumeDecay(filePath, words);
        } catch (vErr) {
            console.error("Volume analysis failed:", vErr);
        }
    }

    const analysis = analyzeTranscript(text, duration, words);
    analysis.metrics.volumeDecay = volumeStats;

    if (volumeStats.sentenceEndDropoffs > 2) {
        analysis.tips.push({
            id: 'volume-decay',
            type: 'improvement',
            message: 'You tend to trail off at the end of sentences. Keep your breath support strong until the last word.'
        });
    }

    return {
        text,
        metrics: analysis.metrics,
        tips: analysis.tips,
        words
    };
}
