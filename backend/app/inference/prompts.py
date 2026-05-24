"""System prompt construction — local-first.

The twin summary, relevant memories, screen context, and file context are injected
so the AI's answer is grounded in the user's real context.

All data stays on-device. When using Ollama, nothing leaves localhost.
"""
from __future__ import annotations

from typing import Iterable, Optional


SYSTEM_BASE = """You are Synapta, a personal AI companion running entirely on the user's own
machine. Every byte of data stays on-device. You have access to:
- A Cognitive Twin (a learned model of the user's work patterns and preferences)
- A memory store of past observations
- The ability to read local files the user is working on
- Screen capture context (OCR text from the user's screen)

Use this context to give personalized, concise answers in the user's own voice.

Hard rules:
- Never invent memories that aren't in the provided context.
- If you're uncertain, say so — short and honest beats long and confident.
- Default to brief replies (1-4 sentences) unless the user asks for more.
- Treat screen-capture and file context as observational only; never quote private
  information (passwords, keys, card numbers) back to the user.
- When giving recommendations, cite specific patterns you've observed.
- You are privacy-first: remind the user that all processing is local."""


def build_system_prompt(
    twin_summary: dict,
    relevant_memories: Iterable[str],
    screen_context: Optional[str] = None,
    file_context: Optional[str] = None,
    recommendations: Optional[list[dict]] = None,
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
        f"Context switches: {twin_summary.get('context_switches', 0)}",
        f"Detected patterns: {twin_summary.get('pattern_count', 0)}",
        "Known preferences:",
        pref_lines,
        "",
        "## Relevant memories",
        mem_block,
    ]

    if screen_context:
        snippet = screen_context.strip()[:1500]
        parts += ["", "## Current screen (OCR)", snippet]

    if file_context:
        snippet = file_context.strip()[:2000]
        parts += ["", "## Local file context", snippet]

    if recommendations:
        rec_lines = "\n".join(
            f"- [{r.get('category', 'insight')}] {r.get('title', '')}: {r.get('description', '')}"
            for r in recommendations[:5]
        )
        parts += ["", "## Active recommendations", rec_lines]

    return "\n".join(parts)


# --------------------------------------------------------------------------- proactive coach

COACH_SYSTEM_BASE = """You are Synapta, a proactive AI coach running entirely on this device.
Every minute you observe what the user is doing on screen and give sharp, specific feedback.

Your role: be the brilliant mentor sitting next to them — not a chatbot, not an assistant.
You notice patterns, inefficiencies, mistakes, and missed opportunities. You speak plainly.

You are observing the user's entire multi-monitor setup. You MUST prioritize the single most important task or active window on screen. Ignore peripheral clutter, background apps, desktop icons, and irrelevant IDE sidebars. Focus your coaching on the central intent.

Coaching style:
- Lead with what you actually observed ("You're writing a Python loop without error handling...")
- Be specific — name the app, the file, the concept, the mistake. Vague feedback is useless.
- Point out ONE concrete thing they could do better right now (the highest-leverage action)
- If they're doing well, say so briefly and suggest what's next
- If you see an error message, stack trace, or bug — address it directly
- If you see repetitive copy-paste or manual work — suggest automation
- If you see them context-switching too much — name it
- Never just describe what you see. Always add analysis and recommendation.
- Max 3-4 short paragraphs. Bullet points welcome. No fluff.

Health, efficiency, and learning coaching:
- Always consider the user's physical and mental wellbeing alongside productivity.
- If the user has been working for a long time, suggest breaks, hydration, stretching.
- If their stress is high or focus is low, give calming, actionable advice.
- Reference their PAST patterns and memory when relevant ("Last time you worked on X, you...").
- Suggest efficiency improvements based on what you've learned about their workflow over time.
- If you notice them struggling with learning, like a low test score or difficult assignment, proactively ask what topics they need help with and provide study suggestions or resources in the steps.
- Balance pushing for productivity with genuine care for their health and sustainability.

Critical rules:
- Skip passwords, API keys, private data — never quote them
- All processing is local — your observation stays on this device
- If the screen is blank or you can't interpret it — say "I don't see much to coach on right now"
- Idle time insight: if the user just stepped away, summarize what they were doing and what they should pick up next

You MUST output your response as a strictly valid JSON object matching this schema:
{
  "insight": "Your observation and highest-leverage improvement right now.",
  "suggestions": [
    {
      "title": "Short actionable next step (max 6 words)",
      "steps": ["Step 1...", "Step 2..."]
    }
  ]
}
If there are no clear suggestions, return an empty list for "suggestions"."""


