"""The Cognitive Twin — enhanced with pattern detection.

A lightweight, JSON-persisted model of the user that the AI consults before answering.
It tracks:
    - rolling vocabulary (top N words the user / their screen uses)
    - app/window usage histogram
    - time-of-day activity buckets
    - explicit preferences (set by user via /memory/note or extracted by AI)
    - session log (timestamped activity history for pattern detection)
    - context switches (bottleneck signal)
    - recurring patterns (detected sequences in workflow)

Adaptive: each approved observation updates these counters, and recent updates
overwrite older preferences for the same key (so the twin can change its mind).
All data stays on-device.
"""
from __future__ import annotations

import json
import re
import time
from collections import Counter
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Optional

from app.config import settings


_WORD_RE = re.compile(r"[a-zA-Z][a-zA-Z']{2,}")
_STOPWORDS = {
    "the", "and", "for", "with", "you", "your", "are", "this", "that", "from",
    "have", "has", "but", "not", "was", "were", "will", "would", "can", "could",
    "should", "into", "out", "about", "what", "when", "where", "which", "who",
    "how", "why", "all", "any", "some", "more", "most", "other", "than", "then",
    "them", "they", "their", "there", "here", "just", "also", "very", "much",
    "one", "two", "three", "new", "now", "see", "get", "got", "use", "used",
}


@dataclass
class Preference:
    key: str
    value: str
    confidence: float = 0.5
    updated_at: float = field(default_factory=time.time)


@dataclass
class SessionEntry:
    """A single activity log entry for pattern detection."""
    timestamp: float
    activity: str          # app name or activity type
    text_snippet: str      # first 100 chars of observation
    window_title: str = ""


@dataclass
class CognitiveTwin:
    user_id: str = "default"
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)

    vocabulary: dict[str, int] = field(default_factory=dict)
    apps: dict[str, int] = field(default_factory=dict)
    activity_by_hour: dict[str, int] = field(default_factory=dict)
    preferences: dict[str, Preference] = field(default_factory=dict)
    custom_instructions: str = ""
    observation_count: int = 0

    # Pattern detection fields
    session_log: list[dict] = field(default_factory=list)       # last 200 entries
    context_switches: int = 0                                    # rapid app switches
    recurring_patterns: dict[str, dict] = field(default_factory=dict)  # detected patterns
    activity_streaks: dict[str, int] = field(default_factory=dict)     # consecutive same-activity counts
    last_activity: str = ""

    def summarize(self, top_n: int = 8) -> dict:
        top_vocab = sorted(self.vocabulary.items(), key=lambda x: -x[1])[:top_n]
        top_apps = sorted(self.apps.items(), key=lambda x: -x[1])[:top_n]
        peak_hours = sorted(self.activity_by_hour.items(), key=lambda x: -x[1])[:3]
        return {
            "observation_count": self.observation_count,
            "top_vocabulary": [w for w, _ in top_vocab],
            "top_apps": [a for a, _ in top_apps],
            "peak_hours": [int(h) for h, _ in peak_hours],
            "preferences": {k: p.value for k, p in self.preferences.items()},
            "custom_instructions": self.custom_instructions,
            "context_switches": self.context_switches,
            "pattern_count": len(self.recurring_patterns),
            "session_entries": len(self.session_log),
            "updated_at": self.updated_at,
        }


