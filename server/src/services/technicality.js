const COMMON_TECHNICAL_TERMS = new Set([
    'kubernetes', 'docker', 'redis', 'postgres', 'postgresql', 'prometheus', 'grafana',
    'opentelemetry', 'lora', 'transformer', 'embeddings', 'rag', 'llm', 'llms', 'rlhf',
    'ann', 'bm25', 'api', 'apis', 'cpu', 'gpu', 'tpu', 's3', 'ec2', 'k8s', 'ci/cd',
    'pipeline', 'algorithm', 'heuristic', 'latency', 'throughput', 'bandwidth', 'json',
    'xml', 'yaml', 'html', 'css', 'javascript', 'typescript', 'python', 'rust', 'go',
    'java', 'c++', 'sql', 'nosql', 'kafka', 'grpc', 'rest', 'graphql', 'jwt', 'oauth',
    'sso', 'mfa', 'dns', 'ip', 'tcp', 'udp', 'http', 'https', 'ssl', 'tls', 'ssh',
    'vpc', 'subnet', 'firewall', 'router', 'switch', 'load balancer', 'proxy', 'cdn',
    'daas', 'saas', 'paas', 'iaas', 'serverless', 'microservice', 'monolith', 'container',
    'orchestration', 'virtualization', 'hypervisor', 'kernel', 'shell', 'bash', 'zsh',
    'terminal', 'cli', 'gui', 'ide', 'sdk', 'lib', 'library', 'framework', 'runtime',
    'compiler', 'interpreter', 'debugger', 'linter', 'formatter', 'bundler', 'minifier',
    'transpiler', 'tree-shaking', 'code-splitting', 'lazy-loading', 'hydration', 'ssr',
    'csr', 'ssg', 'isr', 'spa', 'mpa', 'pwa', 'dom', 'bom', 'cssom', 'ajax', 'xhr',
    'fetch', 'axios', 'jquery', 'react', 'vue', 'angular', 'svelte', 'solid', 'qwik',
    'next.js', 'nuxt', 'remix', 'astro', 'gatsby', 'vite', 'webpack', 'rollup', 'parcel',
    'esbuild', 'babel', 'tsc', 'jest', 'mocha', 'chai', 'jasmine', 'cypress', 'playwright',
    'puppeteer', 'selenium', 'vitest', 'testing library', 'storybook', 'figma', 'sketch',
    'adobe xd', 'zeplin', 'invision', 'framer', 'principle', 'proto.io', 'webflow',
    'wordpress', 'shopify', 'magento', 'woocommerce', 'bigcommerce', 'squarespace', 'wix',
    'weebly', 'ghost', 'drupal', 'joomla', 'moodle', 'lms', 'cms', 'erp', 'crm', 'hrm',
    'scm', 'bi', 'dw', 'etl', 'elt', 'olap', 'oltp', 'db', 'dbms', 'rdbms', 'acid',
    'cap', 'base', 'crud', 'orm', 'odm', 'dao', 'dto', 'pojos', 'javabean', 'singleton',
    'factory', 'builder', 'prototype', 'adapter', 'bridge', 'composite', 'decorator',
    'facade', 'flyweight', 'proxy', 'chain of responsibility', 'command', 'interpreter',
    'iterator', 'mediator', 'memento', 'observer', 'state', 'strategy', 'template method',
    'visitor', 'mvc', 'mvp', 'mvvm', 'flux', 'redux', 'mobx', 'zustand', 'recoil', 'jotai',
    'xstate', 'rxjs', 'saga', 'thunk', 'promise', 'async', 'await', 'callback', 'closure',
    'hoisting', 'scope', 'context', 'this', 'prototype', 'constructor', 'class', 'interface',
    'type', 'enum', 'generic', 'mixin', 'decorator', 'module', 'namespace', 'package',
    'import', 'export', 'require', 'commonjs', 'amd', 'umd', 'esm', 'systemjs', 'iife'
]);
export function analyzeTechnicality(input) {
    const { transcriptText, words, audienceLevel = 1, requiredTimeSec } = input;
    // --- A. Segmentation ---
    // Improved segmentation: handle abbreviations (e.g., e.g., i.e.) roughly, but split mainly by .!?
    // Also handle trailing punctuations in tokens
    const sentences = transcriptText.match(/[^.!?\n]+[.!?\n]+/g) || [transcriptText];
    // Improved Tokenization:
    // 1. Lowercase for comparison (but keep original for stats?) - better to normalize map
    // 2. Strip standard punctuation
    // 3. Keep hyphens inside words (CI/CD, chain-of-thought)
    const normalizeToken = (t) => t.toLowerCase().replace(/^['"(\[]+|['")\]?!.,]+$/g, '');
    // --- B. Technical Term Detection ---
    const isTechnical = (token, originalToken) => {
        const clean = normalizeToken(token);
        if (clean.length < 2)
            return false;
        // 1. Check Seed Glossary (case-insensitive)
        if (COMMON_TECHNICAL_TERMS.has(clean))
            return true;
        // 2. ALL CAPS acronyms (length >= 2) -> API, LLM, ANN, etc.
        // Must be originally upper case, and contain no lowercase letters
        if (/^[A-Z0-9]+s?$/.test(originalToken.replace(/[^a-zA-Z0-9]/g, '')) && !/[a-z]/.test(originalToken)) {
            return true;
        }
        // 3. Mixed Case / CamelCase (must have meaningful separation)
        // e.g. OpenTelemetry, TensorFlow (has upper in middle)
        // Heuristic: starts with upper or lower, has upper in middle
        if (/[a-z]+[A-Z]/.test(originalToken) && /^[a-zA-Z0-9]+$/.test(clean))
            return true;
        // 4. Letters + Digits (e.g. 5nm, gpt4, k8s)
        if (/[a-z]/.test(clean) && /[0-9]/.test(clean))
            return true;
        return false;
    };
    let globalTechCount = 0;
    const globalTechTerms = new Set();
    const analyzedSentences = sentences.map(sent => {
        const tokens = sent.trim().split(/\s+/);
        const terms = tokens.filter(t => isTechnical(normalizeToken(t), t));
        const cleanTerms = terms.map(normalizeToken);
        terms.forEach(t => {
            globalTechCount++;
            globalTechTerms.add(normalizeToken(t));
        });
        return { sent, tokens, terms, cleanTerms };
    });
    const wordCount = analyzedSentences.reduce((acc, s) => acc + s.tokens.length, 0) || 1;
    // --- C. Clumping Detection (Sliding Window on Full Text) ---
    // Window 15 words, Step 3
    const allTokens = analyzedSentences.flatMap(s => s.tokens);
    const WINDOW_SIZE = 15;
    const STEP = 5; // User suggested 3-5, let's go 5 for efficiency
    let maxClump = 0;
    for (let i = 0; i < allTokens.length; i += STEP) {
        const windowTokens = allTokens.slice(i, i + WINDOW_SIZE);
        const windowTech = windowTokens.filter(t => isTechnical(normalizeToken(t), t)).length;
        if (windowTech > maxClump)
            maxClump = windowTech;
    }
    // --- D. Explanation Coverage ---
    // Explanations: look for markers in current, next, or previous sentence
    const explanationMarkers = [
        ' is ', ' means ', ' refers to ', 'by ', ' mean ',
        'in other words', 'basically', 'for example', 'like', 'imagine',
        'called ', 'known as ', 'defined as', 'stands for', 'concept of'
    ];
    let explainedCount = 0;
    const sentenceIsExplanatory = (idx) => {
        if (idx < 0 || idx >= analyzedSentences.length || !analyzedSentences[idx])
            return false;
        const txt = analyzedSentences[idx].sent.toLowerCase();
        return explanationMarkers.some(m => txt.includes(m)) || txt.includes('(');
    };
    analyzedSentences.forEach((s, idx) => {
        // If this sentence, prev, or next has explanation markers, we assume TERMS within THIS sentence are potentially explained contextually.
        // This is a heuristic. A robust one would check proximity.
        const hasContext = sentenceIsExplanatory(idx) || sentenceIsExplanatory(idx - 1) || sentenceIsExplanatory(idx + 1);
        if (hasContext) {
            explainedCount += s.terms.length;
        }
    });
    const explainedRate = globalTechCount > 0 ? explainedCount / globalTechCount : 1;
    // --- E. Scoring ---
    // Adjust formula:
    // Base Score = (Density * 1000) + (MaxClump * 5)
    // Penalize if MaxClump > 4 drastically
    // Credit for explained
    const density = globalTechCount / wordCount; // e.g. 0.05
    let rawScore = (density * 100) * 2; // 5% -> 10 pts
    // Add Clump Penalty
    if (maxClump > 3)
        rawScore += (maxClump * 3);
    if (maxClump > 6)
        rawScore += 20; // Critical clump penalty
    // Discount for explanation
    rawScore = rawScore * (1 - (explainedRate * 0.4)); // Max 40% reduction if fully explained
    const thresholdMap = {
        0: 20, // Novice (VERY strict)
        1: 40, // Familiar
        2: 60, // Strong
        3: 80 // Expert
    };
    const threshold = thresholdMap[audienceLevel] ?? 40;
    // Clamp 0-100
    // If rawScore is around 30, and threshold is 20, it should be "Above".
    // 30 score -> ?? 
    // Let's normalize rawScore to likely 0-100 range.
    // If 15 words density 20% -> 3 words technically.
    // Density 10% is very high. (0.1 * 100 * 2) = 20 pts.
    // + Clump (3) * 3 = 9. Total 29.
    // Seems low. Let's bump multiplier.
    rawScore = (density * 300); // 10% density -> 30pts
    rawScore += (maxClump * 4); // Clump 5 -> 20pts
    if (maxClump > 5)
        rawScore += 15;
    // Reduction
    rawScore = rawScore * (1 - (explainedRate * 0.3));
    let technicalLoadScore = Math.max(1, Math.min(100, Math.round(rawScore)));
    // Ensure "Too Simple" is rare: if score < 10 and threshold > 30
    // Actually we adjust status labeling logic instead of score here.
    // --- F. Hotspots ---
    const hotspots = [];
    analyzedSentences.forEach((s) => {
        // Hotspot logic:
        // 1. High term count (> 3)
        // 2. Or > 2 terms and NOT explained
        // 3. Or really long sentence with > 1 term
        const termCount = s.terms.length;
        if (termCount <= 1)
            return;
        const reasons = [];
        const suggestions = [];
        if (termCount >= 4) {
            reasons.push("Dense jargon cluster");
            suggestions.push("Split into multiple sentences");
        }
        else if (termCount >= 2) {
            // Check if dense relative to length
            const sWords = s.tokens.length;
            if (sWords < 15) {
                reasons.push("High density in short sentence");
                suggestions.push("Define terms immediately");
            }
        }
        // Check for specific terms that are "hard" and not in a glossary context
        // This effectively repeats the "global explained" check but locally
        if (termCount > 0 && !sentenceIsExplanatory(analyzedSentences.indexOf(s)) && !sentenceIsExplanatory(analyzedSentences.indexOf(s) + 1)) {
            reasons.push("Terms likely undefined");
            suggestions.push("Add an explanation or easier synonym");
        }
        if (reasons.length > 0) {
            hotspots.push({
                sentence: s.sent.trim(),
                terms: s.cleanTerms,
                reasons: [...new Set(reasons)], // dedup
                suggestions: [...new Set(suggestions)]
            });
        }
    });
    // Sort hotspots by severity (term count)
    hotspots.sort((a, b) => b.terms.length - a.terms.length);
    const topHotspots = hotspots.slice(0, 5); // Return top 5
    // --- G. Status Determination ---
    let status = "near";
    if (technicalLoadScore < threshold - 15)
        status = "below";
    else if (technicalLoadScore > threshold + 15)
        status = "above";
    // Summary Text
    let summary = "";
    if (status === "above") {
        summary = "Your content is significantly more technical than your target audience level. Jargon density is high.";
    }
    else if (status === "near") {
        summary = "You are generally on target, but watch out for specific dense clusters identified below.";
    }
    else {
        summary = "Your content is very accessible. Ensure you aren't over-simplifying key concepts if the audience expects depth.";
    }
    return {
        technicalLoadScore,
        audienceThreshold: threshold,
        status,
        summary,
        hotspots: topHotspots,
        termStats: {
            totalTerms: globalTechCount,
            uniqueTerms: globalTechTerms.size,
            maxClump,
            explainedRate
        }
    };
}
//# sourceMappingURL=technicality.js.map