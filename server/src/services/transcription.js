import fs from 'fs';
import { analyzeTranscript } from '../utils/analyze.js';
import { getAudioDuration } from '../utils/file_info.js';
const MOCK_TRANSCRIPT = "So, um, today I want to talk about, like, presentation skills. It is, you know, really important to be clear. Basically, if you practice enough, you will sort of get better at it naturally. I mean, it takes time, but literally anyone can do it.";
export async function processAudio(filePath) {
    let text = '';
    let duration = 0;
    // 1. Get Duration
    duration = await getAudioDuration(filePath);
    // Fallback duration if metadata fails (approximate for mock or calculation safety)
    if (!duration || duration === 0) {
        // If mocking, assume 15 seconds for the mock text
        duration = process.env.ASSEMBLYAI_API_KEY ? 0 : 15;
    }
    // 2. Transcribe
    if (process.env.ASSEMBLYAI_API_KEY) {
        try {
            console.log(`[DEBUG] Starting AssemblyAI Logic with key length: ${process.env.ASSEMBLYAI_API_KEY.length}`);
            console.log(`[DEBUG] File exists at path? ${fs.existsSync(filePath)}`);
            const { AssemblyAI } = await import('assemblyai');
            const client = new AssemblyAI({ apiKey: process.env.ASSEMBLYAI_API_KEY });
            console.log("[DEBUG] Calling client.transcripts.transcribe...");
            const transcript = await client.transcripts.transcribe({
                audio: filePath
            });
            console.log(`[DEBUG] AssemblyAI response status: ${transcript.status}`);
            if (transcript.text) {
                text = transcript.text;
                console.log("AssemblyAI Transcription Success:", text.substring(0, 50) + "...");
            }
            else {
                console.warn('AssemblyAI returned empty text. Full response:', JSON.stringify(transcript));
                text = "";
            }
            // AssemblyAI returns duration in seconds (if available in metadata? usually it's in audio_duration but we can check doc. 
            // actually transcript object has audio_duration in seconds)
            if (duration === 0 && transcript.audio_duration) {
                duration = transcript.audio_duration;
            }
        }
        catch (e) {
            console.error("AssemblyAI Transcription failed, falling back to mock:", e);
            text = MOCK_TRANSCRIPT;
            if (duration === 0)
                duration = 15;
        }
    }
    else {
        console.log("No ASSEMBLYAI_API_KEY found. Using mock transcription.");
        // Artificial delay to simulate processing
        await new Promise(r => setTimeout(r, 1500));
        text = MOCK_TRANSCRIPT;
        if (duration === 0)
            duration = 15;
    }
    // 3. Analyze
    const analysis = analyzeTranscript(text, duration);
    return {
        text,
        metrics: analysis.metrics,
        tips: analysis.tips
    };
}
//# sourceMappingURL=transcription.js.map