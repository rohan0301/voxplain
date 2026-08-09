import type { Express, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import type { Multer } from 'multer';
import { requireAuth } from '../middleware/auth.js';
import { supabaseAdmin } from '../lib/supabase.js';

/**
 * PRESERVED, NOT MOUNTED. See legacy/README.md.
 *
 * These are the account-based cloud recording routes from before Voxplain
 * became a no-sign-in app. Recordings now live in the browser's IndexedDB
 * (client/src/lib/recordingStore.ts) and never reach the server.
 *
 * Nothing calls registerRecordingRoutes(). It is kept compiling so that
 * restoring accounts is a matter of mounting it again rather than recovering
 * it from git history.
 */

const RECORDINGS_BUCKET = process.env.SUPABASE_RECORDINGS_BUCKET || 'recordings';

const isSupabaseConfigured = () =>
    Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

interface MulterRequest extends Request {
    file?: Express.Multer.File;
    user?: { id: string };
}

interface RecordingRow {
    id: string;
    user_id: string;
    project_id: string | null;
    project_name: string | null;
    recorded_at: string;
    audio_path: string;
    audio_mime_type: string | null;
    file_name: string | null;
    report: unknown;
    created_at?: string;
}

const mapRecordingRow = async (row: RecordingRow) => {
    let audioUrl: string | null = null;

    if (isSupabaseConfigured()) {
        const { data } = await supabaseAdmin.storage
            .from(RECORDINGS_BUCKET)
            .createSignedUrl(row.audio_path, 60 * 60);
        audioUrl = data?.signedUrl ?? null;
    }

    return {
        id: row.id,
        projectId: row.project_id,
        projectName: row.project_name || 'Untitled Session',
        recordedAt: row.recorded_at,
        audioUrl,
        audioType: row.audio_mime_type || 'audio/webm',
        fileName: row.file_name || 'voxplain-recording.webm',
        report: row.report,
    };
};

export function registerRecordingRoutes(app: Express, upload: Multer): void {
    app.get('/api/recordings', requireAuth, async (req: Request, res: Response) => {
        const authReq = req as MulterRequest;

        if (!authReq.user?.id) {
            res.status(401).json({ error: 'Authentication required' });
            return;
        }

        if (!isSupabaseConfigured()) {
            res.status(503).json({ error: 'Supabase storage is not configured' });
            return;
        }

        try {
            const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : null;
            let query = supabaseAdmin
                .from('recordings')
                .select('id,user_id,project_id,project_name,recorded_at,audio_path,audio_mime_type,file_name,report,created_at')
                .eq('user_id', authReq.user.id)
                .order('recorded_at', { ascending: false });

            if (projectId) {
                query = query.eq('project_id', projectId);
            }

            const { data, error } = await query;

            if (error) {
                throw error;
            }

            const recordings = await Promise.all(((data || []) as RecordingRow[]).map(mapRecordingRow));
            res.json(recordings);
        } catch (error) {
            console.error('Failed to list recordings:', error);
            res.status(500).json({ error: 'Failed to load recordings' });
        }
    });

    app.post('/api/recordings', requireAuth, upload.single('audio'), async (req: Request, res: Response) => {
        const authReq = req as MulterRequest;

        if (!authReq.user?.id) {
            res.status(401).json({ error: 'Authentication required' });
            return;
        }

        if (!isSupabaseConfigured()) {
            res.status(503).json({ error: 'Supabase storage is not configured' });
            return;
        }

        if (!authReq.file) {
            res.status(400).json({ error: 'No audio file provided' });
            return;
        }

        let filePath = authReq.file.path;

        if (authReq.file.originalname) {
            const ext = path.extname(authReq.file.originalname) || '.webm';
            const newPath = `${filePath}${ext}`;
            try {
                fs.renameSync(filePath, newPath);
                filePath = newPath;
            } catch (err) {
                console.error('Failed to rename upload:', err);
            }
        }

        try {
            const reportRaw = authReq.body?.report;
            const report = typeof reportRaw === 'string' ? JSON.parse(reportRaw) : null;

            if (!report) {
                res.status(400).json({ error: 'Missing report payload' });
                return;
            }

            const ext = path.extname(authReq.file.originalname || filePath) || '.webm';
            const storagePath = `${authReq.user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
            const fileBuffer = fs.readFileSync(filePath);

            const uploadResult = await supabaseAdmin.storage
                .from(RECORDINGS_BUCKET)
                .upload(storagePath, fileBuffer, {
                    contentType: authReq.file.mimetype || 'audio/webm',
                    upsert: false,
                });

            if (uploadResult.error) {
                throw uploadResult.error;
            }

            const insertPayload = {
                user_id: authReq.user.id,
                project_id: typeof authReq.body?.projectId === 'string' ? authReq.body.projectId : null,
                project_name: typeof authReq.body?.projectName === 'string' ? authReq.body.projectName : 'Untitled Session',
                recorded_at: typeof authReq.body?.recordedAt === 'string' ? authReq.body.recordedAt : new Date().toISOString(),
                audio_path: storagePath,
                audio_mime_type: authReq.file.mimetype || 'audio/webm',
                file_name: authReq.file.originalname || `voxplain-recording${ext}`,
                report,
            };

            const { data, error } = await supabaseAdmin
                .from('recordings')
                .insert(insertPayload)
                .select('id,user_id,project_id,project_name,recorded_at,audio_path,audio_mime_type,file_name,report,created_at')
                .single();

            if (error || !data) {
                throw error || new Error('Failed to insert recording');
            }

            const recording = await mapRecordingRow(data as RecordingRow);
            res.status(201).json(recording);
        } catch (error) {
            console.error('Failed to save recording:', error);
            res.status(500).json({ error: 'Failed to save recording' });
        } finally {
            try {
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            } catch (cleanupError) {
                console.error('Failed to delete temp file:', cleanupError);
            }
        }
    });

    app.delete('/api/recordings/:id', requireAuth, async (req: Request, res: Response) => {
        const authReq = req as MulterRequest;

        if (!authReq.user?.id) {
            res.status(401).json({ error: 'Authentication required' });
            return;
        }

        if (!isSupabaseConfigured()) {
            res.status(503).json({ error: 'Supabase storage is not configured' });
            return;
        }

        try {
            const { data, error } = await supabaseAdmin
                .from('recordings')
                .select('id,user_id,audio_path')
                .eq('id', req.params.id)
                .eq('user_id', authReq.user.id)
                .single();

            if (error || !data) {
                res.status(404).json({ error: 'Recording not found' });
                return;
            }

            const storageDelete = await supabaseAdmin.storage
                .from(RECORDINGS_BUCKET)
                .remove([data.audio_path]);

            if (storageDelete.error) {
                throw storageDelete.error;
            }

            const deleteResult = await supabaseAdmin
                .from('recordings')
                .delete()
                .eq('id', req.params.id)
                .eq('user_id', authReq.user.id);

            if (deleteResult.error) {
                throw deleteResult.error;
            }

            res.status(204).send();
        } catch (error) {
            console.error('Failed to delete recording:', error);
            res.status(500).json({ error: 'Failed to delete recording' });
        }
    });
}
