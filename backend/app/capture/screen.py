"""Screen capture using mss (fast) with opencv preprocessing for OCR."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

import cv2
import mss
import mss.tools
import numpy as np

from app.config import settings


@dataclass
class Frame:
    """A captured screen frame, BGR uint8 ready for OpenCV / OCR."""
    image: np.ndarray
    width: int
    height: int
    monitor_index: int


class ScreenGrabber:
    """Wraps mss in a small reusable object. Not thread-safe — one instance per worker.

    Monitor index semantics (mss on Windows):
      0  = virtual combined display (ALL monitors stitched together)
      1  = primary monitor
      2  = secondary monitor, etc.

    We default to 0 so the observer sees your entire screen, not just one display.
    """

    def __init__(self, monitor_index: Optional[int] = None, max_width: Optional[int] = None):
        self._sct = mss.mss()
        # Default 0 = all monitors combined; override via config or constructor arg
        self._monitor_index = monitor_index if monitor_index is not None else settings.capture_monitor_index
        self._max_width = max_width or settings.capture_max_width

    def _active_monitor_index(self) -> int:
        """Return the mss index of the monitor currently under the mouse cursor.

        Falls back to self._monitor_index if detection fails.
        Useful for the autonomous observer so it watches where the user is.
        """
        try:
            import ctypes
            # Get cursor position via Win32
            class POINT(ctypes.Structure):
                _fields_ = [("x", ctypes.c_long), ("y", ctypes.c_long)]
            pt = POINT()
            ctypes.windll.user32.GetCursorPos(ctypes.byref(pt))
            cx, cy = pt.x, pt.y

            # Find which mss monitor contains this point
            for i, mon in enumerate(self._sct.monitors[1:], start=1):
                if (mon["left"] <= cx < mon["left"] + mon["width"] and
                        mon["top"] <= cy < mon["top"] + mon["height"]):
                    return i
        except Exception:
            pass
        return self._monitor_index

    def grab(self, use_active_monitor: bool = False, active_window_only: bool = True) -> Frame:
        """Grab a frame.

        Args:
            use_active_monitor: If True, auto-detect the monitor under the cursor.
                                If False, use self._monitor_index (default: 0 = all).
            active_window_only: If True, try to crop to just the foreground active window.
        """
        idx = self._active_monitor_index() if use_active_monitor else self._monitor_index
        mon = self._sct.monitors[idx]

        bbox = mon
        if active_window_only:
            try:
                from app.privacy.window_filter import get_active_window_bounds
                bounds = get_active_window_bounds()
                if bounds:
                    left, top, width, height = bounds
                    # Constrain the window bounds to the selected monitor bounds
                    bbox = {
                        "left": max(mon["left"], left),
                        "top": max(mon["top"], top),
                        "width": min(mon["width"], width),
                        "height": min(mon["height"], height),
                    }
                    if bbox["width"] <= 0 or bbox["height"] <= 0:
                        bbox = mon
            except Exception:
                pass

        raw = self._sct.grab(bbox)
        # mss returns BGRA; convert to BGR for OpenCV.
        img = np.array(raw, dtype=np.uint8)
        img = cv2.cvtColor(img, cv2.COLOR_BGRA2BGR)

        h, w = img.shape[:2]
        if w > self._max_width:
            scale = self._max_width / w
            img = cv2.resize(img, (self._max_width, int(h * scale)), interpolation=cv2.INTER_AREA)
            h, w = img.shape[:2]

        return Frame(image=img, width=w, height=h, monitor_index=idx)

    def close(self) -> None:
        self._sct.close()


def preprocess_for_ocr(img: np.ndarray) -> np.ndarray:
    """Grayscale + adaptive threshold. Improves OCR on screenshots with mixed contrast."""
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    # Light denoise then adaptive threshold — leaves text crisp.
    gray = cv2.bilateralFilter(gray, d=5, sigmaColor=50, sigmaSpace=50)
    return gray
