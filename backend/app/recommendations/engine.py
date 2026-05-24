"""Proactive recommendations engine.

Aggregates predictions + twin data into actionable suggestions.
Categories: reminder, optimization, warning, insight

All processing is local. No data leaves the device.
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field

from app.cognitive_twin.twin import manager as twin_manager
from app.predictions.engine import get_predictions, Prediction


@dataclass
class Recommendation:
    id: str
    category: str       # "reminder" | "optimization" | "warning" | "insight"
    title: str
    description: str
    confidence: float
    source: str          # "pattern" | "prediction" | "twin" | "file"
    created_at: float = field(default_factory=time.time)
    actionable: bool = True


def _focus_recommendations() -> list[Recommendation]:
    """Recommendations based on focus/distraction patterns."""
    twin = twin_manager.twin
    out: list[Recommendation] = []

    # Deep focus suggestion based on streak data
    if twin.activity_streaks:
        best_streak_app = max(twin.activity_streaks.items(), key=lambda x: x[1])
        if best_streak_app[1] >= 5:
            out.append(Recommendation(
                id="focus_streak",
                category="insight",
                title="Deep Focus Detected",
                description=f"You've had a {best_streak_app[1]}-observation streak on '{best_streak_app[0]}'. You're in the zone — avoid interruptions.",
                confidence=0.8,
                source="twin",
            ))

    # Context switch warning
    if twin.observation_count > 10:
        switch_rate = twin.context_switches / max(twin.observation_count, 1)
        if switch_rate > 0.4:
            out.append(Recommendation(
                id="context_switch_warn",
                category="warning",
                title="High Context Switching",
                description=f"You've switched between apps {twin.context_switches} times across {twin.observation_count} observations ({switch_rate:.0%} switch rate). Try time-blocking: dedicate 25-min blocks to one task.",
                confidence=min(0.9, 0.5 + switch_rate),
                source="pattern",
            ))

    return out


def _schedule_recommendations() -> list[Recommendation]:
    """Recommendations based on time-of-day patterns."""
    twin = twin_manager.twin
    out: list[Recommendation] = []

    if not twin.activity_by_hour:
        return out

    hour = time.localtime().tm_hour
    total = sum(twin.activity_by_hour.values()) or 1

    # Find dead zones (hours with zero or minimal activity)
    active_hours = {int(h) for h, c in twin.activity_by_hour.items() if c > 0}
    if len(active_hours) >= 3:
        peak = max(twin.activity_by_hour.items(), key=lambda x: x[1])
        peak_h = int(peak[0])

        if hour != peak_h and peak[1] >= 3:
            if 5 <= peak_h < 12:
                period = "morning"
            elif 12 <= peak_h < 17:
                period = "afternoon"
            elif 17 <= peak_h < 21:
                period = "evening"
            else:
                period = "night"

            out.append(Recommendation(
                id="peak_hour",
                category="optimization",
                title=f"Peak Focus: {period.title()}",
                description=f"Your most productive hour is {peak_h}:00 ({peak[1]} observations). Schedule your hardest work then.",
                confidence=0.7,
                source="twin",
            ))

    return out


def _session_recommendations() -> list[Recommendation]:
    """Recommendations based on recent session activity."""
    twin = twin_manager.twin
    out: list[Recommendation] = []

    if twin.observation_count < 5:
        out.append(Recommendation(
            id="getting_started",
            category="insight",
            title="CogOS is Learning",
            description=f"I've observed {twin.observation_count} activities so far. Keep working normally — I'll start surfacing patterns after about 10-20 observations.",
            confidence=0.5,
            source="twin",
            actionable=False,
        ))
        return out

    # Session length insight
    if twin.session_log:
        recent = twin.session_log[-20:]
        if len(recent) >= 2:
            session_span = recent[-1].get("timestamp", 0) - recent[0].get("timestamp", 0)
            session_minutes = session_span / 60

            if session_minutes > 120:
                out.append(Recommendation(
                    id="long_session",
                    category="reminder",
                    title="Take a Break",
                    description=f"You've been working for {session_minutes:.0f} minutes. Studies show that breaks every 90 minutes improve sustained focus.",
                    confidence=0.75,
                    source="pattern",
                ))

    return out


def get_recommendations(limit: int = 10) -> list[Recommendation]:
    """Get all recommendations, sorted by confidence."""
    items = (
        _focus_recommendations()
        + _schedule_recommendations()
        + _session_recommendations()
    )

    # Also convert high-confidence predictions into recommendations
    predictions = get_predictions(limit=5)
    for pred in predictions:
        if pred.confidence >= 0.6:
            items.append(Recommendation(
                id=f"pred_{pred.kind}",
                category=pred.category,
                title=pred.kind.replace("_", " ").title(),
                description=pred.text,
                confidence=pred.confidence,
                source="prediction",
                actionable=pred.category in ("reminder", "warning"),
            ))

    items.sort(key=lambda r: -r.confidence)
    return items[:limit]
