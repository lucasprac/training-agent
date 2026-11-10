"""Levanto Sage 2 client: /decide/batch, /v1/extract, /ready.

Retries 429 and 503 (honours Retry-After, capped). Any other failure raises SageError,
which the harness treats as "degraded mode".
"""

import asyncio
from typing import Any

import httpx

RETRY_STATUSES = {429, 503}
MAX_RETRIES = 2
MAX_RETRY_WAIT_S = 3.0


class SageError(Exception):
    def __init__(self, message: str, status: int | None = None):
        super().__init__(message)
        self.status = status


class SageClient:
    def __init__(
        self,
        base_url: str,
        api_key: str,
        timeout_s: float = 20.0,
        transport: httpx.AsyncBaseTransport | None = None,
    ):
        self.base_url = base_url.rstrip("/")
        self._api_key = api_key
        self._timeout = timeout_s
        self._transport = transport

    @property
    def configured(self) -> bool:
        return bool(self._api_key)

    def _client(self) -> httpx.AsyncClient:
        headers = {"Content-Type": "application/json"}
        if self._api_key:
            headers["Authorization"] = f"Bearer {self._api_key}"
        return httpx.AsyncClient(
            base_url=self.base_url,
            headers=headers,
            timeout=self._timeout,
            transport=self._transport,
        )

    async def ready(self) -> bool:
        try:
            async with self._client() as client:
                response = await client.get("/ready")
            return response.status_code == 200
        except httpx.HTTPError:
            return False

    async def _post(self, path: str, body: dict[str, Any]) -> dict[str, Any]:
        if not self._api_key:
            raise SageError("SAGE_API_KEY is not set", status=401)
        attempt = 0
        async with self._client() as client:
            while True:
                try:
                    response = await client.post(path, json=body)
                except httpx.TimeoutException as exc:
                    raise SageError(f"Sage timeout on {path}") from exc
                except httpx.HTTPError as exc:
                    raise SageError(f"Sage connection error on {path}: {exc}") from exc
                if response.status_code in RETRY_STATUSES and attempt < MAX_RETRIES:
                    attempt += 1
                    await asyncio.sleep(_retry_wait(response, attempt))
                    continue
                if response.status_code >= 400:
                    raise SageError(
                        f"Sage {path} returned {response.status_code}: {_detail(response)}",
                        status=response.status_code,
                    )
                return response.json()

    async def decide_batch(
        self, requests: list[dict[str, Any]], reasoning: str = "off"
    ) -> dict[str, Any]:
        body: dict[str, Any] = {"requests": requests}
        if reasoning != "off":
            body["reasoning"] = reasoning
        return await self._post("/decide/batch", body)

    async def extract(self, content: str, extract: dict[str, Any]) -> dict[str, Any]:
        return await self._post("/v1/extract", {"content": content, "extract": extract})


def _retry_wait(response: httpx.Response, attempt: int) -> float:
    header = response.headers.get("Retry-After")
    try:
        wait = float(header) if header else 0.5 * attempt
    except ValueError:
        wait = 0.5 * attempt
    return min(max(wait, 0.0), MAX_RETRY_WAIT_S)


def _detail(response: httpx.Response) -> str:
    try:
        return str(response.json().get("detail", ""))[:300]
    except ValueError:
        return response.text[:300]
