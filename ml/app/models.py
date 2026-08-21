"""
Pydantic models for request/response validation.

FastAPI uses these to:
  - Parse and validate incoming JSON bodies automatically
  - Generate OpenAPI (Swagger) documentation at /docs
  - Return typed, structured JSON responses
"""

from pydantic import BaseModel, Field
from typing import Literal, List, Optional


# ── Request Models ──────────────────────────────────────────────


class PredictRequest(BaseModel):
    """Request body for a single prediction."""

    text: str = Field(
        ...,
        min_length=1,
        description="The sentence or passage to classify as clear or confusing.",
        examples=["Quantum entanglement enables instantaneous state correlation."],
    )
    audience_level: int = Field(
        default=1,
        ge=0,
        le=3,
        description="Target audience expertise: 0 = novice, 1 = some knowledge, 2 = strong background, 3 = expert.",
    )
    domain: str = Field(
        default="general",
        description="Subject domain, e.g. 'tech', 'finance', 'healthcare', 'general'.",
        examples=["tech", "finance", "general"],
    )


class BatchPredictRequest(BaseModel):
    """Request body for batch predictions (multiple sentences at once)."""

    items: List[PredictRequest] = Field(
        ...,
        min_length=1,
        max_length=100,
        description="List of prediction requests (max 100).",
    )


# ── Response Models ─────────────────────────────────────────────


class PredictResponse(BaseModel):
    """Response for a single prediction."""

    prediction: Literal["clear", "confusing"] = Field(
        description="The model's classification."
    )
    confidence: float = Field(
        ge=0.0,
        le=1.0,
        description="Confidence of the predicted class (higher = more certain).",
    )
    p_clear: float = Field(description="Probability that the text is clear.")
    p_confusing: float = Field(description="Probability that the text is confusing.")


class BatchPredictResponse(BaseModel):
    """Response for batch predictions."""

    results: List[PredictResponse]


class HealthResponse(BaseModel):
    """Response for the health check endpoint."""

    status: str
    model_loaded: bool
    # Whether this service is *meant* to load the model (LOAD_BERT_MODEL).
    # Without it, model_loaded=False is ambiguous: the model being switched
    # off and the model failing to load look identical to callers, and they
    # are different problems. The server distinguishes them for the
    # degradation banner (Fix #3).
    model_enabled: bool = False


# ── Technicality Metrics Models ─────────────────────────────────


class MetricsRequest(BaseModel):
    """Request for technicality metrics analysis."""

    text: str = Field(
        ...,
        min_length=1,
        description="The text to analyze for technicality/confusion.",
    )
    audience_level: int = Field(
        default=1,
        ge=0,
        le=3,
        description="Target audience expertise: 0 = novice, 1 = some knowledge, 2 = strong background, 3 = expert.",
    )
    domain: str = Field(
        default="general",
        description="Subject domain, e.g. 'tech', 'finance', 'medical', 'general'.",
        examples=["tech", "finance", "general"],
    )


class MetricsResponse(BaseModel):
    """Detailed metrics response (all CPU-based, no ML)."""

    readability: dict
    jargon: dict
    sentence_complexity: dict
    definitions: dict
    concept_density: dict
    technicality_score: float = Field(
        description="Composite score 0-1 where 0=easy and 1=highly confusing."
    )
    risk_level: str = Field(description="'low', 'medium', or 'high'.")
    recommendations: List[str]


# ── Audience Profile Models (Fix #1) ────────────────────────────


class AudienceProfileRequest(BaseModel):
    """Request to infer an audience profile from free text."""

    description: str = Field(
        default="",
        description="Free-text audience description, e.g. 'board of directors, non-technical'.",
        examples=["board of directors, non-technical, finance background"],
    )


class AudienceProfileResponse(BaseModel):
    """Inferred audience profile.

    `audience_level` and `domain` are null when nothing matched. Null means
    "unknown" and callers must not quietly substitute a number for it — see
    Fix #4: a score computed against an invented audience has to say so.
    """

    audience_level: Optional[int] = Field(
        default=None,
        ge=0,
        le=3,
        description="Inferred level, or null when the description gave no signal.",
    )
    domain: Optional[str] = Field(
        default=None,
        description="Inferred domain, or null when no domain cue was found.",
    )
    confidence: float = Field(
        default=0.0,
        ge=0.0,
        le=1.0,
        description="0-1, based on how many cues matched. Not a probability.",
    )
    matched: List[str] = Field(
        default_factory=list,
        description="The cue phrases found, so the UI can show its work.",
    )


# ── Sentence Analysis Models (Phase 2) ──────────────────────────


class SentenceAnalysisRequest(BaseModel):
    """Request to score each sentence of a passage for the target audience."""

    text: str = Field(..., min_length=1, description="The passage to analyze.")
    audience_level: int = Field(default=1, ge=0, le=3)
    domain: str = Field(default="general")


class ScoredSentence(BaseModel):
    """One sentence and what the model made of it."""

    sentence: str
    p_confusing: float = Field(description="0-1 probability the model assigns to 'confusing'.")
    prediction: str = Field(description="'clear' or 'confusing'.")


class SentenceAnalysisResponse(BaseModel):
    """Per-sentence scores plus a document roll-up.

    `model_version` is not decoration: scores from two different training runs
    are not comparable, and without it a stored score cannot be interpreted
    later. It is null only if the artifact predates version stamping.
    """

    sentences: List[ScoredSentence]
    document_score: float = Field(description="Mean p_confusing across scored sentences.")
    worst: List[ScoredSentence] = Field(description="Up to 5 most confusing, worst first.")
    model_version: Optional[str] = None
    skipped: int = Field(
        default=0,
        description="Fragments too short to score meaningfully (< 4 words).",
    )
