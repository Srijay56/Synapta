"""Simple in-process pub/sub for pushing events to WebSocket subscribers."""
from __future__ import annotations

import asyncio
from typing import Any


class EventBus:
    def __init__(self):
        self._subscribers: set[asyncio.Queue] = set()

    def subscribe(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=100)
        self._subscribers.add(q)
        return q

    def unsubscribe(self, q: asyncio.Queue) -> None:
        self._subscribers.discard(q)

    async def publish(self, event_type: str, payload: dict[str, Any]) -> None:
        msg = {"type": event_type, "payload": payload}
        for q in list(self._subscribers):
            try:
                q.put_nowait(msg)
            except asyncio.QueueFull:
                # Drop slowest subscribers rather than block the producer.
                pass


bus = EventBus()
