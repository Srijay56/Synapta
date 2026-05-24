"""Screen capture using mss (fast) with opencv preprocessing for OCR."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

import cv2
import mss
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
    """Wraps mss in a small reusable object. Not thread-safe — one instance per worker."""

    def __init__(self, monitor_index: Optional[int] = None, max_width: Optional[int] = None):
        self._sct = mss.mss()
        self._monitor_index = monitor_index or settings.capture_monitor_index
        self._max_width = max_width or settings.capture_max_width

    def grab(self) -> Frame:
        mon = self._sct.monitors[self._monitor_index]
        raw = self._sct.grab(mon)
        # mss returns BGRA; convert to BGR for OpenCV.
        img = np.array(raw, dtype=np.uint8)
        img = cv2.cvtColor(img, cv2.COLOR_BGRA2BGR)

        h, w = img.shape[:2]
        if w > self._max_width:
            scale = self._max_width / w
            img = cv2.resize(img, (self._max_width, int(h * scale)), interpolation=cv2.INTER_AREA)
            h, w = img.shape[:2]

        return Frame(image=img, width=w, height=h, monitor_index=self._monitor_index)

    def close(self) -> None:
        self._sct.close()


def preprocess_for_ocr(img: np.ndarray) -> np.ndarray:
    """Grayscale + adaptive threshold. Improves OCR on screenshots with mixed contrast."""
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    # Light denoise then adaptive threshold — leaves text crisp.
    gray = cv2.bilateralFilter(gray, d=5, sigmaColor=50, sigmaSpace=50)
    return gray
