"""
Voxplain ML FastAPI Service
===========================

Serves the DistilBERT text-clarity model over HTTP.

Run with:
    cd ml/
    uvicorn app.main:app --reload --port 8000

Then visit:
    http://localhost:8000/docs   — interactive Swagger docs
    http://localhost:8000/redoc  — ReDoc reference
"""

from contextlib import asynccontextmanager
import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .inference import model_service, LOAD_BERT_MODEL
from .metrics import analyze_technicality
from .audience_profile import infer_profile
from .models import (
    PredictRequest,
    PredictResponse,
    BatchPredictRequest,
    BatchPredictResponse,
    HealthResponse,
    MetricsRequest,
    MetricsResponse,
    AudienceProfileRequest,
    AudienceProfileResponse,
    SentenceAnalysisRequest,
    SentenceAnalysisResponse,
    ScoredSentence,
)
import re


# ── Lifespan (startup / shutdown) ───────────────────────────────


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load the ML model into memory at startup; free it on shutdown."""
    model_service.load()
    yield
    model_service.unload()


# ── App ─────────────────────────────────────────────────────────


app = FastAPI(
    title="Voxplain ML Service",
    description="Predicts whether a sentence/passage is **clear** or **confusing** for a given audience level.",
    version="1.0.0",
    lifespan=lifespan,
)


def normalize_origin(origin: str) -> str:
    return origin.strip().rstrip("/")


configured_origins = [
    normalize_origin(origin)
    for origin in os.getenv("ALLOWED_ORIGINS", "").split(",")
    if normalize_origin(origin)
]
local_dev_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

# CORS — allow requests from local dev plus configured deployment origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(dict.fromkeys([*configured_origins, *local_dev_origins])),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Routes ──────────────────────────────────────────────────────


@app.get("/health", response_model=HealthResponse)
def health():
    """Check if the service and model are operational."""
    return HealthResponse(
        status="ok",
        model_loaded=model_service.is_loaded if LOAD_BERT_MODEL else False,
        model_enabled=LOAD_BERT_MODEL,
    )


@app.post("/predict", response_model=PredictResponse)
def predict(req: PredictRequest):
    """
    Classify a single text as **clear** or **confusing**.

    The model considers the target `audience_level` and `domain` when scoring.
    """
    try:
        result = model_service.predict(
            text=req.text,
            audience_level=req.audience_level,
            domain=req.domain,
        )
        return PredictResponse(**result)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))


@app.post("/predict/batch", response_model=BatchPredictResponse)
def predict_batch(req: BatchPredictRequest):
    """
    Classify multiple texts in a single request (max 100).

    Useful for analyzing all sentences in a writing-studio document at once.
    """
    try:
        results = [
            PredictResponse(
                **model_service.predict(
                    text=item.text,
                    audience_level=item.audience_level,
                    domain=item.domain,
                )
            )
            for item in req.items
        ]
        return BatchPredictResponse(results=results)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))


@app.post("/analyze/metrics", response_model=MetricsResponse)
def analyze_metrics(req: MetricsRequest):
    """
    Analyze technicality using CPU-friendly metrics (no ML overhead).

    Computes:
      - Readability (Flesch-Kincaid grade, sentence length)
      - Jargon detection (domain-specific terms)
      - Sentence complexity (clauses, passive voice, nesting)
      - Definition frequency
      - Concept density
      - Composite technicality score + risk level

    Runs entirely on CPU with no GPU cost.
    """
    result = analyze_technicality(
        text=req.text,
        audience_level=req.audience_level,
        domain=req.domain,
    )
    return MetricsResponse(**result)


@app.post("/analyze/audience", response_model=AudienceProfileResponse)
def analyze_audience(req: AudienceProfileRequest):
    """
    Turn a free-text audience description into a level and a domain.

    "board of directors, non-technical, finance background" becomes
    level 0 in the finance domain. Rule-based and cheap; see
    audience_profile.py for why it is not a model yet.

    Nulls mean "no signal", never "assume 1" — the caller decides what to do
    with an unknown, and the UI shows the user what was inferred so they can
    override it.
    """
    return AudienceProfileResponse(**infer_profile(req.description))


# Same splitter metrics.py uses, so the two halves agree on what a sentence is.
_SENTENCE_SPLIT = re.compile(r"[.!?]+")

# Fragments shorter than this are titles, list items, and stray punctuation.
# Scoring them produces confident nonsense and drags the document average.
MIN_SENTENCE_WORDS = 4


@app.post("/analyze/sentences", response_model=SentenceAnalysisResponse)
def analyze_sentences(req: SentenceAnalysisRequest):
    """
    Score each sentence for confusingness at the target audience level.

    The sentence is the unit that matters: hotspots are sentences, and a
    single document-level number cannot tell a speaker which part to fix.

    503 when the model is not loaded — unlike /analyze/metrics there is no
    heuristic fallback here, and returning zeros would be a lie the caller
    could not detect. The server treats a 503 as "model unavailable" and
    falls back to the blended heuristic (Fix #3).
    """
    if not model_service.is_loaded:
        raise HTTPException(status_code=503, detail="model_not_loaded")

    candidates = [s.strip() for s in _SENTENCE_SPLIT.split(req.text) if s.strip()]
    sentences = [s for s in candidates if len(s.split()) >= MIN_SENTENCE_WORDS]
    skipped = len(candidates) - len(sentences)

    if not sentences:
        return SentenceAnalysisResponse(
            sentences=[], document_score=0.0, worst=[],
            model_version=model_service.version, skipped=skipped,
        )

    # One batched pass, not one call per sentence — see predict_many().
    preds = model_service.predict_many(
        sentences,
        audience_level=req.audience_level,
        domain=req.domain,
    )

    scored = [
        ScoredSentence(
            sentence=sentence,
            p_confusing=pred["p_confusing"],
            prediction=pred["prediction"],
        )
        for sentence, pred in zip(sentences, preds)
    ]

    document_score = round(sum(s.p_confusing for s in scored) / len(scored), 4)
    worst = sorted(scored, key=lambda s: -s.p_confusing)[:5]

    return SentenceAnalysisResponse(
        sentences=scored,
        document_score=document_score,
        worst=worst,
        model_version=model_service.version,
        skipped=skipped,
    )
