import express, { type Request, type Response } from 'express';
import cors, { type CorsOptions } from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { processAudio } from './services/transcription.js';
import { analyzeTechnicality } from './services/technicality.js';
import { transcribeLimiter, analyzeLimiter, labelsLimiter } from './middleware/rateLimit.js';
import type { AudienceLevel } from './types.js';
import { supabaseAdmin } from './lib/supabase.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = process.env.PORT || 3000;

// Render terminates TLS at a proxy, so the client IP is in X-Forwarded-For.
// Without this the rate limiters would see one shared IP for every request.
app.set('trust proxy', 1);

// Middleware — CORS
const normalizeOrigin = (origin: string): string => {
    try {
        return new URL(origin).origin;
    } catch {
        return origin.replace(/\/$/, '');
    }
};

const localDevOrigins = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:4173',
    'http://127.0.0.1:4173',
];
const configuredOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(origin => normalizeOrigin(origin.trim())).filter(Boolean)
    : [];
const allowedOrigins = [...new Set([...configuredOrigins, ...localDevOrigins.map(normalizeOrigin)])];
const allowedOriginPatterns = (process.env.ALLOWED_ORIGIN_PATTERNS || '')
    .split(',')
    .map(pattern => pattern.trim())
    .filter(Boolean)
    .map(pattern => new RegExp(pattern));

const corsOptions = {
    origin: (origin, callback) => {
        // Allow requests with no origin (curl, health checks, mobile, etc.)
        if (!origin) return callback(null, true);

        const normalizedOrigin = normalizeOrigin(origin);
        const isAllowed =
            allowedOrigins.includes(normalizedOrigin) ||
            allowedOriginPatterns.some(pattern => pattern.test(normalizedOrigin));

        if (!isAllowed) {
            console.warn(`Origin ${normalizedOrigin} not allowed by CORS. Allowed origins: ${allowedOrigins.join(', ')}`);
        }

        callback(null, isAllowed);
    },
    credentials: true,
    optionsSuccessStatus: 204,
} satisfies CorsOptions;

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
app.use(express.json());

// File Upload Setup
const upload = multer({
    dest: path.join(__dirname, '../uploads/'),
    limits: { fileSize: 25 * 1024 * 1024 } // 25MB limit
});

// Routes
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

interface MulterRequest extends Request {
    file?: Express.Multer.File;
}

const isSupabaseConfigured = () =>
    Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

// Handler wrapper to fix type mismatch
const transcribeHandler = async (req: Request, res: Response): Promise<void> => {
    const multerReq = req as MulterRequest;

    if (!multerReq.file) {
        res.status(400).json({ error: 'No audio file provided' });
        return;
    }

    let filePath = multerReq.file.path;

    // Rename file to include extension (important for some tools/APIs)
    if (multerReq.file.originalname) {
        const ext = path.extname(multerReq.file.originalname) || '.webm';
        const newPath = `${filePath}${ext}`;
        try {
            fs.renameSync(filePath, newPath);
            filePath = newPath;
        } catch (err) {
            console.error('Failed to rename upload:', err);
        }
    }

    try {
        console.log(`[DEBUG] Processing file: ${multerReq.file.originalname} (${multerReq.file.mimetype})`);
        console.log(`[DEBUG] Current file path: ${filePath}`);

        // Process: Transcribe + Analyze
        const result = await processAudio(filePath);

        res.json(result);

    } catch (error) {
        console.error('Error processing audio:', error);
        res.status(500).json({ error: 'Failed to process audio' });
    } finally {
        // Cleanup: Delete uploaded file
        try {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        } catch (cleanupError) {
            console.error('Failed to delete temp file:', cleanupError);
        }
    }
};
// Anonymous: the app has no accounts, so labels carry no user_id. The rate
// limiter is the only thing guarding this table against scripted junk — see
// legacy/README.md for the authenticated version.
app.post("/api/labels", labelsLimiter, async (req, res) => {
    if (!isSupabaseConfigured()) {
        return res.status(503).json({ ok: false, error: "Supabase is not configured" });
    }

    try {
        const { text, label, audienceLevel, domain, projectId } = req.body ?? {};

        if (typeof text !== "string" || text.trim().length === 0) {
            return res.status(400).json({ ok: false, error: "Missing text" });
        }
        if (!(label === 0 || label === 1)) {
            return res.status(400).json({ ok: false, error: "label must be 0 or 1" });
        }
        // Validate here so a bad value is a 400, not a CHECK-constraint 500.
        if (audienceLevel !== undefined && audienceLevel !== null && ![0, 1, 2, 3].includes(audienceLevel)) {
            return res.status(400).json({ ok: false, error: "audienceLevel must be 0, 1, 2, 3 or null" });
        }

        const { data, error } = await supabaseAdmin
            .from('labels')
            .insert({
                user_id: null,
                text: text.trim(),
                label,
                audience_level: typeof audienceLevel === "number" ? audienceLevel : null,
                domain: typeof domain === "string" && domain.trim() ? domain.trim() : "general",
                project_id: typeof projectId === "string" ? projectId : null,
                source: 'human',
            })
            .select('id')
            .single();

        if (error) {
            console.error('[Labels] Insert failed:', error);
            return res.status(500).json({ ok: false, error: "Failed to save label" });
        }

        return res.json({ ok: true, id: data.id });
    } catch (err: any) {
        console.error('[Labels] Unexpected error:', err);
        return res.status(500).json({ ok: false, error: "Failed to save label" });
    }
});
app.post('/api/transcribe', transcribeLimiter, upload.single('audio'), transcribeHandler);

