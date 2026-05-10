import asyncio
import copy
import json
import os
import random
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
    comfyui_url: str = "http://localhost:8188"  # ComfyUI server URL


# Default SD1.5/SDXL text-to-image workflow template
# The prompt is injected into the CLIPTextEncode node connected to KSampler's "positive" input
COMFYUI_DEFAULT_WORKFLOW = {
    "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "sd_xl_base_1.0.safetensors"}},
    "2": {"class_type": "EmptyLatentImage", "inputs": {"width": 1024, "height": 1024, "batch_size": 1}},
    "3": {"class_type": "CLIPTextEncode", "inputs": {"text": "__PROMPT__", "clip": ["1", 1]}},
    "4": {"class_type": "CLIPTextEncode", "inputs": {"text": "ugly, deformed, bad anatomy, low quality, worst quality", "clip": ["1", 1]}},
    "5": {"class_type": "KSampler", "inputs": {"seed": 42, "steps": 20, "cfg": 7.0, "sampler_name": "euler", "scheduler": "normal", "denoise": 1.0, "model": ["1", 0], "positive": ["3", 0], "negative": ["4", 0], "latent_image": ["2", 0]}},
    "6": {"class_type": "VAEDecode", "inputs": {"samples": ["5", 0], "vae": ["1", 2]}},
    "7": {"class_type": "PreviewImage", "inputs": {"images": ["6", 0]}},
}


COMFYUI_WORKFLOW_FILE = Path("comfyui_workflow.json")


def _load_comfyui_workflow() -> dict:
    """Load ComfyUI workflow from JSON file. If not exists, create with default template."""
    if COMFYUI_WORKFLOW_FILE.exists():
        try:
            with open(COMFYUI_WORKFLOW_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError):
            pass
    with open(COMFYUI_WORKFLOW_FILE, "w", encoding="utf-8") as f:
        json.dump(COMFYUI_DEFAULT_WORKFLOW, f, ensure_ascii=False, indent=2)
    return COMFYUI_DEFAULT_WORKFLOW


def _inject_prompt(workflow: dict, prompt: str) -> dict:
    """Inject the user prompt into the positive CLIPTextEncode node of a ComfyUI workflow.
    Supports CLIPTextEncode, CLIPTextEncodeSDXL, and any custom node connected to KSampler.positive."""
    wf = copy.deepcopy(workflow)
    ksampler_nodes = [nid for nid, n in wf.items() if n.get("class_type") == "KSampler"]
    for ksid in ksampler_nodes:
        pos_input = wf[ksid]["inputs"].get("positive")
        if pos_input and isinstance(pos_input, list) and len(pos_input) == 2:
            pos_node_id = str(pos_input[0])
            if pos_node_id in wf:
                pos_node = wf[pos_node_id]
                if "text" in pos_node.get("inputs", {}):
                    pos_node["inputs"]["text"] = prompt
                    break
    for n in wf.values():
        if n.get("class_type") == "KSampler" and "seed" in n.get("inputs", {}):
            n["inputs"]["seed"] = random.randint(0, 2**31 - 1)
    return wf


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
            base_url = stored.get("cloud_base_url", "").rstrip("/") or "https://api.openai.com/v1"

            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f"{base_url}/models",
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
            base_url = stored.get("cloud_base_url", "").rstrip("/") or "https://api.openai.com/v1"

            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f"{base_url}/models",
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

        elif provider == "comfyui":
            import httpx
            comfyui_url = stored.get("comfyui_url", "http://localhost:8188").rstrip("/")
            try:
                async with httpx.AsyncClient() as client:
                    resp = await client.get(f"{comfyui_url}/system_stats", timeout=10.0)
                    if resp.status_code == 200:
                        return {"status": "ok", "provider": "comfyui", "model": "ComfyUI", "message": f"ComfyUI 可用 ({comfyui_url})"}
                    else:
                        return {"status": "error", "message": f"ComfyUI 返回 {resp.status_code}，请检查服务是否正常运行"}
            except Exception as e:
                return {"status": "error", "message": f"无法连接到 ComfyUI ({comfyui_url}): {str(e)[:200]}"}

        else:
            return {"status": "error", "message": f"未知的图片生成提供商: {provider}"}

    except Exception as e:
        return {"status": "error", "provider": provider, "model": model, "error": str(e)[:500]}


