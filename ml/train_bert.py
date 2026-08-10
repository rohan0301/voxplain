import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import torch
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


class WeightedTrainer(Trainer):
    """Trainer with class-weighted loss.

    The label distribution is roughly 73/27 in favour of "clear", so an
    unweighted model can score ~73% accuracy by never predicting "confusing" —
    which is precisely the prediction the product needs it to make. Weights are
    inverse-frequency, computed from the training split at run time so they
    track the data instead of a constant that goes stale.
    """

    def __init__(self, *args, class_weights=None, **kwargs):
        super().__init__(*args, **kwargs)
        self.class_weights = class_weights

    def compute_loss(self, model, inputs, return_outputs=False, **kwargs):
        labels = inputs.pop("labels")
        outputs = model(**inputs)
        weight = None
        if self.class_weights is not None:
            weight = self.class_weights.to(outputs.logits.device)
        loss = torch.nn.functional.cross_entropy(
            outputs.logits, labels, weight=weight
        )
        return (loss, outputs) if return_outputs else loss


def inverse_frequency_weights(labels):
    """weight[c] = n / (num_classes * count[c]); mean weight is 1."""
    counts = np.bincount(labels, minlength=2).astype(np.float64)
    if (counts == 0).any():
        return None
    weights = len(labels) / (2.0 * counts)
    return torch.tensor(weights, dtype=torch.float)


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

    eval_strategy = "epoch" if val_ds is not None else "no"
    save_strategy = "epoch" if val_ds is not None else "no"

    # Tuned for the ~600-row dataset. Six epochs on this much data overfits
    # hard; three is enough to converge without memorizing the training split.
    args = TrainingArguments(
        output_dir=str(OUT_DIR),
        learning_rate=2e-5,
        per_device_train_batch_size=16,
        per_device_eval_batch_size=32,
        num_train_epochs=3,
        weight_decay=0.01,
        eval_strategy=eval_strategy,
        save_strategy=save_strategy,
        # Each checkpoint is ~770MB; without a cap a 3-epoch run leaves 2.3GB
        # of intermediate state behind next to a 268MB model.
        save_total_limit=1,
        load_best_model_at_end=True if val_ds is not None else False,
        metric_for_best_model="f1",
        greater_is_better=True,
        logging_steps=5,
        report_to="none",
    )

    class_weights = inverse_frequency_weights(np.asarray(list(train_ds["labels"])))
    if class_weights is not None:
        print(f"Class weights (0/1): {class_weights.tolist()}")

    trainer = WeightedTrainer(
        model=model,
        args=args,
        train_dataset=train_ds,
        eval_dataset=val_ds,
        processing_class=tokenizer,
        compute_metrics=compute_metrics,
        class_weights=class_weights,
    )

    print("\nTraining…")
    trainer.train()

    print("\nSaving model…")
    trainer.save_model(str(OUT_DIR))
    tokenizer.save_pretrained(str(OUT_DIR))

    # Every score the product shows must be traceable to the model that made
    # it. Phase 2 reads this back and returns it on the analysis response.
    version = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    (OUT_DIR / "version.txt").write_text(
        f"{version}\ntrain_rows={len(train_ds)}\nbase={MODEL_NAME}\n",
        encoding="utf-8",
    )
    print(f"Model version: {version}")

    if test_ds is not None:
        print("\nEvaluating on test set…")
        metrics = trainer.evaluate(test_ds)
        print(metrics)
    else:
        print("\nNo test set found (ml/data/test.jsonl empty).")

    print(f"\nDone. Model saved to: {OUT_DIR}")


if __name__ == "__main__":
    main()
