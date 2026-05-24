"""Synapta Backend — Local-First Cognitive Operating System.

Runs entirely on-device. All inference goes to local Ollama (localhost:11434).
No data leaves the machine unless the user explicitly enables cloud inference.

Features:
  - Screen capture + OCR
  - File/directory observation
  - Cognitive Twin (behavioral model)
  - TrueMemory (local SQLite)
  - Pattern detection (bottlenecks, forgotten tasks, workflow analysis)
  - Proactive recommendations
  - Privacy gate + review queue
  - WebSocket event bus
"""
from __future__ import annotations

import asyncio
import contextlib
import time
from dataclasses import asdict
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from app.capture.ocr import OCREngine
from app.capture.screen import ScreenGrabber
from app.cognitive_twin.twin import manager as twin_manager
from app.config import PROJECT_ROOT, settings
from app.hotkey import HotkeyListener
from app.inference.router import ChatMessage, router as inference
from app.inference.prompts import build_system_prompt, build_help_prompt, build_coach_prompt
from app.memory.store import store as memory
from app.observe.file_watcher import file_index, file_watcher
from app.observe.file_reader import read_file, list_recent_files
from app.predictions.engine import get_predictions
from app.recommendations.engine import get_recommendations
from app.privacy.review_queue import ReviewItem, queue
from app.privacy.window_filter import get_active_window_title
from app.schemas import (
    CaptureControl,
    ChatRequest,
    ChatResponse,
    MemoryNote,
    PreferenceUpdate,
    ReviewDecision,
)
from app.workers.capture_loop import worker
from app.workers.autonomous_observer import observer
from app.workers.events import bus
from app.wellness.engine import wellness


# ----------------------------------------------------------------------------- helpers


async def _grab_screen_text() -> str:
    loop = asyncio.get_running_loop()

    def _do():
        grabber = ScreenGrabber()
        try:
            frame = grabber.grab()
            ocr = OCREngine()
            return ocr.read(frame.image).text
        finally:
            grabber.close()

    return await loop.run_in_executor(None, _do)


async def _run_chat(message: str, include_screen: bool, deep_memory: bool, include_files: bool = False) -> ChatResponse:
    screen_text: Optional[str] = None
    if include_screen:
        with contextlib.suppress(Exception):
            screen_text = await _grab_screen_text()

    # Memory retrieval
    search_fn = memory.search_deep if deep_memory else memory.search
    raw_hits = search_fn(message) or []
    mem_lines: list[str] = []
    for h in raw_hits[:8]:
        if isinstance(h, dict):
            mem_lines.append(h.get("content") or h.get("memory") or str(h))
        else:
            mem_lines.append(str(h))

    # File context (if requested)
    file_context = None
    if include_files:
        recent_files = file_index.get_recent(limit=10)
        if recent_files:
            file_lines = [f"- {f.name} ({f.extension}, {f.size_bytes}B, modified {time.strftime('%Y-%m-%d %H:%M', time.localtime(f.modified_at))})" for f in recent_files]
            file_context = "Recent files on your device:\n" + "\n".join(file_lines)

    # Get active recommendations for context
    recs = get_recommendations(limit=3)
    rec_dicts = [asdict(r) for r in recs] if recs else None

    system = build_system_prompt(
        twin_summary=twin_manager.twin.summarize(),
        relevant_memories=mem_lines,
        screen_context=screen_text,
        file_context=file_context,
        recommendations=rec_dicts,
    )

    reply = await inference.chat([
        ChatMessage(role="system", content=system),
        ChatMessage(role="user", content=message),
    ])

    await bus.publish("chat.completed", {"message": message[:200], "response_preview": reply[:200]})

    provider = inference.active_provider
    model_name = settings.ollama_model if provider == "ollama" else settings.gemma_model

    return ChatResponse(
        response=reply,
        model=f"{provider}:{model_name}",
        memory_hits=len(mem_lines),
        used_screen_context=screen_text is not None,
    )


