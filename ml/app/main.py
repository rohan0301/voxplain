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
from .models import (
    PredictRequest,
    PredictResponse,
    BatchPredictRequest,
    BatchPredictResponse,
    HealthResponse,
    MetricsRequest,
    MetricsResponse,
)


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
