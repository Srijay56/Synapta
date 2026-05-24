"""The Cognitive Twin.

A lightweight, JSON-persisted model of the user that the AI consults before answering.
It tracks:
    - rolling vocabulary (top N words the user / their screen uses)
    - app/window usage histogram
    - time-of-day activity buckets
    - explicit preferences (set by user via /memory/note or extracted by Gemma)

Adaptive: each approved observation updates these counters, and recent updates
overwrite older preferences for the same key (so the twin can change its mind).
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
class CognitiveTwin:
    user_id: str = "default"
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)

    vocabulary: dict[str, int] = field(default_factory=dict)   # word -> count
    apps: dict[str, int] = field(default_factory=dict)         # window title token -> count
    activity_by_hour: dict[str, int] = field(default_factory=dict)  # "0".."23" -> count
    preferences: dict[str, Preference] = field(default_factory=dict)
    observation_count: int = 0

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
            twin = CognitiveTwin(**raw)
            twin.preferences = {k: Preference(**v) for k, v in prefs_raw.items()}
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

        for word in _WORD_RE.findall(text.lower()):
            if word in _STOPWORDS:
                continue
            self.twin.vocabulary[word] = self.twin.vocabulary.get(word, 0) + 1

        if window_title:
            token = window_title.split(" - ")[-1].strip().lower() or window_title.lower()
            self.twin.apps[token] = self.twin.apps.get(token, 0) + 1

        hour = time.localtime(ts).tm_hour
        key = str(hour)
        self.twin.activity_by_hour[key] = self.twin.activity_by_hour.get(key, 0) + 1

        # Keep vocabulary bounded so the file doesn't grow forever.
        if len(self.twin.vocabulary) > 5000:
            keep = dict(sorted(self.twin.vocabulary.items(), key=lambda x: -x[1])[:2500])
            self.twin.vocabulary = keep

        self._persist()

    def set_preference(self, key: str, value: str, confidence: float = 0.8) -> Preference:
        pref = Preference(key=key, value=value, confidence=confidence)
        self.twin.preferences[key] = pref
        self.twin.updated_at = time.time()
        self._persist()
        return pref

    def get_preferences(self) -> dict[str, Preference]:
        return dict(self.twin.preferences)

    def reset(self) -> None:
        self.twin = CognitiveTwin(user_id=settings.user_id)
        self._persist()


manager = TwinManager()
