"""Wellness Engine — behavioral pattern recognition → emotional state inference.

Analyzes data from the Cognitive Twin and Autonomous Observer to detect
real-time behavioral signals and infer the user's wellness state.

Signals detected:
  - Rapid context switching (>3 app switches in 2 min)
  - Long session without break (>90 min continuous)
  - Erratic activity bursts (high observation density in short window)
  - Stuck / no progress (high screen similarity for extended period)
  - Off-hours work (working outside personal peak hours)
  - Repetitive task loops (A→B→A detected ≥3×)

All rule-based: cheap, instant, explainable, fully local.
No AI inference call needed.
"""
from __future__ import annotations

import time
from collections import deque
from dataclasses import asdict, dataclass, field
from typing import Optional

from app.cognitive_twin.twin import manager as twin_manager


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

@dataclass
class WellnessSignal:
    """A single detected behavioral signal."""
    name: str           # e.g. "rapid_switching", "long_session"
    severity: float     # 0.0–1.0
    description: str    # human-readable explanation
    icon_name: str      # for UI rendering (lucide icon name)
    category: str       # "stress" | "fatigue" | "distraction" | "info"


@dataclass
class WellnessRecommendation:
    """An actionable suggestion based on detected signals."""
    text: str
    priority: float     # 0.0–1.0 (higher = more urgent)
    icon_name: str
    signal_name: str    # which signal triggered this


@dataclass
class WellnessState:
    """The user's inferred emotional / behavioral wellness."""
    mood: str                  # "focused" | "stressed" | "scattered" | "fatigued" | "in-flow" | "idle"
    mood_label: str            # human-friendly label, e.g. "In the zone"
    mood_color: str            # hex color for UI
    stress_level: float        # 0.0–1.0
    focus_score: float         # 0.0–1.0
    energy_estimate: str       # "high" | "medium" | "low"
    session_duration_minutes: float
    context_switch_rate: float # switches per observation (recent window)
    active_signals: list[dict] = field(default_factory=list)
    recommendations: list[dict] = field(default_factory=list)
    timestamp: float = field(default_factory=time.time)


# ---------------------------------------------------------------------------
# Mood configuration
# ---------------------------------------------------------------------------

MOOD_CONFIG = {
    "in-flow":    {"label": "In the zone",         "color": "#10b981", "emoji": "🟢"},
    "focused":    {"label": "Focused",             "color": "#3b82f6", "emoji": "🔵"},
    "idle":       {"label": "Taking it easy",      "color": "#6b7280", "emoji": "⚪"},
    "scattered":  {"label": "Scattered",           "color": "#f59e0b", "emoji": "🟡"},
    "fatigued":   {"label": "Running low",         "color": "#f97316", "emoji": "🟠"},
    "stressed":   {"label": "Under pressure",      "color": "#ef4444", "emoji": "🔴"},
}


# ---------------------------------------------------------------------------
# Wellness Engine
# ---------------------------------------------------------------------------

