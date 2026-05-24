"""Pause capture when the foreground window matches a denylist (password mgr, banking, etc.)."""
from __future__ import annotations

import sys
from typing import Optional

from app.config import settings


def _active_window_title_windows() -> Optional[str]:
    try:
        import pygetwindow as gw  # type: ignore
        win = gw.getActiveWindow()
        return win.title if win else None
    except Exception:
        return None


def _active_window_title_generic() -> Optional[str]:
    # Best-effort no-op on platforms we don't specifically support.
    return None


def get_active_window_title() -> Optional[str]:
    if sys.platform == "win32":
        return _active_window_title_windows()
    return _active_window_title_generic()


def is_window_blocked(title: Optional[str] = None) -> tuple[bool, Optional[str]]:
    """Return (blocked, matched_term). If blocked, capture should be skipped."""
    if title is None:
        title = get_active_window_title()
    if not title:
        return False, None
    low = title.lower()
    for term in settings.window_denylist:
        if term in low:
            return True, term
    return False, None
