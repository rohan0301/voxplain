import rateLimit from 'express-rate-limit';

/**
 * The app is public and account-free, so every compute endpoint is reachable by
 * anyone who knows the URL. These limits exist so that a scraper or a bad actor
 * can't drain the AssemblyAI balance or peg the free-tier CPU.
 *
 * Keyed by IP. That's imperfect — a shared NAT counts as one caller — but
 * without accounts there is no better key, and the limits are loose enough that
 * a normal user will never see them.
 */

const jsonLimitHandler = (retryAfterHint: string) =>
    (_req: any, res: any) => {
        res.status(429).json({
            error: `Too many requests. Please try again in ${retryAfterHint}.`,
        });
    };

/**
 * Transcription calls a metered third-party API and is the only endpoint here
 * that costs real money per request. Keep this tight.
 */
export const transcribeLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    limit: 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: jsonLimitHandler('an hour'),
});

/**
 * Analysis is CPU-bound on our own boxes, not billed per call, so this is about
 * keeping the free tier responsive. The writing studio analyses on demand, so
 * a real session can legitimately fire a few dozen of these.
 */
export const analyzeLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 100,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: jsonLimitHandler('a few minutes'),
});

/**
 * Labels are anonymous now that sign-in is gone, so this is the only thing
 * standing between the training table and someone scripting junk rows into it.
 * Generous enough for genuine bulk labeling of a long transcript.
 */
export const labelsLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    limit: 200,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: jsonLimitHandler('an hour'),
});