@router.post("/comfyui-checkpoints")
async def list_comfyui_checkpoints(
    db: Session = Depends(get_db),
    authorization: str = Header(...),
):
    """Query ComfyUI for available checkpoints and models."""
    token = authorization.replace("Bearer ", "")
    get_current_user(token, db)

    stored = _load_settings()
    comfyui_url = stored.get("comfyui_url", "http://localhost:8188").rstrip("/")

    import httpx
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{comfyui_url}/object_info", timeout=10.0)
            if resp.status_code != 200:
                return {"status": "error", "message": f"ComfyUI 返回 {resp.status_code}"}
            data = resp.json()

            checkpoints = []
            # CheckpointLoaderSimple.ckpt_name lists available .safetensors/.ckpt files
            loader_info = data.get("CheckpointLoaderSimple", {})
            ckpt_input = loader_info.get("input", {}).get("required", {}).get("ckpt_name", [])
            if isinstance(ckpt_input, list) and len(ckpt_input) > 0:
                checkpoints = ckpt_input[0]  # First element is the list of available values

            # Also check CheckpointLoader (older node)
            loader_info2 = data.get("CheckpointLoader", {})
            ckpt_input2 = loader_info2.get("input", {}).get("required", {}).get("ckpt_name", [])
            if isinstance(ckpt_input2, list) and len(ckpt_input2) > 0:
                for c in ckpt_input2[0]:
                    if c not in checkpoints:
                        checkpoints.append(c)

            return {"status": "ok", "checkpoints": checkpoints, "comfyui_url": comfyui_url}
    except Exception as e:
        return {"status": "error", "message": f"无法连接 ComfyUI: {str(e)[:200]}"}


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
            base_url = stored.get("cloud_base_url", "").rstrip("/") or "https://api.openai.com/v1"

            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    f"{base_url}/images/generations",
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
            base_url = stored.get("cloud_base_url", "").rstrip("/") or "https://api.openai.com/v1"

            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    f"{base_url}/chat/completions",
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

        elif provider == "comfyui":
            import httpx
            comfyui_url = stored.get("comfyui_url", "http://localhost:8188").rstrip("/")

            workflow = _load_comfyui_workflow()

            # Auto-detect and inject available checkpoint if the configured one doesn't exist
            try:
                async with httpx.AsyncClient() as pre_client:
                    obj_resp = await pre_client.get(f"{comfyui_url}/object_info", timeout=10.0)
                    if obj_resp.status_code == 200:
                        obj_data = obj_resp.json()
                        available_ckpts = []
                        for loader_name in ("CheckpointLoaderSimple", "CheckpointLoader"):
                            loader = obj_data.get(loader_name, {})
                            ckpt_list = loader.get("input", {}).get("required", {}).get("ckpt_name", [])
                            if isinstance(ckpt_list, list) and len(ckpt_list) > 0:
                                available_ckpts.extend(ckpt_list[0])
                        if available_ckpts:
                            # Find CheckpointLoader nodes that need fixing
                            for node in workflow.values():
                                if node.get("class_type") in ("CheckpointLoaderSimple", "CheckpointLoader"):
                                    current = node["inputs"].get("ckpt_name", "")
                                    if current and current not in available_ckpts:
                                        node["inputs"]["ckpt_name"] = available_ckpts[0]
            except Exception:
                pass  # If can't reach ComfyUI for detection, proceed with configured workflow

            workflow = _inject_prompt(workflow, body.prompt)

            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    f"{comfyui_url}/prompt",
                    json={"prompt": workflow},
                    timeout=30.0,
                )
                if resp.status_code != 200:
                    raise HTTPException(status_code=502, detail=f"ComfyUI 提交失败: {resp.text[:300]}")
                data = resp.json()

                if data.get("error"):
                    error_msg = data["error"]
                    if isinstance(error_msg, dict):
                        error_msg = error_msg.get("message", str(error_msg))
                    raise HTTPException(status_code=502, detail=f"ComfyUI 错误: {error_msg}")

                prompt_id = data.get("prompt_id")
                if not prompt_id:
                    raise HTTPException(status_code=502, detail="ComfyUI 未返回 prompt_id")

                # Poll for completion
                max_wait = 300
                poll_interval = 2
                elapsed = 0
                while elapsed < max_wait:
                    await asyncio.sleep(poll_interval)
                    elapsed += poll_interval
                    hist_resp = await client.get(f"{comfyui_url}/history/{prompt_id}", timeout=10.0)
                    if hist_resp.status_code != 200:
                        continue
                    history = hist_resp.json()
                    if prompt_id not in history:
                        continue

                    prompt_data = history[prompt_id]
                    status_info = prompt_data.get("status", {})

                    # Check for ComfyUI-side errors (bad workflow, missing model, OOM, etc.)
                    if status_info.get("status_str") == "error":
                        messages = status_info.get("messages", [])
                        error_details = []
                        for m in messages:
                            if isinstance(m, list) and len(m) >= 2:
                                error_details.append(f"[{m[0]}] {m[1]}")
                            elif isinstance(m, str):
                                error_details.append(m)
                        detail = "; ".join(error_details) if error_details else "ComfyUI 工作流执行失败，请检查 comfyui_workflow.json 中的模型名称是否正确"
                        raise HTTPException(status_code=502, detail=f"ComfyUI 生成失败: {detail}")

                    outputs = prompt_data.get("outputs", {})
                    if outputs:
                        image_files = []
                        for node_output in outputs.values():
                            for img in node_output.get("images", []):
                                filename = img.get("filename", "")
                                subfolder = img.get("subfolder", "")
                                img_type = img.get("type", "output")
                                if filename:
                                    image_files.append((filename, subfolder, img_type))
                        if image_files:
                            local_dir = UPLOAD_DIR / "comfyui_outputs"
                            local_dir.mkdir(parents=True, exist_ok=True)
                            local_urls = []
                            for filename, subfolder, img_type in image_files:
                                params = {"filename": filename, "type": img_type}
                                if subfolder:
                                    params["subfolder"] = subfolder
                                img_resp = await client.get(f"{comfyui_url}/view", params=params, timeout=60.0)
                                if img_resp.status_code == 200:
                                    local_name = f"{prompt_id}_{filename}"
                                    local_path = local_dir / local_name
                                    with open(local_path, "wb") as f:
                                        f.write(img_resp.content)
                                    local_urls.append(f"/api/uploads/comfyui_outputs/{local_name}")
                            if local_urls:
                                return {"status": "ok", "urls": local_urls, "prompt": body.prompt}

                    if status_info.get("completed") is False:
                        continue
                    break
                raise HTTPException(status_code=504, detail="ComfyUI 生图超时（5分钟），请检查 ComfyUI 是否正在运行、工作流是否正确")

        else:
            raise HTTPException(status_code=400, detail=f"Unknown image gen provider: {provider}")

    except HTTPException:
        raise
    except Exception as e:
        msg = str(e)
        if "connect" in msg.lower() or "name or service not known" in msg.lower():
            provider_name = {"openai_dalle": "OpenAI DALL-E", "openai_gpt": "OpenAI GPT", "comfyui": "ComfyUI"}.get(provider, provider)
            if provider in ("openai_dalle", "openai_gpt"):
                msg = f"无法连接到 OpenAI API（{provider_name}）。如果您在中国大陆，请在设置中填写 cloud_base_url 代理地址。原始错误: {msg}"
            else:
                msg = f"无法连接到 {provider_name}。请检查服务是否正在运行。原始错误: {msg}"
        raise HTTPException(status_code=500, detail=msg[:500])
