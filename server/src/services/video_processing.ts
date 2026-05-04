
import path from 'path';
import fs from 'fs';
import ffmpeg from 'fluent-ffmpeg';
import pathToFfmpeg from 'ffmpeg-static';

// Set ffmpeg path
if (pathToFfmpeg) {
    ffmpeg.setFfmpegPath(pathToFfmpeg as unknown as string);
}

/**
 * Extracts audio from a video file and saves it as .mp3 (or wav/webm audio)
 * returns path to the extracted audio file.
 */
export async function extractAudioFromVideo(videoPath: string): Promise<string> {
    const outputPath = videoPath.replace(/\.(webm|mp4|mov)$/i, '.mp3');

    // Check if output already exists (unlikely with unique IDs but safe to check)
    if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
    }

    return new Promise((resolve, reject) => {
        ffmpeg(videoPath)
            .noVideo()
            .audioCodec('libmp3lame') // Standard MP3 encoding
            .save(outputPath)
            .on('end', () => {
                console.log(`[FFMPEG] Audio extraction complete: ${outputPath}`);
                resolve(outputPath);
            })
            .on('error', (err) => {
                console.error(`[FFMPEG] Error extracting audio:`, err);
                reject(err);
            });
    });
}
