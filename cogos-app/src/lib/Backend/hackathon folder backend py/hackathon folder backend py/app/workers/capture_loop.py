"""Background capture worker.

Every N seconds:
    1. Check privacy gate (foreground window denylist) — if blocked, skip.
    2. mss grab → opencv preprocess → EasyOCR.
    3. If text is non-trivial, file as a ReviewItem and publish over the event bus.
    4. The frontend approves/rejects; only on approval does it hit memory + twin.
"""
from __future__ import annotations

import asyncio
import time
from typing import Optional

from app.capture.ocr import OCREngine
from app.capture.screen import ScreenGrabber
from app.config import settings
from app.privacy.review_queue import ReviewItem, queue
from app.privacy.window_filter import get_active_window_title, is_window_blocked
from app.workers.events import bus


_MIN_TEXT_LEN = 20  # don't bother reviewing nearly-empty screens


class CaptureWorker:
    def __init__(self):
        self._task: Optional[asyncio.Task] = None
        self._stop = asyncio.Event()
        self._grabber: Optional[ScreenGrabber] = None
        self._ocr: Optional[OCREngine] = None
        self._paused: bool = False
        self.last_status: dict = {"running": False}

    @property
    def is_paused(self) -> bool:
        return self._paused

    def pause(self) -> None:
        self._paused = True

    def resume(self) -> None:
        self._paused = False

    async def start(self) -> None:
        if self._task is not None:
            return
        self._stop.clear()
        self._task = asyncio.create_task(self._run(), name="capture-loop")

    async def stop(self) -> None:
        self._stop.set()
        if self._task is not None:
            await asyncio.wait([self._task], timeout=3)
            self._task = None
        if self._grabber is not None:
            self._grabber.close()
            self._grabber = None

    async def _tick_once(self) -> Optional[ReviewItem]:
        """Single capture iteration. Returns the queued ReviewItem if one was filed."""
        # Lazy-init heavy resources so server startup is fast.
        if self._grabber is None:
            self._grabber = ScreenGrabber()
        if self._ocr is None:
            self._ocr = OCREngine()

        title = get_active_window_title()
        blocked, term = is_window_blocked(title)
        if blocked:
            await bus.publish("capture.skipped", {"reason": "window_blocked", "matched": term, "window": title})
            return None

        loop = asyncio.get_running_loop()
        frame = await loop.run_in_executor(None, self._grabber.grab)
        ocr_result = await loop.run_in_executor(None, self._ocr.read, frame.image)
        text = ocr_result.text.strip()

        if len(text) < _MIN_TEXT_LEN:
            await bus.publish("capture.skipped", {"reason": "low_text", "chars": len(text)})
            return None

        item = ReviewItem.new(text=text, window_title=title, source="auto_capture")
        await queue.add(item)
        await bus.publish(
            "review.queued",
            {
                "id": item.id,
                "window_title": item.window_title,
                "text_preview": text[:240],
                "avg_confidence": ocr_result.avg_confidence,
                "created_at": item.created_at,
            },
        )
        return item

    async def _run(self) -> None:
        self.last_status = {"running": True, "started_at": time.time()}
        try:
            while not self._stop.is_set():
                if not self._paused:
                    try:
                        await self._tick_once()
                    except Exception as e:
                        await bus.publish("capture.error", {"error": str(e)})
                try:
                    await asyncio.wait_for(self._stop.wait(), timeout=settings.capture_interval_seconds)
                except asyncio.TimeoutError:
                    continue
        finally:
            self.last_status = {"running": False, "stopped_at": time.time()}


worker = CaptureWorker()
