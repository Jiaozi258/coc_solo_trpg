import json
from typing import AsyncGenerator


def sse_event(event: str, data: dict) -> str:
    """Format a Server-Sent Event string."""
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


async def sse_stream(generator) -> AsyncGenerator[str, None]:
    """Wrap an async generator that yields (event_type, payload) tuples into SSE format."""
    async for event_type, payload in generator:
        if event_type == "done":
            yield sse_event("done", payload)
            return
        yield sse_event(event_type, payload)


def estimate_tokens(text_or_chars) -> int:
    """Rough token estimation: ~2 chars per token for CJK, ~4 for English."""
    if isinstance(text_or_chars, int):
        return max(1, text_or_chars // 2)
    text = str(text_or_chars)
    cjk = sum(1 for c in text if '一' <= c <= '鿿' or '㐀' <= c <= '䶿')
    other = len(text) - cjk
    return max(1, cjk // 2 + other // 4)
