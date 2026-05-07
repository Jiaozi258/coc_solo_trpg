import json
from abc import ABC, abstractmethod
from typing import AsyncGenerator
from app.config import get_settings


class LLMProvider(ABC):
    @abstractmethod
    async def stream_chat(
        self, system_prompt: str, messages: list[dict], model: str
    ) -> AsyncGenerator[str, None]:
        ...

    @abstractmethod
    async def chat(
        self, system_prompt: str, messages: list[dict], model: str
    ) -> str:
        ...


class AnthropicProvider(LLMProvider):
    def __init__(self, api_key: str):
        import anthropic
        self.client = anthropic.AsyncAnthropic(api_key=api_key)

    async def stream_chat(
        self, system_prompt: str, messages: list[dict], model: str
    ) -> AsyncGenerator[str, None]:
        formatted = []
        for m in messages:
            formatted.append({"role": m["role"], "content": m["content"]})
        async with self.client.messages.stream(
            model=model,
            max_tokens=4096,
            system=system_prompt,
            messages=formatted,
        ) as stream:
            async for text in stream.text_stream:
                yield text

    async def chat(
        self, system_prompt: str, messages: list[dict], model: str
    ) -> str:
        formatted = []
        for m in messages:
            formatted.append({"role": m["role"], "content": m["content"]})
        response = await self.client.messages.create(
            model=model,
            max_tokens=4096,
            system=system_prompt,
            messages=formatted,
        )
        return response.content[0].text


class OpenAIProvider(LLMProvider):
    def __init__(self, api_key: str):
        from openai import AsyncOpenAI
        self.client = AsyncOpenAI(api_key=api_key)

    async def stream_chat(
        self, system_prompt: str, messages: list[dict], model: str
    ) -> AsyncGenerator[str, None]:
        formatted = [{"role": "system", "content": system_prompt}]
        for m in messages:
            formatted.append({"role": m["role"], "content": m["content"]})
        stream = await self.client.chat.completions.create(
            model=model, messages=formatted, max_tokens=4096, stream=True
        )
        async for chunk in stream:
            if chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content

    async def chat(
        self, system_prompt: str, messages: list[dict], model: str
    ) -> str:
        formatted = [{"role": "system", "content": system_prompt}]
        for m in messages:
            formatted.append({"role": m["role"], "content": m["content"]})
        response = await self.client.chat.completions.create(
            model=model, messages=formatted, max_tokens=4096,
        )
        return response.choices[0].message.content or ""


class OllamaProvider(LLMProvider):
    def __init__(self, base_url: str):
        import httpx
        self.base_url = base_url
        self.client = httpx.AsyncClient(timeout=120.0)

    async def stream_chat(
        self, system_prompt: str, messages: list[dict], model: str
    ) -> AsyncGenerator[str, None]:
        formatted = [{"role": "system", "content": system_prompt}]
        for m in messages:
            formatted.append({"role": m["role"], "content": m["content"]})
        async with self.client.stream(
            "POST", f"{self.base_url}/api/chat",
            json={"model": model, "messages": formatted, "stream": True},
        ) as resp:
            async for line in resp.aiter_lines():
                if line:
                    try:
                        data = json.loads(line)
                        if "message" in data and "content" in data["message"]:
                            yield data["message"]["content"]
                    except Exception:
                        pass

    async def chat(
        self, system_prompt: str, messages: list[dict], model: str
    ) -> str:
        formatted = [{"role": "system", "content": system_prompt}]
        for m in messages:
            formatted.append({"role": m["role"], "content": m["content"]})
        resp = await self.client.post(
            f"{self.base_url}/api/chat",
            json={"model": model, "messages": formatted, "stream": False},
        )
        data = resp.json()
        return data.get("message", {}).get("content", "")


def get_llm_provider() -> LLMProvider:
    s = get_settings()
    if s.llm_provider == "anthropic":
        return AnthropicProvider(s.anthropic_api_key)
    elif s.llm_provider == "openai":
        return OpenAIProvider(s.openai_api_key)
    elif s.llm_provider == "ollama":
        return OllamaProvider(s.ollama_base_url)
    raise ValueError(f"Unknown LLM provider: {s.llm_provider}")
