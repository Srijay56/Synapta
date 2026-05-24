"""System prompt construction. The twin summary + relevant memories are injected
here so Gemma's answer is grounded in the user's real context."""
from __future__ import annotations

from typing import Iterable, Optional


SYSTEM_BASE = """You are a personal AI companion running entirely on the user's own
machine. You have access to a Cognitive Twin (a learned model of the user) and a
memory store of past observations. Use this context to give personalized, concise
answers in the user's own voice and vocabulary.

Hard rules:
- Never invent memories that aren't in the provided context.
- If you're uncertain, say so — short and honest beats long and confident.
- Default to brief replies (1-4 sentences) unless the user asks for more.
- Treat the screen-capture context as observational only; never quote private
  information (passwords, full card numbers, etc.) back to the user."""


def build_system_prompt(
    twin_summary: dict,
    relevant_memories: Iterable[str],
    screen_context: Optional[str] = None,
) -> str:
    mem_block = "\n".join(f"- {m}" for m in relevant_memories) or "- (no relevant memories yet)"

    prefs = twin_summary.get("preferences", {}) or {}
    pref_lines = "\n".join(f"  {k}: {v}" for k, v in prefs.items()) or "  (none recorded)"

    parts = [
        SYSTEM_BASE,
        "",
        "## Cognitive Twin",
        f"Observations recorded: {twin_summary.get('observation_count', 0)}",
        f"Top vocabulary: {', '.join(twin_summary.get('top_vocabulary', [])) or '(none)'}",
        f"Frequently used apps: {', '.join(twin_summary.get('top_apps', [])) or '(none)'}",
        f"Active hours (24h): {twin_summary.get('peak_hours', [])}",
        "Known preferences:",
        pref_lines,
        "",
        "## Relevant memories",
        mem_block,
    ]

    if screen_context:
        # Trim to keep prompt small.
        snippet = screen_context.strip()[:1500]
        parts += ["", "## Current screen (OCR)", snippet]

    return "\n".join(parts)
