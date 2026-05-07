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
