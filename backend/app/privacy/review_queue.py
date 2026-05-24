"""User-confirmation review queue.

Auto-captured observations land here. Nothing reaches TrueMemory or the cognitive twin
until the user approves the entry through the frontend. Approvals/rejections are pushed
over the WebSocket event bus so any connected frontend stays in sync.
"""
from __future__ import annotations

import asyncio
import json
import time
import uuid
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Optional

from app.config import settings


@dataclass
class ReviewItem:
    id: str
    created_at: float
    source: str               # "auto_capture" | "manual"
    text: str
    window_title: Optional[str]
    status: str = "pending"   # "pending" | "approved" | "rejected"
    notes: Optional[str] = None

    @classmethod
    def new(cls, text: str, window_title: Optional[str], source: str = "auto_capture") -> "ReviewItem":
        return cls(
            id=str(uuid.uuid4()),
            created_at=time.time(),
            source=source,
            text=text,
            window_title=window_title,
        )


class ReviewQueue:
    def __init__(self, path: Optional[Path] = None):
        self._path = path or settings.review_queue_path
        self._lock = asyncio.Lock()
        self._items: dict[str, ReviewItem] = {}
        self._load()

    def _load(self) -> None:
        if not self._path.exists():
            return
        try:
            data = json.loads(self._path.read_text(encoding="utf-8"))
            for raw in data.get("items", []):
                item = ReviewItem(**raw)
                self._items[item.id] = item
        except Exception:
            # Corrupt file — start fresh rather than crash the server.
            self._items = {}

    def _persist(self) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        payload = {"items": [asdict(i) for i in self._items.values()]}
        self._path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    async def add(self, item: ReviewItem) -> ReviewItem:
        async with self._lock:
            self._items[item.id] = item
            self._persist()
            return item

    async def list_pending(self) -> list[ReviewItem]:
        async with self._lock:
            return [i for i in self._items.values() if i.status == "pending"]

    async def list_all(self) -> list[ReviewItem]:
        async with self._lock:
            return list(self._items.values())

    async def get(self, item_id: str) -> Optional[ReviewItem]:
        async with self._lock:
            return self._items.get(item_id)

    async def set_status(self, item_id: str, status: str, notes: Optional[str] = None) -> Optional[ReviewItem]:
        async with self._lock:
            item = self._items.get(item_id)
            if item is None:
                return None
            item.status = status
            if notes is not None:
                item.notes = notes
            self._persist()
            return item

    async def purge_resolved(self) -> int:
        async with self._lock:
            keep = {k: v for k, v in self._items.items() if v.status == "pending"}
            removed = len(self._items) - len(keep)
            self._items = keep
            self._persist()
            return removed


# Module-level singleton so all routers share state.
queue = ReviewQueue()