class TwinManager:
    def __init__(self, path: Optional[Path] = None):
        self._path = path or settings.twin_path
        self.twin = self._load()

    def _load(self) -> CognitiveTwin:
        if not self._path.exists():
            return CognitiveTwin(user_id=settings.user_id)
        try:
            raw = json.loads(self._path.read_text(encoding="utf-8"))
            prefs_raw = raw.pop("preferences", {})
            # Handle new fields gracefully for existing data
            session_log = raw.pop("session_log", [])
            recurring_patterns = raw.pop("recurring_patterns", {})
            activity_streaks = raw.pop("activity_streaks", {})
            custom_instructions = raw.pop("custom_instructions", "")

            twin = CognitiveTwin(**raw)
            twin.preferences = {k: Preference(**v) for k, v in prefs_raw.items()}
            twin.session_log = session_log
            twin.recurring_patterns = recurring_patterns
            twin.activity_streaks = activity_streaks
            twin.custom_instructions = custom_instructions
            return twin
        except Exception:
            return CognitiveTwin(user_id=settings.user_id)

    def _persist(self) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        data = asdict(self.twin)
        data["preferences"] = {k: asdict(v) for k, v in self.twin.preferences.items()}
        self._path.write_text(json.dumps(data, indent=2), encoding="utf-8")

    # --- adaptive updates --------------------------------------------------

    def ingest_observation(self, text: str, window_title: Optional[str] = None, ts: Optional[float] = None) -> None:
        """Pull signal from an approved observation into the twin."""
        ts = ts or time.time()
        self.twin.observation_count += 1
        self.twin.updated_at = ts

        # Vocabulary
        for word in _WORD_RE.findall(text.lower()):
            if word in _STOPWORDS:
                continue
            self.twin.vocabulary[word] = self.twin.vocabulary.get(word, 0) + 1

        # App tracking
        activity_name = ""
        if window_title:
            token = window_title.split(" - ")[-1].strip().lower() or window_title.lower()
            self.twin.apps[token] = self.twin.apps.get(token, 0) + 1
            activity_name = token

        # Time-of-day
        hour = time.localtime(ts).tm_hour
        key = str(hour)
        self.twin.activity_by_hour[key] = self.twin.activity_by_hour.get(key, 0) + 1

        # --- Pattern detection ---

        # Track context switches (rapid app changes)
        if activity_name and activity_name != self.twin.last_activity and self.twin.last_activity:
            # Check if switch happened within 60 seconds
            if self.twin.session_log:
                last_ts = self.twin.session_log[-1].get("timestamp", 0)
                if ts - last_ts < 60:
                    self.twin.context_switches += 1

        # Track activity streaks
        if activity_name:
            if activity_name == self.twin.last_activity:
                self.twin.activity_streaks[activity_name] = self.twin.activity_streaks.get(activity_name, 1) + 1
            else:
                self.twin.activity_streaks[activity_name] = 1
            self.twin.last_activity = activity_name

        # Append to session log
        entry = {
            "timestamp": ts,
            "activity": activity_name,
            "text_snippet": text[:100],
            "window_title": window_title or "",
        }
        self.twin.session_log.append(entry)

        # Keep session log bounded (last 200 entries)
        if len(self.twin.session_log) > 200:
            self.twin.session_log = self.twin.session_log[-200:]

        # Detect recurring patterns (every 10 observations)
        if self.twin.observation_count % 10 == 0:
            self._detect_patterns()

        # Keep vocabulary bounded
        if len(self.twin.vocabulary) > 5000:
            keep = dict(sorted(self.twin.vocabulary.items(), key=lambda x: -x[1])[:2500])
            self.twin.vocabulary = keep

        self._persist()

    def _detect_patterns(self) -> None:
        """Analyze session log for recurring patterns."""
        if len(self.twin.session_log) < 10:
            return

        recent = self.twin.session_log[-50:]
        activities = [e.get("activity", "") for e in recent if e.get("activity")]

        if not activities:
            return

        # Detect frequent transitions (A → B)
        transitions: dict[str, int] = {}
        for i in range(len(activities) - 1):
            pair = f"{activities[i]} → {activities[i+1]}"
            if activities[i] != activities[i+1]:  # ignore self-transitions
                transitions[pair] = transitions.get(pair, 0) + 1

        for pair, count in transitions.items():
            if count >= 3:
                self.twin.recurring_patterns[pair] = {
                    "type": "transition",
                    "count": count,
                    "last_seen": time.time(),
                }

        # Detect bottleneck hours (high context-switch rate)
        hour_switches: dict[str, int] = {}
        for i in range(len(recent) - 1):
            if recent[i].get("activity") != recent[i+1].get("activity"):
                h = str(time.localtime(recent[i]["timestamp"]).tm_hour)
                hour_switches[h] = hour_switches.get(h, 0) + 1

        for hour, count in hour_switches.items():
            if count >= 3:
                self.twin.recurring_patterns[f"bottleneck_hour_{hour}"] = {
                    "type": "bottleneck",
                    "hour": int(hour),
                    "switch_count": count,
                    "last_seen": time.time(),
                }

        # Detect abandoned activities (appeared early, never returned)
        activity_last_seen: dict[str, float] = {}
        for e in self.twin.session_log:
            act = e.get("activity", "")
            if act:
                activity_last_seen[act] = e["timestamp"]

        now = time.time()
        for act, last_ts in activity_last_seen.items():
            gap_hours = (now - last_ts) / 3600
            if gap_hours > 24 and self.twin.apps.get(act, 0) >= 3:
                self.twin.recurring_patterns[f"abandoned_{act}"] = {
                    "type": "abandoned",
                    "activity": act,
                    "hours_since": round(gap_hours, 1),
                    "total_sessions": self.twin.apps.get(act, 0),
                    "last_seen": last_ts,
                }

    def set_preference(self, key: str, value: str, confidence: float = 0.8) -> Preference:
        pref = Preference(key=key, value=value, confidence=confidence)
        self.twin.preferences[key] = pref
        self.twin.updated_at = time.time()
        self._persist()
        return pref

    def set_custom_instructions(self, instructions: str) -> None:
        self.twin.custom_instructions = instructions
        self.twin.updated_at = time.time()
        self._persist()

    def get_preferences(self) -> dict[str, Preference]:
        return dict(self.twin.preferences)

    def get_session_log(self, limit: int = 50) -> list[dict]:
        return self.twin.session_log[-limit:]

    def get_patterns(self) -> dict[str, dict]:
        return dict(self.twin.recurring_patterns)

    def reset(self) -> None:
        self.twin = CognitiveTwin(user_id=settings.user_id)
        self._persist()


manager = TwinManager()