// Cloud recording routes (/api/recordings) lived here. Voxplain has no
// accounts now, so recordings are stored in the browser via IndexedDB.
// The old routes are preserved, unmounted, in ./legacy/recordings.routes.ts

app.post('/api/analyze-technicality', analyzeLimiter, async (req, res) => {
    try {
        const { transcriptText, words, audienceLevel, requiredTimeSec, domain = 'general' } = req.body;

        if (!transcriptText) {
            res.status(400).json({ error: 'transcriptText is required' });
            return;
        }

        // Get base technicality score
        const result = analyzeTechnicality({
            transcriptText,
            words,
            audienceLevel: audienceLevel as AudienceLevel,
            requiredTimeSec
        });

        // Enrich with metrics from ML service
        try {
            const mlServiceUrl = process.env.ML_SERVICE_URL || 'http://localhost:8000';
            const metricsResponse = await fetch(`${mlServiceUrl}/analyze/metrics`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: transcriptText,
                    audience_level: audienceLevel,
                    domain
                })
            });

            if (metricsResponse.ok) {
                const metrics = await metricsResponse.json();

                // Blend metrics score into technical load score (50% weight to metrics)
                // Metrics are more sensitive to modern jargon and complexity
                const metricsInfluence = metrics.technicality_score * 50; // 0-50 points from metrics
                const blendedScore = Math.round(result.technicalLoadScore * 0.5 + metricsInfluence);

                result.technicalLoadScore = Math.max(1, Math.min(100, blendedScore));

                // Recalculate status based on blended score
                const threshold = result.audienceThreshold;
                if (result.technicalLoadScore < threshold - 15) {
                    result.status = "below";
                } else if (result.technicalLoadScore > threshold + 15) {
                    result.status = "above";
                } else {
                    result.status = "near";
                }

                // Update summary
                if (result.status === "above") {
                    result.summary = "Your content is significantly more technical than your target audience level. Jargon density is high.";
                } else if (result.status === "below") {
                    result.summary = "Your content is very accessible. Ensure you aren't over-simplifying key concepts if the audience expects depth.";
                } else {
                    result.summary = "You are generally on target, but watch out for specific dense clusters identified below.";
                }

                (result as any).metrics = metrics;
            }
        } catch (err) {
            console.warn('Metrics enrichment failed, using base score:', err);
        }

        res.json({ technicality: result });
    } catch (error) {
        console.error('Technicality analysis failed:', error);
        res.status(500).json({ error: 'Analysis failed' });
    }
});

app.post('/api/analyze/metrics', analyzeLimiter, async (req, res) => {
    try {
        const { text, audienceLevel = 1, domain = 'general' } = req.body;

        if (!text) {
            res.status(400).json({ error: 'text is required' });
            return;
        }

        const mlServiceUrl = process.env.ML_SERVICE_URL || 'http://localhost:8000';

        const response = await fetch(`${mlServiceUrl}/analyze/metrics`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text,
                audience_level: audienceLevel,
                domain
            })
        });

        if (!response.ok) {
            throw new Error(`ML service error: ${response.statusText}`);
        }

        const metrics = await response.json();
        res.json(metrics);
    } catch (error) {
        console.error('Metrics analysis failed:', error);
        res.status(500).json({ error: 'Metrics analysis failed' });
    }
});

// Ensure upload dir exists
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
    if (process.env.ASSEMBLYAI_API_KEY) {
        console.log(`ASSEMBLYAI_API_KEY loaded (${process.env.ASSEMBLYAI_API_KEY.length} chars). Real transcription enabled.`);
    } else {
        console.log("ASSEMBLYAI_API_KEY not found or empty. Mock mode enabled.");
    }
});
