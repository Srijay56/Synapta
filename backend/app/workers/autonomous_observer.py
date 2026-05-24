"""Autonomous observation loop — the "always-watching friend."

Continuously captures the screen, extracts text via OCR, learns from it,
and deletes the raw capture immediately. No screenshots are ever stored.

Detects when the user is stuck (same content for too long, no progress)
and surfaces proactive nudges through the event bus.

Learning:
  - Every observation is fed into the Cognitive Twin (vocabulary, apps, patterns)
  - Key learnings are persisted to TrueMemory for long-term recall
  - Context updates are published so connected frontends stay in sync

Privacy:
  - Raw screenshots are NEVER saved to disk
  - Only extracted text/observations are kept
  - All processing is on-device
  - User approves any AI interventions
"""
from __future__ import annotations

import asyncio
import difflib
import hashlib
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Optional

from app.capture.ocr import OCREngine
from app.capture.screen import ScreenGrabber
from app.config import settings
from app.cognitive_twin.twin import manager as twin_manager
from app.memory.store import store as memory
from app.privacy.window_filter import get_active_window_title, is_window_blocked
from app.workers.events import bus


_MIN_TEXT_LEN = 20


@dataclass
class Observation:
    """A single observation from the screen — text only, no image stored."""
    timestamp: float
    text: str
    text_hash: str
    window_title: str
    similarity_to_prev: float = 0.0  # 0 = totally new, 1 = identical


@dataclass
class StuckState:
    """Tracks whether the user appears stuck."""
    is_stuck: bool = False
    stuck_since: float = 0.0
    stuck_duration_minutes: float = 0.0
    stuck_context: str = ""
    stuck_window: str = ""
    nudge_sent: bool = False
    nudge_count: int = 0


