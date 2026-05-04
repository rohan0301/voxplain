
export interface Project {
    id: string;
    name: string;
    lastModified: string; // ISO date string or formatted string
    lastModifiedDateObj: Date; // For sorting if needed, but display string is fine for now
    estimatedTimeSec: number;
    requiredTimeSec?: number | null;
    audience?: string;
    presentationType?: string;
    speechText?: string;
    audienceLevel?: AudienceLevel;
    domain?: "general" | "tech" | "finance" | "healthcare" | "other";
}

export type AudienceLevel = 0 | 1 | 2 | 3;
