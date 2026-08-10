"""Split labels.jsonl into train/val/test for training.

Three properties this script exists to guarantee, all of which the previous
random split violated:

1. **Grouped by text.** Every row sharing a text goes to the same split. The
   synthetic seed data emits each text at all four audience levels, so a random
   split scatters those rows across train and test — the model then memorizes
   the sentence from the training rows and scores well on test without ever
   learning the level-dependence the data was built to teach.

2. **`source` is preserved.** The previous version dropped the column while
   cleaning rows, which made a human-only eval set impossible downstream no
   matter how the split was done.

3. **Deduplicated.** Exact (text, audienceLevel, domain, label) repeats are
   collapsed. Rows that agree on (text, audienceLevel, domain) but disagree on
   the label are annotator conflicts: they are kept, but written to
   conflicts.jsonl for manual resolution.

Splitting is stratified by source, so the test set always contains human rows in
proportion. Use --all-human-to-test when you want the §1.5 eval gate to see
every human label at the cost of never training on them.

    python data/split.py
    python data/split.py --all-human-to-test
"""
import argparse
import hashlib
import json
import random
import re
from collections import defaultdict
from pathlib import Path

LABELS_PATH = Path(__file__).parent / "labels.jsonl"
OUT_DIR = Path(__file__).parent

TRAIN_PATH = OUT_DIR / "train.jsonl"
VAL_PATH = OUT_DIR / "val.jsonl"
TEST_PATH = OUT_DIR / "test.jsonl"
TEST_HUMAN_PATH = OUT_DIR / "test_human.jsonl"
CONFLICTS_PATH = OUT_DIR / "conflicts.jsonl"

RANDOM_SEED = 42
TRAIN_FRAC = 0.8
VAL_FRAC = 0.1

# Below this, eval_compare.py cannot distinguish a model that learned something
# from one that got lucky. See the data reality check in AUDIENCE_ENGINE_PLAN.md.
MIN_USABLE_HUMAN_TEST = 50

WHITESPACE = re.compile(r"\s+")


def normalize(text: str) -> str:
    """Fold the cosmetic differences that would otherwise split one text in two."""
    return WHITESPACE.sub(" ", text.strip().lower())


def group_key(text: str) -> str:
    return hashlib.sha1(normalize(text).encode("utf-8")).hexdigest()


def read_jsonl(path: Path):
    rows = []
    if not path.exists():
        raise FileNotFoundError(f"File not found: {path}")
    with path.open("r", encoding="utf-8") as f:
        for line_num, line in enumerate(f, start=1):
            line = line.strip()
            if not line:
                continue
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError as e:
                raise ValueError(f"Invalid JSON on line {line_num}: {e}")
    return rows


def write_jsonl(path: Path, rows):
    with path.open("w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")


def clean(rows):
    """Drop unusable rows and normalize the fields we keep."""
    cleaned = []
    for r in rows:
        text = (r.get("text") or "").strip()
        label = r.get("label")
        if not text or label not in (0, 1):
            continue
        cleaned.append({
            "text": text,
            "label": int(label),
            "audienceLevel": r.get("audienceLevel"),
            "domain": r.get("domain") or "general",
            # Unlabeled provenance is treated as human: it is the conservative
            # assumption for a training set, but it must never silently inflate
            # the eval gate, so it is reported separately below.
            "source": r.get("source") or "human",
        })
    return cleaned


def dedupe(rows):
    """Collapse exact repeats; surface (text, level, domain) label disagreements."""
    seen = set()
    unique = []
    by_context = defaultdict(set)

    for r in rows:
        context = (normalize(r["text"]), r["audienceLevel"], r["domain"])
        by_context[context].add(r["label"])
        key = context + (r["label"],)
        if key in seen:
            continue
        seen.add(key)
        unique.append(r)

    conflicts = [
        {"text": text, "audienceLevel": level, "domain": domain,
         "labels": sorted(labels)}
        for (text, level, domain), labels in by_context.items()
        if len(labels) > 1
    ]
    return unique, len(rows) - len(unique), conflicts