async def _on_hotkey() -> None:
    await bus.publish("hotkey.fired", {})
    try:
        screen_text = await _grab_screen_text()
    except Exception as e:
        await bus.publish("hotkey.error", {"error": str(e)})
        return

    prompt = "Look at what's on my screen right now. Briefly tell me the single most useful next action or insight."
    system = build_system_prompt(
        twin_summary=twin_manager.twin.summarize(),
        relevant_memories=[],
        screen_context=screen_text,
    )
    reply = await inference.chat([
        ChatMessage(role="system", content=system),
        ChatMessage(role="user", content=prompt),
    ])
    await bus.publish("hotkey.response", {"response": reply})


# ----------------------------------------------------------------------------- app

app = FastAPI(title="Synapta", version="0.3.0", description="Local-first cognitive operating system. All data stays on your device.")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

static_dir = PROJECT_ROOT / "app" / "static"
static_dir.mkdir(parents=True, exist_ok=True)
app.mount("/ui", StaticFiles(directory=str(static_dir), html=True), name="ui")

_hotkey: Optional[HotkeyListener] = None


@app.on_event("startup")
async def _startup() -> None:
    global _hotkey
    await worker.start()
    await observer.start()

    # Wire the proactive coaching callback into the observer.
    # The observer calls this every 60s with a system prompt; we run the AI and return text.
    async def _coach_fn(system_prompt: str) -> str:
        return await inference.chat([
            ChatMessage(role="system", content=system_prompt),
            ChatMessage(role="user", content="What do you see, and what should I focus on or improve right now?"),
        ])

    observer.set_coach_callback(_coach_fn)

    # Start file watcher
    loop = asyncio.get_running_loop()
    file_watcher._bus = bus
    file_watcher.start(loop)

    _hotkey = HotkeyListener(on_trigger=_on_hotkey, loop=loop)
    _hotkey.start()


@app.on_event("shutdown")
async def _shutdown() -> None:
    global _hotkey
    if _hotkey is not None:
        _hotkey.stop()
    file_watcher.stop()
    await observer.stop()
    await worker.stop()


# ----------------------------------------------------------------------------- routes

@app.get("/")
async def root():
    return {
        "name": "Synapta",
        "version": "0.3.0",
        "mode": "local-first",
        "docs": "/docs",
        "frontend": "/ui",
        "events_ws": "/ws/events",
        "inference_provider": inference.active_provider,
        "local_only": inference.is_local,
    }


@app.get("/health")
async def health():
    inference_h = await inference.health()
    return {
        "ok": True,
        "mode": "local-first",
        "memory_backend": memory.backend,
        "capture": worker.last_status,
        "capture_paused": worker.is_paused,
        "inference": inference_h,
        "file_watcher": file_index.stats(),
        "twin": {
            "observations": twin_manager.twin.observation_count,
            "patterns": len(twin_manager.twin.recurring_patterns),
            "context_switches": twin_manager.twin.context_switches,
        },
        "hotkey": settings.hotkey_combo,
    }


# ----- chat / inference

@app.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    include_files = getattr(req, "include_files", False)
    return await _run_chat(req.message, req.include_screen, req.deep_memory, include_files)


# ----- activity logging

@app.post("/activity")
async def log_activity(payload: dict):
    activity = payload.get("activity", "unknown")
    description = payload.get("description", "")
    duration = payload.get("duration_minutes", 5)

    content = f"[{activity}] {description} ({duration} min)"
    result = memory.add(content=content, metadata={"activity": activity, "duration": duration})
    twin_manager.ingest_observation(content, window_title=activity)

    memory_item = {
        "id": result.get("id", "") if isinstance(result, dict) else str(time.time()),
        "activity": activity,
        "summary": description,
        "tags": [activity],
        "mood": "focused" if activity in ("coding", "writing", "reading") else "neutral",
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "duration_minutes": duration,
    }

    profile = _twin_to_profile()
    await bus.publish("activity.logged", {"activity": activity, "description": description[:200]})
    return {"memory": memory_item, "profile": profile}


# ----- profile (twin-derived)

