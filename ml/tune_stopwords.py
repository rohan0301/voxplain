"""Does dropping the ambiguous glossary terms help or hurt? (plan Fix #5 prep)

The seed glossary inherited programming keywords that are also ordinary English
words. "this" appears in 50 of 607 labelled rows and was being counted as a
technical term every time.

Removing them is obviously right on the face of it, but "obviously right"
is what item 11b said too, so this measures instead of assuming. Same method:
5-fold CV, thresholds fitted out-of-fold, scored only on rows they never saw.

Run score_rows.ts twice first — once per glossary — into
data/node_scores/{split}.jsonl and data/node_scores_pruned/{split}.jsonl.

    python tune_stopwords.py
"""
import sys
from collections import Counter
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from tune_threshold import SHIPPED_LADDER, blend, f1, fit_flat, load, stats  # noqa: E402
from tune_cv import mcnemar  # noqa: E402

SEED = 0
FOLDS = 5
DATA_DIR = Path(__file__).parent / "data"


def load_variant(subdir: str):
    """load() reads data/node_scores; point it elsewhere for the variant."""
    import tune_threshold
    original = tune_threshold.NODE_DIR
    tune_threshold.NODE_DIR = DATA_DIR / subdir
    try:
        return [r for s in ("train", "val", "test") for r in load(s)]
    finally:
        tune_threshold.NODE_DIR = original


def oof_predictions(rows, y, lv, folds, rng):
    scaled = blend(rows, "metrics_scaled")
    pred = np.zeros(len(rows), dtype=int)
    flat = np.zeros(len(rows), dtype=int)
    for i, held in enumerate(folds):
        tr = np.concatenate([f for j, f in enumerate(folds) if j != i])
        cuts = np.array([SHIPPED_LADDER[int(x)] for x in lv[held]], dtype=float)
        pred[held] = (scaled[held] > cuts).astype(int)
        cut = fit_flat(scaled[tr], y[tr])
        flat[held] = (scaled[held] > cut).astype(int)
    return pred, flat


def main():
    full = load_variant("node_scores")
    pruned = load_variant("node_scores_pruned")

    assert len(full) == len(pruned), "variants must cover the same rows"

    y = np.array([r["label"] for r in full])
    lv = np.array([r["audienceLevel"] for r in full])

    rng = np.random.default_rng(SEED)
    folds = np.array_split(rng.permutation(len(full)), FOLDS)

    print(f"{len(full)} rows, labels {dict(Counter(y.tolist()))}, "
          f"{FOLDS}-fold CV out-of-fold\n")

    changed = sum(1 for a, b in zip(full, pruned)
                  if a["node_score"] != b["node_score"])
    print(f"rows whose Node score changed: {changed} "
          f"({changed / len(full):.0%})\n")

    results = {}
    for name, rows in (("glossary as-is", full), ("ambiguous removed", pruned)):
        pred, flat = oof_predictions(rows, y, lv, folds, rng)
        results[name] = pred
        s = stats(y, pred)
        sf = stats(y, flat)
        print(f"{name:<20} shipped ladder  acc {s['acc']:.3f}  "
              f"prec {s['prec']:.3f}  rec {s['rec']:.3f}  f1 {s['f1']:.3f}")
        print(f"{'':<20} flat (fitted)   acc {sf['acc']:.3f}  "
              f"prec {sf['prec']:.3f}  rec {sf['rec']:.3f}  f1 {sf['f1']:.3f}")

    n01, n10, p = mcnemar(y, results["glossary as-is"], results["ambiguous removed"])
    print(f"\nMcNemar: as-is only right {n01}, pruned only right {n10}, p={p:.4g}")
    if p >= 0.05:
        print("Not significant either way — the change is safe on accuracy, "
              "and justified on the grounds that counting 'this' as jargon is "
              "indefensible regardless of what it does to the metric.")
    else:
        better = "pruned" if n10 > n01 else "as-is"
        print(f"Significant: {better} is better.")


if __name__ == "__main__":
    main()
