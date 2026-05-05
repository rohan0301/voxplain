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
        self.is_loaded = True
        print("[ModelService] Model loaded successfully.")

    def unload(self) -> None:
        """Release model resources."""
        self.model = None
        self.tokenizer = None
        self._torch = None
        self.is_loaded = False
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


# Module-level singleton — shared across the app
model_service = ModelService()
