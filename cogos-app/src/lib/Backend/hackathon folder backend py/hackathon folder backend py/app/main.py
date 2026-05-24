from __future__ import annotations

import asyncio
import contextlib
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.capture.ocr import OCREngine
from app.capture.screen import ScreenGrabber
from app.cognitive_twin.twin import manager as twin_manager
from app.config import PROJECT_ROOT, settings
from app.hotkey import HotkeyListener
from app.inference.ollama_client import ChatMessage, client as ollama
from app.inference.prompts import build_system_prompt
from app.memory.store import store as memory
from app.predictions.engine import get_predictions
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
from app.workers.events import bus


# ----------------------------------------------------------------------------- helpers


async def _grab_screen_text() -> str:
    """Synchronous OCR offloaded to a thread. Used by /chat?include_screen=true and the hotkey."""
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


async def _run_chat(message: str, include_screen: bool, deep_memory: bool) -> ChatResponse:
    screen_text: Optional[str] = None
    if include_screen:
        with contextlib.suppress(Exception):
            screen_text = await _grab_screen_text()

    # Memory retrieval.
    search_fn = memory.search_deep if deep_memory else memory.search
    raw_hits = search_fn(message) or []
    # truememory and the fallback both return list-of-dict-ish; coerce to strings.
    mem_lines: list[str] = []
    for h in raw_hits[:8]:
        if isinstance(h, dict):
            mem_lines.append(h.get("content") or h.get("memory") or str(h))
        else:
            mem_lines.append(str(h))

    system = build_system_prompt(
        twin_summary=twin_manager.twin.summarize(),
        relevant_memories=mem_lines,
        screen_context=screen_text,
    )

    reply = await ollama.chat([
        ChatMessage(role="system", content=system),
        ChatMessage(role="user", content=message),
    ])

    await bus.publish("chat.completed", {"message": message[:200], "response_preview": reply[:200]})

    return ChatResponse(
        response=reply,
        model=settings.ollama_model,
        memory_hits=len(mem_lines),
        used_screen_context=screen_text is not None,
    )


async def _on_hotkey() -> None:
    """Hotkey fired: capture screen + ask Gemma 'what's relevant here?'"""
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
    reply = await ollama.chat([
        ChatMessage(role="system", content=system),
        ChatMessage(role="user", content=prompt),
    ])
    await bus.publish("hotkey.response", {"response": reply})


# ----------------------------------------------------------------------------- app

app = FastAPI(title="Gemma Companion", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount a static dir so the user can drop an imported frontend in app/static/
static_dir = PROJECT_ROOT / "app" / "static"
static_dir.mkdir(parents=True, exist_ok=True)
app.mount("/ui", StaticFiles(directory=str(static_dir), html=True), name="ui")


_hotkey: Optional[HotkeyListener] = None


@app.on_event("startup")
async def _startup() -> None:
    global _hotkey
    await worker.start()
    loop = asyncio.get_running_loop()
    _hotkey = HotkeyListener(on_trigger=_on_hotkey, loop=loop)
    _hotkey.start()


@app.on_event("shutdown")
async def _shutdown() -> None:
    global _hotkey
    if _hotkey is not None:
        _hotkey.stop()
    await worker.stop()


# ----------------------------------------------------------------------------- routes


@app.get("/")
async def root():
    return {
        "name": "Gemma Companion",
        "version": "0.1.0",
        "docs": "/docs",
        "frontend": "/ui",
        "events_ws": "/ws/events",
    }


@app.get("/health")
async def health():
    ollama_h = await ollama.health()
    return {
        "ok": True,
        "memory_backend": memory.backend,
        "capture": worker.last_status,
        "capture_paused": worker.is_paused,
        "ollama": ollama_h,
        "hotkey": settings.hotkey_combo,
    }


# ----- chat / inference

@app.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    return await _run_chat(req.message, req.include_screen, req.deep_memory)


# ----- memory

@app.post("/memory/note")
async def add_note(note: MemoryNote):
    meta = {"tag": note.tag} if note.tag else None
    result = memory.add(content=note.content, metadata=meta)
    # User-supplied notes bypass the review queue and go straight into the twin.
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

    # Promote into memory + twin.
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
    return {"items": [p.__dict__ for p in items]}


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


# ----- hotkey manual trigger (for testing without keyboard access)

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
        await ws.send_json({"type": "hello", "payload": {"version": app.version}})
        while True:
            msg = await q.get()
            await ws.send_json(msg)
    except WebSocketDisconnect:
        pass
    finally:
        bus.unsubscribe(q)
