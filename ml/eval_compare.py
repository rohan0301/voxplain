"""Compare the trained model against the heuristic it is meant to replace.

The entire justification for the DistilBERT model is that it beats what already
ships. This script is the gate that checks. Do not wire the model into scoring
(Phase 2) until it passes here.

Four systems are scored on the same held-out rows:

  majority    Always predict the more common training label. A model that has
              learned nothing still scores ~73% accuracy on this data, so this
              row exists to stop that number reading as success.
  heuristic   metrics.analyze_technicality() per sentence, thresholded with the
              product's audience ladder (20/40/60/80 -> 0.20/0.40/0.60/0.80).
              This is what the product does today.
  heuristic*  The same scores at the single fixed threshold that maximizes its
              F1 on this very test set. It is optimistically biased — the
              threshold saw the answers — and exists only so the model cannot
              win by being compared against a badly calibrated baseline. If the
              model does not beat this, it has not clearly earned its place.
  model       ml/model_distilbert.

Results are broken down by source. That breakdown is the point: the synthetic
rows encode a rule written by hand in seed_synthetic.py, so a model can score
near-perfectly on them by reproducing that rule while learning nothing that
generalizes. Read the human column, not the total.

    python eval_compare.py
    python eval_compare.py --test-file data/test_human.jsonl
"""
import argparse
import json
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
from sklearn.metrics import precision_recall_fscore_support, accuracy_score

from app import metrics as heuristic_metrics
from train_bert import format_input

DATA_DIR = Path(__file__).parent / "data"
MODEL_DIR = Path(__file__).parent / "model_distilbert"
TRAIN_PATH = DATA_DIR / "train.jsonl"

# Below this many rows the difference between two systems is noise. See the
# data reality check in AUDIENCE_ENGINE_PLAN.md.
MIN_TRUSTWORTHY_N = 50

# server/src/services/technicality.ts:207, rescaled from 0-100 to 0-1.
AUDIENCE_THRESHOLDS = {0: 0.20, 1: 0.40, 2: 0.60, 3: 0.80}


