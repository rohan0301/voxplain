"""Retune the audience threshold ladder (plan item 11b).

The shipped product does NOT score the quantity eval_compare.py scores.
eval_compare thresholds metrics.analyze_technicality()["technicality_score"]
directly. The product blends that with a second, independent Node heuristic
(server/src/services/technicality.ts) 50/50 in server/src/index.ts:224 and
thresholds the blend. A cutoff tuned on the first number is not the cutoff the
second number needs, so this script tunes on the blend the product computes.

The Node half is produced by server/scripts/score_rows.ts and read from disk;
this script does not re-implement it.

Two defects are being fixed at once:

  1. Double discount. metrics.py:391 multiplies its composite by
     audience_factor = 1 - level/4, and then the ladder in technicality.ts:207
     raises the bar again for the same audience. The Node half gets no such
     discount, so one ladder is applied to two halves with different audience
     semantics.
  2. The ladder itself (20/40/60/80) was never fitted to anything.

Candidate systems, all scored on the same rows:

  shipped      blend(node, audience-scaled metrics) > ladder[level]
  shipped+flat the same blend, one fitted cutoff
  raw+ladder   blend(node, RAW metrics) > fitted ladder[level]   <- proposed
  raw+flat     blend(node, RAW metrics) > one fitted cutoff

Thresholds are fitted on train+val and reported on test exactly once. The test
set is not used to choose anything.

    python tune_threshold.py --fit train,val --report test
"""
import argparse
import json
import sys
from collections import Counter
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from app import metrics as heuristic_metrics  # noqa: E402

DATA_DIR = Path(__file__).parent / "data"
NODE_DIR = Path(__file__).parent / "data" / "node_scores"

# What ships today: server/src/services/technicality.ts:207
SHIPPED_LADDER = {0: 20, 1: 40, 2: 60, 3: 80}


def read_jsonl(path: Path):
    return [json.loads(l) for l in path.read_text().splitlines() if l.strip()]


def load(split: str):
    """Rows joined with their Node heuristic score, keyed by text+level."""
    node_path = NODE_DIR / f"{split}.jsonl"
    if not node_path.exists():
        raise SystemExit(
            f"Missing {node_path}. Generate it first:\n"
            f"  cd server && npx tsx scripts/score_rows.ts "
            f"../ml/data/{split}.jsonl > ../ml/data/node_scores/{split}.jsonl"
        )
    rows = read_jsonl(node_path)
    for r in rows:
        # Audience-scaled composite: exactly what /analyze/metrics returns.
        r["metrics_scaled"] = heuristic_metrics.analyze_technicality(
            r["text"], r["audienceLevel"], r["domain"],
        )["technicality_score"]
        # Raw composite: audience_level=0 makes audience_factor 1.0, so this is
        # the same number before the discount. Nothing else in the function
        # reads audience_level.
        r["metrics_raw"] = heuristic_metrics.analyze_technicality(
            r["text"], 0, r["domain"],
        )["technicality_score"]
    return rows


def blend(rows, metrics_key):
    """server/src/index.ts:224 — 50% Node score, 50% metrics scaled to 0-50."""
    return np.array([
        min(100, max(1, round(r["node_score"] * 0.5 + r[metrics_key] * 50)))
        for r in rows
    ], dtype=float)


def f1(y_true, y_pred):
    tp = int(((y_pred == 1) & (y_true == 1)).sum())
    fp = int(((y_pred == 1) & (y_true == 0)).sum())
    fn = int(((y_pred == 0) & (y_true == 1)).sum())
    if tp == 0:
        return 0.0
    prec, rec = tp / (tp + fp), tp / (tp + fn)
    return 2 * prec * rec / (prec + rec)


def stats(y_true, y_pred):
    tp = int(((y_pred == 1) & (y_true == 1)).sum())
    fp = int(((y_pred == 1) & (y_true == 0)).sum())
    fn = int(((y_pred == 0) & (y_true == 1)).sum())
    tn = int(((y_pred == 0) & (y_true == 0)).sum())
    prec = tp / (tp + fp) if tp + fp else 0.0
    rec = tp / (tp + fn) if tp + fn else 0.0
    return {
        "n": len(y_true),
        "acc": (tp + tn) / len(y_true),
        "prec": prec,
        "rec": rec,
        "f1": f1(y_true, y_pred),
    }


