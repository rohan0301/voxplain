import type { AudienceLevel } from './types/Project';
import { supabase } from './lib/supabase';

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
    words?: Array<{ text: string; startSec: number; endSec: number }>;
}

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

// Use env var in production, fallback to localhost for dev
const API_URL = (import.meta.env.VITE_API_URL as string) || 'http://localhost:3000/api';

/**
 * Get authorization headers with the current Supabase session token.
 */
async function authHeaders(): Promise<Record<string, string>> {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
        return { Authorization: `Bearer ${session.access_token}` };
    }
    return {};
}

export async function transcribeAudio(file: File): Promise<TranscriptionResult> {
    const formData = new FormData();
    formData.append('audio', file);

    const headers = await authHeaders();

    const response = await fetch(`${API_URL}/transcribe`, {
        method: 'POST',
        headers,
        body: formData,
    });

    if (!response.ok) {
        throw new Error('Transcription failed');
    }

    return response.json();
}

export interface AnalyzePayload {
    transcriptText: string;
    words?: Array<{ text: string; startSec: number; endSec: number }>;
    audienceLevel?: AudienceLevel;
    requiredTimeSec?: number | null;
    domain?: string;
}

export async function analyzeTechnicality(payload: AnalyzePayload): Promise<{ technicality: TechnicalityResult }> {
    const headers = await authHeaders();

    const response = await fetch(`${API_URL}/analyze-technicality`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        throw new Error('Technicality analysis failed');
    }

    return response.json();
}

export interface LabelPayload {
    text: string;
    label: 0 | 1;
    audienceLevel?: number | null;
    domain?: string;
    projectId?: string | null;
}

export async function saveLabel(payload: LabelPayload): Promise<void> {
    console.log('[API] Saving label payload:', payload);
    const headers = await authHeaders();

    const response = await fetch(`${API_URL}/labels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errText = await response.text();
        console.error('[API] Save label failed:', errText);
        throw new Error(`Failed to save label: ${errText}`);
    }

    const resJson = await response.json();
    console.log('[API] Save label success:', resJson);
}
