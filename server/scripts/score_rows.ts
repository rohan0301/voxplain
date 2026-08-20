/**
 * Score a labelled JSONL through the real Node heuristic.
 *
 * The tuning script (ml/tune_threshold.py) needs the exact number the product
 * computes, not a Python re-implementation of it. This prints one JSON object
 * per input row with the heuristic's raw 0-100 load score, so the Python side
 * can blend it with /analyze/metrics the way server/src/index.ts does.
 *
 *   npx tsx scripts/score_rows.ts ../ml/data/val.jsonl > /tmp/val.node.jsonl
 */
import { readFileSync } from 'node:fs';
import { analyzeTechnicality } from '../src/services/technicality.js';
import type { AudienceLevel } from '../src/types.js';

const path = process.argv[2];
if (!path) {
    console.error('usage: score_rows.ts <labels.jsonl>');
    process.exit(1);
}

for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    const level = (typeof row.audienceLevel === 'number' ? row.audienceLevel : 1) as AudienceLevel;
    const result = analyzeTechnicality({
        transcriptText: row.text,
        audienceLevel: level,
        // Domain matters here since Fix #2; scoring without it would measure
        // a pipeline the product no longer runs.
        domain: row.domain ?? 'general',
    });
    process.stdout.write(JSON.stringify({
        text: row.text,
        label: row.label,
        audienceLevel: level,
        domain: row.domain ?? 'general',
        source: row.source ?? 'human',
        node_score: result.technicalLoadScore,
        node_threshold: result.audienceThreshold,
    }) + '\n');
}
