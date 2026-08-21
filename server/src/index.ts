import express, { type Request, type Response } from 'express';
import cors, { type CorsOptions } from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { processAudio } from './services/transcription.js';
import { preloadJargon } from './services/jargon.js';
import { scoreForAudience } from './services/audienceScoring.js';
import { compareAudiences, parseLevels } from './services/audienceCompare.js';
import {
    getMlStatus,
    mlServiceUrl,
    noteMlReachable,
    startMlHealthPolling,
} from './services/mlHealth.js';
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
    // The server being up says nothing about the analyzer being up, and the
    // two fail independently. Report both.
    res.json({ status: 'ok', ml: getMlStatus() });
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

        // Resolve the audience level once, here, and record where it came
        // from. Defaulting is the right behaviour — failing the request
        // because no project is selected would be worse — but a score
        // computed against an invented audience must say so, or the product
        // is quietly grading against someone the user never named.
        //
        // Previously three separate layers each defaulted to 1 on their own
        // (technicality.ts, metrics.py, and the studio page), so nothing
        // anywhere knew whether level 1 was a choice or a fallback.
        const hasExplicitLevel = typeof audienceLevel === 'number'
            && Number.isInteger(audienceLevel)
            && audienceLevel >= 0 && audienceLevel <= 3;
        const resolvedLevel: AudienceLevel = hasExplicitLevel
            ? audienceLevel as AudienceLevel
            : 1;
        // 'inferred' is reserved for Fix #1, when a free-text audience
        // description can produce a level. Nothing emits it yet.
        const audienceLevelSource: 'project' | 'inferred' | 'default' =
            hasExplicitLevel ? 'project' : 'default';

        // The blend — base heuristic plus whichever ML signals answer — lives
        // in services/audienceScoring.ts, because /compare below needs exactly
        // the same computation and two copies of it would drift.
        const { result, mode, degraded, modelVersion } = await scoreForAudience({
            transcriptText,
            words,
            audienceLevel: resolvedLevel,
            requiredTimeSec,
            domain,
        });

        res.json({
            technicality: result,
            analysis: {
                mode,
                degraded,
                audienceLevel: resolvedLevel,
                audienceLevelSource,
                domain,
                modelVersion,
            },
        });
    } catch (error) {
        console.error('Technicality analysis failed:', error);
        res.status(500).json({ error: 'Analysis failed' });
    }
});

/**
 * Fix #6 — the same script, scored against several audiences at once.
 *
 * Deliberately a separate route rather than a `levels` parameter on the
 * analysis endpoint: the single-analysis path defaults a missing level and
 * reports where it came from (Fix #4), and there is no sensible default for
 * "which audiences are you comparing". Requests here must say.
 *
 * See services/audienceCompare.ts for what genuinely differs between
 * audiences today — less than the UI could be tempted to imply.
 */
app.post('/api/analyze-technicality/compare', analyzeLimiter, async (req, res) => {
    try {
        const { transcriptText, words, requiredTimeSec, domain = 'general', levels } = req.body;

        if (!transcriptText) {
            res.status(400).json({ error: 'transcriptText is required' });
            return;
        }

        let parsedLevels;
        try {
            parsedLevels = parseLevels(levels);
        } catch (err) {
            // A bad level list is the caller's mistake and is worth naming
            // precisely — this is the one input the endpoint cannot guess.
            res.status(400).json({ error: (err as Error).message });
            return;
        }

        const comparison = await compareAudiences({
            transcriptText,
            levels: parsedLevels,
            domain,
            words,
            requiredTimeSec,
        });

        res.json(comparison);
    } catch (error) {
        console.error('Audience comparison failed:', error);
        res.status(500).json({ error: 'Comparison failed' });
    }
});

app.post('/api/analyze/metrics', analyzeLimiter, async (req, res) => {
    try {
        const { text, audienceLevel = 1, domain = 'general' } = req.body;

        if (!text) {
            res.status(400).json({ error: 'text is required' });
            return;
        }

        const response = await fetch(`${mlServiceUrl()}/analyze/metrics`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text,
                audience_level: audienceLevel,
                domain
            })
        });

        if (!response.ok) {
            noteMlReachable(false);
            throw new Error(`ML service error: ${response.statusText}`);
        }

        noteMlReachable(true);
        const metrics = await response.json();
        res.json(metrics);
    } catch (error) {
        console.error('Metrics analysis failed:', error);
        noteMlReachable(false);
        res.status(503).json({
            error: 'Metrics analysis failed',
            degraded: getMlStatus().degraded,
        });
    }
});

/**
 * Infer an audience level + domain from the project's free-text description.
 *
 * Proxied rather than called from the browser because ML_SERVICE_URL is a
 * server-side secret and the ML service's CORS list does not include the
 * client origin.
 *
 * Degrades to "no inference" rather than an error: the description field is
 * an assist, and a project form that will not submit because the analyzer is
 * asleep would be a worse product than one that quietly stops suggesting.
 */
app.post('/api/analyze/audience', analyzeLimiter, async (req, res) => {
    const { description } = req.body ?? {};

    if (typeof description !== 'string' || !description.trim()) {
        res.json({ audience_level: null, domain: null, confidence: 0, matched: [] });
        return;
    }

    try {
        const response = await fetch(`${mlServiceUrl()}/analyze/audience`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ description }),
        });

        if (!response.ok) {
            noteMlReachable(false);
            res.json({
                audience_level: null, domain: null, confidence: 0, matched: [],
                degraded: getMlStatus().degraded,
            });
            return;
        }

        noteMlReachable(true);
        res.json(await response.json());
    } catch (error) {
        console.warn('Audience inference failed:', error);
        noteMlReachable(false);
        res.json({
            audience_level: null, domain: null, confidence: 0, matched: [],
            degraded: getMlStatus().degraded,
        });
    }
});

// Ensure upload dir exists
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

preloadJargon();
startMlHealthPolling();

app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
    console.log(`ML service expected at ${mlServiceUrl()} (polling /health every 60s)`);
    if (process.env.ASSEMBLYAI_API_KEY) {
        console.log(`ASSEMBLYAI_API_KEY loaded (${process.env.ASSEMBLYAI_API_KEY.length} chars). Real transcription enabled.`);
    } else {
        console.log("ASSEMBLYAI_API_KEY not found or empty. Mock mode enabled.");
    }
});