def _twin_to_profile() -> dict:
    twin = twin_manager.twin
    summary = twin.summarize()
    obs = twin.observation_count
    top_apps = summary.get("top_apps", [])
    peak_hours = summary.get("peak_hours", [])

    peak_period = "morning"
    if peak_hours:
        h = peak_hours[0]
        if 5 <= h < 12:
            peak_period = "morning"
        elif 12 <= h < 17:
            peak_period = "afternoon"
        elif 17 <= h < 21:
            peak_period = "evening"
        else:
            peak_period = "night"

    app_count = len(twin.apps)
    if app_count <= 2 and obs >= 5:
        work_style = "deep-focus"
    elif app_count >= 5:
        work_style = "multitasker"
    elif obs >= 3:
        work_style = "sprinter"
    else:
        work_style = "unknown"

    total_app_hits = sum(twin.apps.values()) or 1
    distribution = {app: round((count / total_app_hits) * 100) for app, count in
                    sorted(twin.apps.items(), key=lambda x: -x[1])[:6]}
    dominant = max(twin.apps.items(), key=lambda x: x[1])[0] if twin.apps else "unknown"

    return {
        "id": settings.user_id,
        "preferred_work_style": work_style,
        "avg_focus_minutes": 25,
        "dominant_activity": dominant,
        "total_sessions": obs,
        "peak_hours": peak_period,
        "activity_distribution": distribution,
        "context_switches": twin.context_switches,
        "patterns_detected": len(twin.recurring_patterns),
        "behavioral_notes": [
            f"Top vocabulary: {', '.join(summary.get('top_vocabulary', [])[:5])}",
            f"Active apps: {', '.join(top_apps[:3])}",
            f"Context switches: {twin.context_switches}",
        ] + [f"{k}: {v}" for k, v in summary.get("preferences", {}).items()][:3],
        "updated_at": summary.get("updated_at", time.time()),
    }


@app.get("/profile")
async def get_profile():
    return {"profile": _twin_to_profile()}


class CustomInstructionsRequest(BaseModel):
    instructions: str

@app.post("/profile/instructions")
async def update_custom_instructions(req: CustomInstructionsRequest):
    twin_manager.set_custom_instructions(req.instructions)
    return {"ok": True}


@app.get("/privacy/settings")
async def get_privacy_settings():
    return {
        "privacy_mode": settings.privacy_mode,
        "window_allowlist": list(settings.window_allowlist),
        "window_denylist": list(settings.window_denylist),
    }

class PrivacySettingsRequest(BaseModel):
    privacy_mode: str
    window_allowlist: list[str]

@app.post("/privacy/settings")
async def update_privacy_settings(req: PrivacySettingsRequest):
    settings.privacy_mode = req.privacy_mode
    settings.window_allowlist = tuple(req.window_allowlist)
    return {"ok": True}

# ----- memory

@app.post("/memory/note")
async def add_note(note: MemoryNote):
    meta = {"tag": note.tag} if note.tag else None
    result = memory.add(content=note.content, metadata=meta)
    twin_manager.ingest_observation(note.content, window_title=note.tag)
    return {"ok": True, "stored": result}


@app.get("/memory/search")
async def search_memory(q: str, deep: bool = False, limit: int = 10):
    fn = memory.search_deep if deep else memory.search
    return {"query": q, "deep": deep, "results": fn(q) if deep else fn(q, limit=limit)}


@app.get("/memory/stats")
async def memory_stats():
    return memory.stats()


@app.get("/memory/all")
async def memory_all():
    return {"items": memory.get_all()}


# ----- file observation (Claude Cowork-style)

@app.get("/files/recent")
async def files_recent(limit: int = 20):
    entries = file_index.get_recent(limit=limit)
    return {"files": [asdict(e) for e in entries]}


@app.get("/files/search")
async def files_search(q: str, limit: int = 20):
    entries = file_index.search(q, limit=limit)
    return {"query": q, "files": [asdict(e) for e in entries]}


@app.post("/files/read")
async def files_read(payload: dict):
    path = payload.get("path", "")
    if not path:
        raise HTTPException(400, "path is required")
    result = read_file(path)
    if result.get("error"):
        raise HTTPException(403, result["error"])
    return result


@app.get("/files/status")
async def files_status():
    return file_index.stats()


# ----- recommendations & insights

@app.get("/recommendations")
async def recommendations(limit: int = 10):
    items = get_recommendations(limit=limit)
    return {"items": [asdict(r) for r in items]}


