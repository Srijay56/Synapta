"""File watcher — observes local directories for document activity.

Runs in a background thread, indexes file metadata (name, path, size, mtime),
and publishes events when files change. Does NOT read file contents automatically
— only when explicitly asked via file_reader.

All data stays on-device. This is the "eyes" of CogOS for your filesystem.
"""
from __future__ import annotations

import asyncio
import json
import os
import threading
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Optional

from app.config import settings


@dataclass
class FileEntry:
    path: str
    name: str
    extension: str
    size_bytes: int
    modified_at: float
    directory: str
    last_seen: float = field(default_factory=time.time)

    @classmethod
    def from_path(cls, p: Path) -> Optional["FileEntry"]:
        try:
            stat = p.stat()
            return cls(
                path=str(p),
                name=p.name,
                extension=p.suffix.lower(),
                size_bytes=stat.st_size,
                modified_at=stat.st_mtime,
                directory=str(p.parent),
            )
        except (OSError, PermissionError):
            return None


class FileIndex:
    """In-memory + JSON-persisted index of observed files."""

    def __init__(self, path: Optional[Path] = None):
        self._path = path or settings.file_index_path
        self._entries: dict[str, FileEntry] = {}
        self._lock = threading.Lock()
        self._load()

    def _load(self) -> None:
        if not self._path.exists():
            return
        try:
            data = json.loads(self._path.read_text(encoding="utf-8"))
            for raw in data.get("files", []):
                entry = FileEntry(**raw)
                self._entries[entry.path] = entry
        except Exception:
            self._entries = {}

    def _persist(self) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        # Keep bounded
        if len(self._entries) > settings.file_index_max_entries:
            sorted_entries = sorted(self._entries.values(), key=lambda e: -e.modified_at)
            self._entries = {e.path: e for e in sorted_entries[:settings.file_index_max_entries]}
        payload = {"files": [asdict(e) for e in self._entries.values()]}
        self._path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    def upsert(self, entry: FileEntry) -> bool:
        """Returns True if this is a new or updated entry."""
        with self._lock:
            existing = self._entries.get(entry.path)
            if existing and existing.modified_at >= entry.modified_at:
                existing.last_seen = time.time()
                return False
            self._entries[entry.path] = entry
            return True

    def save(self) -> None:
        with self._lock:
            self._persist()

    def get_recent(self, limit: int = 20) -> list[FileEntry]:
        with self._lock:
            return sorted(self._entries.values(), key=lambda e: -e.modified_at)[:limit]

    def search(self, query: str, limit: int = 20) -> list[FileEntry]:
        q = query.lower()
        with self._lock:
            matches = [
                e for e in self._entries.values()
                if q in e.name.lower() or q in e.path.lower()
            ]
            matches.sort(key=lambda e: -e.modified_at)
            return matches[:limit]

    def stats(self) -> dict:
        with self._lock:
            ext_counts: dict[str, int] = {}
            for e in self._entries.values():
                ext_counts[e.extension] = ext_counts.get(e.extension, 0) + 1
            return {
                "total_files": len(self._entries),
                "extensions": ext_counts,
                "watched_dirs": settings.file_watch_dirs,
            }


class FileWatcher:
    """Background thread that scans configured directories periodically."""

    def __init__(self, index: FileIndex, interval: float = 30.0):
        self._index = index
        self._interval = interval
        self._thread: Optional[threading.Thread] = None
        self._stop = threading.Event()
        self._event_loop: Optional[asyncio.AbstractEventLoop] = None
        self._bus = None

    def start(self, loop: asyncio.AbstractEventLoop) -> None:
        self._event_loop = loop
        if self._thread is not None:
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._run, name="file-watcher", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=3)
            self._thread = None

    def _scan_directory(self, dir_path: str) -> int:
        """Scan a directory and return count of new/updated files."""
        changes = 0
        exts = set(settings.file_watch_extensions)
        try:
            for root, dirs, files in os.walk(dir_path):
                # Skip hidden dirs, node_modules, .git, __pycache__, .venv
                dirs[:] = [
                    d for d in dirs
                    if not d.startswith(".") and d not in (
                        "node_modules", "__pycache__", ".venv", "venv",
                        ".git", ".hg", "dist", "build", ".next",
                    )
                ]
                for fname in files:
                    p = Path(root) / fname
                    if p.suffix.lower() not in exts:
                        continue
                    entry = FileEntry.from_path(p)
                    if entry and self._index.upsert(entry):
                        changes += 1
        except (OSError, PermissionError):
            pass
        return changes

    def _run(self) -> None:
        # Initial scan
        self._do_scan()

        while not self._stop.is_set():
            self._stop.wait(timeout=self._interval)
            if self._stop.is_set():
                break
            self._do_scan()

    def _do_scan(self) -> None:
        total_changes = 0
        for d in settings.file_watch_dirs:
            if os.path.isdir(d):
                total_changes += self._scan_directory(d)

        self._index.save()

        if total_changes > 0 and self._event_loop and self._bus:
            try:
                asyncio.run_coroutine_threadsafe(
                    self._bus.publish("files.updated", {"changes": total_changes}),
                    self._event_loop,
                )
            except Exception:
                pass


# Module-level singletons
file_index = FileIndex()
file_watcher = FileWatcher(file_index)