def read_jsonl(path: Path):
    with path.open("r", encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def audience_level(row) -> int:
    level = row.get("audienceLevel")
    return level if isinstance(level, int) and 0 <= level <= 3 else 1


def heuristic_scores(rows):
    """Raw 0-1 technicality score per row, before any thresholding."""
    return np.array([
        heuristic_metrics.analyze_technicality(
            row["text"], audience_level(row), row.get("domain") or "general",
        )["technicality_score"]
        for row in rows
    ])


def model_predictions(rows):
    import torch
    from transformers import AutoTokenizer, AutoModelForSequenceClassification

    tokenizer = AutoTokenizer.from_pretrained(str(MODEL_DIR))
    model = AutoModelForSequenceClassification.from_pretrained(str(MODEL_DIR))
    model.eval()

    texts = [format_input(row) for row in rows]
    preds = []
    with torch.no_grad():
        for start in range(0, len(texts), 32):
            enc = tokenizer(
                texts[start:start + 32], return_tensors="pt",
                truncation=True, padding=True, max_length=256,
            )
            preds.extend(model(**enc).logits.argmax(dim=-1).tolist())
    return np.array(preds)


def score(y_true, y_pred) -> dict:
    precision, recall, f1, _ = precision_recall_fscore_support(
        y_true, y_pred, average="binary", zero_division=0,
    )
    return {
        "n": len(y_true),
        "accuracy": accuracy_score(y_true, y_pred),
        "precision": precision,
        "recall": recall,
        "f1": f1,
    }


def best_threshold(scores, y_true):
    """The fixed cutoff maximizing F1 on this set. Optimistically biased."""
    candidates = sorted(set(scores.tolist()) | {0.0, 1.0})
    best, best_f1 = 0.5, -1.0
    for cut in candidates:
        f1 = score(y_true, (scores > cut).astype(int))["f1"]
        if f1 > best_f1:
            best, best_f1 = cut, f1
    return best


def print_table(title, systems, subset_idx):
    print(f"\n{title}")
    print(f"{'system':<12} {'n':>4} {'acc':>7} {'prec':>7} {'rec':>7} {'f1':>7}")
    print("-" * 48)
    for name, y_true, y_pred in systems:
        s = score(y_true[subset_idx], y_pred[subset_idx])
        print(f"{name:<12} {s['n']:>4} {s['accuracy']:>7.3f} "
              f"{s['precision']:>7.3f} {s['recall']:>7.3f} {s['f1']:>7.3f}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--test-file", default=str(DATA_DIR / "test.jsonl"))
    args = parser.parse_args()

    test_path = Path(args.test_file)
    rows = read_jsonl(test_path)
    if not rows:
        raise SystemExit(f"No rows in {test_path}")
    if not MODEL_DIR.exists():
        raise SystemExit(f"No model at {MODEL_DIR}. Run train_bert.py first.")

    y_true = np.array([r["label"] for r in rows])

    # Majority class is taken from train, not test: a baseline may not peek.
    train_labels = [r["label"] for r in read_jsonl(TRAIN_PATH)]
    majority = Counter(train_labels).most_common(1)[0][0]

    raw = heuristic_scores(rows)
    ladder = np.array([AUDIENCE_THRESHOLDS[audience_level(r)] for r in rows])
    cut = best_threshold(raw, y_true)

    systems = [
        ("majority", y_true, np.full(len(rows), majority)),
        ("heuristic", y_true, (raw > ladder).astype(int)),
        ("heuristic*", y_true, (raw > cut).astype(int)),
        ("model", y_true, model_predictions(rows)),
    ]

    print(f"Test set: {test_path.name}  ({len(rows)} rows)")
    print(f"Label balance: {dict(Counter(y_true.tolist()))}   "
          f"majority class from train: {majority}")
    print(f"heuristic* tuned threshold: {cut:.3f} (optimistic — fitted on this set)")

    all_idx = np.arange(len(rows))
    print_table("OVERALL", systems, all_idx)

    by_source = defaultdict(list)
    for i, r in enumerate(rows):
        by_source[r.get("source") or "human"].append(i)

    for source in sorted(by_source):
        idx = np.array(by_source[source])
        if len(set(y_true[idx].tolist())) < 2:
            print(f"\nBY SOURCE — {source} ({len(idx)} rows): single-class, "
                  "F1 undefined; skipped.")
            continue
        print_table(f"BY SOURCE — {source}", systems, idx)

    # --- Verdict -----------------------------------------------------------
    model_f1 = score(y_true, systems[3][2])["f1"]
    heur_f1 = score(y_true, systems[1][2])["f1"]
    tuned_f1 = score(y_true, systems[2][2])["f1"]
    maj_f1 = score(y_true, systems[0][2])["f1"]

    print("\n" + "=" * 48)
    print("VERDICT")
    print("=" * 48)

    print(f"model F1 {model_f1:.3f} vs heuristic {heur_f1:.3f}, "
          f"heuristic* {tuned_f1:.3f}, majority {maj_f1:.3f}")

    # The gate is against what actually ships. heuristic* is a diagnostic: it
    # cannot be "kept the heuristic" without retuning the ladder first, and its
    # threshold was fitted on this set, so it is not a fair rival.
    passed = model_f1 > heur_f1 and model_f1 > maj_f1
    print("PASS — model beats the shipped heuristic and the majority baseline."
          if passed else
          "FAIL — model does not beat the shipped heuristic. "
          "Keep the heuristic and collect more data.")

    if tuned_f1 > model_f1:
        print(
            f"\nDO THIS BEFORE PHASE 2: the same heuristic scored at a flat "
            f"{cut:.2f} cutoff reaches F1 {tuned_f1:.3f}, beating the model's "
            f"{model_f1:.3f}. The audience ladder (0.20/0.40/0.60/0.80) is "
            "badly calibrated against metrics.technicality_score, which already "
            "scales itself by audience — so the ladder discounts for audience a "
            "second time and under-flags everything. Retuning those four "
            "numbers is free and currently worth more than the model. Note the "
            "cutoff here was fitted on this test set, so re-derive it on a "
            "validation split before shipping it."
        )

    human_idx = np.array(by_source.get("human", []))
    n_human = len(human_idx)
    if n_human < MIN_TRUSTWORTHY_N:
        print(
            f"\nCAVEAT: only {n_human} human-labeled rows here "
            f"(want >= {MIN_TRUSTWORTHY_N}). Synthetic rows are currently counted "
            "toward the gate, but they encode a rule written by hand in "
            "seed_synthetic.py — a model reproducing that rule scores well "
            "without generalizing. Treat a PASS as a working pipeline, not as "
            "evidence the model works on real speech. Collecting human labels "
            "remains the bottleneck."
        )


if __name__ == "__main__":
    main()
