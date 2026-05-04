import type { FaceFrame } from './faceLandmarks';
import type { VideoAnalysisResult } from '../types/PracticeResult';

/**
 * Key Landmark Indices (Mediapipe 468)
 * Nose tip: 1
 * Left Eye Iris Center (approx): 468 (refine) or use pupil 468
 * Right Eye Iris: 473
 * Left Eye Outer: 33
 * Right Eye Outer: 263
 * Mouth Left: 61
 * Mouth Right: 291
 * Mouth Top: 13
 * Mouth Bottom: 14
 * Left Brow: 105
 * Right Brow: 334
 */

function calculateYawPitch(landmarks: Array<{ x: number, y: number, z: number }>) {
    // Simple geometry approximation
    // Yaw: Nose (1) relative to mid-point of checkbones/ears. 
    // Simplified: Nose x relative to mid-point of eye outer corners (33, 263)

    if (!landmarks || landmarks.length < 468) return { yaw: 0, pitch: 0 };

    const nose = landmarks[1];
    const leftEye = landmarks[33];
    const rightEye = landmarks[263];

    const midEyeX = (leftEye.x + rightEye.x) / 2;
    const midEyeY = (leftEye.y + rightEye.y) / 2;

    // Face width approx
    const faceWidth = Math.abs(rightEye.x - leftEye.x);

    // Yaw: (nose X - midEye X) / faceWidth
    // If looking straight, diff is 0.
    // If looking left, nose moves left (smaller x).
    const yawVal = (nose.x - midEyeX) / faceWidth;

    // Pitch: (nose Y - midEye Y) / faceHeight (approx faceHeight ~ faceWidth for normalized)
    const pitchVal = (nose.y - midEyeY) / faceWidth;

    // Convert to degrees approx (calibrated loosely)
    // 0.1 normalized deviation approx 15-20 degrees
    const yawDeg = yawVal * 200;
    const pitchDeg = pitchVal * 200;

    return { yaw: yawDeg, pitch: pitchDeg };
}

function calculateSmile(landmarks: Array<{ x: number, y: number }>) {
    // Smile: width of mouth (61-291) vs standardized face width
    const leftMouth = landmarks[61];
    const rightMouth = landmarks[291];
    const leftEye = landmarks[33];
    const rightEye = landmarks[263];

    const faceWidth = Math.abs(rightEye.x - leftEye.x);
    const mouthWidth = Math.abs(rightMouth.x - leftMouth.x);

    const ratio = mouthWidth / faceWidth;
    // Threshold ~ 0.45 is neutral, > 0.5 is smile
    return ratio;
}


// Helper defaults
const DEFAULTS = {
    resolution: "HD (1280x720)",
    brightness: "Good",
    postureScore: 88,
    framing: "Centered",
    eyeContactScore: 0
};

export function analyzeVideoMetrics(frames: FaceFrame[]): VideoAnalysisResult {
    if (!frames || frames.length === 0) {
        return {
            ...DEFAULTS,
            trackingQuality: 'low',
            notes: ["No video frames processed."]
        };
    }

    const totalFrames = frames.length;
    let facesFound = 0;

    let lookingAtCameraCount = 0;
    let lookingDownCount = 0;
    let smileCount = 0;

    // For expressiveness
    const browMovements: number[] = [];

    frames.forEach((frame) => {
        if (frame.landmarks.length === 0) return;
        facesFound++;

        const { yaw, pitch } = calculateYawPitch(frame.landmarks);

        // Eye Contact Thresholds
        const isCenteredYaw = Math.abs(yaw) < 20; // 20 degrees

        // Looking down detection (reading notes)
        // If pitch is significantly lower (higher value in our geometry) or 'looking down at notes'
        // Let's assume > 35 is looking down.
        if (pitch > 35) {
            lookingDownCount++;
        }

        if (isCenteredYaw && pitch < 30) {
            lookingAtCameraCount++;
        }

        const smileRatio = calculateSmile(frame.landmarks);
        if (smileRatio > 0.52) { // calibrated guess
            smileCount++;
        }

        // Expressiveness: Brow height variance
        // Left Brow (105) y relative to eye (33) y
        const browDist = Math.abs(frame.landmarks[105].y - frame.landmarks[33].y);
        browMovements.push(browDist);
    });

    const facePresentRate = facesFound / totalFrames;
    console.log(`[FaceAnalysis] Present: ${facePresentRate.toFixed(2)}, Frames: ${totalFrames}`);

    let trackingQuality: "high" | "medium" | "low" = 'high';
    const notes: string[] = [];

    if (facePresentRate < 0.5) {
        trackingQuality = 'low';
        notes.push("Face not visible in many frames.");
    } else if (facePresentRate < 0.8) {
        trackingQuality = 'medium';
        notes.push("Face tracking was intermittent.");
    }

    if (trackingQuality === 'low') {
        return {
            ...DEFAULTS,
            trackingQuality,
            notes
        };
    }

    const eyeContactPct = Math.round((lookingAtCameraCount / facesFound) * 100);
    const lookingDownPct = Math.round((lookingDownCount / facesFound) * 100);
    const smilePct = Math.round((smileCount / facesFound) * 100);

    // Expressiveness (Variance of brow movements)
    // Calc standard deviation
    const mean = browMovements.reduce((a, b) => a + b, 0) / browMovements.length;
    const variance = browMovements.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / browMovements.length;
    const stdDev = Math.sqrt(variance);

    // Normalize by mean?
    const cv = stdDev / mean; // Coefficient of variation

    let expressivenessLevel: "low" | "balanced" | "high" = 'balanced';
    if (cv < 0.05) expressivenessLevel = 'low';
    if (cv > 0.15) expressivenessLevel = 'high';

    return {
        ...DEFAULTS,
        trackingQuality,
        eyeContactScore: eyeContactPct, // Mapped
        lookingDownPct,
        smilePct,
        expressivenessLevel,
        notes
    };
}
