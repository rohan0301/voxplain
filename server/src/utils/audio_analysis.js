import { spawn } from 'child_process';
import pathToFfmpeg from 'ffmpeg-static';

async function getMeanVolume(filePath, startMs, endMs) {
    return new Promise((resolve) => {
        if (!pathToFfmpeg) return resolve(-50);

        const startSec = (startMs / 1000).toFixed(3);
        const durationSec = ((endMs - startMs) / 1000).toFixed(3);
        const nullDevice = process.platform === 'win32' ? 'NUL' : '/dev/null';

        const ffmpeg = spawn(pathToFfmpeg, [
            '-ss', startSec,
            '-t', durationSec,
            '-i', filePath,
            '-filter:a', 'volumedetect',
            '-f', 'null',
            nullDevice
        ]);

        let output = '';
        ffmpeg.stderr.on('data', (data) => { output += data.toString(); });
        ffmpeg.on('error', () => resolve(-50));
        ffmpeg.on('close', () => {
            const match = output.match(/mean_volume: ([\-\d\.]+) dB/);
            resolve(match && match[1] ? parseFloat(match[1]) : -50);
        });
    });
}

export async function analyzeVolumeDecay(filePath, words) {
    const sentenceEnds = [];
    for (let i = 0; i < words.length; i++) {
        if (/[.!?]$/.test(words[i].text.trim())) sentenceEnds.push(i);
    }

    if (sentenceEnds.length === 0) return { sentenceEndDropoffs: 0, averageDropoffDb: 0 };

    const sampleEnds = sentenceEnds.slice(0, 10);
    let totalDropoff = 0;
    let dropoffCount = 0;

    for (const endIdx of sampleEnds) {
        const lastWord = words[endIdx];
        const startIdx = Math.max(0, endIdx - 4);
        const sentenceStart = words[startIdx];

        const [lastWordVol, sentenceAvgVol] = await Promise.all([
            getMeanVolume(filePath, lastWord.start, lastWord.end),
            getMeanVolume(filePath, sentenceStart.start, lastWord.end)
        ]);

        const dropoff = sentenceAvgVol - lastWordVol;
        if (dropoff > 5) dropoffCount++;
        totalDropoff += dropoff;
    }

    return {
        sentenceEndDropoffs: dropoffCount,
        averageDropoffDb: Math.round(totalDropoff / sampleEnds.length)
    };
}
