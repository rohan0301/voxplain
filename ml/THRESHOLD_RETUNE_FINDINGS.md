# Item 11b — retuning the audience threshold ladder

**Date:** 2026-08-19
**Verdict:** do not retune. The plan's premise was wrong. Thresholds left at
20/40/60/80; the reasoning is now recorded in `technicality.ts` next to them.

## What the plan said

> The audience ladder (0.20/0.40/0.60/0.80, `technicality.ts:207`) is badly
> calibrated… A flat 0.13 cutoff reaches F1 0.765. **Retuning four numbers is
> free and currently worth more than the model.**

Three things were wrong with that.

### 1. The 0.455 baseline measured a pipeline the product does not run

`eval_compare.py` thresholds `metrics.analyze_technicality()["technicality_score"]`
directly. The product does not. `server/src/index.ts:224` blends that score
50/50 with a **second, independent Node heuristic** (`technicality.ts`) and
thresholds the blend:

```ts
const metricsInfluence = metrics.technicality_score * 50;
const blendedScore = Math.round(result.technicalLoadScore * 0.5 + metricsInfluence);
```

The Node half carries real signal and is audience-independent. Scoring the
blend the product actually computes, the shipped system gets **F1 0.651 on the
same 65-row test set** the plan reported 0.455 for.

### 2. The 0.765 was fitted on the set it was reported on

The plan says so itself, then uses the number anyway. Fitted honestly — 5-fold
CV over all 607 rows, every threshold scored only on rows it never saw — the
best refit reaches **F1 0.561**, not 0.765.

### 3. It is a trade, not an improvement

Out-of-fold over 607 rows (`ml/tune_cv.py`):

| system | acc | prec | rec | F1 |
|---|---|---|---|---|
| **shipped (20/40/60/80)** | **0.799** | **0.847** | 0.355 | 0.500 |
| shipped + flat cutoff | 0.634 | 0.419 | 0.756 | 0.539 |
| raw blend + refitted ladder | 0.675 | 0.455 | 0.733 | 0.561 |
| raw blend + flat cutoff | 0.674 | 0.442 | 0.576 | 0.500 |

The shipped ladder has the best accuracy and the best precision of anything
measured. Every refit buys recall with precision, and F1 is the only metric
that makes the trade look like a win, because it ignores true negatives.

McNemar on the out-of-fold predictions, shipped vs. each challenger:

| challenger | shipped only right | challenger only right | p |
|---|---|---|---|
| shipped + flat | 169 | 69 | 7.3e-11 |
| raw + ladder | 140 | 65 | 1.7e-07 |
| raw + flat | 115 | 39 | 6.8e-10 |

Every refit is right on significantly **fewer** rows overall. Meanwhile the F1
gain of the best challenger is **+0.061, 95% bootstrap CI −0.016 to +0.140** —
not distinguishable from zero.

So: the accuracy loss is significant, the F1 gain is not. That is the whole
finding.

## The double discount is real, and it is not the problem

`metrics.py:391` scales its composite by `audience_factor = 1 - level/4` and
then the ladder adjusts for audience again. That is genuinely incoherent, and
`raw+ladder` above is the fixed version: metrics unscaled, one audience
adjustment, ladder refitted. It does not beat what ships. The double discount
is muted because the Node half — which never sees `audience_factor` — carries
most of the blend's signal.

Left in place, documented rather than fixed, because changing it costs
accuracy today and the fix is only worth revisiting once the blend is
rebuilt (Phase 2) or there is enough human data to fit it properly.

## The refitted ladders are non-monotonic

Fitting per level, on the raw blend, across folds:

```
accuracy   0: 21, 1: 21, 2: 58, 3: 16
f1         0: 14, 1: 14, 2: 33, 3: 16
f2         0: 10, 1: 12, 2: 12, 3: 16
```

Level 3 (expert) repeatedly gets a **lower** cutoff than level 2, and under f2
a lower cutoff than level 0. An audience-tolerance ladder that does not
increase with audience expertise is not measuring audience tolerance. Either
the blend does not separate by level the way the design assumes, or 607 rows
spread over four levels is too thin to fit four thresholds — 31 of those rows
are human, so probably both.

**This is the finding worth acting on.** The level-dependence this project
exists to model is not visibly present in the heuristic's output. Wiring in
the model (Phase 2) is the intended fix; more human labels is the prerequisite.

## Available operating points

From `ml/tune_operating_points.py`, all out-of-fold:

| ladder fitted for | acc | prec | rec | F1 |
|---|---|---|---|---|
| (what ships today) | 0.799 | 0.847 | 0.355 | 0.500 |
| accuracy | 0.720 | 0.506 | 0.523 | 0.514 |
| f0.5 (precision-leaning) | 0.697 | 0.467 | 0.488 | 0.477 |
| f1 (balanced) | 0.656 | 0.436 | 0.733 | 0.547 |
| f2 (recall-leaning) | 0.524 | 0.364 | 0.907 | 0.519 |

Decision, 2026-08-19: **keep the current thresholds.** Flagging with 85%
precision and staying quiet about two thirds of the problems was judged the
better failure mode for a coaching tool than flagging twice as often and being
wrong more than half the time. Revisit if user feedback says the tool feels
silent.

## Reproducing

```bash
cd server && npx tsx scripts/score_rows.ts ../ml/data/train.jsonl > ../ml/data/node_scores/train.jsonl
# ...same for val.jsonl and test.jsonl

cd ml
.venv/bin/python tune_threshold.py          # fit on train+val, report on test once
.venv/bin/python tune_cv.py                 # 5-fold CV + McNemar + bootstrap CI
.venv/bin/python tune_operating_points.py   # the trade-off table above
```

`score_rows.ts` runs the real `analyzeTechnicality()` rather than a Python
re-implementation of it, which is the only reason these numbers describe the
product instead of a model of the product.

## Also done in this pass (item 1c)

`technicality.ts` had two scoring blocks. The first (density × 200, clump × 3,
`explainedRate * 0.4`) was overwritten by the second before anything read it —
genuinely dead, and it had been sitting there long enough that the plan flagged
it. Removed, along with the stale comment block reasoning about it.

The surviving constants moved into a named `SCORING` object and
`AUDIENCE_THRESHOLDS`, with the measurements above recorded beside them so the
next person to reach for these numbers starts from evidence.

`words` and `requiredTimeSec` were destructured and never used. They stay on
`AnalyzeInput` — callers send them and a pacing check would want them — but are
now documented as accepted-and-ignored instead of looking load-bearing.

**This refactor is behaviour-preserving.** All 549 train+test rows produce
byte-identical `technicalLoadScore` before and after; verified by diffing
`score_rows.ts` output across the change.
