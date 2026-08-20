export interface AnalysisMetrics {
  wordCount: number;
  durationSeconds: number;
  wpm: number;
  fillerCount: number;
  fillerWordsFound: Record<string, number>;
  pausesEstimate: number;
  
  // New Confidence Metrics
  hedges: string[];
  apologies: string[];
  iTax: number; // % of sentences starting with "I"
  
  // New Pacing Metrics
  pacing: {
    goodPauses: number; // Pauses at sentence/clause boundaries
    badPauses: number;  // Pauses mid-clause
    totalPauseTime: number;
    wpmSpikes: number; // Count of segments with >20% above avg WPM
  };

  // New Vocal Metrics
  volumeDecay?: {
    sentenceEndDropoffs: number; // Count of sentences with significant volume drop
    averageDropoffDb: number;
  };
}

export interface ActionableTip {
  id: string;
  type: 'improvement' | 'positive';
  message: string;
}

export interface TranscriptionResult {
  text: string;
  metrics: AnalysisMetrics;
  tips: ActionableTip[];
  words: Array<{ text: string; start: number; end: number; confidence: number }>;
}

export type AudienceLevel = 0 | 1 | 2 | 3;

export interface TechnicalityHotspot {
  sentence: string;
  startWordIndex?: number;
  endWordIndex?: number;
  terms: string[];
  reasons: string[];
  suggestions: string[];
  /**
   * Concrete term -> plain-language swaps for this sentence, chosen for the
   * audience level (Fix #5 Stage A). Empty when none of the terms have an
   * entry in shared/jargon/plain.json. The same swaps also appear, formatted,
   * at the front of `suggestions`, so existing renderers show them without
   * changes.
   */
  replacements?: Array<{ term: string; plain: string }>;
  localWPM?: number;
}

export interface TechnicalityResult {
  technicalLoadScore: number;
  audienceThreshold: number;
  status: "below" | "near" | "above";
  summary: string;
  hotspots: TechnicalityHotspot[];
  termStats: {
    totalTerms: number;
    uniqueTerms: number;
    maxClump: number;
    explainedRate: number;
  };
}
