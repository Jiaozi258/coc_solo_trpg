import json
from pathlib import Path
from abc import ABC, abstractmethod
from typing import AsyncGenerator
from app.config import get_settings


def _load_user_llm_config() -> dict:
    """Read LLM config from user_settings.json with config.py fallback defaults."""
    s = get_settings()
    config = {
        "ai_mode": "cloud",
        "provider": "anthropic",  # cloud_provider when ai_mode=cloud
        "api_key": s.anthropic_api_key or "",
        "base_url": s.openai_base_url or "",
        "model": "claude-sonnet-4-6",
        "ollama_url": s.ollama_base_url,
    }
    try:
        us = json.loads(Path("user_settings.json").read_text(encoding="utf-8"))
        ai_mode = us.get("ai_mode", "cloud")
        config["ai_mode"] = ai_mode
        if ai_mode == "ollama":
            config["ollama_url"] = us.get("ollama_url", config["ollama_url"])
            config["model"] = us.get("ollama_model", "") or "llama3"
        else:
            config["provider"] = us.get("cloud_provider", "anthropic")
            config["api_key"] = us.get("cloud_api_key", "") or config["api_key"]
            config["base_url"] = us.get("cloud_base_url", "") or config["base_url"]
            config["model"] = us.get("cloud_model", "") or "claude-sonnet-4-6"
    except Exception:
        pass
    return config


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
    def __init__(self, api_key: str, base_url: str = ""):
        from openai import AsyncOpenAI
        kwargs = {"api_key": api_key}
        if base_url:
            kwargs["base_url"] = base_url
        self.client = AsyncOpenAI(**kwargs)

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
    c = _load_user_llm_config()
    if c["ai_mode"] == "ollama":
        return OllamaProvider(c["ollama_url"])
    if c["provider"] == "openai":
        return OpenAIProvider(c["api_key"], c["base_url"])
    return AnthropicProvider(c["api_key"])


def get_llm_model() -> str:
    return _load_user_llm_config()["model"]
