import { useState, useCallback } from 'react';
import { analyzeTechnicality } from '../../api';
import type { TechnicalityResult, MetricsResponse, AnalysisProvenance } from '../../api';
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
    // Which signals produced the current analysis. Kept beside it rather than
    // inside it so a degraded run cannot be mistaken for a normal one.
    const [provenance, setProvenance] = useState<AnalysisProvenance | null>(null);

    // audienceLevel is deliberately not defaulted here. Defaulting it locally
    // would send the server a number it cannot distinguish from a real choice,
    // and the whole point of Fix #4 is that the response says which it was.
    const analyzeText = useCallback(async (text: string, audienceLevel?: AudienceLevel, domain: string = 'general') => {
        setIsAnalyzing(true);
        setError(null);

        try {
            const words = text.trim().split(/\s+/).filter(Boolean);
            const wordCount = words.length;

            if (wordCount === 0) {
                setAnalysis(null);
                setProvenance(null);
                setIsAnalyzing(false);
                return null;
            }

            // Basic local stats
            const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
            const sentenceCount = sentences.length;
            const avgWordsPerSentence = parseFloat((wordCount / sentenceCount).toFixed(1));

            // Call API (now includes metrics enrichment server-side)
            const { technicality, analysis: provenanceResult } = await analyzeTechnicality({
                transcriptText: text,
                audienceLevel,
                domain
            });
            setProvenance(provenanceResult ?? null);

            const nextAnalysis = {
                ...technicality,
                wordCount,
                sentenceCount,
                avgWordsPerSentence,
                metrics: (technicality as any).metrics
            };

            setAnalysis(nextAnalysis);
            return nextAnalysis;

        } catch (err) {
            console.error("Analysis failed:", err);
            setError("Failed to analyze text. Please try again.");
            // Stale provenance would describe the previous run, not this one.
            setProvenance(null);
            return null;
        } finally {
            setIsAnalyzing(false);
        }
    }, []);

    return { analysis, isAnalyzing, analyzeText, error, provenance };
}
