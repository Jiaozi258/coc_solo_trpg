import json
import os
import shutil
import time
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, Depends, Header, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.api.auth import get_current_user

router = APIRouter(prefix="/api/settings", tags=["settings"])

SETTINGS_FILE = Path("user_settings.json")
UPLOAD_DIR = Path("./uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

BG_IMAGE_FILE = UPLOAD_DIR / "background_image"
BG_MUSIC_FILE = UPLOAD_DIR / "background_music"

ALLOWED_IMAGE_TYPES = {"image/png", "image/jpeg", "image/jpg", "image/webp"}
ALLOWED_AUDIO_TYPES = {"audio/mpeg", "audio/mp3", "audio/wav", "audio/ogg", "audio/flac"}
MAX_FILE_SIZE = 20 * 1024 * 1024  # 20MB


class UserSettings(BaseModel):
    ai_mode: str = "cloud"  # "cloud" or "ollama"
    cloud_provider: str = "anthropic"  # "anthropic" or "openai"
    cloud_api_key: str = ""
    cloud_base_url: str = ""  # custom API base URL (for OpenAI-compatible proxies)
    cloud_model: str = ""
    ollama_url: str = "http://localhost:11434"
    ollama_model: str = ""
    text_speed: int = 3  # 1-5, where 1=slow 5=fast
    show_token_usage: bool = False  # token consumption display toggle
    dialogue_length: str = "medium"  # "short", "medium", "long"
    image_gen_provider: str = ""  # "" (disabled), "openai_dalle", "openai_gpt"
    image_gen_model: str = "dall-e-3"  # model name for image generation
    image_gen_api_key: str = ""  # dedicated OpenAI API key for image generation


def _load_settings() -> dict:
    if SETTINGS_FILE.exists():
        try:
            with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError):
            pass
    return {}


def _save_settings(data: dict) -> None:
    with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


@router.get("")
def get_settings(
    db: Session = Depends(get_db),
    authorization: str = Header(...),
):
    """Return current user settings with defaults filled in."""
    token = authorization.replace("Bearer ", "")
    get_current_user(token, db)

    defaults = UserSettings().model_dump()
    stored = _load_settings()
    defaults.update(stored)

    # Check which files exist
    defaults["has_background_image"] = BG_IMAGE_FILE.exists()
    defaults["has_background_music"] = BG_MUSIC_FILE.exists()

    return defaults


@router.post("")
def save_settings(
    body: UserSettings,
    db: Session = Depends(get_db),
    authorization: str = Header(...),
):
    """Save user settings. Also updates .env for backend compatibility."""
    token = authorization.replace("Bearer ", "")
    get_current_user(token, db)

    data = body.model_dump()
    _save_settings(data)

    # Sync LLM settings to .env so backend picks them up
    _sync_env(data)

    return {"detail": "Settings saved"}


def _sync_env(data: dict) -> None:
    """Write LLM-related settings to .env file."""
    env_path = Path(".env")
    lines: dict[str, str] = {}

    if env_path.exists():
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if "=" in line and not line.startswith("#"):
                    key, _, val = line.partition("=")
                    lines[key.strip()] = val.strip().strip('"').strip("'")

    # Remove all provider-specific keys first to prevent stale values
    for stale in ("OPENAI_API_KEY", "OPENAI_BASE_URL", "ANTHROPIC_API_KEY", "OLLAMA_BASE_URL"):
        lines.pop(stale, None)

    if data.get("ai_mode") == "ollama":
        lines["LLM_PROVIDER"] = "ollama"
        lines["OLLAMA_BASE_URL"] = data.get("ollama_url", "http://localhost:11434")
        lines["LLM_MODEL"] = data.get("ollama_model", "llama3")
    else:
        cloud_provider = data.get("cloud_provider", "anthropic")
        lines["LLM_PROVIDER"] = cloud_provider
        if cloud_provider == "openai":
            lines["OPENAI_API_KEY"] = data.get("cloud_api_key", "")
            base_url = data.get("cloud_base_url", "")
            if base_url:
                lines["OPENAI_BASE_URL"] = base_url
        else:
            lines["ANTHROPIC_API_KEY"] = data.get("cloud_api_key", "")
        lines["LLM_MODEL"] = data.get("cloud_model", "claude-sonnet-4-6")

    with open(env_path, "w", encoding="utf-8") as f:
        for k, v in lines.items():
            f.write(f"{k}={v}\n")


@router.post("/background-image")
async def upload_background_image(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    authorization: str = Header(...),
):
    """Upload a background image. Replaces any existing one."""
    token = authorization.replace("Bearer ", "")
    get_current_user(token, db)

    if file.content_type and file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail=f"Unsupported image type: {file.content_type}. Use PNG, JPEG, or WebP.")

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail=f"File too large ({len(content) / 1024 / 1024:.1f}MB). Max 20MB.")

    with open(BG_IMAGE_FILE, "wb") as f:
        f.write(content)

    return {"detail": "Background image saved", "size": len(content)}


