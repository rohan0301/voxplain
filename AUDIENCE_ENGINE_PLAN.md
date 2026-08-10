# Audience Engine — Implementation Plan

Making the landing-page claim true: *"Voxplain grades your talk against the people hearing it."*

Everything here runs on the local DistilBERT in `ml/`. No external LLM APIs.

---

## 0. The situation, honestly

Before the fix list, three facts that determine the order of everything else.

**The local model has never been trained.** `ml/app/inference.py:11` points `MODEL_DIR` at `ml/model_distilbert`. That directory does not exist. `ModelService.load()` hits the `if not MODEL_DIR.exists()` branch at line 35, prints an error, and returns with `is_loaded = False`. `render.yaml:37` sets `LOAD_BERT_MODEL=false`, so in production it doesn't even try.

**Nothing calls the model anyway.** `ml/app/main.py` exposes `/predict` and `/predict/batch`, both already conditioned on audience and domain. Grep the whole repo: no caller. The server's `/api/analyze-technicality` (`server/src/index.ts:388`) only calls `/analyze/metrics`, which is `ml/app/metrics.py` — pure regex and word-list heuristics with no model in the path.

**The training data cannot train anything.** 21 rows in `ml/data/labels.jsonl`, split into 16/2/3. The first two rows of `train.jsonl` are byte-identical duplicates. A 2-row validation set produces an F1 that is one of about four possible values. `train_bert.py:120` says so in a comment: *"With tiny data, keep it small and just prove the pipeline. Expect overfitting and noisy metrics."*

So the audience feature today is: a threshold lookup table (`server/src/services/technicality.ts:207`) plus two hardcoded word lists. That is not nothing — it is a reasonable v0 — but it is not a model, and the data problem is the real bottleneck. **Phase 1 is the long pole.** Everything else is wiring that can be done in a day or two.

The good news: `train_bert.py:44` already formats inputs as `AUDIENCE={aud} DOMAIN={domain} TEXT={text}`, and `inference.py:74` uses the identical format at predict time. The audience conditioning is designed correctly. It just needs data and a caller.

---

## Phase 1 — Training data (do this first, it gates everything)

**Target: 800–1500 labeled sentences before you trust the model. 300 is enough to stop embarrassing yourself.**

The label is binary: `0 = clear`, `1 = confusing`, *for the given audience level*. The same sentence should appear with different labels at different levels — that is the entire signal you are trying to teach. Your current data barely does this.

### 1.1 Fix the label sink first

`server/src/index.ts:18`:

```ts
const LABELS_PATH = path.join(__dirname, "..", "data", "labels.jsonl");
```

Appending to local disk. On Render's free tier the filesystem is ephemeral — every deploy and every cold start wipes it. **Any label a user submits in production is already being lost.**

Move labels to Postgres. Add to `supabase/recordings.sql`:

```sql
create table if not exists public.labels (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users(id) on delete set null,
    text text not null,
    label smallint not null check (label in (0, 1)),
    audience_level smallint check (audience_level between 0 and 3),
    domain text not null default 'general',
    project_id text,
    source text not null default 'human',   -- 'human' | 'synthetic' | 'heuristic'
    created_at timestamptz not null default timezone('utc', now())
);

create index if not exists labels_created_at_idx on public.labels (created_at desc);
create index if not exists labels_level_domain_idx on public.labels (audience_level, domain);

alter table public.labels enable row level security;

-- Users insert their own; only service role reads the full set for training.
drop policy if exists "Users can insert their own labels" on public.labels;
create policy "Users can insert their own labels"
    on public.labels for insert to authenticated
    with check (auth.uid() = user_id);
```

