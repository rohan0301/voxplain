# Voxplain Technicality Metrics

## Overview

A **CPU-friendly, zero-cost** system for measuring how confusing a speech might be based on audience technicality level. All metrics run locally without GPU or API costs.

## What It Measures

### 1. **Readability Metrics**
- **Flesch-Kincaid Grade Level** (0-18+): How many years of education needed to understand
  - 0-6: Elementary school
  - 9-12: High school
  - 13+: College/specialized knowledge
- **Average Sentence Length**: Words per sentence (longer = harder to parse)

### 2. **Jargon Detection**
- Identifies domain-specific technical terms (tech, finance, medical, etc.)
- **Jargon Density**: Ratio of technical terms to total words
- **Term List**: Shows which specific terms were found
- Impacts score more for novice audiences

### 3. **Sentence Complexity**
- **Clause Count**: Number of independent ideas per sentence
- **Passive Voice Ratio**: Passive constructions (harder to parse than active)
- **Nesting Depth**: Parentheses/dashes indicating embedded clauses
- **Complexity Score**: 0 (simple) to 1 (very complex)

### 4. **Concept Density**
- Counts unique concepts (capitalized words, proper nouns) per sentence
- Measures cognitive load (too many new ideas = harder to follow)
- **Avg Concepts/Sentence**: How many new ideas introduced
- **Concept Density Score**: 0-1, normalized

### 5. **Definition Tracking**
- Finds sentences that define/explain terms
- Patterns detected:
  - "X is a Y"
  - "X refers to Y"
  - "X (definition)"
  - "By X, we mean Y"
- **Definition Ratio**: % of sentences with definitions
- Higher definition frequency = lower technicality risk

### 6. **Composite Technicality Score**
Combines all metrics into a single **0-1 score**:
- **0.0-0.3**: Easy (appropriate for novices)
- **0.3-0.6**: Medium (some technical content)
- **0.6-1.0**: High (risky for non-experts)

**Audience Adjustment**: Score automatically adjusts based on `audience_level`:
- Level 0 (novice): Full adjustment, stricter scoring
- Level 1 (some knowledge): 75% adjustment
- Level 2 (strong): 50% adjustment
- Level 3 (expert): 25% adjustment

## API Endpoints

### Single Analysis
```bash
POST /analyze/metrics

{
  "text": "The API leverages asynchronous event loops...",
  "audience_level": 0,
  "domain": "tech"
}
```

**Response:**
```json
{
  "readability": {
    "flesch_kincaid_grade": 21.6,
    "avg_sentence_length": 18.0
  },
  "jargon": {
    "jargon_count": 4,
    "jargon_density": 0.222,
    "jargon_terms": ["api", "middleware", "latency", "throughput"],
    "domain": "tech"
  },
  "sentence_complexity": {
    "avg_clause_count": 3.0,
    "passive_voice_ratio": 0.0,
    "max_nesting_depth": 0,
    "complexity_score": 0.4
  },
  "definitions": {
    "definition_count": 0,
    "definition_ratio": 0.0
  },
  "concept_density": {
    "avg_new_concepts_per_sentence": 2.0,
    "total_unique_concepts": 2,
    "concept_density_score": 0.67
  },
  "technicality_score": 0.58,
  "risk_level": "medium",
  "recommendations": [
    "High reading grade level (21.6). Simplify sentence structure.",
    "Found 4 technical terms. Define or replace with simpler alternatives for audience level 0.",
    "No definitions found. Consider explaining technical terms."
  ]
}
```

## Implementation Details

### No GPU, No Cost
- ✅ Pure Python with standard library functions
- ✅ Lightweight regex and heuristic parsing
- ✅ Runs in milliseconds on any CPU
- ✅ Zero external API calls
- ✅ No model weights to download

### Domain Support
Pre-built jargon lists for:
- **tech**: API, async, cache, bandwidth, GPU, latency, microservices, etc.
- **finance**: derivatives, volatility, yield, portfolio, Sharpe ratio, etc.
- **medical/healthcare**: diagnosis, stenosis, ischemia, thrombosis, etc.

Add more domains by extending `DOMAIN_JARGON` in `metrics.py`.

## Testing

Run the demo script to see all metrics in action:
```bash
cd ml/
python test_metrics.py
```

Shows analysis of 6 example texts across different domains and audience levels.

## Integration with Existing ML Service

This metrics system **complements** your existing DistilBERT model:
- **DistilBERT** (`/predict`): Deep learning-based classification (clear vs. confusing)
- **Metrics** (`/analyze/metrics`): CPU-friendly diagnostic breakdown

Use both for comprehensive analysis:
1. Call `/analyze/metrics` for instant, detailed diagnostics (no wait)
2. Call `/predict` for ML-backed confidence scores

## Recommendations Generation

The system automatically generates actionable suggestions:
- **High Flesch-Kincaid** → "Simplify sentence structure"
- **Missing definitions** → "Explain technical terms"
- **Too much jargon** → "Replace with simpler alternatives"
- **High concept density** → "Introduce concepts more gradually"

## Performance

- Single sentence: <1ms
- Full 5000-word document: 50-100ms
- Batch analysis (100 items): 5-10 seconds

## Future Enhancements

Potential additions (still CPU-friendly):
- [ ] Word frequency analysis (identify repeated vs. one-off terms)
- [ ] Active vocabulary list (what domain knowledge does audience already have?)
- [ ] Comparison to baseline (how does this compare to typical speech in domain?)
- [ ] Sentence-level breakdown (identify which sentences are most problematic)
- [ ] Custom domain jargon upload