@router.post("/background-music")
async def upload_background_music(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    authorization: str = Header(...),
):
    """Upload background music. Replaces any existing one."""
    token = authorization.replace("Bearer ", "")
    get_current_user(token, db)

    if file.content_type and file.content_type not in ALLOWED_AUDIO_TYPES:
        raise HTTPException(status_code=400, detail=f"Unsupported audio type: {file.content_type}. Use MP3, WAV, OGG, or FLAC.")

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail=f"File too large ({len(content) / 1024 / 1024:.1f}MB). Max 20MB.")

    with open(BG_MUSIC_FILE, "wb") as f:
        f.write(content)

    return {"detail": "Background music saved", "size": len(content)}


@router.get("/background-image")
def get_background_image(
    db: Session = Depends(get_db),
    authorization: str = Header(...),
):
    """Serve the uploaded background image."""
    token = authorization.replace("Bearer ", "")
    get_current_user(token, db)

    if not BG_IMAGE_FILE.exists():
        raise HTTPException(status_code=404, detail="No background image uploaded")
    return FileResponse(BG_IMAGE_FILE)


@router.get("/background-music")
def get_background_music(
    db: Session = Depends(get_db),
    authorization: str = Header(...),
):
    """Serve the uploaded background music."""
    token = authorization.replace("Bearer ", "")
    get_current_user(token, db)

    if not BG_MUSIC_FILE.exists():
        raise HTTPException(status_code=404, detail="No background music uploaded")
    return FileResponse(BG_MUSIC_FILE)


@router.delete("/background-image")
def delete_background_image(
    db: Session = Depends(get_db),
    authorization: str = Header(...),
):
    token = authorization.replace("Bearer ", "")
    get_current_user(token, db)

    if BG_IMAGE_FILE.exists():
        os.remove(BG_IMAGE_FILE)
    return {"detail": "Background image removed"}


@router.delete("/background-music")
def delete_background_music(
    db: Session = Depends(get_db),
    authorization: str = Header(...),
):
    token = authorization.replace("Bearer ", "")
    get_current_user(token, db)

    if BG_MUSIC_FILE.exists():
        os.remove(BG_MUSIC_FILE)
    return {"detail": "Background music removed"}


@router.post("/test-llm")
async def test_llm_connection(
    db: Session = Depends(get_db),
    authorization: str = Header(...),
):
    """Test LLM connectivity with a tiny ping message. Returns status and latency."""
    token = authorization.replace("Bearer ", "")
    get_current_user(token, db)

    from app.services.llm_adapter import get_llm_provider, get_llm_model, _load_user_llm_config

    llm_config = _load_user_llm_config()
    provider = get_llm_provider()
    model = get_llm_model()

    t0 = time.perf_counter()
    try:
        response = await provider.chat(
            system_prompt="Reply with exactly the word: pong",
            messages=[{"role": "user", "content": "ping"}],
            model=model,
        )
        elapsed = round((time.perf_counter() - t0) * 1000)  # ms
        return {
            "status": "ok",
            "provider": llm_config["ai_mode"] == "ollama" and "ollama" or llm_config["provider"],
            "model": model,
            "latency_ms": elapsed,
            "response_preview": response[:100] if response else "(empty)",
        }
    except Exception as e:
        elapsed = round((time.perf_counter() - t0) * 1000)
        return {
            "status": "error",
            "provider": llm_config["ai_mode"] == "ollama" and "ollama" or llm_config["provider"],
            "model": model,
            "latency_ms": elapsed,
            "error": str(e)[:500],
        }


