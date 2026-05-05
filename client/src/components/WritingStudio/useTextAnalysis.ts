import { useState, useCallback } from 'react';
import { analyzeTechnicality } from '../../api';
import type { TechnicalityResult, MetricsResponse } from '../../api';
import type { AudienceLevel } from '../../types/Project';

export interface TextAnalysis extends TechnicalityResult {
    wordCount: number;
    sentenceCount: number;
    avgWordsPerSentence: number;
    metrics?: MetricsResponse;
}

export function useTextAnalysis() {
    const [analysis, setAnalysis] = useState<TextAnalysis | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const analyzeText = useCallback(async (text: string, audienceLevel: AudienceLevel = 1, domain: string = 'general') => {
        setIsAnalyzing(true);
        setError(null);

        try {
            const words = text.trim().split(/\s+/).filter(Boolean);
            const wordCount = words.length;

            if (wordCount === 0) {
                setAnalysis(null);
                setIsAnalyzing(false);
                return;
            }

            // Basic local stats
            const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
            const sentenceCount = sentences.length;
            const avgWordsPerSentence = parseFloat((wordCount / sentenceCount).toFixed(1));

            // Call API (now includes metrics enrichment server-side)
            const { technicality } = await analyzeTechnicality({
                transcriptText: text,
                audienceLevel,
                domain
            });

            setAnalysis({
                ...technicality,
                wordCount,
                sentenceCount,
                avgWordsPerSentence,
                metrics: (technicality as any).metrics
            });

        } catch (err) {
            console.error("Analysis failed:", err);
            setError("Failed to analyze text. Please try again.");
        } finally {
            setIsAnalyzing(false);
        }
    }, []);

    return { analysis, isAnalyzing, analyzeText, error };
}
