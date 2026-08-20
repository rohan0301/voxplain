/**
 * Domain vocabularies, shared with the Python metrics service.
 *
 * Both halves of the blended technicality score need these lists. Until now
 * they were two unrelated hardcoded sets: `metrics.py` picked a list per
 * domain, while this service scored everything against one ~470-entry set that
 * was almost entirely AI/ML and web infrastructure. A cardiology talk got half
 * its score from a vocabulary containing `react` and `kubernetes`, and
 * choosing "Healthcare" in the project form changed nothing on this side.
 *
 * The lists now live in shared/jargon/*.json. Edit those, not this file.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Three levels up from either src/services (tsx) or dist/services (built).
const JARGON_DIR = path.join(__dirname, '../../..', 'shared', 'jargon');

/**
 * Product domains → vocabulary file.
 *
 * 'general' and 'other' are real choices in the project form but are not
 * domains with their own vocabulary, so they get every term at once. That used
 * to happen by accident through a fallthrough in metrics.py; here it is
 * deliberate. 'healthcare' is the product's spelling of 'medical'.
 */
function fileForDomain(domain?: string): string {
    const d = (domain ?? '').trim().toLowerCase();
    if (!d || d === 'general' || d === 'other') return 'all';
    if (d === 'healthcare') return 'medical';
    if (d === 'tech' || d === 'finance' || d === 'medical') return d;
    return 'all';
}

/**
 * Glossary entries that are ordinary English words. Subtracted from every
 * vocabulary. The old inline set inherited programming keywords like `this`,
 * `type` and `go`, which matched constantly on ordinary speech — `this` alone
 * appeared in 50 of 607 labelled rows. See shared/jargon/ambiguous.json.
 *
 * Set VOXPLAIN_KEEP_AMBIGUOUS_TERMS=1 to disable the subtraction; the only
 * intended use is ml/tune_stopwords.py, which scores the corpus both ways.
 */
const KEEP_AMBIGUOUS = process.env.VOXPLAIN_KEEP_AMBIGUOUS_TERMS === '1';

let ambiguous: ReadonlySet<string> | null = null;

function ambiguousTerms(): ReadonlySet<string> {
    if (ambiguous) return ambiguous;
    let terms: string[] = [];
    if (!KEEP_AMBIGUOUS) {
        try {
            const raw = fs.readFileSync(path.join(JARGON_DIR, 'ambiguous.json'), 'utf8');
            const parsed = JSON.parse(raw) as { terms?: unknown };
            if (Array.isArray(parsed.terms)) {
                terms = parsed.terms.filter((t): t is string => typeof t === 'string');
            }
        } catch (err) {
            console.warn(`[jargon] Could not load ambiguous.json:`, err);
        }
    }
    ambiguous = new Set(terms.map(t => t.toLowerCase()));
    return ambiguous;
}

const cache = new Map<string, ReadonlySet<string>>();

function read(name: string): ReadonlySet<string> {
    const cached = cache.get(name);
    if (cached) return cached;

    let terms: string[] = [];
    try {
        const raw = fs.readFileSync(path.join(JARGON_DIR, `${name}.json`), 'utf8');
        const parsed = JSON.parse(raw) as { terms?: unknown };
        if (Array.isArray(parsed.terms)) {
            terms = parsed.terms.filter((t): t is string => typeof t === 'string');
        }
    } catch (err) {
        // An enrichment, not a hard dependency: the generic detectors
        // (acronyms, camelCase, letter+digit) still work without it, so a
        // missing directory degrades the score rather than failing the request.
        console.warn(`[jargon] Could not load '${name}' from ${JARGON_DIR}:`, err);
    }

    const excluded = ambiguousTerms();
    const set: ReadonlySet<string> = new Set(
        terms.map(t => t.toLowerCase()).filter(t => !excluded.has(t))
    );
    cache.set(name, set);
    return set;
}

/** Terms for a product domain. Never throws; may be empty. */
export function termsForDomain(domain?: string): ReadonlySet<string> {
    return read(fileForDomain(domain));
}

/** Loads every vocabulary once at boot so the first request is not the one
 *  that pays for disk I/O, and so a missing directory is logged at startup
 *  rather than discovered under load. */
export function preloadJargon(): void {
    for (const name of ['all', 'tech', 'finance', 'medical']) read(name);
    const counts = ['tech', 'finance', 'medical', 'all']
        .map(n => `${n}=${read(n).size}`)
        .join(' ');
    console.log(`[jargon] loaded from ${JARGON_DIR}: ${counts}`);
}


/**
 * Plain-language substitutions — Fix #5 Stage A.
 *
 * Hotspots used to offer "Add an explanation or easier synonym", which is
 * advice, not a fix. With these, a flagged sentence can say what to say
 * instead, at the level of the audience being spoken to.
 *
 * Entries are keyed by the canonical term; `aliases` map other spellings onto
 * the same entry. `plain` is keyed by audience level as a string.
 *
 * Fallback goes UP, never down. A substitution exists to make something
 * simpler, so offering a simpler audience's wording to a more expert one is
 * always wrong: a cardiologist should not be told to replace "dyspnea" with
 * "shortness of breath". If a term is only written for novices, expert
 * audiences get no substitution at all, which is the correct answer.
 */
export interface PlainSubstitution {
    /** The term as it appeared in the text. */
    term: string;
    /** What to say instead, chosen for this audience level. */
    plain: string;
}

interface PlainEntry {
    aliases?: string[];
    plain: Record<string, string>;
}

let plainIndex: Map<string, PlainEntry> | null = null;

function loadPlain(): Map<string, PlainEntry> {
    if (plainIndex) return plainIndex;

    const index = new Map<string, PlainEntry>();
    try {
        const raw = fs.readFileSync(path.join(JARGON_DIR, 'plain.json'), 'utf8');
        const parsed = JSON.parse(raw) as { terms?: Record<string, PlainEntry> };
        for (const [term, entry] of Object.entries(parsed.terms ?? {})) {
            if (!entry || typeof entry.plain !== 'object') continue;
            index.set(term.toLowerCase(), entry);
            for (const alias of entry.aliases ?? []) {
                index.set(alias.toLowerCase(), entry);
            }
        }
    } catch (err) {
        console.warn('[jargon] Could not load plain.json:', err);
    }

    plainIndex = index;
    return index;
}

/**
 * The plain-language wording for one term at one audience level, or null when
 * the term has no entry or is not worth explaining to this audience.
 */
export function plainFor(term: string, audienceLevel: number): string | null {
    const entry = loadPlain().get(term.trim().toLowerCase());
    if (!entry) return null;

    // Exact level first, then the next level up — more technical wording is a
    // safe substitute for a more expert audience; simpler wording is not.
    // Anything below the audience's own level is skipped entirely.
    for (let level = audienceLevel; level <= audienceLevel + 1 && level <= 3; level++) {
        const wording = entry.plain[String(level)];
        if (wording) return wording;
    }
    return null;
}

/** Substitutions for whichever of these terms have one. Order is preserved. */
export function substitutionsFor(terms: string[], audienceLevel: number): PlainSubstitution[] {
    const seen = new Set<string>();
    const out: PlainSubstitution[] = [];
    for (const term of terms) {
        const key = term.trim().toLowerCase();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        const plain = plainFor(key, audienceLevel);
        if (plain) out.push({ term, plain });
    }
    return out;
}