@router.post("/test-image-gen")
async def test_image_generation(
    db: Session = Depends(get_db),
    authorization: str = Header(...),
):
    """Test whether the configured image generation provider is available."""
    token = authorization.replace("Bearer ", "")
    get_current_user(token, db)

    stored = _load_settings()
    provider = stored.get("image_gen_provider", "")
    model = stored.get("image_gen_model", "dall-e-3")

    if not provider:
        return {"status": "disabled", "message": "未启用图片生成"}

    from app.services.llm_adapter import _load_user_llm_config
    llm_config = _load_user_llm_config()

    try:
        if provider == "openai_dalle":
            # Use OpenAI's DALL-E
            import httpx
            api_key = stored.get("image_gen_api_key") or stored.get("cloud_api_key") or llm_config["api_key"]
            if not api_key:
                return {"status": "error", "message": "未设置图片生成 API Key，请在设置中填写", "provider": provider, "model": model}

            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    "https://api.openai.com/v1/models",
                    headers={"Authorization": f"Bearer {api_key}"},
                    timeout=10.0,
                )
                if resp.status_code == 200:
                    models_data = resp.json()
                    available = [m["id"] for m in models_data.get("data", [])]
                    if model in available:
                        return {"status": "ok", "provider": provider, "model": model, "message": "DALL-E 可用"}
                    else:
                        dalle_models = [m for m in available if "dall-e" in m.lower()]
                        return {
                            "status": "partial",
                            "provider": provider,
                            "model": model,
                            "message": f"模型 {model} 不可用，可用 DALL-E 模型: {', '.join(dalle_models[:5])}",
                            "available": dalle_models[:10],
                        }
                else:
                    return {"status": "error", "message": f"API 返回 {resp.status_code}，可能 API Key 不支持 OpenAI"}

        elif provider == "openai_gpt":
            # Check if GPT-4o with image generation is available
            import httpx
            api_key = stored.get("image_gen_api_key") or stored.get("cloud_api_key") or llm_config["api_key"]
            if not api_key:
                return {"status": "error", "message": "未设置云端 API Key"}

            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    "https://api.openai.com/v1/models",
                    headers={"Authorization": f"Bearer {api_key}"},
                    timeout=10.0,
                )
                if resp.status_code == 200:
                    models_data = resp.json()
                    available = [m["id"] for m in models_data.get("data", [])]
                    gpt_image_models = [m for m in available if "gpt-4o" in m.lower() or "gpt-4" in m.lower() and "vision" not in m.lower()]
                    if gpt_image_models:
                        return {"status": "ok", "provider": provider, "model": model, "available_gpt": gpt_image_models[:5], "message": "GPT-4o 支持图片生成"}
                    else:
                        return {"status": "error", "message": "当前账号没有支持图片生成的 GPT 模型"}
                else:
                    return {"status": "error", "message": f"API Key 可能不支持 OpenAI"}

        else:
            return {"status": "error", "message": f"未知的图片生成提供商: {provider}"}

    except Exception as e:
        return {"status": "error", "provider": provider, "model": model, "error": str(e)[:500]}


class GenerateImageRequest(BaseModel):
    prompt: str
    size: str = "1024x1024"  # "1024x1024", "1792x1024", "1024x1792"


@router.post("/generate-image")
async def generate_image(
    body: GenerateImageRequest,
    db: Session = Depends(get_db),
    authorization: str = Header(...),
):
    """Generate an image from a text prompt using the configured provider."""
    token = authorization.replace("Bearer ", "")
    get_current_user(token, db)

    stored = _load_settings()
    provider = stored.get("image_gen_provider", "")
    model = stored.get("image_gen_model", "dall-e-3")

    if not provider:
        raise HTTPException(status_code=400, detail="Image generation is not enabled in settings")

    from app.services.llm_adapter import _load_user_llm_config
    llm_config = _load_user_llm_config()

    try:
        if provider == "openai_dalle":
            import httpx
            api_key = stored.get("image_gen_api_key") or stored.get("cloud_api_key") or llm_config["api_key"]
            if not api_key:
                raise HTTPException(status_code=400, detail="No cloud API key configured")

            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    "https://api.openai.com/v1/images/generations",
                    json={
                        "model": model,
                        "prompt": body.prompt,
                        "n": 1,
                        "size": body.size,
                    },
                    headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                    timeout=120.0,
                )
                if resp.status_code == 200:
                    data = resp.json()
                    image_url = data["data"][0]["url"] if data.get("data") else None
                    return {"status": "ok", "url": image_url, "prompt": body.prompt}
                else:
                    raise HTTPException(status_code=resp.status_code, detail=f"DALL-E API error: {resp.text[:500]}")

        elif provider == "openai_gpt":
            import httpx
            api_key = stored.get("image_gen_api_key") or stored.get("cloud_api_key") or llm_config["api_key"]
            if not api_key:
                raise HTTPException(status_code=400, detail="No cloud API key configured")

            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    "https://api.openai.com/v1/chat/completions",
                    json={
                        "model": model,
                        "messages": [
                            {"role": "user", "content": f"Generate an image based on this description:\n{body.prompt}"}
                        ],
                        "max_tokens": 500,
                    },
                    headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                    timeout=120.0,
                )
                if resp.status_code == 200:
                    data = resp.json()
                    text = data["choices"][0]["message"]["content"] if data.get("choices") else ""
                    return {"status": "ok", "text": text, "prompt": body.prompt}
                else:
                    raise HTTPException(status_code=resp.status_code, detail=f"GPT API error: {resp.text[:500]}")

        else:
            raise HTTPException(status_code=400, detail=f"Unknown image gen provider: {provider}")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)[:500])
