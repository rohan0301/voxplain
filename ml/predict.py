import argparse
import numpy as np
from pathlib import Path
from transformers import AutoTokenizer, AutoModelForSequenceClassification
import torch


MODEL_DIR = Path(__file__).parent / "model_distilbert"

def audience_level_to_text(level):
    try:
        lvl = int(level)
    except Exception:
        lvl = 1
    mapping = {0: "novice", 1: "some", 2: "strong", 3: "expert"}
    return mapping.get(lvl, "some")

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("text", type=str, help="Sentence to score")
    parser.add_argument("--audienceLevel", type=int, default=1, help="0 novice, 1 some, 2 strong, 3 expert")
    parser.add_argument("--domain", type=str, default="general", help="e.g. tech, finance, healthcare")
    args = parser.parse_args()

    aud = audience_level_to_text(args.audienceLevel)
    prompt = f"AUDIENCE={aud} DOMAIN={args.domain} TEXT={args.text.strip()}"

    tokenizer = AutoTokenizer.from_pretrained(str(MODEL_DIR))
    model = AutoModelForSequenceClassification.from_pretrained(str(MODEL_DIR))
    model.eval()

    enc = tokenizer(prompt, return_tensors="pt", truncation=True, padding=True, max_length=256)
    with torch.no_grad():
        logits = model(**enc).logits
        probs = torch.softmax(logits, dim=-1).cpu().numpy()[0]

    # Label convention: 0 = clear, 1 = confusing
    p_clear = float(probs[0])
    p_confusing = float(probs[1])
    pred = int(np.argmax(probs))

    print("Input:", prompt)
    print(f"p(clear)= {p_clear:.3f}")
    print(f"p(confusing)= {p_confusing:.3f}")
    print("pred:", "CONFUSING" if pred == 1 else "CLEAR")


if __name__ == "__main__":
    main()
