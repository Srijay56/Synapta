"""Unified inference router — LOCAL-FIRST.

Priority:
  1. Default: local Ollama (no data leaves your machine)
  2. Optional: Gemma 4 cloud (only if user explicitly sets inference_provider=gemma)
  3. Auto: tries Ollama first, falls back to Gemma if Ollama is unreachable AND API key is set
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import AsyncIterator

from app.config import settings


@dataclass
class ChatMessage:
    role: str  # "system" | "user" | "assistant"
    content: str

    def as_dict(self) -> dict:
        return {"role": self.role, "content": self.content}


class InferenceRouter:
    def __init__(self):
        self._gemma = None
        self._ollama = None

    def _get_gemma(self):
        if self._gemma is None:
            from app.inference.gemma_client import GemmaClient
            self._gemma = GemmaClient()
        return self._gemma

    def _get_ollama(self):
        if self._ollama is None:
            from app.inference.ollama_client import OllamaClient
            self._ollama = OllamaClient()
        return self._ollama

    @property
    def active_provider(self) -> str:
        provider = settings.inference_provider
        if provider == "gemma":
            return "gemma"
        elif provider == "ollama":
            return "ollama"
        else:  # "auto" — local-first: prefer Ollama, cloud only as explicit fallback
            return "ollama"

    @property
    def is_local(self) -> bool:
        return self.active_provider == "ollama"

    def _get_active_client(self):
        if self.active_provider == "gemma":
            return self._get_gemma()
        return self._get_ollama()

    async def health(self) -> dict:
        provider = self.active_provider
        client = self._get_active_client()
        result = await client.health()
        result["active_provider"] = provider
        result["local_only"] = self.is_local
        return result

    async def chat(self, messages: list[ChatMessage]) -> str:
        """Non-streaming chat. Routes to active provider."""
        client = self._get_active_client()

        provider = self.active_provider
        if provider == "gemma":
            from app.inference.gemma_client import ChatMessage as GemmaMsg
            converted = [GemmaMsg(role=m.role, content=m.content) for m in messages]
        else:
            from app.inference.ollama_client import ChatMessage as OllamaMsg
            converted = [OllamaMsg(role=m.role, content=m.content) for m in messages]

        return await client.chat(converted)

    async def chat_stream(self, messages: list[ChatMessage]) -> AsyncIterator[str]:
        """Streaming chat. Routes to active provider."""
        client = self._get_active_client()

        provider = self.active_provider
        if provider == "gemma":
            from app.inference.gemma_client import ChatMessage as GemmaMsg
            converted = [GemmaMsg(role=m.role, content=m.content) for m in messages]
        else:
            from app.inference.ollama_client import ChatMessage as OllamaMsg
            converted = [OllamaMsg(role=m.role, content=m.content) for m in messages]

        async for chunk in client.chat_stream(converted):
            yield chunk


router = InferenceRouter()
