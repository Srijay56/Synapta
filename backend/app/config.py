from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

# Load .env file if present
try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
except ImportError:
    pass


PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "data"
DATA_DIR.mkdir(exist_ok=True)


@dataclass
class Settings:
    # --- Server (bind to 0.0.0.0 for device-wide access) ---
    host: str = "0.0.0.0"
    port: int = 8000

    # --- Capture loop ---
    capture_interval_seconds: float = 5.0
    capture_monitor_index: int = 0  # mss: 0 = ALL monitors combined, 1+ = individual displays
    capture_max_width: int = 1600   # downscale before OCR for speed

    # --- Autonomous Observer ---
    observer_interval_seconds: float = 15.0  # slower than capture loop; balances CPU vs stuck-detection responsiveness

    # --- OCR ---
    ocr_languages: tuple[str, ...] = ("en",)
    ocr_gpu: bool = False
    ocr_min_confidence: float = 0.35

    # --- Hotkey ---
    hotkey_combo: str = "<ctrl>+<alt>+<space>"

    # --- Privacy ---
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
    
    # --- Privacy Mode & Allowlist ---
    privacy_mode: str = "allow_all" # "allow_all" or "allowlist"
    window_allowlist: tuple[str, ...] = ()
    
    require_user_approval: bool = True

    # --- Inference: LOCAL-FIRST (Ollama by default, no cloud) ---
    inference_provider: str = "ollama"  # "ollama" (local) | "gemma" (cloud) | "auto"
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "gemma3:4b"
    ollama_timeout_seconds: float = 120.0

    # --- Gemma 4 cloud (OPTIONAL — only if user explicitly enables) ---
    gemini_api_key: str = ""
    gemma_model: str = "gemma-4-e4b"

    # --- File observation (Claude Cowork-style) ---
    file_watch_dirs: list = field(default_factory=lambda: [
        str(Path.home() / "Documents"),
        str(Path.home() / "Desktop"),
    ])
    file_watch_extensions: tuple[str, ...] = (
        ".py", ".ts", ".tsx", ".js", ".jsx", ".md", ".txt", ".json",
        ".csv", ".html", ".css", ".yaml", ".yml", ".toml", ".cfg",
        ".java", ".cpp", ".c", ".h", ".rs", ".go", ".rb", ".sh",
        ".bat", ".ps1", ".sql", ".xml", ".ini", ".log", ".env",
        ".docx", ".pdf",  # metadata only for these
    )
    file_watch_max_read_bytes: int = 100_000  # max bytes to read from a single file
    file_index_max_entries: int = 10_000      # cap index size

    # --- Cognitive twin ---
    twin_path: Path = field(default_factory=lambda: DATA_DIR / "twin.json")
    review_queue_path: Path = field(default_factory=lambda: DATA_DIR / "review_queue.json")
    file_index_path: Path = field(default_factory=lambda: DATA_DIR / "file_index.json")

    # --- Default user id ---
    user_id: str = "default"

    @classmethod
    def from_env(cls) -> "Settings":
        s = cls()
        s.host = os.getenv("APP_HOST", s.host)
        s.port = int(os.getenv("APP_PORT", s.port))
        s.capture_interval_seconds = float(
            os.getenv("CAPTURE_INTERVAL", s.capture_interval_seconds)
        )
        s.inference_provider = os.getenv("INFERENCE_PROVIDER", s.inference_provider)
        s.ollama_model = os.getenv("OLLAMA_MODEL", s.ollama_model)
        s.ollama_base_url = os.getenv("OLLAMA_BASE_URL", s.ollama_base_url)
        s.user_id = os.getenv("USER_ID", s.user_id)
        s.gemini_api_key = os.getenv("GEMINI_API_KEY", s.gemini_api_key)
        s.gemma_model = os.getenv("GEMMA_MODEL", s.gemma_model)

        # Parse comma-separated watch dirs from env
        watch_dirs = os.getenv("FILE_WATCH_DIRS")
        if watch_dirs:
            s.file_watch_dirs = [d.strip() for d in watch_dirs.split(",") if d.strip()]

        return s


settings = Settings.from_env()
