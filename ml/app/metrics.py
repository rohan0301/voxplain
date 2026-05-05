"""
Lightweight, CPU-friendly metrics for analyzing speech technicality confusion.

Measures:
  - Readability (Flesch-Kincaid grade level, average sentence length)
  - Technical jargon density (using domain-specific term lists)
  - Sentence complexity (clause count, passive voice, nesting depth)
  - Concept density (new terms introduced per sentence)
  - Definition frequency (how often concepts are explained)

All metrics run on CPU with no ML overhead.
"""

import re
from collections import defaultdict
from typing import List, Dict, Tuple, Optional


# ── Domain-Specific Term Lists ──────────────────────────────────


TECH_JARGON = {
    # AI/ML Core
    "transformer", "attention", "softmax", "embedding", "neural", "network", "deep learning",
    "machine learning", "llm", "gpt", "bert", "claude", "training", "inference",
    "fine-tuning", "pretraining", "backpropagation", "gradient", "optimizer", "loss",
    "activation", "tensor", "model", "parameter",

    # Modern AI/ML
    "attention bottleneck", "linear attention", "ssm", "hybrid", "scaling law",
    "induction head", "in-context learning", "prompt engineering", "chain of thought",
    "rag", "lora", "adapter", "instruction tuning", "alignment", "rlhf", "dpo",
    "ppo", "constitutional ai", "mechanistic interpretability", "interpretability",
    "sae", "sparse autoencoder", "residual stream", "monosemantic", "polysemantic",
    "feature", "circuit", "manifold hypothesis", "sample efficiency", "capability",
    "emergent", "emergence", "ablation", "probe", "steering", "adversarial",

    # Data & Training
    "dataset", "corpus", "tokenization", "token", "vocabulary", "context window",
    "batch size", "learning rate", "weight decay", "dropout", "regularization",
    "cross-entropy", "perplexity", "accuracy", "overfitting", "generalization",

    # Architecture
    "convolution", "cnn", "rnn", "lstm", "gru", "encoder", "decoder", "seq2seq",
    "autoencoder", "gan", "diffusion", "normalization", "batch norm", "layer norm",
    "skip connection", "residual", "pooling", "upsampling",

    # NLP/Vision
    "nlp", "natural language", "vision", "transformer", "object detection",
    "segmentation", "classification", "sentiment analysis", "translation",

    # Optimization
    "quantization", "pruning", "distillation", "compression", "sparsity",
    "mixture of experts", "pipeline parallelism", "data parallelism",

    # Evaluation
    "bleu", "rouge", "metric", "benchmark", "evaluation", "annotation",

    # Infrastructure
    "api", "async", "cache", "bandwidth", "buffer", "cpu", "gpu", "latency",
    "throughput", "loop", "recursion", "algorithm", "data structure", "hash",
    "variable", "function", "parameter", "namespace", "daemon", "socket",
    "protocol", "serialization", "abstraction", "interface", "inheritance",
    "polymorphism", "encapsulation", "debugging", "breakpoint", "compiler",
    "middleware", "framework", "library", "dependency", "version control",
    "git", "repository", "merge", "rebase", "commit", "branch", "pull request",
    "ci/cd", "docker", "kubernetes", "container", "virtualization", "microservices",
    "rest", "graphql", "websocket", "http", "https", "ssl", "encryption",
    "authentication", "authorization", "session", "token", "jwt", "oauth",
    "database", "sql", "nosql", "query", "index", "transaction", "acid",
}

FINANCE_JARGON = {
    "derivatives", "futures", "options", "hedge", "arbitrage", "leverage",
    "liquidity", "volatility", "yield", "maturity", "coupon", "principal",
    "amortization", "depreciation", "appreciation", "valuation", "discounted",
    "cash flow", "roi", "irr", "npv", "wacc", "ebitda", "p/e ratio",
    "sharpe ratio", "beta", "alpha", "correlation", "covariance",
    "portfolio", "diversification", "rebalancing", "asset allocation",
    "bond", "equity", "security", "collateral", "margin", "swap",
    "credit default", "credit rating", "spread", "basis points",
}

