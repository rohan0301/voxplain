import { FaceMesh, type Results } from '@mediapipe/face_mesh';

// Singleton instance to avoid reloading models constantly
let faceMesh: FaceMesh | null = null;

export interface FaceFrame {
    t: number; // timestamp in seconds
    landmarks: Array<{ x: number; y: number; z: number }>;
}

export async function initializeFaceMesh(): Promise<void> {
    if (faceMesh) return;

    faceMesh = new FaceMesh({
        locateFile: (file) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
        }
    });

    faceMesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
    });

    await faceMesh.initialize();
}

/**
 * Detects landmarks in a video element by sampling frames.
 * Returns a list of frames with 3D landmarks.
 */
export async function detectLandmarks(
    videoEl: HTMLVideoElement,
    onProgress?: (pct: number) => void,
    knownDuration?: number
): Promise<FaceFrame[]> {
    if (!faceMesh) {
        await initializeFaceMesh();
    }

    if (!faceMesh) throw new Error("Failed to initialize FaceMesh");

    const frames: FaceFrame[] = [];
    let duration = videoEl.duration;
    if (!Number.isFinite(duration) && knownDuration) {
        duration = knownDuration;
    }

    // We want to sample at ~10 FPS
    // Video might be long, so we seek through it or play it?
    // Playing it in real-time (accelerated) is safer for browser video APIs than rapid seeking.
    // Ideally we use requestVideoFrameCallback if playing.

    return new Promise((resolve) => {
        // Reset video to start
        const originalCurrentTime = videoEl.currentTime;
        const originalMuted = videoEl.muted;

        videoEl.currentTime = 0;
        videoEl.muted = true; // Mute for analysis

        let processedFrames = 0;

        // Callback for each frame
        faceMesh!.onResults((results: Results) => {
            if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
                // Take the first face
                frames.push({
                    t: videoEl.currentTime,
                    landmarks: results.multiFaceLandmarks[0]
                });
            } else {
                // Record empty frame for tracking quality
                frames.push({
                    t: videoEl.currentTime,
                    landmarks: []
                });
            }
            processedFrames++;
            if (onProgress) {
                onProgress(Math.min(100, (videoEl.currentTime / duration) * 100));
            }
        });

        // Use a loop to process
        // We will "play" the video but capturing frames. 
        // Note: FaceMesh.send() is async.

        const process = async () => {
            if (videoEl.ended || videoEl.paused) {
                // Done
                videoEl.currentTime = originalCurrentTime;
                videoEl.muted = originalMuted;
                resolve(frames);
                return;
            }

            // Send frame to analysis
            await faceMesh!.send({ image: videoEl });

            // Limit FPS processing if needed, but FaceMesh send is the bottleneck usually.
            // Just request next frame
            if ('requestVideoFrameCallback' in videoEl) {
                videoEl.requestVideoFrameCallback(process);
            } else {
                requestAnimationFrame(process);
            }
        };

        videoEl.play().then(() => {
            process();
        }).catch(err => {
            console.error("Auto-play failed for analysis", err);
            resolve(frames);
        });
    });
}