Rewrite the `/api/labels` handler to insert via `supabaseAdmin` instead of `fs.appendFileSync`, and attach `user_id` from `(req as any).user.id`. Note the existing route is `requireAuth`-protected, which fails open when Supabase env vars are missing (see Fix #7) — with the DB write it will fail loudly instead, which is what you want.

Then add an export script, `ml/data/pull_labels.py`:

```python
"""Pull labels from Supabase into labels.jsonl for training."""
import json, os
from pathlib import Path
from supabase import create_client

OUT = Path(__file__).parent / "labels.jsonl"

client = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])

rows, page, size = [], 0, 1000
while True:
    resp = client.table("labels").select("*").range(page * size, (page + 1) * size - 1).execute()
    if not resp.data:
        break
    rows.extend(resp.data)
    page += 1

with OUT.open("w", encoding="utf-8") as f:
    for r in rows:
        f.write(json.dumps({
            "text": r["text"],
            "label": r["label"],
            "audienceLevel": r["audience_level"] if r["audience_level"] is not None else 1,
            "domain": r["domain"],
            "source": r["source"],
        }) + "\n")

print(f"Wrote {len(rows)} labels to {OUT}")
```

Add `supabase>=2.0.0` to `ml/requirements-train.txt`.

### 1.2 Bootstrap with synthetic pairs

You need volume fast. The highest-value examples are **minimal pairs**: the same idea written two ways, labeled per audience level.

Create `ml/data/seed_synthetic.py`. The pattern:

```python
# Each entry: one concept, a jargon-heavy phrasing and a plain phrasing.
PAIRS = [
    {
        "domain": "tech",
        "jargon": "We use RAG with a reranker over a vector store to ground responses.",
        "plain":  "Before answering, the system searches our documents and uses what it finds, so answers stay tied to real sources.",
    },
    {
        "domain": "finance",
        "jargon": "The book carries material convexity exposure under a parallel shift.",
        "plain":  "If interest rates move, our losses grow faster than our gains — the risk is lopsided.",
    },
    {
        "domain": "medical",
        "jargon": "Patients presented with idiopathic dyspnea refractory to bronchodilators.",
        "plain":  "Patients were short of breath, we don't know why, and the usual inhalers didn't help.",
    },
]

# Labeling rule, encoding the actual product thesis:
#   jargon phrasing → confusing for novice(0) and some(1), clear for strong(2) and expert(3)
#   plain phrasing  → clear at every level
def expand(pair):
    out = []
    for level in (0, 1, 2, 3):
        out.append({"text": pair["jargon"], "label": 1 if level <= 1 else 0,
                    "audienceLevel": level, "domain": pair["domain"], "source": "synthetic"})
        out.append({"text": pair["plain"], "label": 0,
                    "audienceLevel": level, "domain": pair["domain"], "source": "synthetic"})
    return out
```

Write 60–100 pairs across `tech`, `finance`, `medical`, `general`. At 8 rows per pair that is 480–800 examples. Two evenings of work, and it directly teaches the level-dependence.

**Do not train on synthetic data alone.** It teaches the rule you already wrote, so the model will look excellent and generalize poorly. Track `source` in the DB precisely so you can measure this — hold out a human-labeled-only test set and report metrics on *that*.

### 1.3 Build the labeling UI (the thing that actually scales)

`client/src/api.ts:404` already has `saveLabel()`. Nothing calls it. Add a review surface where every flagged hotspot gets 👍 / 👎 buttons:

```tsx
// In the hotspot list — App.tsx around line 761, and AnalysisPanel.tsx
<div className="flex gap-2 mt-2">
  <button onClick={() => saveLabel({
      text: hotspot.sentence, label: 1,
      audienceLevel: activeProject?.audienceLevel, domain: activeProject?.domain,
      projectId: activeProject?.id,
    })}
    className="text-xs text-slate-500 hover:text-slate-900">
    Yes, too dense
  </button>
  <button onClick={() => saveLabel({ text: hotspot.sentence, label: 0, /* …same */ })}
    className="text-xs text-slate-500 hover:text-slate-900">
    No, this is fine
  </button>
</div>
```

Every correction becomes a training row, tagged with the audience level it was judged against. This is the only mechanism here that improves the model while you sleep — build it early even though the model isn't trained yet.

**Also label the sentences that were *not* flagged.** A model trained only on flagged text learns from a biased sample. `AnalysisPanel.tsx:130` already computes non-hotspot sentences — surface a few per analysis for confirmation.

### 1.4 Deduplicate and split properly

`ml/data/split.py` does a random 80/10/10 with `RANDOM_SEED = 42`. Two problems: it does not deduplicate (your train set has literal duplicates today), and random splitting leaks. The same sentence at four audience levels lands across train *and* test, so the model can memorize the sentence and score well without learning the level-dependence.

Rewrite the split to be **grouped by text**: all rows sharing a `text` go to the same split.

```python
import hashlib
from collections import defaultdict

def group_key(row):
    return hashlib.sha1(row["text"].strip().lower().encode()).hexdigest()

def split_grouped(rows, seed=42, fracs=(0.8, 0.1, 0.1)):
    groups = defaultdict(list)
    for r in rows:
        groups[group_key(r)].append(r)
    keys = sorted(groups)                      # sorted → deterministic
    random.Random(seed).shuffle(keys)
    n = len(keys)
    n_train, n_val = int(n * fracs[0]), int(n * fracs[1])
    buckets = (keys[:n_train], keys[n_train:n_train + n_val], keys[n_train + n_val:])
    return [[r for k in bucket for r in groups[k]] for bucket in buckets]
```

Also drop exact `(text, audienceLevel, domain, label)` duplicates before splitting, and log any `(text, audienceLevel, domain)` that appears with *both* labels — those are annotator disagreements and you should resolve them by hand.

### 1.5 Train

```bash
cd ml
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-train.txt
python data/pull_labels.py        # needs SUPABASE_* env vars
python data/split.py
python train_bert.py
```

`train_bert.py` is sound. Once you are past ~500 rows, change these:

- `num_train_epochs=6` → `3`. Six epochs on a small set overfits hard.
- Add `per_device_train_batch_size=16` once you have the volume.
- Add class weighting if labels skew — check the ratio first; hotspot-sourced labels will skew toward `1`.

Sanity gate before wiring it in: **the model must beat the existing heuristic on a human-labeled test set.** If it doesn't, keep the heuristic and go collect more data. Write `ml/eval_compare.py` that scores both on the same held-out rows and prints accuracy/F1 side by side. Do not skip this — the entire justification for the model is that it beats what you already have.

---

## Phase 2 — Wire the model into scoring

Currently `/api/analyze-technicality` blends the Node heuristic 50/50 with `/analyze/metrics` (`server/src/index.ts:424`). Both halves are heuristics. Add the model as a third signal — and make it the primary one once it earns that.

### 2.1 New endpoint: per-sentence audience scoring

The unit that matters is the sentence, because hotspots are sentences. Add to `ml/app/main.py`:

```python
@app.post("/analyze/sentences", response_model=SentenceAnalysisResponse)
def analyze_sentences(req: SentenceAnalysisRequest):
    """Score each sentence for confusingness at the target audience level."""
    if not model_service.is_loaded:
        raise HTTPException(status_code=503, detail="model_not_loaded")

    sentences = split_sentences(req.text)
    results = []
    for s in sentences:
        if len(s.split()) < 4:          # skip fragments
            continue
        pred = model_service.predict(s, req.audience_level, req.domain)
        results.append({
            "sentence": s,
            "p_confusing": pred["p_confusing"],
            "prediction": pred["prediction"],
        })

    scores = [r["p_confusing"] for r in results] or [0.0]
    return SentenceAnalysisResponse(
        sentences=results,
        document_score=round(sum(scores) / len(scores), 4),
        worst=sorted(results, key=lambda r: -r["p_confusing"])[:5],
        model_version=model_service.version,
    )
```

Use one batched forward pass rather than a loop — `predict_batch` already exists at `main.py:113`; give `ModelService` a `predict_many()` that tokenizes the whole list with `padding=True` and does a single `model(**enc)`. Sentence-at-a-time on CPU will be slow enough to notice in the writing studio's live analysis.

Add a `version` attribute to `ModelService`, read from a `version.txt` you write in `train_bert.py`. You need to know which model produced which score.

### 2.2 Blend, then take over

In `server/src/index.ts`, replace the 50/50 blend with a three-way that degrades cleanly:

```ts
// Weights depend on what's actually available.
const signals: Array<{ score: number; weight: number }> = [
    { score: heuristicScore, weight: 0.3 },
];
if (metrics) signals.push({ score: metrics.technicality_score * 100, weight: 0.2 });
if (modelResult) signals.push({ score: modelResult.document_score * 100, weight: 0.5 });

const totalWeight = signals.reduce((a, s) => a + s.weight, 0);
const blended = Math.round(signals.reduce((a, s) => a + s.score * s.weight, 0) / totalWeight);
```

Renormalizing by `totalWeight` is what makes a missing signal degrade instead of silently deflating the score — which is exactly the bug in Fix #3 below.

Hotspots should then come from the model's `worst` list, with the heuristic's `reasons`/`suggestions` attached where the sentences match.

---

## Phase 3 — The six fixes

### Fix #1 — "Audience Description" does nothing

**Problem.** `CreateProjectModal.tsx:86` and `EditProjectModal.tsx:99` collect free text. `App.tsx:160` stores it. `api.ts:140` persists it. No analyzer ever reads it. A user writes "board of directors, non-technical, finance background" and nothing happens.

**Fix.** Derive `audienceLevel` and `domain` from the description, show the user what was inferred, and let them override.

Add `ml/app/audience_profile.py`:

```python
"""Infer audience level + domain from a free-text audience description."""
import re

LEVEL_CUES = {
    0: ["non-technical", "nontechnical", "general public", "layperson", "board",
        "executives", "investors", "customers", "students", "press", "journalists"],
    1: ["managers", "product", "stakeholders", "mixed", "cross-functional", "sales"],
    2: ["engineers", "developers", "analysts", "practitioners", "technical team"],
    3: ["researchers", "phd", "experts", "peers", "specialists", "principal"],
}

DOMAIN_CUES = {
    "tech":      ["engineer", "developer", "software", "ml", "ai", "data", "infra", "security"],
    "finance":   ["finance", "investor", "trading", "banking", "portfolio", "risk", "cfo"],
    "medical":   ["clinical", "doctor", "physician", "nurse", "patient", "medical", "health"],
}

def infer_profile(description: str) -> dict:
    if not description or not description.strip():
        return {"audience_level": None, "domain": None, "confidence": 0.0, "matched": []}

    text = description.lower()
    matched, level_hits = [], {}

    for level, cues in LEVEL_CUES.items():
        hits = [c for c in cues if re.search(rf"\b{re.escape(c)}\b", text)]
        if hits:
            level_hits[level] = len(hits)
            matched.extend(hits)

    domain_hits = {
        d: sum(1 for c in cues if re.search(rf"\b{re.escape(c)}\b", text))
        for d, cues in DOMAIN_CUES.items()
    }
    domain = max(domain_hits, key=domain_hits.get) if any(domain_hits.values()) else None

    if not level_hits:
        return {"audience_level": None, "domain": domain, "confidence": 0.0, "matched": matched}

    # Lowest matched level wins — mixed rooms are limited by their least technical member.
    level = min(level_hits)
    confidence = min(1.0, sum(level_hits.values()) / 3)
    return {"audience_level": level, "domain": domain,
            "confidence": round(confidence, 2), "matched": matched}
```

The `min(level_hits)` choice is deliberate and worth keeping: "engineers and some board members" should be scored for the board members.

Expose it as `POST /analyze/audience`, call it from the project modals on blur, and render the inference inline:

```tsx
{inferred && (
  <p className="text-sm text-slate-600 mt-2">
    Detected: <strong>{LEVEL_LABELS[inferred.audience_level]}</strong>
    {inferred.domain && <> · <strong>{inferred.domain}</strong></>}
    <button onClick={() => setShowOverride(true)} className="ml-2 text-brand-600">change</button>
  </p>
)}
```

**Upgrade path when you have data.** Once you are logging `(description, level_the_user_kept)` pairs, fine-tune a second DistilBERT head for 4-class level classification and swap the rule engine for it behind the same endpoint. Keep the rules as the fallback for when the model is unavailable. Don't start here — the rules are genuinely fine until you have a few hundred descriptions.

**Verify:** create a project with "board of directors, non-technical" → the form should show Novice/finance, and analysis should use level 0.

---

### Fix #2 — Domain only affects half the score

**Problem.** `metrics.py:169` picks the right list from `DOMAIN_JARGON` (`tech`, `finance`, `medical`, `healthcare`). But the Node analyzer — the other half of the blend — scores against `COMMON_TECHNICAL_TERMS` (`technicality.ts:19`), a single ~400-entry set that is almost entirely AI/ML and web infra. There is no medical or finance vocabulary in it. A cardiology talk gets half its score from a list containing `react` and `kubernetes`.

The generic heuristics at `technicality.ts:112-128` (all-caps acronyms, camelCase, letter+digit) catch some medical acronyms incidentally, so it isn't zero — but the seed glossary contributes nothing.

Also: `Project.domain` allows `"general"` and `"other"`, neither a `DOMAIN_JARGON` key, so both hit the `else` at `metrics.py:189` and use the union of all lists. Defensible, but accidental.

**Fix — one source of truth.** Move the vocabularies to a shared JSON both services read.

Create `shared/jargon/{tech,finance,medical,general}.json`:

```json
{
  "domain": "medical",
  "version": "2026-08-08",
  "terms": ["dyspnea", "idiopathic", "refractory", "bronchodilator", "..."]
}
```

Python (`metrics.py`) loads them into `DOMAIN_JARGON` at import. Node (`technicality.ts`) loads them at boot:

```ts
const JARGON_DIR = path.join(__dirname, '../../../shared/jargon');

function loadDomainTerms(domain: string): Set<string> {
    const file = path.join(JARGON_DIR, `${normalizeDomain(domain)}.json`);
    const fallback = path.join(JARGON_DIR, 'general.json');
    const target = fs.existsSync(file) ? file : fallback;
    return new Set(JSON.parse(fs.readFileSync(target, 'utf8')).terms);
}

// 'general' and 'other' → union of all domains (make this explicit, not accidental)
function normalizeDomain(d?: string): string {
    if (!d || d === 'general' || d === 'other') return 'all';
    if (d === 'healthcare') return 'medical';
    return d;
}
```

Then thread `domain` into `analyzeTechnicality` — it currently isn't even a parameter (`AnalyzeInput`, `technicality.ts:3`). Add it, and select the term set per call instead of using the module-level constant.

Build the medical and finance lists from public sources (MeSH terms, an investopedia glossary dump) — a few hundred terms each is plenty. Bundle the directory in both deploys; add it to the Docker context / Render `rootDir` considerations, since `server` and `ml` have separate roots.

**Verify:** analyze the same medical paragraph with `domain: "tech"` vs `domain: "medical"`. The scores must differ. Today they don't.

---

### Fix #3 — ML service down = domain silently stops mattering

**Problem.** `server/src/index.ts:441` catches metrics failures and logs a warning. Since domain is used *only* by the ML half, an unreachable `ML_SERVICE_URL` means domain has zero effect — and the client shows a normal-looking score with no indication anything degraded. Render free tier cold-starts, so this is a routine state, not an edge case.

Worse, the blend at line 424 is `result.technicalLoadScore * 0.5 + metricsInfluence` — when metrics are missing, the code skips the blend entirely and returns the raw heuristic. Two different scales presented identically.

**Fix.** Make degradation explicit end to end.

```ts
type AnalysisMode = 'model' | 'metrics' | 'heuristic';

const degraded: string[] = [];
let mode: AnalysisMode = 'heuristic';

// …after attempting each signal
if (modelResult) mode = 'model';
else if (metrics) mode = 'metrics';
else degraded.push('ml_service_unreachable');

res.json({
  technicality: result,
  analysis: { mode, degraded, modelVersion: modelResult?.model_version ?? null },
});
```

Add to `TechnicalityResult` in `client/src/api.ts` and render a banner when `mode !== 'model'`:

> Scored with fallback heuristics — the analysis service is unavailable, so domain-specific terms and audience modeling aren't being applied.

Two supporting changes:
- Add a startup + 60s-interval health poll of `ML_SERVICE_URL/health` in the server, so `mode` is known before a request rather than discovered during one.
- `ml/app/main.py:88` returns `model_loaded: false` when `LOAD_BERT_MODEL` is off. Surface that distinctly — "model disabled" and "service down" are different problems.

**Verify:** stop the ML service, run an analysis, confirm the banner appears and `mode: "heuristic"` comes back.

---

### Fix #4 — Audience level silently defaults to 1

**Problem.** Three independent defaults to "Some Familiarity": `technicality.ts:94` (`audienceLevel = 1`), `WritingStudioPage.tsx:58`, `metrics.py:357`. `Project.audienceLevel` is optional, and the transcribe view runs with no project at all. So the product whose pitch is "graded against your audience" routinely invents the audience without saying so.

**Fix.** Keep a default — failing hard would be worse UX — but make it visible and traceable.

Server:

```ts
const resolvedLevel: AudienceLevel = typeof audienceLevel === 'number' ? audienceLevel : 1;
const levelSource: 'project' | 'inferred' | 'default' =
    typeof audienceLevel === 'number' ? 'project' : 'default';
```

Return `audienceLevel` and `audienceLevelSource` in the response. In the UI, wherever the score is shown, name the audience it was scored against:

```tsx
<p className="text-sm text-slate-500">
  Scored for a <strong>{LEVEL_LABELS[audienceLevel]}</strong> audience
  {audienceLevelSource === 'default' && (
    <> — <button onClick={openAudiencePicker} className="text-brand-600">set your audience</button> for accurate results</>
  )}
</p>
```

`WritingStudioPage.tsx:153` already renders `{['Novice','Familiar','Strong','Expert'][audienceLevel]} Audience`. Extend that pattern to the transcribe/report view, which has no such indicator.

Also: make `audienceLevel` non-optional on new projects (`CreateProjectModal.tsx:18` already defaults the select to `1`, so just persist it always), and backfill existing rows with a migration setting `audience_level = 1` where null — so "unset" stops being ambiguous with "deliberately level 1".

**Verify:** analyze with no project selected → response says `audienceLevelSource: "default"` and the UI prompts to set an audience.

---

### Fix #5 — The "fix" is generic advice, not a rewrite

**Problem.** `technicality.ts:252-268` emits three canned strings: `"Split into multiple sentences"`, `"Define terms immediately"`, `"Add an explanation or easier synonym"`. They do not vary by audience level. `metrics.py:434` (`_generate_recommendations`) at least reads `audience_level`, but still returns templates. The landing page promises flagged sentences come "with a fix."

**Fix, in two stages.**

**Stage A — glossary substitution (no new model, ship this now).** Extend the shared jargon JSON with plain-language equivalents:

```json
{
  "term": "RAG",
  "aliases": ["retrieval augmented generation"],
  "plain": {
    "0": "the system looks things up in our documents before answering",
    "1": "retrieval — it searches our docs, then answers using what it finds",
    "2": "retrieval-augmented generation"
  }
}
```

For each hotspot, find its terms in the glossary and build a concrete suggestion:

> Replace **RAG** with "the system looks things up in our documents before answering" — your audience is Novice.

This is mechanical, fully local, and covers the terms that actually recur in your users' talks. Prioritize the 100 most frequent terms in your labels table.

**Stage B — local generative rewrite.** DistilBERT is a classifier; it cannot rewrite. To generate text locally, add a small seq2seq — `flan-t5-small` (~300MB, CPU-viable) or `flan-t5-base` (~1GB) if you have the memory.

```python
# ml/app/rewriter.py
from transformers import AutoTokenizer, AutoModelForSeq2SeqLM

REWRITER_DIR = Path(__file__).resolve().parent.parent / "model_rewriter"

AUDIENCE_INSTRUCTION = {
    0: "Rewrite for someone with no technical background. Replace every technical term with plain words.",
    1: "Rewrite for a general professional audience. Briefly define technical terms inline.",
    2: "Rewrite more clearly for a technical audience. Keep the terminology, reduce sentence complexity.",
    3: "Tighten this for expert peers. Keep precision, remove redundancy.",
}

class Rewriter:
    def rewrite(self, sentence: str, audience_level: int, domain: str) -> str:
        prompt = f"{AUDIENCE_INSTRUCTION[audience_level]}\nDomain: {domain}\nSentence: {sentence}\nRewrite:"
        enc = self.tokenizer(prompt, return_tensors="pt", truncation=True, max_length=256)
        out = self.model.generate(**enc, max_new_tokens=80, num_beams=4, no_repeat_ngram_size=3)
        return self.tokenizer.decode(out[0], skip_special_tokens=True)
```

Off-the-shelf `flan-t5-small` will be mediocre. Fine-tune it on your minimal pairs from §1.2 — that dataset is *already* a rewrite corpus (`jargon` → `plain` is exactly the supervision signal), which is a second reason to build it properly. `ml/train_rewriter.py` mirrors `train_bert.py` with `AutoModelForSeq2SeqLM` and `Seq2SeqTrainer`.

Two guardrails, both non-negotiable:
- **Always present rewrites as suggestions in a diff view**, never auto-apply. A small local model will sometimes produce nonsense.
- **Validate the output before showing it**: non-empty, not a verbatim copy of the input, within 0.5–2× the original length, and — cheaply — re-score it with the classifier and only show it if `p_confusing` actually dropped. If it fails, fall back to Stage A. This is the single highest-leverage check in the whole plan; a "fix" that scores worse than the original destroys trust instantly.

Serve at `POST /rewrite` with the model lazy-loaded behind a `LOAD_REWRITER` flag, mirroring `LOAD_BERT_MODEL`.

**Verify:** a Novice-audience hotspot returns a rewrite that (a) differs from the input, (b) scores lower `p_confusing` than the original.

---

### Fix #6 — No way to compare one script across two audiences

**Problem.** The headline promise is "the same script that lands with engineers gets rewritten before you take it to the board." Today the level lives on the project, so comparing means editing the project and losing the prior result.

**Fix.** The analysis endpoint is already stateless with respect to audience — `audienceLevel` is just a request parameter. So this is almost entirely UI.

Add `POST /api/analyze-technicality/compare` taking `levels: AudienceLevel[]`, running the analysis per level (reusing one sentence-split and one tokenization pass), and returning a map. With the batched model call this is roughly the cost of one analysis, not four.

```ts
{
  "results": {
    "0": { "technicalLoadScore": 78, "audienceThreshold": 20, "status": "above", "hotspots": [...] },
    "2": { "technicalLoadScore": 78, "audienceThreshold": 60, "status": "near",  "hotspots": [...] }
  }
}
```

Note what this makes visible: the *score* is largely audience-independent under the current heuristic, while the *threshold* moves (20/40/60/80 at `technicality.ts:207`). Once the model is in the blend the score itself becomes audience-sensitive, because `predict()` conditions on `AUDIENCE=`. **The compare view is therefore the clearest demonstration that the model is doing real work** — build it right after Phase 2 and use it as your own smoke test.

UI: an audience switcher above the results, and a two-column diff highlighting sentences that are fine for one audience and flagged for the other. That specific list — "these 6 sentences work for engineers but will lose the board" — is the product.

---

### Fix #7 — Dead scoring code and other cleanups

**Dead code (real, verified).** `technicality.ts:198-205` computes `rawScore` from density, clump penalties, and an `explainedRate * 0.4` discount. Line 219 then does `rawScore = (density * 300)`, discarding all of it, and recomputes with different constants and a `0.3` discount. **The entire first block has no effect on output.** Anyone tuning it will see nothing change. Delete lines 198-205 and the stale comment block at 216-222, keeping only the second computation.

While you are in the file, the scoring constants (`300`, `4`, `15`, `0.3`) and the threshold map should move to a named config object — you will be tuning these against the model's output, and hunting magic numbers mid-file will waste your time.

**Unused parameters.** `words` and `requiredTimeSec` are destructured at `technicality.ts:94` and never used. Either drop them from `AnalyzeInput` or implement the pacing check they were presumably for.

**Auth fails open.** `server/src/middleware/auth.ts:12` calls `next()` with no user when `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` are unset. Fine for local dev, but if either is missing in production `requireAuth` is a no-op. The recordings routes re-check `authReq.user?.id`, but `/api/labels` (`index.ts:172`) does not — it is fully open in that state, which matters more once labels are training data and an attacker can poison them. Gate the permissive branch on `NODE_ENV !== 'production'`.

**Unauthenticated compute endpoints.** `/api/transcribe`, `/api/analyze-technicality`, and `/api/analyze/metrics` have no auth at all. Anyone can burn your AssemblyAI credits and ML CPU. Add `requireAuth` or a rate limit before this is public.

---

## Phase 4 — Deployment

`render.yaml` needs updating once the model exists:

- **`LOAD_BERT_MODEL`** — currently hardcoded `false` at line 37. Flip to `true`.
- **Model artifacts.** `model_distilbert/` will be ~250MB and must not go in git. Options, in order of preference: (a) commit via Git LFS, (b) download from Supabase Storage on startup in `ModelService.load()`, (c) bake into a Docker image. Option (b) fits your stack — you already have a private bucket and a service-role key.
- **Memory.** Render's free tier is 512MB. DistilBERT plus PyTorch plus FastAPI will be tight; adding `flan-t5-small` will not fit. Budget for the paid tier before Stage B of Fix #5.
- **Cold starts.** Free-tier spin-down means the first analysis after idle waits for a container *and* a model load. Fix #3's degradation banner is what keeps this from looking broken.
- **`requirements.txt`** (line 1-4) has no `torch`/`transformers` — only `requirements-train.txt` does. Serving the model needs them in the runtime requirements. Use the CPU-only torch wheel to keep the image small:
  ```
  --extra-index-url https://download.pytorch.org/whl/cpu
  torch>=2.0.0
  transformers>=4.40.0
  ```

---

## Suggested order

| # | Task | Depends on | Rough effort |
|---|------|-----------|--------------|
| 1 | Fix #7 dead code + auth fail-open | — | 1h |
| 2 | Fix #4 audience-level transparency | — | 2h |
| 3 | Fix #3 degradation signalling | — | 3h |
| 4 | §1.1 labels → Postgres | — | 3h |
| 5 | §1.3 labeling UI | 4 | 4h |
| 6 | Fix #1 audience description → profile | — | 4h |
| 7 | Fix #2 shared domain vocabularies | — | 1 day |
| 8 | Fix #5 Stage A glossary substitution | 7 | 4h |
| 9 | §1.2 synthetic pairs (60–100) | — | 2 evenings |
| 10 | §1.4 grouped split + dedup | 9 | 2h |
| 11 | §1.5 train + `eval_compare.py` gate | 10 | 1 day |
| 12 | Phase 2 wire model into scoring | 11 | 1 day |
| 13 | Fix #6 compare view | 12 | 1 day |
| 14 | Fix #5 Stage B local rewriter | 12 | 2–3 days |

Items 1–8 need no model and make the current heuristic honest — do them first regardless. Items 9–11 are the real investment. Do not start 12 until `eval_compare.py` shows the model beating the heuristic on human-labeled data.

## What "done" means

- [ ] Audience description changes the analysis, visibly
- [ ] Two domains produce different scores for the same text
- [ ] ML service down → user sees it, score is still coherent
- [ ] Every score names the audience it was computed for
- [ ] Every hotspot offers a concrete replacement, validated to score better
- [ ] One script can be compared across two audiences side by side
- [ ] `model_distilbert/` exists, is loaded in prod, and beats the heuristic on held-out human labels
