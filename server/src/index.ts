import express, { type Request, type Response } from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { processAudio } from './services/transcription.js';
import { analyzeTechnicality } from './services/technicality.js';
import { requireAuth } from './middleware/auth.js';
import type { AudienceLevel } from './types.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LABELS_PATH = path.join(__dirname, "..", "data", "labels.jsonl");
const app = express();
const port = process.env.PORT || 3000;

// Middleware — CORS
const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
    : ['http://localhost:5173', 'http://localhost:4173'];

app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (curl, mobile, etc.) in dev
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error(`Origin ${origin} not allowed by CORS`));
        }
    },
    credentials: true,
}));
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
app.post("/api/labels", requireAuth, (req, res) => {
    try {
        const { text, label, audienceLevel, domain, projectId } = req.body ?? {};

        // Basic validation
        if (typeof text !== "string" || text.trim().length === 0) {
            return res.status(400).json({ ok: false, error: "Missing text" });
        }
        if (!(label === 0 || label === 1)) {
            return res.status(400).json({ ok: false, error: "label must be 0 or 1" });
        }

        const record = {
            text: text.trim(),
            label,
            audienceLevel: typeof audienceLevel === "number" ? audienceLevel : null,
            domain: typeof domain === "string" ? domain : "general",
            projectId: typeof projectId === "string" ? projectId : null,
            createdAt: new Date().toISOString(),
        };

        // Ensure folder exists, then append JSONL
        fs.mkdirSync(path.dirname(LABELS_PATH), { recursive: true });

        console.log(`[DEBUG] Appending label to: ${LABELS_PATH}`);
        fs.appendFileSync(LABELS_PATH, JSON.stringify(record) + "\n", "utf8");

        return res.json({ ok: true, path: LABELS_PATH });
    } catch (err: any) {
        return res.status(500).json({ ok: false, error: err?.message ?? "Unknown error" });
    }
});
app.post('/api/transcribe', requireAuth, upload.single('audio'), transcribeHandler);

app.post('/api/analyze-technicality', requireAuth, (req, res) => {
    try {
        const { transcriptText, words, audienceLevel, requiredTimeSec } = req.body;

        if (!transcriptText) {
            res.status(400).json({ error: 'transcriptText is required' });
            return;
        }

        const result = analyzeTechnicality({
            transcriptText,
            words,
            audienceLevel: audienceLevel as AudienceLevel,
            requiredTimeSec
        });

        res.json({ technicality: result });
    } catch (error) {
        console.error('Technicality analysis failed:', error);
        res.status(500).json({ error: 'Analysis failed' });
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
