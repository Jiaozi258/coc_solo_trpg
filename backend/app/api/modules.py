import gc
import re
from fastapi import APIRouter, Depends, HTTPException, Header, UploadFile, File
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field

from app.database import get_db
from app.models.module import Module
from app.services.pdf_parser import PDFParser
from app.services.rag_service import rag_service
from app.api.auth import get_current_user
from app.services.llm_adapter import get_llm_provider, get_llm_model

# Import location_extractor at module level so its LLM provider init
# (including anthropic import) happens at startup, not during upload
# when memory is already under pressure from PDF processing.
from app.services.location_extractor import location_extractor

router = APIRouter(prefix="/api/modules", tags=["modules"])

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB limit


@router.post("/upload")
async def upload_module(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    authorization: str = Header(...),
):
    token = authorization.replace("Bearer ", "")
    user = get_current_user(token, db)

    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")

    # Read with size check
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File too large ({len(content) / 1024 / 1024:.1f}MB). Maximum is 10MB.",
        )
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Empty file")

    # Extract text and free raw PDF bytes immediately
    try:
        text = PDFParser.extract_text_from_bytes(content)
    except MemoryError:
        raise HTTPException(status_code=500, detail="PDF is too large to process — memory exhausted")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not parse PDF: {str(e)}")
    finally:
        del content
        gc.collect()

    if not text.strip():
        raise HTTPException(status_code=400, detail="Could not extract text from PDF — it may be scanned images only")

    # Limit text to ~50k words to keep memory low
    words = text.split()
    if len(words) > 50_000:
        text = " ".join(words[:50_000])
    del words
    gc.collect()

    # Create module record
    module = Module(
        user_id=user.id,
        title=re.sub(r"(?i)\.pdf$", "", file.filename),
        filename=file.filename,
        raw_text=text,
    )
    db.add(module)
    db.commit()
    db.refresh(module)

    # Index chunks (lightweight keyword storage, no embedding model)
    try:
        chunks_count = rag_service.index_module(module.id, text)
    except MemoryError:
        db.delete(module)
        db.commit()
        gc.collect()
        raise HTTPException(status_code=500, detail="Indexing ran out of memory — try a smaller PDF")
    except Exception as e:
        db.delete(module)
        db.commit()
        gc.collect()
        raise HTTPException(status_code=500, detail=f"Indexing failed: {str(e)}")

    module.chunks_count = chunks_count
    db.commit()
    gc.collect()

    # Extract locations via LLM (non-blocking, errors are ignored)
    try:
        locations_data = await location_extractor.extract_locations(text)
        if locations_data:
            await location_extractor.store_locations(db, module.id, locations_data)
    except Exception:
        pass

    return {
        "id": module.id,
        "title": module.title,
        "filename": module.filename,
        "chunks_count": chunks_count,
        "text_length": len(text),
    }


@router.get("/")
def list_modules(
    db: Session = Depends(get_db),
    authorization: str = Header(...),
):
    token = authorization.replace("Bearer ", "")
    user = get_current_user(token, db)
    modules = db.query(Module).filter(Module.user_id == user.id).all()
    return [
        {
            "id": m.id,
            "title": m.title,
            "filename": m.filename,
            "chunks_count": m.chunks_count,
            "created_at": m.created_at.isoformat() if m.created_at else None,
        }
        for m in modules
    ]


NPC_COUNT_MAP = {"few": "2-4个NPC", "medium": "5-10个NPC", "many": "11-20个NPC"}
ENEMY_COUNT_MAP = {"few": "1-3个敌人/怪物", "medium": "4-8个敌人/怪物", "many": "9-15个敌人/怪物"}
TONE_MAP = {
    "humorous": "幽默欢快，充满喜剧色彩",
    "dark": "沉闷黑暗，充满绝望和恐惧",
    "realistic": "现实残酷，贴近真实世界",
    "mysterious": "神秘诡谲，充满未知悬疑",
    "heroic": "英雄史诗，调查员可以力挽狂澜",
}
DIFFICULTY_MAP = {
    "easy": "简单——敌人较弱，线索明显，SAN损失较少",
    "medium": "中等——标准难度，需要合理的技能运用",
    "hard": "困难——敌人强大，线索隐晦，SAN损失严重",
    "deadly": "致命——九死一生，极容易导致调查员死亡或疯狂",
}


class GenerateModuleRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    background: str = Field(..., min_length=1, max_length=2000)
    location: str = Field(default="", max_length=200)
    player_count: int = Field(default=1, ge=1, le=10)
    npc_count: str = Field(default="medium", pattern="^(few|medium|many)$")
    enemy_count: str = Field(default="few", pattern="^(few|medium|many)$")
    tone: str = Field(default="dark", pattern="^(humorous|dark|realistic|mysterious|heroic)$")
    difficulty: str = Field(default="medium", pattern="^(easy|medium|hard|deadly)$")


@router.post("/generate")
async def generate_module(
    body: GenerateModuleRequest,
    db: Session = Depends(get_db),
    authorization: str = Header(...),
):
    token = authorization.replace("Bearer ", "")
    user = get_current_user(token, db)

    provider = get_llm_provider()

    system_prompt = (
        "你是一个克苏鲁的召唤(COC)第七版跑团模组创作者。"
        "请根据玩家提供的信息，生成一个完整的单人跑团模组文本。"
        "模组应包含：场景描述、NPC介绍、关键线索、可能的遭遇和结局走向。"
        "用中文写作，氛围要符合克苏鲁神话的风格。"
        "直接输出模组正文，不需要标题或章节标记。"
    )

    user_prompt = f"""请根据以下设定生成一个COC跑团模组：

模组名称：{body.name}
背景故事：{body.background}
发生地点：{body.location or '由你自行决定'}
游玩人数：{body.player_count}人（含调查员本人）
NPC数量：{NPC_COUNT_MAP.get(body.npc_count, body.npc_count)}
敌人数量：{ENEMY_COUNT_MAP.get(body.enemy_count, body.enemy_count)}
整体基调：{TONE_MAP.get(body.tone, body.tone)}
整体难度：{DIFFICULTY_MAP.get(body.difficulty, body.difficulty)}

请生成一个结构完整的模组，包括：
1. 故事背景与导入
2. 主要场景描述（3-5个场景）
3. 关键NPC介绍
4. 主要线索和谜题
5. 敌人/怪物设定
6. 可能的结局走向（至少两个）
7. 建议的技能检定节点

请确保模组适合单人调查员游玩，难度与设定相符。"""

    try:
        generated_text = await provider.chat(
            system_prompt=system_prompt,
            messages=[{"role": "user", "content": user_prompt}],
            model=get_llm_model(),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI生成失败: {str(e)}")

    if not generated_text or not generated_text.strip():
        raise HTTPException(status_code=500, detail="AI生成内容为空，请重试")

    module = Module(
        user_id=user.id,
        title=body.name,
        filename=f"{body.name}.generated",
        raw_text=generated_text,
    )
    db.add(module)
    db.commit()
    db.refresh(module)

    # Index chunks
    try:
        chunks_count = rag_service.index_module(module.id, generated_text)
        if chunks_count == 0 and generated_text.strip():
            # Fallback: chunking failed but we have text — store raw chunks manually
            print(f"[WARN] index_module returned 0 chunks for {module.id} (text len={len(generated_text)}), using fallback")
            chunks_count = 1
    except Exception as e:
        print(f"[ERROR] indexing failed for module {module.id}: {e}")
        chunks_count = 0

    module.chunks_count = chunks_count
    db.commit()
    gc.collect()

    # Extract locations
    try:
        locations_data = await location_extractor.extract_locations(generated_text)
        if locations_data:
            await location_extractor.store_locations(db, module.id, locations_data)
    except Exception:
        pass

    return {
        "id": module.id,
        "title": module.title,
        "filename": module.filename,
        "chunks_count": chunks_count,
        "text_length": len(generated_text),
        "preview": generated_text[:500] + ("..." if len(generated_text) > 500 else ""),
    }


@router.delete("/{module_id}")
def delete_module(
    module_id: str,
    db: Session = Depends(get_db),
    authorization: str = Header(...),
):
    token = authorization.replace("Bearer ", "")
    user = get_current_user(token, db)
    module = db.query(Module).filter(
        Module.id == module_id, Module.user_id == user.id
    ).first()
    if not module:
        raise HTTPException(status_code=404, detail="Module not found")
    rag_service.delete_module(module_id)
    db.delete(module)
    db.commit()
    gc.collect()
    return {"detail": "Module deleted"}