MEDICAL_JARGON = {
    "diagnosis", "prognosis", "etiology", "pathology", "syndrome",
    "comorbidity", "contraindication", "prophylaxis", "palliative",
    "biopsy", "lesion", "necrosis", "inflammation", "fibrosis",
    "stenosis", "aneurysm", "embolism", "thrombosis", "ischemia",
    "metabolism", "homeostasis", "osmosis", "diffusion", "perfusion",
    "innervation", "vascularization", "lymphatic", "immune response",
}

DOMAIN_JARGON = {
    "tech": TECH_JARGON,
    "finance": FINANCE_JARGON,
    "medical": MEDICAL_JARGON,
    "healthcare": MEDICAL_JARGON,
}


# ── Readability Functions ───────────────────────────────────────


def count_syllables(word: str) -> int:
    """Estimate syllable count for a word."""
    word = word.lower()
    syllables = 0
    vowels = "aeiouy"
    previous_was_vowel = False

    for char in word:
        is_vowel = char in vowels
        if is_vowel and not previous_was_vowel:
            syllables += 1
        previous_was_vowel = is_vowel

    # Adjust for silent e
    if word.endswith("e"):
        syllables -= 1

    # Words less than 3 letters are typically 1 syllable
    if len(word) <= 3:
        syllables = max(1, syllables)

    return max(1, syllables)


def flesch_kincaid_grade(text: str) -> float:
    """
    Calculate Flesch-Kincaid grade level (0-18+).
    Higher = harder to read.
    Formula: 0.39 * (words / sentences) + 11.8 * (syllables / words) - 15.59
    """
    sentences = [s.strip() for s in re.split(r'[.!?]+', text) if s.strip()]
    if not sentences:
        return 0.0

    words = text.split()
    if len(words) == 0:
        return 0.0

    total_syllables = sum(count_syllables(w.lower()) for w in words)

    num_sentences = len(sentences)
    num_words = len(words)

    grade = (
        0.39 * (num_words / num_sentences) +
        11.8 * (total_syllables / num_words) -
        15.59
    )

    return max(0.0, round(grade, 1))


def average_sentence_length(text: str) -> float:
    """Average number of words per sentence."""
    sentences = [s.strip() for s in re.split(r'[.!?]+', text) if s.strip()]
    if not sentences:
        return 0.0

    words = text.split()
    return round(len(words) / len(sentences), 1)


# ── Jargon Detection ───────────────────────────────────────────


def detect_jargon(text: str, domain: str = "general") -> Dict[str, any]:
    """
    Detect technical jargon in text.

    Returns:
        {
            "jargon_terms": ["api", "cache", ...],
            "jargon_count": 5,
            "jargon_density": 0.083,  # per word
            "domain_match": "tech"
        }
    """
    words = text.lower().split()
    word_count = len(words)

    # Get relevant jargon list for domain
    relevant_jargon = set()
    if domain.lower() in DOMAIN_JARGON:
        relevant_jargon = DOMAIN_JARGON[domain.lower()]
    else:
        # Use all jargon lists if domain not recognized
        for jargon_set in DOMAIN_JARGON.values():
            relevant_jargon.update(jargon_set)

    found_jargon = []
    for i, word in enumerate(words):
        # Check single words
        if word in relevant_jargon:
            found_jargon.append(word)
        # Check two-word phrases
        elif i < len(words) - 1:
            phrase = f"{word} {words[i + 1]}"
            if phrase in relevant_jargon:
                found_jargon.append(phrase)

    jargon_density = len(found_jargon) / word_count if word_count > 0 else 0.0

    return {
        "jargon_terms": list(set(found_jargon)),
        "jargon_count": len(found_jargon),
        "jargon_density": round(jargon_density, 3),
        "domain": domain.lower(),
    }


