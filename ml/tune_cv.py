"""Is retuning the ladder actually worth it? (plan item 11b, honest version)

tune_threshold.py fits on train+val and reports on test — but test is 65 rows,
which is too few to separate two systems that land 0.02 F1 apart. This script
answers the question on all 607 rows with 5-fold cross-validation: in each
fold the ladder is fitted on 4/5 of the data and scored on the held-out 1/5,
so every reported number comes from rows the threshold never saw.

McNemar's test then asks whether the two systems' disagreements are lopsided
enough to be more than sampling noise.

    python tune_cv.py
"""
import json
import sys
from collections import Counter
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from tune_threshold import (  # noqa: E402
    SHIPPED_LADDER, blend, f1, fit_flat, fit_ladder, apply_ladder, load, stats,
)

SEED = 0
FOLDS = 5


def mcnemar(y_true, pred_a, pred_b):
    """Exact binomial McNemar on the discordant pairs."""
    from math import comb
    a_right = (pred_a == y_true) & (pred_b != y_true)
    b_right = (pred_b == y_true) & (pred_a != y_true)
    n01, n10 = int(a_right.sum()), int(b_right.sum())
    n = n01 + n10
    if n == 0:
        return n01, n10, 1.0
    k = min(n01, n10)
    p = min(1.0, 2 * sum(comb(n, i) for i in range(k + 1)) / 2 ** n)
    return n01, n10, p


def main():
    rows = [r for s in ("train", "val", "test") for r in load(s)]
    y = np.array([r["label"] for r in rows])
    lv = np.array([r["audienceLevel"] for r in rows])
    scaled = blend(rows, "metrics_scaled")
    raw = blend(rows, "metrics_raw")

    print(f"{len(rows)} rows, labels {dict(Counter(y.tolist()))}")
    print(f"{FOLDS}-fold CV, seed {SEED}\n")

    rng = np.random.default_rng(SEED)
    order = rng.permutation(len(rows))
    folds = np.array_split(order, FOLDS)

    # Out-of-fold predictions for every system.
    oof = {k: np.zeros(len(rows), dtype=int)
           for k in ("shipped", "shipped+flat", "raw+ladder", "raw+flat")}

    for i, held in enumerate(folds):
        tr = np.concatenate([f for j, f in enumerate(folds) if j != i])

        flat_scaled = fit_flat(scaled[tr], y[tr])
        ladder_raw = fit_ladder(raw[tr], y[tr], lv[tr])
        flat_raw = fit_flat(raw[tr], y[tr])

        shipped_cuts = np.array([SHIPPED_LADDER[int(x)] for x in lv[held]], dtype=float)
        oof["shipped"][held] = (scaled[held] > shipped_cuts).astype(int)
        oof["shipped+flat"][held] = (scaled[held] > flat_scaled).astype(int)
        oof["raw+ladder"][held] = apply_ladder(raw[held], lv[held], ladder_raw)
        oof["raw+flat"][held] = (raw[held] > flat_raw).astype(int)

        print(f"  fold {i}: flat_scaled={flat_scaled:.0f} flat_raw={flat_raw:.0f} "
              f"ladder={{{', '.join(f'{k}:{v:.0f}' for k, v in sorted(ladder_raw.items()))}}}")

    print(f"\n{'system':<14} {'n':>4} {'acc':>7} {'prec':>7} {'rec':>7} {'f1':>7}")
    print("-" * 50)
    for name, pred in oof.items():
        s = stats(y, pred)
        print(f"{name:<14} {s['n']:>4} {s['acc']:>7.3f} {s['prec']:>7.3f} "
              f"{s['rec']:>7.3f} {s['f1']:>7.3f}")

    print("\nMcNemar vs shipped (out-of-fold, all rows)")
    for name in ("shipped+flat", "raw+ladder", "raw+flat"):
        n01, n10, p = mcnemar(y, oof["shipped"], oof[name])
        verdict = "significant" if p < 0.05 else "not significant"
        print(f"  {name:<14} shipped-only-right {n01:>3}, {name}-only-right {n10:>3}, "
              f"p={p:.4g}  ({verdict})")

    # Bootstrap CI on the F1 difference for the best challenger.
    best = max(("shipped+flat", "raw+ladder", "raw+flat"),
               key=lambda k: f1(y, oof[k]))
    diffs = []
    for _ in range(5000):
        idx = rng.integers(0, len(y), len(y))
        diffs.append(f1(y[idx], oof[best][idx]) - f1(y[idx], oof["shipped"][idx]))
    lo, hi = np.percentile(diffs, [2.5, 97.5])
    print(f"\nbest challenger: {best}")
    print(f"F1 delta vs shipped: {f1(y, oof[best]) - f1(y, oof['shipped']):+.3f} "
          f"(95% bootstrap CI {lo:+.3f} to {hi:+.3f})")

    # The human slice, stated separately and honestly.
    human = np.array([i for i, r in enumerate(rows)
                      if (r.get("source") or "human") == "human"])
    print(f"\nhuman rows: {len(human)}, labels "
          f"{dict(Counter(y[human].tolist()))}")
    if len(set(y[human].tolist())) > 1:
        print(f"{'system':<14} {'n':>4} {'acc':>7} {'prec':>7} {'rec':>7} {'f1':>7}")
        print("-" * 50)
        for name, pred in oof.items():
            s = stats(y[human], pred[human])
            print(f"{name:<14} {s['n']:>4} {s['acc']:>7.3f} {s['prec']:>7.3f} "
                  f"{s['rec']:>7.3f} {s['f1']:>7.3f}")
        print("\nThis slice is small enough that the ranking above is not "
              "evidence. It is here so nobody has to ask for it.")


if __name__ == "__main__":
    main()