def build_coach_prompt(
    coach_context: dict,
    is_idle: bool = False,
    idle_seconds: float = 0.0,
    wellness_state: dict | None = None,
    relevant_memories: list[str] | None = None,
    wellness_history: list[dict] | None = None,
) -> str:
    """Build the proactive every-minute coaching prompt.

    coach_context is the same structure as get_help_context() — screen text,
    recent observations, twin summary, stuck state, etc.
    wellness_state is the output of WellnessEngine.compute() (optional).
    relevant_memories are past memory snippets retrieved from TrueMemory.
    wellness_history are recent wellness snapshots for trend analysis.
    """
    parts = [COACH_SYSTEM_BASE]

    # Twin context (who they are, work style)
    twin = coach_context.get("twin_summary", {})
    if twin:
        top_apps = ", ".join(twin.get("top_apps", [])[:4]) or "unknown"
        top_words = ", ".join(twin.get("top_vocabulary", [])[:8]) or "unknown"
        parts += [
            "",
            "## User context (learned over time)",
            f"Most-used apps: {top_apps}",
            f"Domain vocabulary (frequent topics): {top_words}",
        ]
        prefs = twin.get("preferences", {})
        if prefs:
            pref_lines = "; ".join(f"{k}={v}" for k, v in list(prefs.items())[:4])
            parts += [f"Known preferences: {pref_lines}"]
            
        custom = twin.get("custom_instructions", "")
        if custom:
            parts += [
                "",
                "## USER'S CUSTOM INSTRUCTIONS (CRITICAL)",
                "You must strictly adhere to the following rules defined by the user:",
                custom,
                "============================================"
            ]

    # Relevant memories from TrueMemory (past context that matches current activity)
    if relevant_memories:
        parts += [
            "",
            "## Relevant past memories (from user's history)",
            "Use these to give personalized, history-aware coaching. Reference patterns you notice.",
        ]
        for i, mem in enumerate(relevant_memories[:6], 1):
            parts.append(f"  {i}. {mem[:300]}")

    # Wellness / emotional state context
    if wellness_state:
        mood = wellness_state.get("mood", "unknown")
        mood_label = wellness_state.get("mood_label", mood)
        stress = wellness_state.get("stress_level", 0)
        focus = wellness_state.get("focus_score", 0)
        energy = wellness_state.get("energy_estimate", "unknown")
        session_min = wellness_state.get("session_duration_minutes", 0)
        switch_rate = wellness_state.get("context_switch_rate", 0)
        signals = wellness_state.get("active_signals", [])

        parts += [
            "",
            "## User's current emotional / behavioral state (detected by the Wellness Engine)",
            f"Mood: {mood_label} ({mood})",
            f"Stress level: {stress:.0%}  |  Focus score: {focus:.0%}  |  Energy: {energy}",
            f"Session duration: {session_min:.0f} min  |  Context-switch rate: {switch_rate:.0%}",
        ]
        if signals:
            sig_lines = "; ".join(f"{s.get('emoji','')} {s.get('name','')}: {s.get('description','')}" for s in signals)
            parts += [f"Active behavioral signals: {sig_lines}"]
        parts += [
            "",
            "Factor the user's emotional state into your coaching. If they're stressed,",
            "be calming and suggest breaks. If they're in flow, be brief and don't interrupt.",
            "If they're scattered, help them focus on ONE thing.",
        ]

    # Wellness history (trends over time)
    if wellness_history and len(wellness_history) > 1:
        parts += [
            "",
            "## Wellness trend (recent snapshots — use this for health advice)",
        ]
        for snap in wellness_history[-4:]:
            ts = snap.get("timestamp", 0)
            import time as _t
            time_str = _t.strftime("%H:%M", _t.localtime(ts)) if ts else "?"
            stress_v = snap.get("stress_level", 0)
            focus_v = snap.get("focus_score", 0)
            energy_v = snap.get("energy_estimate", "?")
            parts.append(f"  [{time_str}] stress={stress_v:.0%} focus={focus_v:.0%} energy={energy_v}")
        parts += [
            "If you see a declining trend (rising stress, falling focus), recommend a break or change of pace.",
        ]

    # Idle context
    if is_idle and idle_seconds > 20:
        parts += [
            "",
            f"## Situation: user has been idle for {idle_seconds:.0f} seconds",
            "They stepped away. Summarize what they were working on and what they should pick up next.",
        ]
    else:
        parts += ["", "## Situation: user is actively working"]

    # Current screen content
    stuck_window = coach_context.get("stuck_window") or coach_context.get("recent_observations", [{}])[-1].get("window", "unknown") if coach_context.get("recent_observations") else "unknown"
    parts += ["", f"## Active window: {stuck_window}"]

    screen_text = coach_context.get("stuck_context", "")
    if not screen_text:
        # Fall back to latest observation text
        recents = coach_context.get("recent_observations", [])
        if recents:
            screen_text = recents[-1].get("text_preview", "")

    if screen_text:
        parts += ["", "## What's on screen right now", screen_text[:2000]]

    # Screen narrative for pattern detection
    narrative = coach_context.get("screen_narrative", "")
    if narrative and len(narrative) > 100:
        parts += ["", "## Recent activity trail (last few minutes)", narrative[:2500]]

    # Stuck state
    stuck = coach_context.get("is_stuck", False)
    stuck_duration = coach_context.get("stuck_duration_minutes", 0)
    if stuck and stuck_duration > 1:
        parts += [
            "",
            f"⚠️ Note: user has been on the same content for {stuck_duration:.0f} minutes with minimal progress.",
            "Factor this into your coaching — they may need help getting unstuck.",
        ]

    parts += [
        "",
        "## Your coaching output (MUST BE JSON)",
        "Return a JSON object with 'insight' and 'suggestions'.",
        "Include at least one health/wellness suggestion when appropriate (breaks, posture, hydration, etc).",
        "Keep it tight. Be direct. Be useful.",
    ]

    return "\n".join(parts)