# ── Sentence Complexity ──────────────────────────────────────────


def analyze_sentence_complexity(text: str) -> Dict[str, any]:
    """
    Analyze sentence structure complexity.

    Returns:
        {
            "avg_clause_count": 1.5,
            "passive_voice_ratio": 0.2,
            "max_nesting_depth": 2,
            "complexity_score": 0.45  # 0=simple, 1=complex
        }
    """
    sentences = [s.strip() for s in re.split(r'[.!?]+', text) if s.strip()]
    if not sentences:
        return {
            "avg_clause_count": 0,
            "passive_voice_ratio": 0.0,
            "max_nesting_depth": 0,
            "complexity_score": 0.0,
        }

    clause_counts = []
    passive_count = 0
    max_depth = 0

    for sentence in sentences:
        # Count clauses (rough: comma-separated parts + conjunctions)
        clauses = len(re.split(r',|and|or|but', sentence, flags=re.IGNORECASE)) - 1
        clause_counts.append(max(1, clauses))

        # Detect passive voice (by/been patterns)
        if re.search(r'\bwas\b.*\bby\b|\bbeen\b', sentence, re.IGNORECASE):
            passive_count += 1

        # Estimate nesting depth (parentheses, dashes)
        depth = max(
            sentence.count('('),
            sentence.count('['),
            len(re.findall(r'—|--', sentence)),
        )
        max_depth = max(max_depth, depth)

    avg_clauses = sum(clause_counts) / len(sentences) if sentences else 1
    passive_ratio = passive_count / len(sentences) if sentences else 0.0

    # Complexity score: 0 (simple) to 1 (very complex)
    complexity = (
        min(avg_clauses / 3, 1.0) * 0.4 +  # Clause density
        passive_ratio * 0.3 +
        min(max_depth / 3, 1.0) * 0.3  # Nesting depth
    )

    return {
        "avg_clause_count": round(avg_clauses, 1),
        "passive_voice_ratio": round(passive_ratio, 2),
        "max_nesting_depth": max_depth,
        "complexity_score": round(complexity, 2),
    }


# ── Concept Tracking ────────────────────────────────────────────


def identify_definitions(text: str) -> Dict[str, List[str]]:
    """
    Heuristically identify sentences that define terms.

    Patterns:
      - "X is a Y"
      - "X refers to Y"
      - "X (definition)"
      - "By X, we mean Y"
    """
    sentences = [s.strip() for s in re.split(r'[.!?]+', text) if s.strip()]
    definitions = []

    definition_patterns = [
        r'(\w+)\s+(?:is|are)\s+(?:a|an|the)',
        r'(\w+)\s+refers?\s+to',
        r'(\w+)\s*\(([^)]+)\)',
        r'By\s+(\w+),?\s+(?:we\s+)?mean',
        r'(?:The|A|An)\s+term\s+"(\w+)"',
    ]

    for sentence in sentences:
        for pattern in definition_patterns:
            matches = re.findall(pattern, sentence, re.IGNORECASE)
            if matches:
                definitions.append(sentence)
                break

    return {
        "definition_sentences": definitions,
        "definition_count": len(definitions),
        "definition_ratio": round(len(definitions) / len(sentences), 2) if sentences else 0.0,
    }


def concept_density(text: str) -> Dict[str, any]:
    """
    Measure how many new/unique concepts appear per sentence.
    Assumes capitalized words or technical terms are concepts.
    """
    sentences = [s.strip() for s in re.split(r'[.!?]+', text) if s.strip()]
    if not sentences:
        return {
            "avg_new_concepts_per_sentence": 0.0,
            "total_unique_concepts": 0,
            "concept_density_score": 0.0,
        }

    # Identify potential concepts (capitalized words, technical terms)
    all_concepts = set()
    sentence_concepts = []

    for sentence in sentences:
        # Capitalized words (likely concepts/proper nouns)
        caps = set(re.findall(r'\b[A-Z][a-z]+\b', sentence))
        # Technical terms (all caps)
        tech = set(re.findall(r'\b[A-Z]{2,}\b', sentence))
        concepts = caps | tech
        sentence_concepts.append(len(concepts))
        all_concepts.update(concepts)

    avg_per_sentence = sum(sentence_concepts) / len(sentences) if sentences else 0.0
    # Density: 0-1 scale (more than 2 concepts per sentence = high)
    density_score = min(avg_per_sentence / 3, 1.0)

    return {
        "avg_new_concepts_per_sentence": round(avg_per_sentence, 1),
        "total_unique_concepts": len(all_concepts),
        "concept_density_score": round(density_score, 2),
    }


