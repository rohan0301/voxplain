"""What operating points can the heuristic actually reach? (plan item 11b)

tune_cv.py shows that maximising F1 buys recall by giving away precision and
accuracy. That is a product decision, not a statistical one, so this script
lays out the choices instead of picking one: for each objective, fit the ladder
to that objective and report all four numbers out-of-fold.

    python tune_operating_points.py
"""
import sys
from collections import Counter
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from tune_threshold import SHIPPED_LADDER, blend, load, stats  # noqa: E402

SEED = 0
FOLDS = 5


def fbeta(y_true, y_pred, beta):
    tp = int(((y_pred == 1) & (y_true == 1)).sum())
    fp = int(((y_pred == 1) & (y_true == 0)).sum())
    fn = int(((y_pred == 0) & (y_true == 1)).sum())
    if tp == 0:
        return 0.0
    prec, rec = tp / (tp + fp), tp / (tp + fn)
    b2 = beta * beta
    return (1 + b2) * prec * rec / (b2 * prec + rec)


OBJECTIVES = {
    # name: (scorer, what it optimises for)
    "accuracy": (lambda yt, yp: stats(yt, yp)["acc"], "fewest total mistakes"),
    "f0.5":     (lambda yt, yp: fbeta(yt, yp, 0.5), "precision-leaning"),
    "f1":       (lambda yt, yp: fbeta(yt, yp, 1.0), "balanced"),
    "f2":       (lambda yt, yp: fbeta(yt, yp, 2.0), "recall-leaning"),
}


def fit_ladder_for(scores, y_true, levels, scorer):
    ladder = {}
    for lv in sorted(set(levels.tolist())):
        idx = levels == lv
        s_lv, y_lv = scores[idx], y_true[idx]
        if len(set(y_lv.tolist())) < 2:
            ladder[lv] = float(np.median(scores))
            continue
        best, best_s = 0.0, -1.0
        for cut in sorted(set(s_lv.tolist())):
            v = scorer(y_lv, (s_lv > cut).astype(int))
            if v > best_s:
                best, best_s = cut, v
        ladder[lv] = best
    return ladder


def main():
    rows = [r for s in ("train", "val", "test") for r in load(s)]
    y = np.array([r["label"] for r in rows])
    lv = np.array([r["audienceLevel"] for r in rows])
    raw = blend(rows, "metrics_raw")
    scaled = blend(rows, "metrics_scaled")

    rng = np.random.default_rng(SEED)
    folds = np.array_split(rng.permutation(len(rows)), FOLDS)

    print(f"{len(rows)} rows, labels {dict(Counter(y.tolist()))}, "
          f"{FOLDS}-fold CV out-of-fold\n")

    oof = {name: np.zeros(len(rows), dtype=int) for name in OBJECTIVES}
    ladders = {name: [] for name in OBJECTIVES}

    for i, held in enumerate(folds):
        tr = np.concatenate([f for j, f in enumerate(folds) if j != i])
        for name, (scorer, _) in OBJECTIVES.items():
            ladder = fit_ladder_for(raw[tr], y[tr], lv[tr], scorer)
            ladders[name].append(ladder)
            cuts = np.array([ladder[int(x)] for x in lv[held]], dtype=float)
            oof[name][held] = (raw[held] > cuts).astype(int)

    shipped_cuts = np.array([SHIPPED_LADDER[int(x)] for x in lv], dtype=float)
    shipped_pred = (scaled > shipped_cuts).astype(int)

    print(f"{'ladder fitted for':<20} {'acc':>7} {'prec':>7} {'rec':>7} {'f1':>7}   note")
    print("-" * 72)
    s = stats(y, shipped_pred)
    print(f"{'(what ships today)':<20} {s['acc']:>7.3f} {s['prec']:>7.3f} "
          f"{s['rec']:>7.3f} {s['f1']:>7.3f}   misses 2 of every 3 problems")
    for name, (_, note) in OBJECTIVES.items():
        s = stats(y, oof[name])
        print(f"{name:<20} {s['acc']:>7.3f} {s['prec']:>7.3f} "
              f"{s['rec']:>7.3f} {s['f1']:>7.3f}   {note}")

    print("\nLadder values per objective (median across folds, on the RAW blend):")
    for name in OBJECTIVES:
        med = {k: float(np.median([l[k] for l in ladders[name]]))
               for k in sorted(ladders[name][0])}
        spread = {k: (min(l[k] for l in ladders[name]),
                      max(l[k] for l in ladders[name]))
                  for k in sorted(ladders[name][0])}
        print(f"  {name:<10} " + ", ".join(f"{k}: {v:.0f}" for k, v in med.items())
              + "   fold range " + ", ".join(f"{k}: {lo:.0f}-{hi:.0f}"
                                             for k, (lo, hi) in spread.items()))


if __name__ == "__main__":
    main()
