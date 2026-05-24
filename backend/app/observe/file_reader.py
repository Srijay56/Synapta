"""Local file reader — reads files on-device when explicitly asked.

Privacy guard: only reads from whitelisted file_watch_dirs.
Used by the AI when user asks "what was I working on?" or "read my notes".
All data stays on-device. No file contents are ever sent to external APIs
when using Ollama (local inference).
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

from app.config import settings


def _is_allowed(path: str) -> bool:
    """Check if the file is under a watched directory (security guard)."""
    abs_path = os.path.abspath(path)
    for watch_dir in settings.file_watch_dirs:
        if abs_path.startswith(os.path.abspath(watch_dir)):
            return True
    return False


def read_file(path: str, max_bytes: Optional[int] = None) -> dict:
    """Read a local file's contents. Returns {path, content, size, error}."""
    max_bytes = max_bytes or settings.file_watch_max_read_bytes

    if not _is_allowed(path):
        return {"path": path, "content": None, "error": "File not in watched directories"}

    try:
        p = Path(path)
        if not p.exists():
            return {"path": path, "content": None, "error": "File not found"}

        if not p.is_file():
            return {"path": path, "content": None, "error": "Not a file"}

        size = p.stat().st_size

        # Binary files — return metadata only
        binary_exts = {".pdf", ".docx", ".xlsx", ".pptx", ".zip", ".tar", ".gz",
                       ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".ico", ".svg",
                       ".mp3", ".mp4", ".avi", ".mov", ".exe", ".dll", ".so"}
        if p.suffix.lower() in binary_exts:
            return {
                "path": str(p),
                "content": f"[Binary file: {p.suffix}, {size} bytes]",
                "size": size,
                "type": "binary",
                "error": None,
            }

        # Text files — read with size limit
        content = p.read_text(encoding="utf-8", errors="replace")
        if len(content) > max_bytes:
            content = content[:max_bytes] + f"\n\n... [truncated at {max_bytes} bytes, total: {size} bytes]"

        return {
            "path": str(p),
            "content": content,
            "size": size,
            "type": "text",
            "error": None,
        }
    except Exception as e:
        return {"path": path, "content": None, "error": str(e)}


def list_recent_files(directory: Optional[str] = None, limit: int = 20) -> list[dict]:
    """List recently modified files in a directory or across all watched dirs."""
    dirs = [directory] if directory else settings.file_watch_dirs
    exts = set(settings.file_watch_extensions)
    files: list[dict] = []

    for d in dirs:
        if not os.path.isdir(d):
            continue
        try:
            for root, subdirs, filenames in os.walk(d):
                subdirs[:] = [
                    sd for sd in subdirs
                    if not sd.startswith(".") and sd not in (
                        "node_modules", "__pycache__", ".venv", "venv",
                        ".git", ".hg", "dist", "build", ".next",
                    )
                ]
                for fname in filenames:
                    p = Path(root) / fname
                    if p.suffix.lower() not in exts:
                        continue
                    try:
                        stat = p.stat()
                        files.append({
                            "path": str(p),
                            "name": p.name,
                            "extension": p.suffix,
                            "size": stat.st_size,
                            "modified_at": stat.st_mtime,
                            "directory": str(p.parent),
                        })
                    except (OSError, PermissionError):
                        continue
        except (OSError, PermissionError):
            continue

    files.sort(key=lambda f: -f["modified_at"])
    return files[:limit]
