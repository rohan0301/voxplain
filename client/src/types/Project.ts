
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
    domain?: ProjectDomain;
}

export type AudienceLevel = 0 | 1 | 2 | 3;

/**
 * The domain vocabulary the product offers. Named so the audience-inference
 * code can narrow to it instead of passing bare strings around.
 *
 * Note "healthcare", not "medical": ml/app/metrics.py keys its jargon list on
 * "medical" but aliases "healthcare" to the same list, so both work on the
 * wire. This is the spelling the UI uses.
 */
export type ProjectDomain = "general" | "tech" | "finance" | "healthcare" | "other";
