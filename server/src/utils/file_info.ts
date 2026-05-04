import { parseFile } from 'music-metadata';
import fs from 'fs';

export async function getAudioDuration(filePath: string): Promise<number> {
    try {
        const metadata = await parseFile(filePath);
        return metadata.format.duration || 0;
    } catch (error) {
        // console.warn('Failed to extract duration metadata (will use fallback):', error);
        return 0;
    }
}
