import type { TechnicalityResult, AudienceLevel } from '../types.js';
interface AnalyzeInput {
    transcriptText: string;
    words?: Array<{
        text: string;
        startSec: number;
        endSec: number;
    }>;
    audienceLevel?: AudienceLevel;
    requiredTimeSec?: number | null;
}
export declare function analyzeTechnicality(input: AnalyzeInput): TechnicalityResult;
export {};
//# sourceMappingURL=technicality.d.ts.map