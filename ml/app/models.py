"""
Pydantic models for request/response validation.

FastAPI uses these to:
  - Parse and validate incoming JSON bodies automatically
  - Generate OpenAPI (Swagger) documentation at /docs
  - Return typed, structured JSON responses
"""

from pydantic import BaseModel, Field
from typing import Literal, List


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
