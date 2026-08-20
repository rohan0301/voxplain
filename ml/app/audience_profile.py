"""Infer audience level + domain from a free-text audience description.

Users type things like "board of directors, non-technical, finance background"
into the project form. Until now nothing read it. This turns that sentence into
the two values the analyzer actually uses — an audience level and a domain —
so the description stops being decoration.

Rules, not a model, and deliberately so: there are 40 human labels in the whole
project and none of them are descriptions. The plan's upgrade path is to
fine-tune a 4-class head once a few hundred (description, level_kept) pairs
exist and swap it in behind the same endpoint, keeping these rules as the
fallback.
"""
import re
from typing import Dict, List, Optional, TypedDict

LEVEL_CUES: Dict[int, List[str]] = {
    0: ["non-technical", "nontechnical", "non technical", "general public",
        "layperson", "laypeople", "board", "board of directors", "executives",
        "execs", "investors", "customers", "clients", "students", "press",
        "journalists", "beginners", "newcomers"],
    1: ["managers", "management", "product", "product managers", "stakeholders",
        "mixed", "cross-functional", "sales", "marketing", "generalists"],
    2: ["engineers", "developers", "analysts", "practitioners", "technical team",
        "technical staff", "architects", "scientists"],
    3: ["researchers", "phd", "phds", "experts", "peers", "specialists",
        "principal", "principals", "academics", "postdocs"],
}

DOMAIN_CUES: Dict[str, List[str]] = {
    "tech": ["engineer", "engineers", "developer", "developers", "software",
             "ml", "ai", "data", "infra", "infrastructure", "security",
             "devops", "platform", "backend", "frontend"],
    "finance": ["finance", "financial", "investor", "investors", "trading",
                "banking", "portfolio", "risk", "cfo", "accounting",
                "equity", "hedge fund", "venture"],
    # Keyed "healthcare", not "medical", to match the domain vocabulary the
    # product actually uses (the project modals offer general/tech/finance/
    # healthcare/other). metrics.py accepts both — DOMAIN_JARGON aliases
    # "healthcare" to MEDICAL_JARGON — so this value drops straight into the
    # form without translation.
    "healthcare": ["clinical", "clinicians", "doctor", "doctors", "physician",
                "physicians", "nurse", "nurses", "patient", "patients",
                "medical", "health", "healthcare", "pharma"],
}


class AudienceProfile(TypedDict):
    audience_level: Optional[int]
    domain: Optional[str]
    confidence: float
    matched: List[str]


def _hits(cues: List[str], text: str) -> List[str]:
    """Cues found as whole words/phrases. Longer cues are matched first so
    'board of directors' is not also counted as a bare 'board'."""
    found = []
    for cue in sorted(cues, key=len, reverse=True):
        if re.search(rf"(?<!\w){re.escape(cue)}(?!\w)", text):
            if not any(cue in already for already in found):
                found.append(cue)
    return found


def infer_profile(description: str) -> AudienceProfile:
    """Best guess at (level, domain) for a free-text audience description.

    Returns audience_level=None when nothing matched. None means "we do not
    know" and must not be silently turned into a number by the caller — that
    is the mistake Fix #4 exists to prevent.
    """
    if not description or not description.strip():
        return {"audience_level": None, "domain": None,
                "confidence": 0.0, "matched": []}

    text = description.lower()
    matched: List[str] = []
    level_hits: Dict[int, int] = {}

    for level, cues in LEVEL_CUES.items():
        hits = _hits(cues, text)
        if hits:
            level_hits[level] = len(hits)
            matched.extend(hits)

    domain_hits = {
        domain: len(_hits(cues, text))
        for domain, cues in DOMAIN_CUES.items()
    }
    domain = (max(domain_hits, key=lambda d: domain_hits[d])
              if any(domain_hits.values()) else None)

    if not level_hits:
        return {"audience_level": None, "domain": domain,
                "confidence": 0.0, "matched": matched}

    # Lowest matched level wins: "engineers and some board members" should be
    # scored for the board members. A room is limited by its least technical
    # listener, not flattered by its most technical one.
    level = min(level_hits)
    confidence = min(1.0, sum(level_hits.values()) / 3)

    return {"audience_level": level, "domain": domain,
            "confidence": round(confidence, 2), "matched": matched}
