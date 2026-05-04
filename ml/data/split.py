import json
import random
from pathlib import Path

LABELS_PATH = Path(__file__).parent / "labels.jsonl"
OUT_DIR = Path(__file__).parent

TRAIN_PATH = OUT_DIR / "train.jsonl"
VAL_PATH = OUT_DIR / "val.jsonl"
TEST_PATH = OUT_DIR / "test.jsonl"

RANDOM_SEED = 42
TRAIN_FRAC = 0.8
VAL_FRAC = 0.1
TEST_FRAC = 0.1

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
def main():
    rows = read_jsonl(LABELS_PATH)

    # Basic sanity checks
    cleaned = []
    for r in rows:
        text = (r.get("text") or "").strip()
        label = r.get("label")
        if not text:
            continue
        if label not in (0, 1):
            continue
        # Keep only fields you care about (optional)
        cleaned.append({
            "text": text,
            "label": int(label),
            "audienceLevel": r.get("audienceLevel", None),
            "domain": r.get("domain", "general"),
        })

    if len(cleaned) < 20:
        print(f"Warning: only {len(cleaned)} usable rows. Training will be weak—collect more labels.")

    random.seed(RANDOM_SEED)
    random.shuffle(cleaned)

    n = len(cleaned)
    n_train = int(n * TRAIN_FRAC)
    n_val = int(n * VAL_FRAC)
    # Put the remainder into test to ensure all rows are used
    n_test = n - n_train - n_val

    train_rows = cleaned[:n_train]
    val_rows = cleaned[n_train:n_train + n_val]
    test_rows = cleaned[n_train + n_val:]

    write_jsonl(TRAIN_PATH, train_rows)
    write_jsonl(VAL_PATH, val_rows)
    write_jsonl(TEST_PATH, test_rows)

    print("Done!")
    print(f"Total: {n}")
    print(f"Train: {len(train_rows)} -> {TRAIN_PATH}")
    print(f"Val:   {len(val_rows)} -> {VAL_PATH}")
    print(f"Test:  {len(test_rows)} -> {TEST_PATH}")

if __name__ == "__main__":
    main()