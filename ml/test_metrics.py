#!/usr/bin/env python3
"""
Quick demo of the CPU-friendly technicality metrics.
Run from ml/ directory: python test_metrics.py
"""

from app.metrics import analyze_technicality
import json


EXAMPLES = {
    "simple": {
        "text": "Dogs are animals that like to play. They are fun pets.",
        "audience_level": 0,
        "domain": "general",
    },
    "tech_expert": {
        "text": "The API leverages asynchronous event loops and middleware pipelines to optimize throughput and minimize latency across distributed microservices.",
        "audience_level": 3,
        "domain": "tech",
    },
    "tech_novice": {
        "text": "The API leverages asynchronous event loops and middleware pipelines to optimize throughput and minimize latency across distributed microservices.",
        "audience_level": 0,
        "domain": "tech",
    },
    "finance": {
        "text": "The portfolio's Sharpe ratio improved due to better asset allocation and rebalancing. Derivatives were used to hedge against volatility.",
        "audience_level": 1,
        "domain": "finance",
    },
    "medical": {
        "text": "The patient presented with acute myocardial infarction. Cardiac catheterization revealed significant stenosis in the left anterior descending artery, necessitating percutaneous coronary intervention.",
        "audience_level": 0,
        "domain": "medical",
    },
    "with_definitions": {
        "text": "API (Application Programming Interface) allows software to communicate. Caching, which means storing data temporarily, improves performance. Latency refers to delay in response time.",
        "audience_level": 0,
        "domain": "tech",
    },
}


def print_result(title: str, result: dict):
    """Pretty print analysis result."""
    print(f"\n{'=' * 70}")
    print(f"  {title}")
    print(f"{'=' * 70}\n")

    print(f"TEXT: {result.get('text', 'N/A')[:100]}...")
    print(f"\n[METRICS]")
    print(f"  Readability:")
    print(f"    - Flesch-Kincaid Grade: {result['readability']['flesch_kincaid_grade']}")
    print(f"    - Avg Sentence Length: {result['readability']['avg_sentence_length']} words")

    print(f"  Jargon:")
    jargon = result["jargon"]
    print(f"    - Count: {jargon['jargon_count']} terms")
    print(f"    - Density: {jargon['jargon_density']} (per word)")
    if jargon["jargon_terms"]:
        print(f"    - Terms: {', '.join(jargon['jargon_terms'][:5])}")

    print(f"  Sentence Complexity:")
    cplx = result["sentence_complexity"]
    print(f"    - Avg Clauses: {cplx['avg_clause_count']}")
    print(f"    - Passive Voice: {cplx['passive_voice_ratio']:.0%}")
    print(f"    - Max Nesting Depth: {cplx['max_nesting_depth']}")
    print(f"    - Complexity Score: {cplx['complexity_score']}")

    print(f"  Concepts:")
    concepts = result["concept_density"]
    print(f"    - Avg per Sentence: {concepts['avg_new_concepts_per_sentence']}")
    print(f"    - Total Unique: {concepts['total_unique_concepts']}")
    print(f"    - Density Score: {concepts['concept_density_score']}")

    print(f"  Definitions:")
    defs = result["definitions"]
    print(f"    - Count: {defs['definition_count']}")
    print(f"    - Ratio: {defs['definition_ratio']:.0%}")

    print(f"\n[ANALYSIS]")
    print(f"  Technicality Score: {result['technicality_score']} (0=easy, 1=confusing)")
    print(f"  Risk Level: {result['risk_level'].upper()}")

    if result["recommendations"]:
        print(f"\n[RECOMMENDATIONS]")
        for i, rec in enumerate(result["recommendations"], 1):
            print(f"  {i}. {rec}")
    else:
        print(f"\n[OK] No major issues detected.")


if __name__ == "__main__":
    print("\n" + "=" * 70)
    print("  VOXPLAIN TECHNICALITY METRICS DEMO")
    print("  (CPU-friendly, no GPU cost)")
    print("=" * 70)

    for title, params in EXAMPLES.items():
        text = params.pop("text")
        result = analyze_technicality(text, **params)
        result["text"] = text  # Add text back for display
        print_result(title.replace("_", " ").title(), result)

    print(f"\n{'=' * 70}\n")