class WellnessEngine:
    """Stateless analyzer — call compute() at any time for the current wellness state."""

    def __init__(self):
        # History ring buffer for snapshots (taken every ~5 min by main.py)
        self._history: deque[dict] = deque(maxlen=50)
        self._last_state: Optional[WellnessState] = None

    # ---- public API -------------------------------------------------------

    def compute(self) -> WellnessState:
        """Compute current wellness state from twin + observer data."""
        twin = twin_manager.twin
        signals = self._detect_signals(twin)
        mood, stress, focus, energy = self._infer_state(twin, signals)
        recommendations = self._build_recommendations(signals, mood, stress)
        session_minutes = self._session_duration(twin)
        switch_rate = self._context_switch_rate(twin)

        cfg = MOOD_CONFIG.get(mood, MOOD_CONFIG["idle"])

        state = WellnessState(
            mood=mood,
            mood_label=cfg["label"],
            mood_color=cfg["color"],
            stress_level=round(stress, 2),
            focus_score=round(focus, 2),
            energy_estimate=energy,
            session_duration_minutes=round(session_minutes, 1),
            context_switch_rate=round(switch_rate, 3),
            active_signals=[asdict(s) for s in signals],
            recommendations=[asdict(r) for r in recommendations],
            timestamp=time.time(),
        )

        self._last_state = state
        return state

    def snapshot(self) -> None:
        """Take a snapshot of the current state for history tracking."""
        state = self.compute()
        self._history.append({
            "mood": state.mood,
            "mood_color": state.mood_color,
            "stress_level": state.stress_level,
            "focus_score": state.focus_score,
            "energy_estimate": state.energy_estimate,
            "session_duration_minutes": state.session_duration_minutes,
            "context_switch_rate": state.context_switch_rate,
            "signal_count": len(state.active_signals),
            "timestamp": state.timestamp,
        })

    def get_history(self, limit: int = 12) -> list[dict]:
        """Return recent wellness snapshots."""
        items = list(self._history)
        return items[-limit:]

    def has_changed(self, new_state: WellnessState) -> bool:
        """Check if the wellness state has changed meaningfully since last snapshot."""
        if self._last_state is None:
            return True
        old = self._last_state
        # Mood change or stress/focus shifted by ≥ 0.15
        return (
            old.mood != new_state.mood
            or abs(old.stress_level - new_state.stress_level) >= 0.15
            or abs(old.focus_score - new_state.focus_score) >= 0.15
        )

    # ---- signal detection -------------------------------------------------

    def _detect_signals(self, twin) -> list[WellnessSignal]:
        signals: list[WellnessSignal] = []

        # 1. Rapid context switching
        sig = self._check_rapid_switching(twin)
        if sig:
            signals.append(sig)

        # 2. Long session without break
        sig = self._check_long_session(twin)
        if sig:
            signals.append(sig)

        # 3. Erratic burst
        sig = self._check_erratic_burst(twin)
        if sig:
            signals.append(sig)

        # 4. Off-hours work
        sig = self._check_off_hours(twin)
        if sig:
            signals.append(sig)

        # 5. Repetitive task loops
        sig = self._check_repetitive_loops(twin)
        if sig:
            signals.append(sig)

        # 6. Deep focus streak (positive signal)
        sig = self._check_deep_focus(twin)
        if sig:
            signals.append(sig)

        return signals

    def _check_rapid_switching(self, twin) -> Optional[WellnessSignal]:
        """Detect rapid app switching in recent session log."""
        if len(twin.session_log) < 5:
            return None

        recent = twin.session_log[-20:]
        now = time.time()
        # Count switches in the last 2 minutes
        switches_2min = 0
        for i in range(1, len(recent)):
            ts = recent[i].get("timestamp", 0)
            if now - ts > 120:
                continue
            if recent[i].get("activity") != recent[i - 1].get("activity") and recent[i].get("activity"):
                switches_2min += 1

        if switches_2min >= 3:
            severity = min(1.0, switches_2min / 8.0)
            return WellnessSignal(
                name="rapid_switching",
                severity=severity,
                description=f"{switches_2min} app switches in the last 2 minutes",
                icon_name="RefreshCw",
                category="distraction",
            )
        return None

    def _check_long_session(self, twin) -> Optional[WellnessSignal]:
        """Detect working for >90 min without a break signal."""
        if len(twin.session_log) < 5:
            return None

        # Look at session log span
        first_ts = twin.session_log[0].get("timestamp", 0)
        last_ts = twin.session_log[-1].get("timestamp", 0)
        if first_ts == 0 or last_ts == 0:
            return None

        span_minutes = (last_ts - first_ts) / 60.0

        # Only fire if recent entries are actually recent (within last 2 hours)
        now = time.time()
        if now - last_ts > 600:  # last entry is >10 min old = they may have taken a break
            return None

        if span_minutes >= 90:
            severity = min(1.0, (span_minutes - 60) / 120.0)
            return WellnessSignal(
                name="long_session",
                severity=severity,
                description=f"Working for {span_minutes:.0f} minutes without a break",
                icon_name="Clock",
                category="fatigue",
            )
        return None

    def _check_erratic_burst(self, twin) -> Optional[WellnessSignal]:
        """Detect unusually dense observation bursts (many entries in short time)."""
        if len(twin.session_log) < 10:
            return None

        now = time.time()
        recent_5min = [e for e in twin.session_log[-30:] if now - e.get("timestamp", 0) < 300]

        if len(recent_5min) >= 15:
            severity = min(1.0, len(recent_5min) / 25.0)
            return WellnessSignal(
                name="erratic_burst",
                severity=severity,
                description=f"{len(recent_5min)} rapid actions in the last 5 minutes",
                icon_name="Zap",
                category="stress",
            )
        return None

    def _check_off_hours(self, twin) -> Optional[WellnessSignal]:
        """Detect working outside the user's established peak hours."""
        if not twin.activity_by_hour or twin.observation_count < 20:
            return None

        current_hour = time.localtime().tm_hour
        total = sum(twin.activity_by_hour.values()) or 1
        current_share = twin.activity_by_hour.get(str(current_hour), 0) / total

        # If current hour has very low historical activity, flag it
        is_late = current_hour >= 23 or current_hour < 5
        if current_share < 0.03 and is_late:
            return WellnessSignal(
                name="off_hours",
                severity=0.5,
                description=f"Working at {current_hour}:00 — outside your usual active hours",
                icon_name="Moon",
                category="fatigue",
            )
        return None

    def _check_repetitive_loops(self, twin) -> Optional[WellnessSignal]:
        """Detect repetitive A→B→A transition patterns."""
        loop_patterns = []
        for key, pattern in twin.recurring_patterns.items():
            if pattern.get("type") == "transition" and pattern.get("count", 0) >= 4:
                loop_patterns.append(key)

        if loop_patterns:
            worst = loop_patterns[0]
            return WellnessSignal(
                name="repetitive_loop",
                severity=0.4,
                description=f"Repetitive workflow loop detected: {worst}",
                icon_name="Repeat",
                category="distraction",
            )
        return None

    def _check_deep_focus(self, twin) -> Optional[WellnessSignal]:
        """Detect deep focus streaks (positive signal)."""
        if not twin.activity_streaks:
            return None

        best = max(twin.activity_streaks.items(), key=lambda x: x[1])
        if best[1] >= 5:
            return WellnessSignal(
                name="deep_focus",
                severity=0.0,  # positive — not a problem
                description=f"Deep focus streak on '{best[0]}' ({best[1]} consecutive observations)",
                icon_name="Target",
                category="info",
            )
        return None

    # ---- state inference --------------------------------------------------

    def _infer_state(self, twin, signals: list[WellnessSignal]) -> tuple[str, float, float, str]:
        """Infer mood, stress, focus, energy from signals."""
        stress = 0.0
        focus = 0.7  # default: moderately focused
        has_deep_focus = False

        signal_names = {s.name for s in signals}
        stress_signals = [s for s in signals if s.category in ("stress", "distraction")]
        fatigue_signals = [s for s in signals if s.category == "fatigue"]

        # Accumulate stress from negative signals
        for s in signals:
            if s.category == "stress":
                stress += s.severity * 0.4
            elif s.category == "distraction":
                stress += s.severity * 0.25
            elif s.category == "fatigue":
                stress += s.severity * 0.2

        # Deep focus reduces stress and boosts focus
        if "deep_focus" in signal_names:
            has_deep_focus = True
            focus = min(1.0, focus + 0.25)
            stress = max(0.0, stress - 0.15)

        # Rapid switching hurts focus
        if "rapid_switching" in signal_names:
            switch_sig = next(s for s in signals if s.name == "rapid_switching")
            focus = max(0.0, focus - switch_sig.severity * 0.4)

        # Long session increases fatigue
        if "long_session" in signal_names:
            focus = max(0.0, focus - 0.15)

        # Context switch rate from twin
        switch_rate = self._context_switch_rate(twin)
        if switch_rate > 0.5:
            focus = max(0.0, focus - (switch_rate - 0.5) * 0.3)
            stress += (switch_rate - 0.5) * 0.2

        stress = min(1.0, max(0.0, stress))
        focus = min(1.0, max(0.0, focus))

        # Energy estimate
        if fatigue_signals:
            energy = "low"
        elif stress > 0.6:
            energy = "low"
        elif stress > 0.3 or focus < 0.5:
            energy = "medium"
        else:
            energy = "high"

        # Mood inference
        if twin.observation_count < 3:
            mood = "idle"
        elif has_deep_focus and stress < 0.3 and focus >= 0.7:
            mood = "in-flow"
        elif focus >= 0.6 and stress < 0.4:
            mood = "focused"
        elif stress >= 0.6:
            mood = "stressed"
        elif "rapid_switching" in signal_names or switch_rate > 0.5:
            mood = "scattered"
        elif fatigue_signals or energy == "low":
            mood = "fatigued"
        else:
            mood = "focused"

        return mood, stress, focus, energy

    # ---- recommendations --------------------------------------------------

    def _build_recommendations(self, signals: list[WellnessSignal], mood: str, stress: float) -> list[WellnessRecommendation]:
        recs: list[WellnessRecommendation] = []

        signal_names = {s.name for s in signals}

        if "rapid_switching" in signal_names:
            recs.append(WellnessRecommendation(
                text="Try single-tasking: pick one task and commit to it for 25 minutes (Pomodoro technique).",
                priority=0.9,
                icon_name="Target",
                signal_name="rapid_switching",
            ))

        if "long_session" in signal_names:
            recs.append(WellnessRecommendation(
                text="You've been going for a while. Stand up, stretch, grab some water — a 5-minute break boosts focus for the next hour.",
                priority=0.85,
                icon_name="Droplets",
                signal_name="long_session",
            ))

        if "erratic_burst" in signal_names:
            recs.append(WellnessRecommendation(
                text="Rapid-fire actions detected. Take a deep breath and slow down — rushing increases errors.",
                priority=0.7,
                icon_name="Wind",
                signal_name="erratic_burst",
            ))

        if "off_hours" in signal_names:
            recs.append(WellnessRecommendation(
                text="It's late. Consider wrapping up — good sleep is the #1 productivity hack for tomorrow.",
                priority=0.6,
                icon_name="Moon",
                signal_name="off_hours",
            ))

        if "repetitive_loop" in signal_names:
            recs.append(WellnessRecommendation(
                text="You're bouncing between the same apps repeatedly. Write down what you need from each before switching.",
                priority=0.5,
                icon_name="FileText",
                signal_name="repetitive_loop",
            ))

        if stress > 0.5 and "rapid_switching" not in signal_names:
            recs.append(WellnessRecommendation(
                text="Stress is building up. Try the 4-7-8 breathing technique: inhale 4s, hold 7s, exhale 8s.",
                priority=0.75,
                icon_name="Wind",
                signal_name="general_stress",
            ))

        if "deep_focus" in signal_names:
            recs.append(WellnessRecommendation(
                text="You're in the zone! Protect this focus — silence notifications and keep going.",
                priority=0.3,
                icon_name="Flame",
                signal_name="deep_focus",
            ))

        if not recs and mood in ("focused", "in-flow"):
            recs.append(WellnessRecommendation(
                text="Looking good — steady focus, manageable workload. Keep it up!",
                priority=0.1,
                icon_name="Sparkles",
                signal_name="all_clear",
            ))

        recs.sort(key=lambda r: -r.priority)
        return recs[:5]

    # ---- helpers ----------------------------------------------------------

    def _session_duration(self, twin) -> float:
        """Estimate current session duration from session log."""
        if not twin.session_log:
            return 0.0
        now = time.time()
        last_ts = twin.session_log[-1].get("timestamp", 0)
        # If last entry is >10 min old, session may have ended
        if now - last_ts > 600:
            return 0.0
        first_ts = twin.session_log[0].get("timestamp", now)
        return (now - first_ts) / 60.0

    def _context_switch_rate(self, twin) -> float:
        """Calculate context switch rate over last 20 observations."""
        if len(twin.session_log) < 3:
            return 0.0
        recent = twin.session_log[-20:]
        switches = 0
        for i in range(1, len(recent)):
            a1 = recent[i].get("activity", "")
            a0 = recent[i - 1].get("activity", "")
            if a1 and a0 and a1 != a0:
                switches += 1
        return switches / max(len(recent) - 1, 1)


# Module singleton
wellness = WellnessEngine()
