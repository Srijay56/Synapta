from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    message: str = Field(..., description="User message")
    include_screen: bool = Field(False, description="OCR the current screen and inject into context")
    deep_memory: bool = Field(False, description="Use TrueMemory's search_deep for higher accuracy")


class ChatResponse(BaseModel):
    response: str
    model: str
    memory_hits: int
    used_screen_context: bool


class MemoryNote(BaseModel):
    content: str
    tag: Optional[str] = None


class PreferenceUpdate(BaseModel):
    key: str
    value: str
    confidence: float = 0.8


class ReviewDecision(BaseModel):
    notes: Optional[str] = None


class CaptureControl(BaseModel):
    paused: bool
