import json
from pathlib import Path

import numpy as np
from datasets import Dataset
from transformers import (
    AutoTokenizer,
    AutoModelForSequenceClassification,
    TrainingArguments,
    Trainer,
)
from sklearn.metrics import precision_recall_fscore_support, accuracy_score


DATA_DIR = Path(__file__).parent / "data"
TRAIN_PATH = DATA_DIR / "train.jsonl"
VAL_PATH = DATA_DIR / "val.jsonl"
TEST_PATH = DATA_DIR / "test.jsonl"

MODEL_NAME = "distilbert-base-uncased"
OUT_DIR = Path(__file__).parent / "model_distilbert"


def read_jsonl(path: Path):
    rows = []
    if not path.exists():
        return rows
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            rows.append(json.loads(line))
    return rows


def audience_level_to_text(level):
    # Accept None, strings, numbers; default to "some"
    try:
        lvl = int(level)
    except Exception:
        lvl = 1
    mapping = {0: "novice", 1: "some", 2: "strong", 3: "expert"}
    return mapping.get(lvl, "some")


def format_input(example):
    text = (example.get("text") or "").strip()
    domain = (example.get("domain") or "general").strip()
    aud = audience_level_to_text(example.get("audienceLevel"))
    # Condition the model by including audience + domain in the text
    return f"AUDIENCE={aud} DOMAIN={domain} TEXT={text}"


def build_dataset(rows):
    # Keep only valid examples
    cleaned = []
    for r in rows:
        text = (r.get("text") or "").strip()
        label = r.get("label")
        if not text:
            continue
        if label not in (0, 1):
            continue
        cleaned.append({
            "text": text,
            "label": int(label),
            "audienceLevel": r.get("audienceLevel", 1),
            "domain": r.get("domain", "general"),
        })
    if not cleaned:
        return None
    # Convert to HuggingFace Dataset
    inputs = [format_input(x) for x in cleaned]
    labels = [x["label"] for x in cleaned]
    return Dataset.from_dict({"text": inputs, "labels": labels})


def compute_metrics(eval_pred):
    logits, labels = eval_pred
    preds = np.argmax(logits, axis=-1)
    acc = accuracy_score(labels, preds)
    precision, recall, f1, _ = precision_recall_fscore_support(
        labels, preds, average="binary", zero_division=0
    )
    return {"accuracy": acc, "precision": precision, "recall": recall, "f1": f1}


def main():
    train_rows = read_jsonl(TRAIN_PATH)
    val_rows = read_jsonl(VAL_PATH)
    test_rows = read_jsonl(TEST_PATH)

    train_ds = build_dataset(train_rows)
    val_ds = build_dataset(val_rows)
    test_ds = build_dataset(test_rows)

    if train_ds is None:
        raise RuntimeError("No usable training rows. Check ml/data/train.jsonl")

    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
    model = AutoModelForSequenceClassification.from_pretrained(MODEL_NAME, num_labels=2)

    def tokenize(batch):
        return tokenizer(batch["text"], truncation=True, padding=True, max_length=256)

    train_ds = train_ds.map(tokenize, batched=True)
    if val_ds is not None:
        val_ds = val_ds.map(tokenize, batched=True)
    if test_ds is not None:
        test_ds = test_ds.map(tokenize, batched=True)

    train_ds.set_format(type="torch", columns=["input_ids", "attention_mask", "labels"])
    if val_ds is not None:
        val_ds.set_format(type="torch", columns=["input_ids", "attention_mask", "labels"])
    if test_ds is not None:
        test_ds.set_format(type="torch", columns=["input_ids", "attention_mask", "labels"])

    # With tiny data, keep it small and just prove the pipeline.
    # Expect overfitting and noisy metrics.
    eval_strategy = "epoch" if val_ds is not None else "no"
    save_strategy = "epoch" if val_ds is not None else "no"

    args = TrainingArguments(
        output_dir=str(OUT_DIR),
        learning_rate=2e-5,
        per_device_train_batch_size=4,
        per_device_eval_batch_size=8,
        num_train_epochs=6,
        weight_decay=0.01,
        eval_strategy=eval_strategy,
        save_strategy=save_strategy,
        load_best_model_at_end=True if val_ds is not None else False,
        metric_for_best_model="f1",
        greater_is_better=True,
        logging_steps=5,
        report_to="none",
    )

    trainer = Trainer(
        model=model,
        args=args,
        train_dataset=train_ds,
        eval_dataset=val_ds,
        tokenizer=tokenizer,
        compute_metrics=compute_metrics,
    )

    print("\nTraining…")
    trainer.train()

    print("\nSaving model…")
    trainer.save_model(str(OUT_DIR))
    tokenizer.save_pretrained(str(OUT_DIR))

    if test_ds is not None:
        print("\nEvaluating on test set…")
        metrics = trainer.evaluate(test_ds)
        print(metrics)
    else:
        print("\nNo test set found (ml/data/test.jsonl empty).")

    print(f"\nDone. Model saved to: {OUT_DIR}")


if __name__ == "__main__":
    main()
