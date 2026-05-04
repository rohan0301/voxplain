export interface AnalysisMetrics {
    wordCount: number;
    durationSeconds: number;
    wpm: number;
    fillerCount: number;
    fillerWordsFound: Record<string, number>;
    pausesEstimate: number;
}
export interface ActionableTip {
    id: string;
    type: 'improvement' | 'positive';
    message: string;
}
export interface TranscriptionResult {
    text: string;
    metrics: AnalysisMetrics;
    tips: ActionableTip[];
    words?: Array<{
        text: string;
        startSec: number;
        endSec: number;
    }>;
}
export type AudienceLevel = 0 | 1 | 2 | 3;
export interface TechnicalityHotspot {
    sentence: string;
    startWordIndex?: number;
    endWordIndex?: number;
    terms: string[];
    reasons: string[];
    suggestions: string[];
    localWPM?: number;
}
export interface TechnicalityResult {
    technicalLoadScore: number;
    audienceThreshold: number;
    status: "below" | "near" | "above";
    summary: string;
    hotspots: TechnicalityHotspot[];
    termStats: {
        totalTerms: number;
        uniqueTerms: number;
        maxClump: number;
        explainedRate: number;
    };
}
//# sourceMappingURL=types.d.ts.map