@app.get("/insights")
async def insights():
    preds = get_predictions(limit=5)
    recs = get_recommendations(limit=5)
    return {
        "predictions": [asdict(p) for p in preds],
        "recommendations": [asdict(r) for r in recs],
        "twin_summary": twin_manager.twin.summarize(),
        "file_stats": file_index.stats(),
    }


# ----- patterns (twin analysis)

@app.get("/patterns")
async def patterns():
    return {
        "patterns": twin_manager.get_patterns(),
        "session_log": twin_manager.get_session_log(limit=30),
        "context_switches": twin_manager.twin.context_switches,
    }


# ----- review queue

@app.get("/review")
async def list_review(include_resolved: bool = False):
    items = await (queue.list_all() if include_resolved else queue.list_pending())
    return {"items": [i.__dict__ for i in items]}


@app.post("/review/{item_id}/approve")
async def approve_review(item_id: str, decision: ReviewDecision = ReviewDecision()):
    item = await queue.get(item_id)
    if item is None:
        raise HTTPException(404, "review item not found")
    if item.status != "pending":
        raise HTTPException(409, f"item already {item.status}")

    memory.add(
        content=item.text,
        metadata={"source": item.source, "window": item.window_title, "review_id": item.id},
    )
    twin_manager.ingest_observation(item.text, window_title=item.window_title, ts=item.created_at)

    updated = await queue.set_status(item_id, "approved", notes=decision.notes)
    await bus.publish("review.approved", {"id": item_id})
    return {"ok": True, "item": updated.__dict__ if updated else None}


@app.post("/review/{item_id}/reject")
async def reject_review(item_id: str, decision: ReviewDecision = ReviewDecision()):
    item = await queue.get(item_id)
    if item is None:
        raise HTTPException(404, "review item not found")
    updated = await queue.set_status(item_id, "rejected", notes=decision.notes)
    await bus.publish("review.rejected", {"id": item_id})
    return {"ok": True, "item": updated.__dict__ if updated else None}


@app.post("/review/purge")
async def purge_review():
    removed = await queue.purge_resolved()
    return {"removed": removed}


# ----- twin

@app.get("/twin")
async def twin_summary():
    return twin_manager.twin.summarize()


@app.post("/twin/preference")
async def set_preference(pref: PreferenceUpdate):
    saved = twin_manager.set_preference(pref.key, pref.value, pref.confidence)
    return {"ok": True, "preference": saved.__dict__}


@app.post("/twin/reset")
async def reset_twin():
    twin_manager.reset()
    return {"ok": True}


# ----- predictions

@app.get("/predictions")
async def predictions(limit: int = 5):
    items = get_predictions(limit=limit)
    return {"items": [asdict(p) for p in items]}


# ----- capture control

@app.get("/capture/status")
async def capture_status():
    return {
        "running": worker.last_status.get("running", False),
        "paused": worker.is_paused,
        "interval_seconds": settings.capture_interval_seconds,
        "active_window": get_active_window_title(),
    }


@app.post("/capture/control")
async def capture_control(ctrl: CaptureControl):
    if ctrl.paused:
        worker.pause()
    else:
        worker.resume()
    return {"paused": worker.is_paused}


# ----- hotkey

@app.post("/hotkey/trigger")
async def hotkey_trigger():
    asyncio.create_task(_on_hotkey())
    return {"ok": True}


# ----- websocket event bus

@app.websocket("/ws/events")
async def ws_events(ws: WebSocket):
    await ws.accept()
    q = bus.subscribe()
    try:
        await ws.send_json({"type": "hello", "payload": {"version": app.version, "mode": "local-first"}})
        while True:
            msg = await q.get()
            await ws.send_json(msg)
    except WebSocketDisconnect:
        pass
    finally:
        bus.unsubscribe(q)


# ----- autonomous observer

@app.get("/observer/status")
async def observer_status():
    return observer.get_status()


@app.post("/observer/control")
async def observer_control(ctrl: CaptureControl):
    if ctrl.paused:
        observer.pause()
    else:
        observer.resume()
    return {"paused": observer.is_paused}