def fit_flat(scores, y_true):
    """One cutoff maximising F1. Ties break toward the lower cutoff (higher
    recall), which is the failure mode this product wants."""
    best, best_f1 = 0.0, -1.0
    for cut in sorted(set(scores.tolist())):
        s = f1(y_true, (scores > cut).astype(int))
        if s > best_f1:
            best, best_f1 = cut, s
    return best


def fit_ladder(scores, y_true, levels):
    """One cutoff per audience level, each fitted on that level's rows only."""
    ladder = {}
    for lv in sorted(set(levels.tolist())):
        idx = levels == lv
        if len(set(y_true[idx].tolist())) < 2:
            ladder[lv] = fit_flat(scores, y_true)  # single-class: fall back
            continue
        ladder[lv] = fit_flat(scores[idx], y_true[idx])
    return ladder


def apply_ladder(scores, levels, ladder):
    cuts = np.array([ladder[int(lv)] for lv in levels], dtype=float)
    return (scores > cuts).astype(int)


def table(title, rows_of):
    print(f"\n{title}")
    print(f"{'system':<14} {'n':>4} {'acc':>7} {'prec':>7} {'rec':>7} {'f1':>7}")
    print("-" * 50)
    for name, s in rows_of:
        print(f"{name:<14} {s['n']:>4} {s['acc']:>7.3f} {s['prec']:>7.3f} "
              f"{s['rec']:>7.3f} {s['f1']:>7.3f}")


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--fit", default="train,val")
    p.add_argument("--report", default="test")
    args = p.parse_args()

    fit_rows = [r for s in args.fit.split(",") for r in load(s)]
    rep_rows = load(args.report)

    print(f"fit on {args.fit} ({len(fit_rows)} rows), "
          f"report on {args.report} ({len(rep_rows)} rows)")
    print(f"fit label balance {dict(Counter(r['label'] for r in fit_rows))}, "
          f"report {dict(Counter(r['label'] for r in rep_rows))}")

    def prep(rows):
        return (
            np.array([r["label"] for r in rows]),
            np.array([r["audienceLevel"] for r in rows]),
            blend(rows, "metrics_scaled"),
            blend(rows, "metrics_raw"),
        )

    y_fit, lv_fit, scaled_fit, raw_fit = prep(fit_rows)
    y_rep, lv_rep, scaled_rep, raw_rep = prep(rep_rows)

    # --- fit every threshold on the fit set only -------------------------
    flat_scaled = fit_flat(scaled_fit, y_fit)
    ladder_raw = fit_ladder(raw_fit, y_fit, lv_fit)
    flat_raw = fit_flat(raw_fit, y_fit)

    print(f"\nfitted: shipped+flat cutoff {flat_scaled:.1f}")
    print(f"fitted: raw+ladder {{{', '.join(f'{k}: {v:.0f}' for k, v in sorted(ladder_raw.items()))}}}")
    print(f"fitted: raw+flat cutoff {flat_raw:.1f}")

    def systems(y, lv, scaled, raw):
        shipped_cuts = np.array([SHIPPED_LADDER[int(x)] for x in lv], dtype=float)
        return [
            ("shipped", stats(y, (scaled > shipped_cuts).astype(int))),
            ("shipped+flat", stats(y, (scaled > flat_scaled).astype(int))),
            ("raw+ladder", stats(y, apply_ladder(raw, lv, ladder_raw))),
            ("raw+flat", stats(y, (raw > flat_raw).astype(int))),
        ]

    table("FIT SET (thresholds saw these labels — optimistic)",
          systems(y_fit, lv_fit, scaled_fit, raw_fit))
    table(f"REPORT SET — {args.report} (held out)",
          systems(y_rep, lv_rep, scaled_rep, raw_rep))

    # Human-only slice of the report set: the only rows that are real speech.
    human_idx = np.array([i for i, r in enumerate(rep_rows)
                          if (r.get("source") or "human") == "human"])
    if len(human_idx) and len(set(y_rep[human_idx].tolist())) > 1:
        table(f"REPORT SET — human rows only ({len(human_idx)})",
              systems(y_rep[human_idx], lv_rep[human_idx],
                      scaled_rep[human_idx], raw_rep[human_idx]))
    else:
        print(f"\nhuman rows in {args.report}: {len(human_idx)} — single-class "
              "or empty, F1 undefined; skipped.")


if __name__ == "__main__":
    main()
