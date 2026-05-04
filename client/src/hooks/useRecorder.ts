import { useState, useRef, useEffect, useCallback } from 'react';

export const useRecorder = () => {
    const [isRecording, setIsRecording] = useState(false);
    const [isInitializing, setIsInitializing] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const [audioBlob, setAudioBlob] = useState<Blob | null>(null);

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const timerRef = useRef<number | null>(null);
    const streamRef = useRef<MediaStream | null>(null);

    const clearTimer = () => {
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
    };

    const startRecording = useCallback(async () => {
        if (isRecording || isInitializing) return;

        setIsInitializing(true);
        // Clear previous data
        setAudioUrl(null);
        setAudioBlob(null);

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;

            // Try to use a supported mime type, or fallback to browser default
            let options: MediaRecorderOptions = {};
            if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
                options = { mimeType: 'audio/webm;codecs=opus' };
            } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
                options = { mimeType: 'audio/mp4' };
            }

            const mediaRecorder = new MediaRecorder(stream, options);
            mediaRecorderRef.current = mediaRecorder;
            chunksRef.current = [];

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    chunksRef.current.push(e.data);
                }
            };

            mediaRecorder.onstop = () => {
                const mimeType = mediaRecorderRef.current?.mimeType || 'audio/webm';
                const blob = new Blob(chunksRef.current, { type: mimeType });
                const url = URL.createObjectURL(blob);
                setAudioBlob(blob);
                setAudioUrl(url);

                // Stop all tracks to release microphone
                if (streamRef.current) {
                    streamRef.current.getTracks().forEach(track => track.stop());
                    streamRef.current = null;
                }
            };

            // Start recording with 1s timeslices to ensure data is captured even if stopped quickly
            mediaRecorder.start(1000);

            setIsRecording(true);
            setRecordingTime(0);

            // Clear any existing timer just in case
            clearTimer();
            timerRef.current = window.setInterval(() => {
                setRecordingTime(prev => prev + 1);
            }, 1000);

        } catch (error) {
            console.error('Error accessing microphone:', error);
            alert('Could not access microphone. Please allow permissions.');
        } finally {
            setIsInitializing(false);
        }
    }, [isRecording, isInitializing]);

    const stopRecording = useCallback(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
            clearTimer();
        }
    }, []);

    const resetRecording = useCallback(() => {
        setAudioUrl(null);
        setAudioBlob(null);
        setRecordingTime(0);
        setIsRecording(false);
        clearTimer();
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            clearTimer();
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }
        };
    }, []);

    return {
        isRecording,
        isInitializing,
        recordingTime,
        audioUrl,
        audioBlob,
        startRecording,
        stopRecording,
        resetRecording
    };
};