@app.get("/observer/context")
async def observer_context(limit: int = 5):
    return {"observations": observer.get_recent_context(limit=limit)}


@app.get("/observer/stuck")
async def observer_stuck():
    return observer.get_stuck_state()


@app.post("/observer/nudge/dismiss")
async def observer_nudge_dismiss():
    observer.dismiss_nudge()
    await bus.publish("nudge.dismissed", {"timestamp": time.time()})
    return {"ok": True}


@app.post("/observer/nudge/accept")
async def observer_nudge_accept():
    context = observer.accept_nudge()
    await bus.publish("nudge.accepted", {"timestamp": time.time()})
    return {"ok": True, "context": context[:1500]}


@app.post("/observer/help")
async def observer_help():
    """User accepted help — run AI analysis on stuck context and return step-by-step suggestions."""
    help_context = observer.get_help_context()
    system = build_help_prompt(help_context)
    user_msg = "I'm stuck. Help me figure out what to do next."

    try:
        reply = await inference.chat([
            ChatMessage(role="system", content=system),
            ChatMessage(role="user", content=user_msg),
        ])
        await bus.publish("observer.help_given", {
            "response_preview": reply[:200],
            "stuck_window": help_context.get("stuck_window", ""),
            "timestamp": time.time(),
        })
        return {
            "ok": True,
            "suggestions": reply,
            "stuck_window": help_context.get("stuck_window", ""),
            "stuck_duration_minutes": help_context.get("stuck_duration_minutes", 0),
        }
    except Exception as e:
        return {
            "ok": False,
            "suggestions": f"I wasn't able to analyze your screen right now: {str(e)}",
            "error": str(e),
        }


# ----- proactive coach

@app.get("/observer/coach/state")
async def observer_coach_state():
    """Latest coaching state — insight text + idle/active info."""
    return observer.get_coach_state()


@app.get("/observer/coach/latest")
async def observer_coach_latest():
    """Return the most recent coaching insight."""
    state = observer.get_coach_state()
    return {
        "ok": True,
        "insight": state.get("last_insight"),
        "timestamp": state.get("last_insight_ts"),
        "is_idle": state.get("is_idle"),
        "idle_seconds": state.get("idle_seconds"),
    }


@app.post("/observer/coach/trigger")
async def observer_coach_trigger():
    """Force a coaching cycle right now (on-demand)."""
    idle_secs = observer._idle_seconds()
    asyncio.create_task(
        observer._coach(is_idle=idle_secs > observer._IDLE_THRESHOLD, idle_seconds=idle_secs)
    )
    return {"ok": True, "message": "Coaching triggered — insight arrives via WebSocket coach.insight"}


@app.get("/observer/coach/interval")
async def observer_coach_interval_get():
    """Get the current coaching interval in seconds."""
    return {"interval": observer._COACH_INTERVAL}


@app.post("/observer/coach/interval")
async def observer_coach_interval_set(payload: dict):
    """Update the coaching interval dynamically."""
    interval = payload.get("interval")
    if interval is not None:
        observer._COACH_INTERVAL = float(interval)
    return {"ok": True, "interval": observer._COACH_INTERVAL}


# ----- wellness (behavioral pattern recognition)

@app.get("/wellness")
async def wellness_state():
    """Current wellness state — mood, stress, focus, signals, recommendations."""
    from dataclasses import asdict
    state = wellness.compute()
    return asdict(state)


@app.get("/wellness/history")
async def wellness_history(limit: int = 12):
    """Recent wellness snapshots for trend visualization."""
    return {"snapshots": wellness.get_history(limit=limit)}


# Background task: periodically snapshot wellness for history tracking
async def _wellness_snapshot_loop() -> None:
    """Take a wellness snapshot every 5 minutes for history/trend data."""
    while True:
        await asyncio.sleep(300)  # 5 minutes
        try:
            wellness.snapshot()
            state = wellness.compute()
            if wellness.has_changed(state):
                from dataclasses import asdict
                await bus.publish("wellness.update", asdict(state))
        except Exception:
            pass


@app.on_event("startup")
async def _start_wellness_loop() -> None:
    asyncio.create_task(_wellness_snapshot_loop(), name="wellness-snapshot")
