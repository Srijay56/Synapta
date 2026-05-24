"""Global hotkey listener. pynput runs in its own thread; we bridge back to the
FastAPI event loop via asyncio.run_coroutine_threadsafe."""
from __future__ import annotations

import asyncio
import threading
from typing import Awaitable, Callable, Optional

from app.config import settings


class HotkeyListener:
    def __init__(self, on_trigger: Callable[[], Awaitable[None]], loop: asyncio.AbstractEventLoop):
        self._on_trigger = on_trigger
        self._loop = loop
        self._listener: Optional[object] = None
        self._thread: Optional[threading.Thread] = None
        self._stop = threading.Event()

    def _fire(self) -> None:
        # pynput callback fires on its own thread — schedule the coroutine on the main loop.
        try:
            asyncio.run_coroutine_threadsafe(self._on_trigger(), self._loop)
        except Exception:
            pass

    def _run(self) -> None:
        try:
            from pynput import keyboard  # type: ignore
        except Exception:
            return  # pynput unavailable (headless CI etc.) — silently no-op

        with keyboard.GlobalHotKeys({settings.hotkey_combo: self._fire}) as listener:
            self._listener = listener
            self._stop.wait()  # block thread until stop signaled
            listener.stop()

    def start(self) -> None:
        if self._thread is not None:
            return
        self._thread = threading.Thread(target=self._run, name="hotkey-listener", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=2)
            self._thread = None