class AutonomousObserver:
    """The always-on observer that watches, learns, coaches, and detects when you need help."""

    # Coaching fires every N seconds (separate from capture interval)
    _COACH_INTERVAL = 30.0     # run AI coaching every 30 seconds (adjustable)
    _IDLE_THRESHOLD = 30.0     # seconds with no mouse/keyboard = user is idle
    _IDLE_POPUP_THRESHOLD = 20.0  # only auto-popup coaching if idle this long

    def __init__(self):
        self._task: Optional[asyncio.Task] = None
        self._stop = asyncio.Event()
        self._grabber: Optional[ScreenGrabber] = None
        self._ocr: Optional[OCREngine] = None
        self._paused: bool = False

        # Observation history (in-memory ring buffer, never persisted as screenshots)
        self._recent: deque[Observation] = deque(maxlen=50)
        self._stuck = StuckState()

        # Thresholds
        self._stuck_similarity_threshold = 0.85   # text >85% similar = no progress
        self._stuck_time_threshold_seconds = 180   # 3 minutes of no progress = stuck
        self._stuck_nudge_cooldown_seconds = 120   # don't re-nudge for 2 min after dismissal
        self._last_nudge_time = 0.0

        # Proactive coaching state
        self._last_coach_time = 0.0          # when we last ran AI coaching
        self._last_insight: Optional[str] = None  # latest coaching insight text
        self._last_insight_ts: float = 0.0   # when the last insight was generated
        self._was_idle: bool = False          # tracks idle→active transitions
        self._coach_callback = None           # optional async fn(system_prompt) -> str

        # Stats
        self.total_observations = 0
        self.total_learnings = 0
        self.status = "idle"

    @property
    def is_paused(self) -> bool:
        return self._paused

    def pause(self) -> None:
        self._paused = True

    def resume(self) -> None:
        self._paused = False

    def get_stuck_state(self) -> dict:
        return {
            "is_stuck": self._stuck.is_stuck,
            "stuck_since": self._stuck.stuck_since,
            "stuck_duration_minutes": self._stuck.stuck_duration_minutes,
            "stuck_context": self._stuck.stuck_context[:200],
            "stuck_window": self._stuck.stuck_window,
            "nudge_sent": self._stuck.nudge_sent,
            "nudge_count": self._stuck.nudge_count,
        }

    def get_status(self) -> dict:
        return {
            "status": self.status,
            "paused": self._paused,
            "total_observations": self.total_observations,
            "total_learnings": self.total_learnings,
            "recent_count": len(self._recent),
            "stuck": self.get_stuck_state(),
            "coach": self.get_coach_state(),
            "is_idle": self._idle_seconds() > self._IDLE_THRESHOLD,
            "idle_seconds": self._idle_seconds(),
        }

    def get_coach_state(self) -> dict:
        """Latest proactive coaching insight."""
        return {
            "last_insight": self._last_insight,
            "last_insight_ts": self._last_insight_ts,
            "last_coach_time": self._last_coach_time,
            "is_idle": self._idle_seconds() > self._IDLE_THRESHOLD,
            "idle_seconds": self._idle_seconds(),
        }

    def set_coach_callback(self, fn) -> None:
        """Inject the async AI inference function (system_prompt: str) -> str."""
        self._coach_callback = fn

    def _idle_seconds(self) -> float:
        """Return how many seconds the system has had no mouse or keyboard input.

        Uses Win32 GetLastInputInfo which tracks ALL input device activity
        (keyboard, mouse, touch). Returns 0.0 on non-Windows or if detection fails.
        """
        try:
            import ctypes

            class LASTINPUTINFO(ctypes.Structure):
                _fields_ = [
                    ("cbSize", ctypes.c_uint),
                    ("dwTime", ctypes.c_uint),
                ]

            lii = LASTINPUTINFO()
            lii.cbSize = ctypes.sizeof(lii)
            ctypes.windll.user32.GetLastInputInfo(ctypes.byref(lii))
            tick_now = ctypes.windll.kernel32.GetTickCount()
            millis_idle = tick_now - lii.dwTime
            return millis_idle / 1000.0
        except Exception:
            return 0.0

    def get_recent_context(self, limit: int = 5) -> list[dict]:
        """Get recent observations for AI context (text only, no images)."""
        items = list(self._recent)[-limit:]
        return [
            {
                "timestamp": o.timestamp,
                "text_preview": o.text[:300],
                "window": o.window_title,
                "similarity": o.similarity_to_prev,
            }
            for o in items
        ]

    def get_help_context(self) -> dict:
        """Rich context bundle for AI help analysis when user is stuck."""
        recent = self.get_recent_context(limit=8)
        twin_summary = twin_manager.twin.summarize()

        # Build a narrative of what the user has been looking at
        screen_narrative = ""
        if recent:
            unique_windows = list(dict.fromkeys(o["window"] for o in recent if o.get("window")))
            screen_narrative = "\n".join(
                f"[{time.strftime('%H:%M:%S', time.localtime(o['timestamp']))}] "
                f"({o['window']}) {o['text_preview']}"
                for o in recent
            )

        return {
            "is_stuck": self._stuck.is_stuck,
            "stuck_duration_minutes": self._stuck.stuck_duration_minutes,
            "stuck_window": self._stuck.stuck_window,
            "stuck_context": self._stuck.stuck_context[:1500],
            "screen_narrative": screen_narrative[:3000],
            "recent_observations": recent,
            "twin_summary": twin_summary,
            "total_observations": self.total_observations,
            "total_learnings": self.total_learnings,
        }

    def dismiss_nudge(self) -> None:
        """User dismissed the stuck nudge — cool down before re-nudging."""
        self._stuck.nudge_sent = False
        self._last_nudge_time = time.time()

    def accept_nudge(self) -> str:
        """User accepted help — return the stuck context for AI analysis."""
        context = self._stuck.stuck_context
        self._stuck.nudge_sent = False
        self._stuck.nudge_count += 1
        return context

    # --- core loop ---

    async def start(self) -> None:
        if self._task is not None:
            return
        self._stop.clear()
        self._task = asyncio.create_task(self._run(), name="autonomous-observer")

    async def stop(self) -> None:
        self._stop.set()
        if self._task is not None:
            await asyncio.wait([self._task], timeout=3)
            self._task = None
        if self._grabber is not None:
            self._grabber.close()
            self._grabber = None

    async def _observe_once(self) -> Optional[Observation]:
        """Single observation cycle: capture → OCR → learn → delete capture."""
        # Lazy-init
        if self._grabber is None:
            self._grabber = ScreenGrabber()
        if self._ocr is None:
            self._ocr = OCREngine()

        # Check privacy gate
        title = get_active_window_title()
        blocked, term = is_window_blocked(title)
        if blocked:
            return None

        # Capture screen (in memory only — NEVER saved to disk)
        # use_active_monitor=False: snaps to primary monitor
        loop = asyncio.get_running_loop()
        frame = await loop.run_in_executor(None, lambda: self._grabber.grab(use_active_monitor=False))
        ocr_result = await loop.run_in_executor(None, self._ocr.read, frame.image)
        text = ocr_result.text.strip()

        # The frame/image is now out of scope and will be garbage collected.
        # No screenshot is ever written to disk.
        del frame

        if len(text) < _MIN_TEXT_LEN:
            return None

        # Calculate similarity to previous observation
        similarity = 0.0
        if self._recent:
            prev_text = self._recent[-1].text
            similarity = difflib.SequenceMatcher(None, prev_text[:500], text[:500]).ratio()

        text_hash = hashlib.md5(text[:500].encode()).hexdigest()

        obs = Observation(
            timestamp=time.time(),
            text=text,
            text_hash=text_hash,
            window_title=title,
            similarity_to_prev=similarity,
        )

        self._recent.append(obs)
        self.total_observations += 1

        return obs

    def _check_stuck(self) -> bool:
        """Analyze recent observations to detect if user is stuck."""
        if len(self._recent) < 3:
            return False

        recent = list(self._recent)[-6:]  # last 6 observations
        now = time.time()

        # Calculate average similarity across recent observations
        similarities = [o.similarity_to_prev for o in recent if o.similarity_to_prev > 0]
        if not similarities:
            return False

        avg_similarity = sum(similarities) / len(similarities)

        # Check: are the last several observations very similar? (user not making progress)
        if avg_similarity >= self._stuck_similarity_threshold:
            oldest_similar = recent[0].timestamp
            duration = now - oldest_similar

            if duration >= self._stuck_time_threshold_seconds:
                self._stuck.is_stuck = True
                self._stuck.stuck_since = oldest_similar
                self._stuck.stuck_duration_minutes = round(duration / 60, 1)
                self._stuck.stuck_context = recent[-1].text[:1000]
                self._stuck.stuck_window = recent[-1].window_title
                return True

        # User made progress — clear stuck state
        if avg_similarity < 0.6:
            self._stuck.is_stuck = False
            self._stuck.stuck_since = 0
            self._stuck.stuck_duration_minutes = 0
            self._stuck.stuck_context = ""
            self._stuck.stuck_window = ""
            self._stuck.nudge_sent = False

        return False

    async def _maybe_nudge(self) -> None:
        """Send a proactive nudge if user is stuck and hasn't been nudged recently."""
        now = time.time()

        if not self._stuck.is_stuck:
            return

        if self._stuck.nudge_sent:
            return

        # Cooldown check
        if now - self._last_nudge_time < self._stuck_nudge_cooldown_seconds:
            return

        # Send the nudge!
        self._stuck.nudge_sent = True
        self._last_nudge_time = now

        await bus.publish("nudge.stuck", {
            "type": "stuck",
            "message": f"I noticed you've been on the same thing for {self._stuck.stuck_duration_minutes:.0f} minutes in '{self._stuck.stuck_window}'. Want me to help?",
            "context_preview": self._stuck.stuck_context[:200],
            "window": self._stuck.stuck_window,
            "duration_minutes": self._stuck.stuck_duration_minutes,
            "timestamp": now,
        })

    async def _learn_from(self, obs: Observation) -> None:
        """Feed the observation into the Cognitive Twin and memory.

        This is the core learning step: the twin updates its vocabulary,
        app histogram, time-of-day buckets, and pattern counters.
        The raw screenshot is already gone — only text survives.
        """
        self.total_learnings += 1

        # Feed into Cognitive Twin (vocabulary, app tracking, patterns)
        twin_manager.ingest_observation(
            obs.text,
            window_title=obs.window_title,
            ts=obs.timestamp,
        )

        # Persist significant observations to long-term memory
        # (skip near-duplicates to avoid flooding the store)
        if obs.similarity_to_prev < 0.7:
            memory.add(
                content=obs.text[:500],
                metadata={
                    "source": "autonomous_observer",
                    "window": obs.window_title,
                    "activity": obs.window_title.split(" - ")[-1].strip() if obs.window_title else "unknown",
                },
            )

    async def _coach(self, is_idle: bool = False, idle_seconds: float = 0.0) -> None:
        """Run proactive AI coaching and publish the insight.

        This is the core of the 'every minute' feature: the observer summarizes
        what it has seen and asks the AI to give sharp, specific coaching feedback.
        The raw screen content is NEVER sent anywhere — only OCR text.
        """
        if not self._coach_callback:
            return
        if not self._recent:
            return

        # Don't coach if we coached very recently (respect cooldown)
        now = time.time()
        elapsed_since_last = now - self._last_coach_time
        if elapsed_since_last < self._COACH_INTERVAL * 0.8:  # allow 20% early
            return

        try:
            from app.inference.prompts import build_coach_prompt
            from app.wellness.engine import wellness as wellness_engine
            from app.memory.store import store as memory_store
            context = self.get_help_context()

            # Compute current wellness state for coaching context
            try:
                from dataclasses import asdict
                ws = wellness_engine.compute()
                wellness_dict = asdict(ws)
            except Exception:
                wellness_dict = None

            # Retrieve relevant memories from TrueMemory for personalized coaching
            relevant_memories: list[str] = []
            try:
                # Use the current screen content as a search query
                screen_text = context.get("stuck_context", "")
                if not screen_text:
                    recents = context.get("recent_observations", [])
                    if recents:
                        screen_text = recents[-1].get("text_preview", "")
                if screen_text:
                    # Search for related past memories
                    raw_hits = memory_store.search(screen_text[:200]) or []
                    for h in raw_hits[:6]:
                        if isinstance(h, dict):
                            content = h.get("content") or h.get("memory") or ""
                            if content and len(content) > 10:
                                relevant_memories.append(content)
                        elif isinstance(h, str) and len(h) > 10:
                            relevant_memories.append(h)
            except Exception:
                pass  # Memory retrieval is best-effort

            # Also grab wellness history for trend analysis
            wellness_history: list[dict] = []
            try:
                wellness_history = wellness_engine.get_history(limit=6)
            except Exception:
                pass

            system = build_coach_prompt(
                context,
                is_idle=is_idle,
                idle_seconds=idle_seconds,
                wellness_state=wellness_dict,
                relevant_memories=relevant_memories,
                wellness_history=wellness_history,
            )

            raw_insight = await self._coach_callback(system)
            if raw_insight and len(raw_insight.strip()) > 20:
                
                # Attempt to parse JSON response
                import json
                
                insight_text = raw_insight
                suggestions = []
                
                try:
                    # Strip markdown json block if present
                    clean_json = raw_insight.strip()
                    if clean_json.startswith("```json"):
                        clean_json = clean_json.split("```json", 1)[1]
                        if "```" in clean_json:
                            clean_json = clean_json.rsplit("```", 1)[0]
                    elif clean_json.startswith("```"):
                        clean_json = clean_json.split("```", 1)[1]
                        if "```" in clean_json:
                            clean_json = clean_json.rsplit("```", 1)[0]
                            
                    parsed = json.loads(clean_json.strip())
                    insight_text = parsed.get("insight", "")
                    raw_suggestions = parsed.get("suggestions", [])
                    # Sanitize: ensure each suggestion has {title: str, steps: [str]}
                    if isinstance(raw_suggestions, list):
                        for s in raw_suggestions:
                            if isinstance(s, dict) and s.get("title"):
                                title = str(s["title"])
                                steps = s.get("steps", [])
                                if isinstance(steps, str):
                                    steps = [steps]
                                elif not isinstance(steps, list):
                                    steps = []
                                suggestions.append({"title": title, "steps": [str(st) for st in steps]})
                except Exception:
                    pass # Fall back to raw text if JSON parsing fails
                    
                self._last_insight = insight_text
                self._last_insight_ts = now
                self._last_coach_time = now

                # Decide whether to auto-show:
                # - Always show if idle (user coming back to machine)
                # - Show if something significant changed (low similarity = new work)
                # - Show if user is stuck
                recent_obs = list(self._recent)[-1] if self._recent else None
                is_significant = (
                    is_idle
                    or self._stuck.is_stuck
                    or (recent_obs and recent_obs.similarity_to_prev < 0.5)
                )

                await bus.publish("coach.insight", {
                    "insight": insight_text,
                    "suggestions": suggestions,
                    "timestamp": now,
                    "window": context.get("stuck_window", ""),
                    "is_idle": is_idle,
                    "idle_seconds": idle_seconds,
                    "auto_show": is_significant,
                    "is_stuck": self._stuck.is_stuck,
                })
        except Exception as e:
            await bus.publish("coach.error", {"error": str(e)})

    async def _run(self) -> None:
        self.status = "running"
        await bus.publish("observer.started", {"timestamp": time.time()})

        try:
            while not self._stop.is_set():
                if not self._paused:
                    try:
                        # --- Idle detection ---
                        idle_secs = self._idle_seconds()
                        is_idle = idle_secs > self._IDLE_THRESHOLD

                        # Track idle → active transition
                        # When the user comes BACK after being away, fire coaching immediately
                        became_active = self._was_idle and not is_idle
                        self._was_idle = is_idle

                        if is_idle:
                            # Publish idle state so frontend can dim or prepare
                            await bus.publish("observer.idle", {
                                "idle_seconds": idle_secs,
                                "timestamp": time.time(),
                            })
                        elif became_active:
                            # User just came back! Fire coaching right now.
                            await bus.publish("observer.active", {
                                "idle_was": idle_secs,
                                "timestamp": time.time(),
                            })

                        # --- Observe screen ---
                        obs = await self._observe_once()

                        if obs:
                            await self._learn_from(obs)

                            await bus.publish("observer.learned", {
                                "text_preview": obs.text[:200],
                                "window": obs.window_title,
                                "similarity": obs.similarity_to_prev,
                                "timestamp": obs.timestamp,
                                "idle_seconds": idle_secs,
                            })

                            if self.total_observations % 5 == 0:
                                await bus.publish("observer.context_update", {
                                    "total_observations": self.total_observations,
                                    "total_learnings": self.total_learnings,
                                    "timestamp": obs.timestamp,
                                })

                            self._check_stuck()
                            await self._maybe_nudge()

                            # --- Proactive coaching (every 60s) ---
                            # Fire if: (a) enough time has passed, OR (b) user just came back
                            now = time.time()
                            time_since_coach = now - self._last_coach_time
                            should_coach = (
                                time_since_coach >= self._COACH_INTERVAL
                                or became_active
                            )

                            if should_coach:
                                # Run coaching in background so it doesn't block the loop
                                asyncio.create_task(
                                    self._coach(is_idle=is_idle, idle_seconds=idle_secs)
                                )

                    except Exception as e:
                        await bus.publish("observer.error", {"error": str(e)})

                # Wait for next capture cycle
                interval = getattr(settings, 'observer_interval_seconds', settings.capture_interval_seconds)
                try:
                    await asyncio.wait_for(self._stop.wait(), timeout=interval)
                except asyncio.TimeoutError:
                    continue
        finally:
            self.status = "stopped"
            await bus.publish("observer.stopped", {"timestamp": time.time()})


# Module singleton
observer = AutonomousObserver()
