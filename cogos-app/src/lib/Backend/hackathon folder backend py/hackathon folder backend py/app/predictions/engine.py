"""Predictions / suggestions engine.

Surfaces lightweight, twin-derived insights to the frontend without invoking Gemma —
think of it as the "ambient" suggestion stream that runs whether or not the model is up.

Rules-based on purpose: it's cheap, explainable, and great for hackathon demos.
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Optional

from app.cognitive_twin.twin import manager as twin_manager


@dataclass
class Prediction:
    kind: str       # "routine" | "preference_recall" | "vocabulary_hint" | "novelty"
    text: str
    confidence: float
    evidence: list[str] = field(default_factory=list)


def _current_hour() -> int:
    return time.localtime().tm_hour


def _routine_predictions() -> list[Prediction]:
    twin = twin_manager.twin
    hour = _current_hour()
    out: list[Prediction] = []

    activity = twin.activity_by_hour
    if not activity:
        return out

    total = sum(activity.values()) or 1
    this_hour = activity.get(str(hour), 0)
    share = this_hour / total

    peak = max(activity.items(), key=lambda x: x[1])
    peak_hour, peak_count = int(peak[0]), peak[1]

    if share >= 0.10:
        out.append(Prediction(
            kind="routine",
            text=f"You're usually active around this hour ({hour}:00) — {this_hour} past observations.",
            confidence=min(0.95, 0.4 + share),
            evidence=[f"activity_share={share:.2f}", f"hour={hour}"],
        ))

    if peak_hour != hour and peak_count >= 3:
        out.append(Prediction(
            kind="routine",
            text=f"Your peak focus hour is {peak_hour}:00 — consider deep work then.",
            confidence=0.65,
            evidence=[f"peak_hour={peak_hour}", f"peak_count={peak_count}"],
        ))

    return out


def _preference_predictions() -> list[Prediction]:
    out: list[Prediction] = []
    for key, pref in twin_manager.get_preferences().items():
        out.append(Prediction(
            kind="preference_recall",
            text=f"You've told me: {key} = {pref.value}.",
            confidence=pref.confidence,
            evidence=[f"updated_at={pref.updated_at:.0f}"],
        ))
    return out


def _vocabulary_predictions() -> list[Prediction]:
    twin = twin_manager.twin
    top = sorted(twin.vocabulary.items(), key=lambda x: -x[1])[:5]
    if not top:
        return []
    words = ", ".join(w for w, _ in top)
    return [Prediction(
        kind="vocabulary_hint",
        text=f"Your screen vocabulary lately is heavy on: {words}.",
        confidence=0.5,
        evidence=[f"top_words={words}"],
    )]


def get_predictions(limit: Optional[int] = None) -> list[Prediction]:
    items = _routine_predictions() + _preference_predictions() + _vocabulary_predictions()
    items.sort(key=lambda p: -p.confidence)
    if limit is not None:
        items = items[:limit]
    return items