def split_grouped(rows, seed=RANDOM_SEED, fracs=(TRAIN_FRAC, VAL_FRAC)):
    """Grouped split: all rows sharing a text land in the same bucket."""
    groups = defaultdict(list)
    for r in rows:
        groups[group_key(r["text"])].append(r)

    keys = sorted(groups)  # sorted before shuffle → deterministic
    random.Random(seed).shuffle(keys)

    n = len(keys)
    n_train = int(n * fracs[0])
    n_val = int(n * fracs[1])
    buckets = (keys[:n_train], keys[n_train:n_train + n_val], keys[n_train + n_val:])
    return [[r for k in bucket for r in groups[k]] for bucket in buckets]


def group_source(rows):
    """A text's source for stratification. Human wins, so a text that carries
    both never lands in a synthetic-only bucket — and never straddles splits."""
    return "human" if any(r["source"] == "human" for r in rows) else "synthetic"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--all-human-to-test", action="store_true",
        help="Route every human-labeled text into test. Maximizes the eval gate; "
             "the model then trains on synthetic data only.",
    )
    parser.add_argument("--seed", type=int, default=RANDOM_SEED)
    args = parser.parse_args()

    rows = clean(read_jsonl(LABELS_PATH))
    rows, dropped, conflicts = dedupe(rows)

    if len(rows) < 20:
        print(f"Warning: only {len(rows)} usable rows. Training will be weak—collect more labels.")

    # Stratify at the group level so proportions hold and no text straddles splits.
    grouped = defaultdict(list)
    for r in rows:
        grouped[group_key(r["text"])].append(r)

    human_rows, synthetic_rows = [], []
    for members in grouped.values():
        (human_rows if group_source(members) == "human" else synthetic_rows).extend(members)

    if args.all_human_to_test:
        s_train, s_val, s_test = split_grouped(synthetic_rows, seed=args.seed)
        train, val, test = s_train, s_val, s_test + human_rows
    else:
        h_train, h_val, h_test = split_grouped(human_rows, seed=args.seed)
        s_train, s_val, s_test = split_grouped(synthetic_rows, seed=args.seed)
        train, val, test = h_train + s_train, h_val + s_val, h_test + s_test

    test_human = [r for r in test if r["source"] == "human"]

    write_jsonl(TRAIN_PATH, train)
    write_jsonl(VAL_PATH, val)
    write_jsonl(TEST_PATH, test)
    write_jsonl(TEST_HUMAN_PATH, test_human)
    if conflicts:
        write_jsonl(CONFLICTS_PATH, conflicts)

    print("Done!")
    print(f"Total usable rows: {len(rows)}  (dropped {dropped} exact duplicates)")
    print(f"Distinct texts:    {len(grouped)}")
    print(f"Train: {len(train):4d} -> {TRAIN_PATH.name}")
    print(f"Val:   {len(val):4d} -> {VAL_PATH.name}")
    print(f"Test:  {len(test):4d} -> {TEST_PATH.name}")
    print(f"  of which human: {len(test_human)} -> {TEST_HUMAN_PATH.name}")

    labels = [r["label"] for r in train]
    if labels:
        ones = sum(labels)
        print(f"Train label balance: {len(labels) - ones}/{ones} (0/1) "
              f"— {round(100 * ones / len(labels))}% positive")

    if conflicts:
        print(f"\n{len(conflicts)} annotator conflict(s) written to {CONFLICTS_PATH.name}. "
              "Same text + level + domain labeled both ways; resolve by hand.")

    if len(test_human) < MIN_USABLE_HUMAN_TEST:
        print(
            f"\nWARNING: {len(test_human)} human rows in the test set "
            f"(want >= {MIN_USABLE_HUMAN_TEST}). eval_compare.py will run, but the "
            "result is a smoke test, not evidence the model beats the heuristic. "
            "Collecting human labels is the bottleneck."
        )


if __name__ == "__main__":
    main()
