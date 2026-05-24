from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "data"
DATA_DIR.mkdir(exist_ok=True)


@dataclass
class Settings:
    # --- Server ---
    host: str = "127.0.0.1"
    port: int = 8000

    # --- Capture loop ---
    capture_interval_seconds: float = 5.0
    capture_monitor_index: int = 1  # mss uses 1-indexed monitors; 0 is virtual all-monitors
    capture_max_width: int = 1600   # downscale before OCR for speed

    # --- OCR ---
    ocr_languages: tuple[str, ...] = ("en",)
    ocr_gpu: bool = False
    ocr_min_confidence: float = 0.35

    # --- Hotkey ---
    hotkey_combo: str = "<ctrl>+<alt>+<space>"

    # --- Privacy ---
    # Foreground window titles containing any of these strings will pause capture.
    window_denylist: tuple[str, ...] = (
        "1password",
        "bitwarden",
        "keepass",
        "lastpass",
        "banking",
        "chase",
        "wells fargo",
        "incognito",
        "private browsing",
    )
    require_user_approval: bool = True  # observations sit in review queue until approved

    # --- Ollama / Gemma ---
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "gemma3:4b"
    ollama_timeout_seconds: float = 60.0

    # --- Cognitive twin ---
    twin_path: Path = field(default_factory=lambda: DATA_DIR / "twin.json")
    review_queue_path: Path = field(default_factory=lambda: DATA_DIR / "review_queue.json")

    # --- Default user id (single-user assumption for hackathon) ---
    user_id: str = "default"

    @classmethod
    def from_env(cls) -> "Settings":
        s = cls()
        s.port = int(os.getenv("APP_PORT", s.port))
        s.capture_interval_seconds = float(
            os.getenv("CAPTURE_INTERVAL", s.capture_interval_seconds)
        )
        s.ollama_model = os.getenv("OLLAMA_MODEL", s.ollama_model)
        s.ollama_base_url = os.getenv("OLLAMA_BASE_URL", s.ollama_base_url)
        s.user_id = os.getenv("USER_ID", s.user_id)
        return s


settings = Settings.from_env()
