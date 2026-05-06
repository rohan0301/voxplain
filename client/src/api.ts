import type { AudienceLevel } from './types/Project';
import type { Project } from './types/Project';
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

export interface SavedSpeech {
    id: string;
    projectId: string | null;
    projectName: string;
    title: string;
    content: string;
    wordCount: number;
    audienceLevel: AudienceLevel | null;
    domain: string | null;
    createdAt: string;
    updatedAt: string;
}

interface ProjectRow {
    id: string;
    user_id: string;
    name: string;
    last_modified: string;
    estimated_time_sec: number;
    required_time_sec: number | null;
    audience: string | null;
    presentation_type: string | null;
    speech_text: string | null;
    audience_level: AudienceLevel | null;
    domain: Project['domain'] | null;
}

interface SavedSpeechRow {
    id: string;
    user_id: string;
    project_id: string | null;
    project_name: string | null;
    title: string | null;
    content: string;
    word_count: number | null;
    audience_level: AudienceLevel | null;
    domain: string | null;
    created_at: string;
    updated_at: string;
}

const projectSelectColumns = [
    'id',
    'user_id',
    'name',
    'last_modified',
    'estimated_time_sec',
    'required_time_sec',
    'audience',
    'presentation_type',
    'speech_text',
    'audience_level',
    'domain',
].join(',');

const formatProjectDate = (date: Date) =>
    date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

const projectFromRow = (row: ProjectRow): Project => {
    const lastModifiedDateObj = new Date(row.last_modified);

    return {
        id: row.id,
        name: row.name,
        lastModified: formatProjectDate(lastModifiedDateObj),
        lastModifiedDateObj,
        estimatedTimeSec: row.estimated_time_sec,
        requiredTimeSec: row.required_time_sec,
        audience: row.audience ?? undefined,
        presentationType: row.presentation_type ?? undefined,
        speechText: row.speech_text ?? undefined,
        audienceLevel: row.audience_level ?? undefined,
        domain: row.domain ?? undefined,
    };
};

const rowFromProject = (userId: string, project: Project) => ({
    id: project.id,
    user_id: userId,
    name: project.name,
    last_modified: project.lastModifiedDateObj.toISOString(),
    estimated_time_sec: project.estimatedTimeSec,
    required_time_sec: project.requiredTimeSec ?? null,
    audience: project.audience ?? null,
    presentation_type: project.presentationType ?? null,
    speech_text: project.speechText ?? null,
    audience_level: project.audienceLevel ?? null,
    domain: project.domain ?? null,
    updated_at: new Date().toISOString(),
});

const savedSpeechFromRow = (row: SavedSpeechRow): SavedSpeech => ({
    id: row.id,
    projectId: row.project_id,
    projectName: row.project_name || 'Untitled Project',
    title: row.title || 'Untitled Speech',
    content: row.content,
    wordCount: row.word_count ?? row.content.trim().split(/\s+/).filter(Boolean).length,
    audienceLevel: row.audience_level,
    domain: row.domain,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
});

export async function listProjects(userId: string): Promise<Project[]> {
    const { data, error } = await supabase
        .from('projects')
        .select(projectSelectColumns)
        .eq('user_id', userId)
        .order('last_modified', { ascending: false });

    if (error) throw error;
    return ((data ?? []) as unknown as ProjectRow[]).map(projectFromRow);
}

export async function saveProjects(userId: string, projects: Project[]): Promise<void> {
    if (projects.length === 0) return;

    const { error } = await supabase
        .from('projects')
        .upsert(projects.map(project => rowFromProject(userId, project)), {
            onConflict: 'user_id,id',
        });

    if (error) throw error;
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

// Use env var in production, fallback to localhost for dev.
const API_URL = ((import.meta.env.VITE_API_URL as string | undefined) || '').replace(/\/$/, '')
    || (import.meta.env.DEV ? 'http://localhost:3000/api' : '');

function apiUrl(path: string): string {
    if (!API_URL) {
        throw new Error('Missing VITE_API_URL. Set it in Vercel to your deployed backend URL, ending in /api.');
    }
    return `${API_URL}${path}`;
}

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

    const response = await fetch(apiUrl('/transcribe'), {
        method: 'POST',
        headers,
        body: formData,
    });

    if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`Transcription failed (${response.status}): ${errText || response.statusText}`);
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

    const response = await fetch(apiUrl('/recordings'), {
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

    const response = await fetch(apiUrl(`/recordings${params.size ? `?${params.toString()}` : ''}`), {
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

    const response = await fetch(apiUrl(`/recordings/${recordingId}`), {
        method: 'DELETE',
        headers,
    });

    if (!response.ok) {
        throw new Error('Failed to delete recording');
    }
}

export interface SaveSpeechPayload {
    userId: string;
    content: string;
    projectId?: string | null;
    projectName?: string | null;
    title?: string | null;
    audienceLevel?: AudienceLevel | null;
    domain?: string | null;
}

export async function listSavedSpeeches(userId: string, projectId?: string | null): Promise<SavedSpeech[]> {
    let query = supabase
        .from('speeches')
        .select('id,user_id,project_id,project_name,title,content,word_count,audience_level,domain,created_at,updated_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

    if (projectId) {
        query = query.eq('project_id', projectId);
    }

    const { data, error } = await query;

    if (error) throw error;
    return ((data ?? []) as unknown as SavedSpeechRow[]).map(savedSpeechFromRow);
}

export async function saveSpeech(payload: SaveSpeechPayload): Promise<SavedSpeech> {
    const content = payload.content.trim();
    const wordCount = content ? content.split(/\s+/).length : 0;
    const now = new Date().toISOString();

    const { data, error } = await supabase
        .from('speeches')
        .insert({
            user_id: payload.userId,
            project_id: payload.projectId ?? null,
            project_name: payload.projectName ?? 'Untitled Project',
            title: payload.title?.trim() || `Speech draft - ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
            content,
            word_count: wordCount,
            audience_level: payload.audienceLevel ?? null,
            domain: payload.domain ?? null,
            updated_at: now,
        })
        .select('id,user_id,project_id,project_name,title,content,word_count,audience_level,domain,created_at,updated_at')
        .single();

    if (error || !data) throw error || new Error('Failed to save speech');
    return savedSpeechFromRow(data as unknown as SavedSpeechRow);
}

export async function deleteSavedSpeech(speechId: string): Promise<void> {
    const { error } = await supabase
        .from('speeches')
        .delete()
        .eq('id', speechId);

    if (error) throw error;
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

    const response = await fetch(apiUrl('/analyze-technicality'), {
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

    const response = await fetch(apiUrl('/labels'), {
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

    const response = await fetch(apiUrl('/analyze/metrics'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        throw new Error('Metrics analysis failed');
    }

    return response.json();
}
