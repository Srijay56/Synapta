"""Ollama client. The only network egress in the whole backend — and it goes to localhost.

If Ollama isn't running, falls back to a deterministic echo response so the rest of the
pipeline can still be demoed end-to-end.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import AsyncIterator, Optional

import httpx

from app.config import settings


@dataclass
class ChatMessage:
    role: str  # "system" | "user" | "assistant"
    content: str

    def as_dict(self) -> dict:
        return {"role": self.role, "content": self.content}


class OllamaClient:
    def __init__(self, base_url: Optional[str] = None, model: Optional[str] = None):
        self._base = (base_url or settings.ollama_base_url).rstrip("/")
        self._model = model or settings.ollama_model
        self._timeout = settings.ollama_timeout_seconds

    async def health(self) -> dict:
        try:
            async with httpx.AsyncClient(timeout=2.0) as client:
                r = await client.get(f"{self._base}/api/tags")
                r.raise_for_status()
                tags = r.json()
                models = [m.get("name") for m in tags.get("models", [])]
                return {
                    "available": True,
                    "configured_model": self._model,
                    "model_present": self._model in models,
                    "models": models,
                }
        except Exception as e:
            return {"available": False, "error": str(e), "configured_model": self._model}

    async def chat(self, messages: list[ChatMessage]) -> str:
        """Non-streaming chat completion. Returns the assistant message content."""
        payload = {
            "model": self._model,
            "messages": [m.as_dict() for m in messages],
            "stream": False,
        }
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                r = await client.post(f"{self._base}/api/chat", json=payload)
                r.raise_for_status()
                data = r.json()
                return data.get("message", {}).get("content", "")
        except Exception as e:
            return self._fallback_response(messages, error=str(e))

    async def chat_stream(self, messages: list[ChatMessage]) -> AsyncIterator[str]:
        """Yields incremental content chunks from Ollama's streaming chat API."""
        payload = {
            "model": self._model,
            "messages": [m.as_dict() for m in messages],
            "stream": True,
        }
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                async with client.stream("POST", f"{self._base}/api/chat", json=payload) as r:
                    r.raise_for_status()
                    async for line in r.aiter_lines():
                        if not line.strip():
                            continue
                        import json
                        try:
                            obj = json.loads(line)
                        except json.JSONDecodeError:
                            continue
                        chunk = obj.get("message", {}).get("content", "")
                        if chunk:
                            yield chunk
                        if obj.get("done"):
                            return
        except Exception as e:
            yield self._fallback_response(messages, error=str(e))

    def _fallback_response(self, messages: list[ChatMessage], error: str) -> str:
        last_user = next((m.content for m in reversed(messages) if m.role == "user"), "")
        return (
            f"[Gemma offline — falling back to echo mode]\n"
            f"You asked: {last_user[:200]}\n\n"
            f"Start Ollama and pull the model to enable real responses:\n"
            f"  ollama pull {self._model}\n"
            f"(error: {error})"
        )


client = OllamaClient()
