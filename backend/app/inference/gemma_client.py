"""Gemma 4 E4B client via Google GenAI SDK.

Primary inference provider for CognitionOS. Falls back gracefully if
no API key is configured — the router will use Ollama instead.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import AsyncIterator, Optional

from app.config import settings


@dataclass
class ChatMessage:
    role: str  # "system" | "user" | "assistant"
    content: str

    def as_dict(self) -> dict:
        return {"role": self.role, "content": self.content}


class GemmaClient:
    def __init__(self, api_key: Optional[str] = None, model: Optional[str] = None):
        self._api_key = api_key or settings.gemini_api_key
        self._model = model or settings.gemma_model
        self._ai = None

    def _ensure_client(self):
        if self._ai is None:
            from google import genai
            self._ai = genai.Client(api_key=self._api_key)
        return self._ai

    @property
    def is_configured(self) -> bool:
        return bool(self._api_key)

    async def health(self) -> dict:
        if not self.is_configured:
            return {"available": False, "error": "No GEMINI_API_KEY configured", "configured_model": self._model}
        try:
            # Simple check — if client initializes, we're good
            self._ensure_client()
            return {
                "available": True,
                "configured_model": self._model,
                "provider": "gemma",
            }
        except Exception as e:
            return {"available": False, "error": str(e), "configured_model": self._model}

    async def chat(self, messages: list[ChatMessage]) -> str:
        """Non-streaming chat completion. Returns the assistant message content."""
        if not self.is_configured:
            return self._fallback_response(messages, error="No GEMINI_API_KEY configured")

        try:
            import asyncio
            ai = self._ensure_client()

            # Separate system prompt from conversation
            system_instruction = None
            contents = []
            for msg in messages:
                if msg.role == "system":
                    system_instruction = msg.content
                else:
                    contents.append(msg.content if msg.role == "user" else msg.content)

            # Build a single prompt string from all messages
            prompt_parts = []
            if system_instruction:
                prompt_parts.append(system_instruction)
            for msg in messages:
                if msg.role != "system":
                    prompt_parts.append(f"[{msg.role}]: {msg.content}")

            full_prompt = "\n\n".join(prompt_parts)

            loop = asyncio.get_running_loop()
            response = await loop.run_in_executor(None, lambda: ai.models.generate_content(
                model=self._model,
                contents=full_prompt,
                config={
                    "max_output_tokens": 500,
                    "temperature": 0.7,
                }
            ))

            return response.text or ""
        except Exception as e:
            return self._fallback_response(messages, error=str(e))

    async def chat_stream(self, messages: list[ChatMessage]) -> AsyncIterator[str]:
        """Yields incremental content chunks from Gemma 4 via Google GenAI SDK."""
        if not self.is_configured:
            yield self._fallback_response(messages, error="No GEMINI_API_KEY configured")
            return

        try:
            import asyncio
            ai = self._ensure_client()

            # Build prompt
            system_instruction = None
            prompt_parts = []
            for msg in messages:
                if msg.role == "system":
                    system_instruction = msg.content
                else:
                    prompt_parts.append(f"[{msg.role}]: {msg.content}")

            if system_instruction:
                prompt_parts.insert(0, system_instruction)

            full_prompt = "\n\n".join(prompt_parts)

            loop = asyncio.get_running_loop()
            response_stream = await loop.run_in_executor(None, lambda: ai.models.generate_content_stream(
                model=self._model,
                contents=full_prompt,
                config={
                    "max_output_tokens": 500,
                    "temperature": 0.7,
                }
            ))

            for chunk in response_stream:
                text = chunk.text
                if text:
                    yield text
        except Exception as e:
            yield self._fallback_response(messages, error=str(e))

    def _fallback_response(self, messages: list[ChatMessage], error: str) -> str:
        last_user = next((m.content for m in reversed(messages) if m.role == "user"), "")
        return (
            f"[Gemma 4 offline — falling back]\n"
            f"You asked: {last_user[:200]}\n\n"
            f"Set GEMINI_API_KEY in backend/.env to enable Gemma 4 responses.\n"
            f"(error: {error})"
        )


client = GemmaClient()
