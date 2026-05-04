import { useRef, useState, useCallback, useEffect } from 'react';

export interface UseVideoRecorderReturn {
    isRecording: boolean;
    isInitializing: boolean;
    recordingTime: number;
    videoUrl: string | null;
    videoBlob: Blob | null;
    startRecording: () => Promise<void>;
    stopRecording: () => void;
    resetRecording: () => void;
    previewStream: MediaStream | null;
    error: string | null;
    hasCameraPermission: boolean;
}

export function useVideoRecorder(): UseVideoRecorderReturn {
    const [isRecording, setIsRecording] = useState(false);
    const [isInitializing, setIsInitializing] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const [videoUrl, setVideoUrl] = useState<string | null>(null);
    const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
    const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [hasCameraPermission, setHasCameraPermission] = useState(false);

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const timerRef = useRef<any>(null);

    // Initialize Camera
    useEffect(() => {
        async function initCamera() {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
                    audio: true
                });
                setPreviewStream(stream);
                setHasCameraPermission(true);
            } catch (err: any) {
                console.error("Camera access error:", err);
                setError(err.name === 'NotAllowedError'
                    ? "Camera/Microphone permission denied. Please allow access."
                    : "Could not access camera/microphone.");
            }
        }
        initCamera();

        return () => {
            // Cleanup on unmount
            if (previewStream) {
                previewStream.getTracks().forEach(track => track.stop());
            }
        };
    }, []); // Run once on mount

    const startRecording = useCallback(async () => {
        if (!previewStream) return;
        setIsInitializing(true);
        setError(null);

        try {
            const stream = previewStream;
            const options = { mimeType: 'video/webm;codecs=vp8,opus' };

            // Fallback for Safari/Other browsers if vp8/opus not supported
            let recorder: MediaRecorder;
            try {
                recorder = new MediaRecorder(stream, options);
            } catch (e) {
                console.warn("vp8/opus not supported, trying default.");
                recorder = new MediaRecorder(stream);
            }

            chunksRef.current = [];

            recorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) {
                    chunksRef.current.push(e.data);
                }
            };

            recorder.onstop = () => {
                const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'video/webm' });
                const url = URL.createObjectURL(blob);
                setVideoBlob(blob);
                setVideoUrl(url);
                setIsRecording(false);
            };

            recorder.start(1000); // Collect chunks every second
            mediaRecorderRef.current = recorder;
            setIsRecording(true);

            // Timer
            setRecordingTime(0);
            timerRef.current = setInterval(() => {
                setRecordingTime(t => t + 1);
            }, 1000);

        } catch (err: any) {
            console.error("Recording error:", err);
            setError("Failed to start recording.");
        } finally {
            setIsInitializing(false);
        }
    }, [previewStream]);

    const stopRecording = useCallback(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
        }
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
    }, []);

    const resetRecording = useCallback(() => {
        if (videoUrl) {
            URL.revokeObjectURL(videoUrl);
        }
        setVideoUrl(null);
        setVideoBlob(null);
        setRecordingTime(0);
        setIsRecording(false);
    }, [videoUrl]);

    return {
        isRecording,
        isInitializing,
        recordingTime,
        videoUrl,
        videoBlob,
        startRecording,
        stopRecording,
        resetRecording,
        previewStream,
        error,
        hasCameraPermission
    };
}