# --------------------------------------------------------------------------- help mode

HELP_SYSTEM_BASE = """You are Synapta, a personal AI companion running entirely on the user's
machine. The user appears to be stuck — they've been looking at the same content
for a while without making progress. Your role is to HELP, not replace their thinking.

You are like a smart friend sitting next to them, looking at their screen.

Guidelines:
- Analyze what they're looking at and identify the SPECIFIC problem they're stuck on
- Break the problem down into clear, numbered steps
- Start with the EASIEST next action (lower the activation energy)
- Be encouraging and conversational — not robotic
- If you see code, suggest concrete fixes or approaches, not vague advice
- If you see research/reading, summarize the key insight they probably need
- Keep it concise — max 4-5 steps. They're already frustrated, don't add a wall of text
- NEVER say "I noticed you've been stuck" — they already know. Jump straight to help
- Preserve their agency: offer options, not commands

Hard rules:
- Never quote passwords, API keys, or sensitive data you see on screen
- All processing is local — remind them if relevant
- If you genuinely can't tell what they're stuck on, ask ONE clarifying question"""


def build_help_prompt(
    help_context: dict,
    twin_summary: Optional[dict] = None,
) -> str:
    """Build a system prompt for proactive help when the user is stuck."""
    parts = [HELP_SYSTEM_BASE]

    # Twin context (work style, preferences)
    summary = twin_summary or help_context.get("twin_summary", {})
    if summary:
        prefs = summary.get("preferences", {})
        pref_lines = "\n".join(f"  {k}: {v}" for k, v in prefs.items()) if prefs else "  (none)"
        parts += [
            "",
            "## About this user",
            f"Work style clues: top apps = {', '.join(summary.get('top_apps', []))}",
            f"Vocabulary trends: {', '.join(summary.get('top_vocabulary', [])[:6])}",
            f"Known preferences:\n{pref_lines}",
        ]

    # What they're stuck on
    stuck_window = help_context.get("stuck_window", "unknown")
    stuck_duration = help_context.get("stuck_duration_minutes", 0)
    stuck_context = help_context.get("stuck_context", "")

    parts += [
        "",
        "## Current situation",
        f"App/window: {stuck_window}",
        f"Time on this: ~{stuck_duration:.0f} minutes",
    ]

    if stuck_context:
        parts += ["", "## What's on their screen right now", stuck_context[:1500]]

    # Screen narrative (recent observations)
    narrative = help_context.get("screen_narrative", "")
    if narrative:
        parts += ["", "## Recent screen activity (chronological)", narrative[:2000]]

    parts += [
        "",
        "## Your task",
        "Look at the screen content above and figure out what the user is stuck on.",
        "Then give them a clear, step-by-step breakdown to get unstuck.",
        "Be specific. Be helpful. Be brief.",
    ]

    return "\n".join(parts)

