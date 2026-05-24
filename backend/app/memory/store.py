"""Thin adapter over TrueMemory (https://github.com/buildingjoshbetter/TrueMemory).

Falls back to a tiny in-process JSON store if the package isn't installed, so the rest
of the backend keeps working during development. Same interface in both cases.
"""
from __future__ import annotations

import json
import time
import uuid
from pathlib import Path
from typing import Any, Optional

from app.config import DATA_DIR, settings


class _FallbackMemory:
    """Append-only JSON store. Used only when `truememory` isn't installed."""

    def __init__(self, path: Path):
        self._path = path
        self._items: list[dict[str, Any]] = []
        if self._path.exists():
            try:
                self._items = json.loads(self._path.read_text(encoding="utf-8"))
            except Exception:
                self._items = []

    def _persist(self) -> None:
        self._path.write_text(json.dumps(self._items, indent=2), encoding="utf-8")

    def add(self, content: str, user_id: str, metadata: Optional[dict] = None) -> dict:
        item = {
            "id": str(uuid.uuid4()),
            "content": content,
            "user_id": user_id,
            "metadata": metadata or {},
            "created_at": time.time(),
        }
        self._items.append(item)
        self._persist()
        return item

    def search(self, query: str, user_id: str, limit: int = 10) -> list[dict]:
        q = query.lower()
        scored = [
            (i, sum(1 for tok in q.split() if tok in i["content"].lower()))
            for i in self._items
            if i["user_id"] == user_id
        ]
        scored = [s for s in scored if s[1] > 0]
        scored.sort(key=lambda s: (-s[1], -s[0]["created_at"]))
        return [s[0] for s in scored[:limit]]

    def get_all(self, user_id: str) -> list[dict]:
        return [i for i in self._items if i["user_id"] == user_id]

    def stats(self, user_id: str) -> dict:
        items = self.get_all(user_id)
        return {"count": len(items), "backend": "fallback_json"}


class MemoryStore:
    """Unified facade. Tries truememory first, falls back to local JSON."""

    def __init__(self):
        self._backend_name: str
        self._impl: Any
        try:
            from truememory import Memory  # type: ignore

            self._impl = Memory()
            self._backend_name = "truememory"
        except Exception:
            self._impl = _FallbackMemory(DATA_DIR / "memory_fallback.json")
            self._backend_name = "fallback_json"

    @property
    def backend(self) -> str:
        return self._backend_name

    # --- public api ---------------------------------------------------------

    def add(self, content: str, user_id: Optional[str] = None, metadata: Optional[dict] = None):
        uid = user_id or settings.user_id
        # truememory accepts (content, user_id, metadata=...); fallback matches.
        try:
            return self._impl.add(content, user_id=uid, metadata=metadata)
        except TypeError:
            # Older/newer truememory signature — try without metadata kwarg.
            return self._impl.add(content, user_id=uid)

    def search(self, query: str, user_id: Optional[str] = None, limit: int = 10):
        uid = user_id or settings.user_id
        try:
            return self._impl.search(query, user_id=uid, limit=limit)
        except TypeError:
            return self._impl.search(query, user_id=uid)

    def search_deep(self, query: str, user_id: Optional[str] = None):
        uid = user_id or settings.user_id
        if hasattr(self._impl, "search_deep"):
            return self._impl.search_deep(query, user_id=uid)
        return self.search(query, user_id=uid)

    def get_all(self, user_id: Optional[str] = None):
        uid = user_id or settings.user_id
        if hasattr(self._impl, "get_all"):
            return self._impl.get_all(user_id=uid)
        return []

    def stats(self, user_id: Optional[str] = None) -> dict:
        uid = user_id or settings.user_id
        if hasattr(self._impl, "stats"):
            try:
                s = self._impl.stats(user_id=uid)
                if isinstance(s, dict):
                    s.setdefault("backend", self._backend_name)
                    return s
            except Exception:
                pass
        return {"backend": self._backend_name}


# Module-level singleton.
store = MemoryStore()
