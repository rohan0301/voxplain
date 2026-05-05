import type { TranscriptionResult } from '../api';

export interface VideoAnalysisResult {
    resolution: string;
    brightness: string; // Placeholder "Moderate", "Bright"
    eyeContactScore: number; // 0-100 (Real or Mock)
    postureScore: number; // 0-100 placeholder
    framing: string; // "Centered", "Askew"

    // Real Face Metrics
    trackingQuality?: "high" | "medium" | "low";
    lookingDownPct?: number;
    smilePct?: number;
    expressivenessLevel?: "low" | "balanced" | "high";
    notes?: string[];
}

export interface PracticeAnalysisResult {
    speech: TranscriptionResult;
    video?: VideoAnalysisResult;
}

export const mockVideoAnalysis = (): VideoAnalysisResult => ({
    resolution: "HD (1280x720)", // Presumed from constraints
    brightness: "Good",
    eyeContactScore: 85,
    postureScore: 92,
    framing: "Centered",
    trackingQuality: "high",
    lookingDownPct: 5,
    smilePct: 20,
    expressivenessLevel: "balanced"
});
