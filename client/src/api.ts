import type { AudienceLevel } from './types/Project';
import { supabase } from './lib/supabase';

export interface AnalysisMetrics {
    wordCount: number;
    durationSeconds: number;
    wpm: number;
    fillerCount: number;
    fillerWordsFound: Record<string, number>;
    pausesEstimate: number;

    // New Confidence Metrics
    hedges: string[];
    apologies: string[];
    iTax: number;

    // New Pacing Metrics
    pacing: {
        goodPauses: number;
        badPauses: number;
        totalPauseTime: number;
        wpmSpikes: number;
    };

    // New Vocal Metrics
    volumeDecay?: {
        sentenceEndDropoffs: number;
        averageDropoffDb: number;
    };
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
    words: Array<{ text: string; start: number; end: number; confidence: number }>;
}

export interface SavedRecording {
    id: string;
    projectId: string | null;
    projectName: string;
    recordedAt: string;
    audioUrl: string | null;
    audioType: string;
    fileName: string;
    report: TranscriptionResult;
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

export interface SaveRecordingPayload {
    file: File;
    report: TranscriptionResult;
    projectId?: string | null;
    projectName?: string | null;
    recordedAt?: string;
}

export async function saveRecording(payload: SaveRecordingPayload): Promise<SavedRecording> {
    const formData = new FormData();
    formData.append('audio', payload.file);
    formData.append('report', JSON.stringify(payload.report));
    if (payload.projectId) formData.append('projectId', payload.projectId);
    if (payload.projectName) formData.append('projectName', payload.projectName);
    if (payload.recordedAt) formData.append('recordedAt', payload.recordedAt);

    const headers = await authHeaders();

    const response = await fetch(`${API_URL}/recordings`, {
        method: 'POST',
        headers,
        body: formData,
    });

    if (!response.ok) {
        throw new Error('Failed to save recording');
    }

    return response.json();
}

export async function listRecordings(projectId?: string | null): Promise<SavedRecording[]> {
    const headers = await authHeaders();
    const params = new URLSearchParams();
    if (projectId) params.set('projectId', projectId);

    const response = await fetch(`${API_URL}/recordings${params.size ? `?${params.toString()}` : ''}`, {
        method: 'GET',
        headers,
    });

    if (!response.ok) {
        throw new Error('Failed to load recordings');
    }

    return response.json();
}

export async function deleteRecording(recordingId: string): Promise<void> {
    const headers = await authHeaders();

    const response = await fetch(`${API_URL}/recordings/${recordingId}`, {
        method: 'DELETE',
        headers,
    });

    if (!response.ok) {
        throw new Error('Failed to delete recording');
    }
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

export interface MetricsRequest {
    text: string;
    audienceLevel?: number;
    domain?: string;
}

export interface MetricsResponse {
    readability: {
        flesch_kincaid_grade: number;
        avg_sentence_length: number;
    };
    jargon: {
        jargon_terms: string[];
        jargon_count: number;
        jargon_density: number;
        domain: string;
    };
    sentence_complexity: {
        avg_clause_count: number;
        passive_voice_ratio: number;
        max_nesting_depth: number;
        complexity_score: number;
    };
    definitions: {
        definition_sentences: string[];
        definition_count: number;
        definition_ratio: number;
    };
    concept_density: {
        avg_new_concepts_per_sentence: number;
        total_unique_concepts: number;
        concept_density_score: number;
    };
    technicality_score: number;
    risk_level: 'low' | 'medium' | 'high';
    recommendations: string[];
}

export async function getMetrics(payload: MetricsRequest): Promise<MetricsResponse> {
    const headers = await authHeaders();

    const response = await fetch(`${API_URL}/analyze/metrics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        throw new Error('Metrics analysis failed');
    }

    return response.json();
}
