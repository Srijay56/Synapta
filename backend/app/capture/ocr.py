"""EasyOCR wrapper. Lazy-loads the model to keep startup fast.

The EasyOCR Reader is a singleton at the class level — all OCREngine instances
share one loaded model to avoid duplicate RAM usage and duplicate downloads.

A threading.Lock guards the first-load path so two workers starting simultaneously
(CaptureWorker + AutonomousObserver) don't both try to download the model at once.
"""
from __future__ import annotations

import threading
from dataclasses import dataclass
from typing import Optional

import numpy as np

from app.config import settings


@dataclass
class OCRWord:
    text: str
    confidence: float
    bbox: tuple[tuple[int, int], tuple[int, int], tuple[int, int], tuple[int, int]]


@dataclass
class OCRResult:
    words: list[OCRWord]

    @property
    def text(self) -> str:
        return " ".join(w.text for w in self.words)

    @property
    def avg_confidence(self) -> float:
        if not self.words:
            return 0.0
        return sum(w.confidence for w in self.words) / len(self.words)


class OCREngine:
    _reader = None          # shared across all instances
    _load_lock = threading.Lock()  # prevents simultaneous first-load by multiple workers

    def __init__(
        self,
        languages: Optional[list[str]] = None,
        use_gpu: Optional[bool] = None,
        min_confidence: Optional[float] = None,
    ):
        self._languages = languages or list(settings.ocr_languages)
        self._use_gpu = settings.ocr_gpu if use_gpu is None else use_gpu
        self._min_confidence = (
            settings.ocr_min_confidence if min_confidence is None else min_confidence
        )

    def _ensure_reader(self):
        # Fast path: already loaded
        if OCREngine._reader is not None:
            return OCREngine._reader

        # Slow path: first load — acquire lock so only one thread downloads
        with OCREngine._load_lock:
            # Double-checked locking: another thread may have loaded while we waited
            if OCREngine._reader is None:
                import easyocr  # heavy import — defer until first use
                OCREngine._reader = easyocr.Reader(self._languages, gpu=self._use_gpu)

        return OCREngine._reader

    def read(self, img: np.ndarray) -> OCRResult:
        reader = self._ensure_reader()
        raw = reader.readtext(img, detail=1, paragraph=False)
        words: list[OCRWord] = []
        for bbox, text, conf in raw:
            if conf < self._min_confidence:
                continue
            bbox_t = tuple(tuple(int(c) for c in pt) for pt in bbox)  # type: ignore[assignment]
            words.append(OCRWord(text=str(text).strip(), confidence=float(conf), bbox=bbox_t))
        return OCRResult(words=words)
