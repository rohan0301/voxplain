"""
Model loading and prediction logic.

Wraps the existing predict.py logic into a singleton service that loads
the DistilBERT model once at startup and serves predictions in-memory.
"""

import numpy as np
import os
from pathlib import Path

MODEL_DIR = Path(__file__).resolve().parent.parent / "model_distilbert"
LOAD_BERT_MODEL = os.getenv("LOAD_BERT_MODEL", "true").lower() in {"1", "true", "yes", "on"}

AUDIENCE_MAP = {0: "novice", 1: "some", 2: "strong", 3: "expert"}


class ModelService:
    """Singleton-style service that holds the loaded model in memory."""

    def __init__(self) -> None:
        self.model = None
        self.tokenizer = None
        self._torch = None
        self.is_loaded: bool = False
        # First line of model_distilbert/version.txt, e.g. "20260810-232218".
        # Every score the model produces is reported with this, because
        # "the model said 0.8" is not a fact until you know which model.
        self.version: str | None = None

    def load(self) -> None:
        """Load model + tokenizer from disk into memory."""
        if not LOAD_BERT_MODEL:
            print("[ModelService] LOAD_BERT_MODEL is disabled. Skipping model load.")
            return

        if not MODEL_DIR.exists():
            print(f"ERROR: Model directory not found at {MODEL_DIR}")
            print("Please run 'python train_bert.py' to generate the model or copy the folder manually.")
            return

        try:
            import torch
            from transformers import AutoTokenizer, AutoModelForSequenceClassification
        except ImportError as exc:
            print(f"[ModelService] Missing BERT dependencies: {exc}")
            return

        print(f"[ModelService] Loading model from {MODEL_DIR} ...")
        self.tokenizer = AutoTokenizer.from_pretrained(str(MODEL_DIR), local_files_only=True)
        self.model = AutoModelForSequenceClassification.from_pretrained(str(MODEL_DIR), local_files_only=True)
        self._torch = torch
        self.model.eval()
        self.version = self._read_version()
        self.is_loaded = True
        print(f"[ModelService] Model loaded successfully (version {self.version}).")

    @staticmethod
    def _read_version() -> str | None:
        """Training stamps a version.txt; an older artifact may not have one."""
        path = MODEL_DIR / "version.txt"
        try:
            first = path.read_text().splitlines()[0].strip()
            return first or None
        except (OSError, IndexError):
            print(f"[ModelService] No version.txt at {path}; version unknown.")
            return None

    def unload(self) -> None:
        """Release model resources."""
        self.model = None
        self.tokenizer = None
        self._torch = None
        self.is_loaded = False
        self.version = None
        print("[ModelService] Model unloaded.")

    def predict(
        self,
        text: str,
        audience_level: int = 1,
        domain: str = "general",
    ) -> dict:
        """
        Run a forward pass on a single text input.

        Returns:
            dict with prediction, confidence, p_clear, p_confusing
        """
        if not self.is_loaded:
            raise RuntimeError("Model is not loaded. Call load() first.")

        aud = AUDIENCE_MAP.get(audience_level, "some")
        prompt = f"AUDIENCE={aud} DOMAIN={domain} TEXT={text.strip()}"

        enc = self.tokenizer(
            prompt,
            return_tensors="pt",
            truncation=True,
            padding=True,
            max_length=256,
        )

        with self._torch.no_grad():
            logits = self.model(**enc).logits
            probs = self._torch.softmax(logits, dim=-1).cpu().numpy()[0]

        p_clear = float(probs[0])
        p_confusing = float(probs[1])
        pred = "confusing" if int(np.argmax(probs)) == 1 else "clear"

        return {
            "prediction": pred,
            "confidence": round(max(p_clear, p_confusing), 4),
            "p_clear": round(p_clear, 4),
            "p_confusing": round(p_confusing, 4),
        }


    def predict_many(
        self,
        texts: list[str],
        audience_level: int = 1,
        domain: str = "general",
        batch_size: int = 32,
    ) -> list[dict]:
        """
        Score several texts with one forward pass per batch.

        A document is a list of sentences, and looping predict() over them
        re-tokenises and re-enters the graph once per sentence. On the CPU box
        this service runs on that is slow enough to be visible in the writing
        studio's live analysis, which is the whole reason this exists.

        Same audience_level and domain for every text: they come from one
        project, so batching across them is safe.
        """
        if not self.is_loaded:
            raise RuntimeError("Model is not loaded. Call load() first.")
        if not texts:
            return []

        aud = AUDIENCE_MAP.get(audience_level, "some")
        prompts = [
            f"AUDIENCE={aud} DOMAIN={domain} TEXT={t.strip()}"
            for t in texts
        ]

        results: list[dict] = []
        for start in range(0, len(prompts), batch_size):
            enc = self.tokenizer(
                prompts[start:start + batch_size],
                return_tensors="pt",
                truncation=True,
                padding=True,
                max_length=256,
            )
            with self._torch.no_grad():
                logits = self.model(**enc).logits
                probs = self._torch.softmax(logits, dim=-1).cpu().numpy()

            for row in probs:
                p_clear = float(row[0])
                p_confusing = float(row[1])
                results.append({
                    "prediction": "confusing" if p_confusing >= p_clear else "clear",
                    "confidence": round(max(p_clear, p_confusing), 4),
                    "p_clear": round(p_clear, 4),
                    "p_confusing": round(p_confusing, 4),
                })

        return results


# Module-level singleton — shared across the app
model_service = ModelService()
