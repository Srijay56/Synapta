"""Predictions / suggestions engine — enhanced with pattern-based insights.

Surfaces lightweight, twin-derived insights including:
  - Routine predictions (active hours, peak focus times)
  - Preference recall
  - Vocabulary trends
  - Bottleneck detection (rapid context-switching hours)
  - Forgotten/abandoned tasks
  - Workflow optimization suggestions
  - File activity predictions

All rule-based: cheap, explainable, and fully local.
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Optional

from app.cognitive_twin.twin import manager as twin_manager


@dataclass
class Prediction:
    kind: str       # "routine" | "preference_recall" | "vocabulary_hint" | "bottleneck" | "forgotten" | "workflow" | "file"
    text: str
    confidence: float
    evidence: list[str] = field(default_factory=list)
    category: str = "insight"  # "reminder" | "optimization" | "warning" | "insight"


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
            category="insight",
        ))

    if peak_hour != hour and peak_count >= 3:
        out.append(Prediction(
            kind="routine",
            text=f"Your peak focus hour is {peak_hour}:00 — consider deep work then.",
            confidence=0.65,
            evidence=[f"peak_hour={peak_hour}", f"peak_count={peak_count}"],
            category="optimization",
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
            category="insight",
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
        category="insight",
    )]


def _bottleneck_predictions() -> list[Prediction]:
    """Surface rapid context-switching patterns."""
    twin = twin_manager.twin
    out: list[Prediction] = []

    # Overall context switch rate
    if twin.context_switches > 10 and twin.observation_count > 20:
        rate = twin.context_switches / twin.observation_count
        if rate > 0.5:
            out.append(Prediction(
                kind="bottleneck",
                text=f"You're context-switching frequently ({twin.context_switches} switches in {twin.observation_count} observations). Try batching similar tasks.",
                confidence=min(0.9, 0.5 + rate * 0.3),
                evidence=[f"switches={twin.context_switches}", f"rate={rate:.2f}"],
                category="warning",
            ))

    # Bottleneck hours from patterns
    for key, pattern in twin.recurring_patterns.items():
        if pattern.get("type") == "bottleneck":
            hour = pattern["hour"]
            switches = pattern["switch_count"]
            out.append(Prediction(
                kind="bottleneck",
                text=f"Hour {hour}:00 is a bottleneck — you context-switched {switches} times recently. Consider protecting this hour.",
                confidence=0.7,
                evidence=[f"hour={hour}", f"switches={switches}"],
                category="warning",
            ))

    return out


def _forgotten_task_predictions() -> list[Prediction]:
    """Surface activities that were started but not revisited."""
    out: list[Prediction] = []

    for key, pattern in twin_manager.twin.recurring_patterns.items():
        if pattern.get("type") == "abandoned":
            activity = pattern["activity"]
            hours = pattern["hours_since"]
            total = pattern["total_sessions"]

            if hours > 48:
                text = f"You haven't worked on '{activity}' in {hours:.0f} hours ({total} past sessions). Forgot about it?"
                cat = "reminder"
            else:
                text = f"'{activity}' hasn't been touched in {hours:.0f} hours. Return to it?"
                cat = "reminder"

            out.append(Prediction(
                kind="forgotten",
                text=text,
                confidence=min(0.85, 0.4 + (hours / 100)),
                evidence=[f"activity={activity}", f"hours_since={hours}", f"sessions={total}"],
                category=cat,
            ))

    return out


def _workflow_predictions() -> list[Prediction]:
    """Suggest optimal task ordering based on detected transition patterns."""
    out: list[Prediction] = []

    for key, pattern in twin_manager.twin.recurring_patterns.items():
        if pattern.get("type") == "transition":
            count = pattern["count"]
            if count >= 5:
                out.append(Prediction(
                    kind="workflow",
                    text=f"Pattern detected: {key} (happened {count}× recently). This is part of your natural flow.",
                    confidence=min(0.8, 0.4 + count * 0.05),
                    evidence=[f"transition={key}", f"count={count}"],
                    category="insight",
                ))

    return out


def get_predictions(limit: Optional[int] = None) -> list[Prediction]:
    items = (
        _routine_predictions()
        + _bottleneck_predictions()
        + _forgotten_task_predictions()
        + _workflow_predictions()
        + _preference_predictions()
        + _vocabulary_predictions()
    )
    items.sort(key=lambda p: -p.confidence)
    if limit is not None:
        items = items[:limit]
    return items
