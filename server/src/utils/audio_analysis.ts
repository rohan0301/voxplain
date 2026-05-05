import { spawn } from 'child_process';
import pathToFfmpeg from 'ffmpeg-static';

export interface VolumeSegment {
    start: number; // ms
    end: number;   // ms
}

async function getMeanVolume(filePath: string, startMs: number, endMs: number): Promise<number> {
    return new Promise((resolve) => {
        if (!pathToFfmpeg) {
            return resolve(-50); // Default low value if ffmpeg missing
        }

        const startSec = (startMs / 1000).toFixed(3);
        const durationSec = ((endMs - startMs) / 1000).toFixed(3);

        const nullDevice = process.platform === 'win32' ? 'NUL' : '/dev/null';
        const ffmpeg = spawn(pathToFfmpeg as unknown as string, [
            '-ss', startSec,
            '-t', durationSec,
            '-i', filePath,
            '-filter:a', 'volumedetect',
            '-f', 'null',
            nullDevice
        ]);

        let output = '';
        ffmpeg.stderr.on('data', (data) => {
            output += data.toString();
        });

        ffmpeg.on('error', () => resolve(-50));

        ffmpeg.on('close', () => {
            const match = output.match(/mean_volume: ([\-\d\.]+) dB/);
            if (match && match[1]) {
                resolve(parseFloat(match[1]));
            } else {
                resolve(-50); // Fallback
            }
        });
    });
}

export async function analyzeVolumeDecay(
    filePath: string,
    words: Array<{ text: string; start: number; end: number }>
): Promise<{ sentenceEndDropoffs: number; averageDropoffDb: number }> {
    // 1. Identify sentence ends
    const sentenceEnds: number[] = [];
    for (let i = 0; i < words.length; i++) {
        const word = words[i];
        if (word && /[.!?]$/.test(word.text.trim())) {
            sentenceEnds.push(i);
        }
    }

    if (sentenceEnds.length === 0) {
        return { sentenceEndDropoffs: 0, averageDropoffDb: 0 };
    }

    // Limit to first 10 sentences to avoid excessive processing time in MVP
    const sampleEnds = sentenceEnds.slice(0, 10);
    let totalDropoff = 0;
    let dropoffCount = 0;
    let measuredCount = 0;

    for (const endIdx of sampleEnds) {
        // Measure last word volume
        const lastWord = words[endIdx];
        // Measure sentence average volume (simplified: look at 3 words before end)
        const startIdx = Math.max(0, endIdx - 4);
        const sentenceStart = words[startIdx];
        if (!lastWord || !sentenceStart) continue;
        
        const [lastWordVol, sentenceAvgVol] = await Promise.all([
            getMeanVolume(filePath, lastWord.start, lastWord.end),
            getMeanVolume(filePath, sentenceStart.start, lastWord.end)
        ]);

        const dropoff = sentenceAvgVol - lastWordVol;
        if (dropoff > 5) { // More than 5dB drop is significant
            dropoffCount++;
        }
        totalDropoff += dropoff;
        measuredCount++;
    }

    return {
        sentenceEndDropoffs: dropoffCount,
        averageDropoffDb: measuredCount > 0 ? Math.round(totalDropoff / measuredCount) : 0
    };
}