# ── Main Analysis Function ──────────────────────────────────────


def analyze_technicality(
    text: str,
    audience_level: int = 1,
    domain: str = "general",
) -> Dict[str, any]:
    """
    Comprehensive technicality analysis (all CPU, no GPU).

    audience_level: 0=novice, 1=some knowledge, 2=strong, 3=expert
    domain: "tech", "finance", "medical", "general", etc.

    Returns a dict with all metrics + a composite score.
    """
    if not text or not text.strip():
        return {"error": "Empty text"}

    # Calculate all metrics
    readability = {
        "flesch_kincaid_grade": flesch_kincaid_grade(text),
        "avg_sentence_length": average_sentence_length(text),
    }

    jargon = detect_jargon(text, domain)
    complexity = analyze_sentence_complexity(text)
    definitions = identify_definitions(text)
    concepts = concept_density(text)

    # Composite technicality score (0=easy, 1=very technical)
    # Takes into account audience level
    fk_grade = readability["flesch_kincaid_grade"]
    grade_normalized = min(fk_grade / 18, 1.0)  # FK grades typically 0-18
    jargon_normalized = jargon["jargon_density"]
    complexity_normalized = complexity["complexity_score"]
    concept_normalized = concepts["concept_density_score"]

    # Adjust for audience (experts can handle more)
    audience_factor = 1.0 - (audience_level / 4)  # 1.0 for novices, 0 for experts

    technicality_score = (
        grade_normalized * 0.3 +
        jargon_normalized * 0.3 +
        complexity_normalized * 0.2 +
        concept_normalized * 0.2
    ) * audience_factor

    # Determine risk level
    if definitions["definition_count"] > 0:
        technicality_score *= 0.9  # Definitions help, lower the score

    technicality_score = round(min(technicality_score, 1.0), 2)

    return {
        "readability": readability,
        "jargon": jargon,
        "sentence_complexity": complexity,
        "definitions": definitions,
        "concept_density": concepts,
        "technicality_score": technicality_score,  # 0=easy, 1=confusing
        "risk_level": _risk_level_from_score(technicality_score),
        "recommendations": _generate_recommendations(
            technicality_score,
            jargon,
            readability,
            definitions,
            audience_level,
        ),
    }


def _risk_level_from_score(score: float) -> str:
    """Convert technicality score to risk level."""
    if score < 0.3:
        return "low"
    elif score < 0.6:
        return "medium"
    else:
        return "high"


def _generate_recommendations(
    score: float,
    jargon: Dict,
    readability: Dict,
    definitions: Dict,
    audience_level: int,
) -> List[str]:
    """Generate actionable recommendations based on metrics."""
    recs = []

    fk_grade = readability["flesch_kincaid_grade"]
    if fk_grade > 12:
        recs.append(f"High reading grade level ({fk_grade}). Simplify sentence structure.")

    if jargon["jargon_count"] > 3 and audience_level < 2:
        recs.append(
            f"Found {jargon['jargon_count']} technical terms. "
            f"Define or replace with simpler alternatives for audience level {audience_level}."
        )

    if definitions["definition_count"] == 0 and jargon["jargon_count"] > 0:
        recs.append("No definitions found. Consider explaining technical terms.")

    if score > 0.6:
        recs.append("Overall technicality is high for this audience. Consider restructuring.")

    return recs
