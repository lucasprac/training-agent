import httpx
import pytest
import respx

from app.clients.openrouter import OpenRouterClient, OpenRouterError
from app.clients.sage import SageClient, SageError
from tests.conftest import OPENROUTER, SAGE, openrouter_stream


@respx.mock
async def test_sage_retries_429_then_succeeds(monkeypatch):
    monkeypatch.setattr("app.clients.sage.MAX_RETRY_WAIT_S", 0.0)
    route = respx.post(f"{SAGE}/decide/batch").mock(
        side_effect=[httpx.Response(429, headers={"Retry-After": "0"}), httpx.Response(200, json={"results": []})]
    )
    client = SageClient(SAGE, "lv_live_x")
    assert await client.decide_batch([]) == {"results": []}
    assert route.call_count == 2
    assert route.calls[0].request.headers["Authorization"] == "Bearer lv_live_x"


@respx.mock
async def test_sage_402_raises_with_status():
    respx.post(f"{SAGE}/v1/extract").mock(return_value=httpx.Response(402, json={"detail": "usage used up"}))
    with pytest.raises(SageError) as info:
        await SageClient(SAGE, "lv_live_x").extract("text", {"a": ""})
    assert info.value.status == 402


async def test_sage_without_key_raises_before_http():
    with pytest.raises(SageError):
        await SageClient(SAGE, "").decide_batch([])


@respx.mock
async def test_sage_reasoning_only_sent_when_not_off():
    route = respx.post(f"{SAGE}/decide/batch").mock(return_value=httpx.Response(200, json={}))
    client = SageClient(SAGE, "k")
    await client.decide_batch([], "off")
    await client.decide_batch([], "auto")
    import json

    assert "reasoning" not in json.loads(route.calls[0].request.content)
    assert json.loads(route.calls[1].request.content)["reasoning"] == "auto"


@respx.mock
async def test_openrouter_stream_parses_tokens_and_usage():
    respx.post(f"{OPENROUTER}/chat/completions").mock(
        return_value=httpx.Response(200, text=openrouter_stream("Hel", "lo"), headers={"content-type": "text/event-stream"})
    )
    client = OpenRouterClient("sk", OPENROUTER, app_url="http://localhost:5173", app_title="T")
    events = [e async for e in client.stream_chat("m", [{"role": "user", "content": "hi"}])]
    assert [e["text"] for e in events if e["type"] == "token"] == ["Hel", "lo"]
    assert events[-1]["type"] == "usage" and events[-1]["finish_reason"] == "stop"
    request = respx.calls.last.request
    assert request.headers["HTTP-Referer"] == "http://localhost:5173"
    assert request.headers["X-OpenRouter-Title"] == "T"


@respx.mock
async def test_openrouter_error_status_raises():
    respx.post(f"{OPENROUTER}/chat/completions").mock(
        return_value=httpx.Response(401, json={"error": {"message": "bad key"}})
    )
    with pytest.raises(OpenRouterError, match="bad key"):
        async for _ in OpenRouterClient("sk", OPENROUTER).stream_chat("m", []):
            pass
