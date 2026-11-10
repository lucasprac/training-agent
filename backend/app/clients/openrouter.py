"""OpenRouter client (OpenAI-compatible chat completions)."""

import json
import time
from collections.abc import AsyncIterator
from typing import Any

import httpx

MODELS_CACHE_TTL_S = 600


class OpenRouterError(Exception):
    def __init__(self, message: str, status: int | None = None):
        super().__init__(message)
        self.status = status


class OpenRouterClient:
    def __init__(
        self,
        api_key: str,
        base_url: str = "https://openrouter.ai/api/v1",
        app_url: str = "",
        app_title: str = "",
        transport: httpx.AsyncBaseTransport | None = None,
    ):
        self._api_key = api_key
        self.base_url = base_url.rstrip("/")
        self._app_url = app_url
        self._app_title = app_title
        self._transport = transport
        self._models_cache: tuple[float, list[dict[str, Any]]] | None = None

    @property
    def configured(self) -> bool:
        return bool(self._api_key)

    def _headers(self) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self._api_key:
            headers["Authorization"] = f"Bearer {self._api_key}"
        if self._app_url:
            headers["HTTP-Referer"] = self._app_url
        if self._app_title:
            headers["X-OpenRouter-Title"] = self._app_title
        return headers

    def _client(self, timeout: float | httpx.Timeout = 60.0) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            base_url=self.base_url,
            headers=self._headers(),
            timeout=timeout,
            transport=self._transport,
        )

    def _require_key(self) -> None:
        if not self._api_key:
            raise OpenRouterError("OPENROUTER_API_KEY is not set", status=401)

    async def stream_chat(
        self,
        model: str,
        messages: list[dict[str, str]],
        temperature: float = 0.9,
        max_tokens: int = 800,
    ) -> AsyncIterator[dict[str, Any]]:
        """Yield {"type": "token", "text": ...} events, then one {"type": "usage", ...}."""
        self._require_key()
        body = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": True,
        }
        timeout = httpx.Timeout(connect=15.0, read=120.0, write=30.0, pool=15.0)
        async with self._client(timeout) as client:
            async with client.stream("POST", "/chat/completions", json=body) as response:
                if response.status_code >= 400:
                    text = (await response.aread()).decode("utf-8", "replace")
                    raise OpenRouterError(
                        f"OpenRouter returned {response.status_code}: {_error_text(text)}",
                        status=response.status_code,
                    )
                usage: dict[str, Any] | None = None
                finish_reason = None
                async for line in response.aiter_lines():
                    if not line.startswith("data:"):
                        continue  # SSE comments such as ": OPENROUTER PROCESSING"
                    data = line[5:].strip()
                    if data == "[DONE]":
                        break
                    try:
                        chunk = json.loads(data)
                    except json.JSONDecodeError:
                        continue
                    if "error" in chunk:
                        raise OpenRouterError(
                            f"OpenRouter stream error: {chunk['error'].get('message', chunk['error'])}"
                        )
                    for choice in chunk.get("choices") or []:
                        text = (choice.get("delta") or {}).get("content")
                        if text:
                            yield {"type": "token", "text": text}
                        if choice.get("finish_reason"):
                            finish_reason = choice["finish_reason"]
                    if chunk.get("usage"):
                        usage = chunk["usage"]
                yield {"type": "usage", "usage": usage or {}, "finish_reason": finish_reason}

    async def complete(
        self,
        model: str,
        messages: list[dict[str, str]],
        temperature: float = 0.3,
        max_tokens: int = 600,
    ) -> str:
        self._require_key()
        body = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        async with self._client(120.0) as client:
            response = await client.post("/chat/completions", json=body)
        if response.status_code >= 400:
            raise OpenRouterError(
                f"OpenRouter returned {response.status_code}: {_error_text(response.text)}",
                status=response.status_code,
            )
        choices = response.json().get("choices") or []
        if not choices:
            return ""
        return (choices[0].get("message") or {}).get("content") or ""

    async def list_models(self) -> list[dict[str, Any]]:
        now = time.monotonic()
        if self._models_cache and now - self._models_cache[0] < MODELS_CACHE_TTL_S:
            return self._models_cache[1]
        async with self._client(30.0) as client:
            response = await client.get("/models")
        if response.status_code >= 400:
            raise OpenRouterError(f"OpenRouter /models returned {response.status_code}")
        models = [
            {
                "id": m.get("id"),
                "name": m.get("name") or m.get("id"),
                "context_length": m.get("context_length"),
                "pricing": m.get("pricing") or {},
            }
            for m in response.json().get("data", [])
            if m.get("id")
        ]
        models.sort(key=lambda m: m["id"])
        self._models_cache = (now, models)
        return models


def _error_text(text: str) -> str:
    try:
        payload = json.loads(text)
        error = payload.get("error", payload)
        if isinstance(error, dict):
            return str(error.get("message", error))[:300]
        return str(error)[:300]
    except (json.JSONDecodeError, AttributeError):
        return text[:300]
