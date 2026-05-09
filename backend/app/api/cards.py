import struct
import json
import zlib
import base64
import re
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, Header, UploadFile, File, Form
from fastapi.responses import StreamingResponse, FileResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field

from app.database import get_db
from app.models.character_card import CharacterCard
from app.models.lorebook import Lorebook
from app.models.user_persona import UserPersona
from app.api.auth import get_current_user
from app.services.llm_adapter import get_llm_provider, get_llm_model
from app.api.lorebooks import match_lorebook_entries
from app.utils.sse import estimate_tokens

router = APIRouter(prefix="/api/cards", tags=["character_cards"])

PORTRAIT_DIR = Path("./uploads/portraits")
PORTRAIT_DIR.mkdir(parents=True, exist_ok=True)


class CreateCardRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    personality: str = Field(default="", max_length=5000)
    background: str = Field(default="", max_length=5000)
    relationships: str = Field(default="", max_length=3000)
    dialogue_examples: str = Field(default="", max_length=10000)


@router.post("")
async def create_card(
    name: str = Form(..., min_length=1, max_length=100),
    personality: str = Form(default=""),
    background: str = Form(default=""),
    relationships: str = Form(default=""),
    dialogue_examples: str = Form(default=""),
    portrait: UploadFile = File(None),
    db: Session = Depends(get_db),
    authorization: str = Header(...),
):
    token = authorization.replace("Bearer ", "")
    user = get_current_user(token, db)

    # Create card first to get its auto-generated ID
    card = CharacterCard(
        user_id=user.id,
        name=name,
        personality=personality,
        background=background,
        relationships=relationships,
        dialogue_examples=dialogue_examples,
        portrait_path="",
        source="manual",
    )
    db.add(card)
    db.flush()

    if portrait and portrait.filename:
        if portrait.content_type and portrait.content_type not in ("image/png", "image/jpeg", "image/webp"):
            raise HTTPException(status_code=400, detail="Portrait must be PNG, JPEG, or WebP")
        content = await portrait.read()
        if len(content) > 10 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="Portrait too large (max 10MB)")
        suffix = Path(portrait.filename).suffix or ".png"
        file_name = f"{card.id}{suffix}"
        with open(PORTRAIT_DIR / file_name, "wb") as f:
            f.write(content)
        card.portrait_path = f"/api/cards/portrait/{file_name}"

    db.commit()
    db.refresh(card)

    return _card_response(card)


@router.get("")
def list_cards(
    db: Session = Depends(get_db),
    authorization: str = Header(...),
):
    token = authorization.replace("Bearer ", "")
    user = get_current_user(token, db)
    cards = db.query(CharacterCard).filter(CharacterCard.user_id == user.id).order_by(CharacterCard.created_at.desc()).all()
    return [_card_response(c) for c in cards]


@router.get("/{card_id}")
def get_card(
    card_id: str,
    db: Session = Depends(get_db),
    authorization: str = Header(...),
):
    token = authorization.replace("Bearer ", "")
    user = get_current_user(token, db)
    card = db.query(CharacterCard).filter(
        CharacterCard.id == card_id, CharacterCard.user_id == user.id
    ).first()
    if not card:
        raise HTTPException(status_code=404, detail="Card not found")
    return _card_response(card)


@router.delete("/{card_id}")
def delete_card(
    card_id: str,
    db: Session = Depends(get_db),
    authorization: str = Header(...),
):
    token = authorization.replace("Bearer ", "")
    user = get_current_user(token, db)
    card = db.query(CharacterCard).filter(
        CharacterCard.id == card_id, CharacterCard.user_id == user.id
    ).first()
    if not card:
        raise HTTPException(status_code=404, detail="Card not found")
    # Delete portrait file if exists
    if card.portrait_path:
        try:
            portrait_file = Path(card.portrait_path.replace("/api/cards/portrait/", ""))
            file_path = PORTRAIT_DIR / portrait_file
            if file_path.exists():
                file_path.unlink()
        except Exception:
            pass
    db.delete(card)
    db.commit()
    return {"detail": "Card deleted"}


@router.post("/import-png")
async def import_png(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    authorization: str = Header(...),
):
    """Import a character card from a PNG file. Extracts JSON from tEXt chunk."""
    token = authorization.replace("Bearer ", "")
    user = get_current_user(token, db)

    if not file.filename or not file.filename.lower().endswith(".png"):
        raise HTTPException(status_code=400, detail="Only PNG files are accepted")

    content = await file.read()
    if len(content) > 20 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 20MB)")

    # Parse PNG and extract tEXt chunk
    card_data = _parse_png_text_chunk(content)
    if not card_data:
        raise HTTPException(status_code=400, detail="No character card data found in PNG. The file must contain a tEXt chunk with card JSON.")

    # Map SillyTavern / CharacterCard fields to our model
    name = card_data.get("name") or ""
    if not name:
        name = file.filename.replace(".png", "").replace(".PNG", "") or "Unnamed Card"

    # description is the main character description in SillyTavern format
    personality = (
        card_data.get("personality") or
        card_data.get("description") or
        ""
    )

    # scenario = background context
    background = (
        card_data.get("background") or
        card_data.get("scenario") or
        ""
    )

    relationships = card_data.get("relationships") or ""

    # Assemble dialogue examples from multiple sources
    dialogue_parts = []
    mes_example = card_data.get("mes_example") or card_data.get("dialogue_examples") or ""
    if mes_example:
        dialogue_parts.append(mes_example)
    first_mes = card_data.get("first_mes") or card_data.get("first_message") or ""
    if first_mes:
        dialogue_parts.append(f"[开场]: {first_mes}")
    alt_greetings = card_data.get("alternate_greetings") or []
    if isinstance(alt_greetings, list):
        for g in alt_greetings:
            if g:
                dialogue_parts.append(f"[可选开场]: {g}")
    dialogue_examples = "\n".join(dialogue_parts)

    # Save portrait copy
    card_id = str(__import__("uuid").uuid4())
    portrait_path = f"/api/cards/portrait/{card_id}.png"
    with open(PORTRAIT_DIR / f"{card_id}.png", "wb") as f:
        f.write(content)

    card = CharacterCard(
        id=card_id,
        user_id=user.id,
        name=name,
        personality=personality,
        background=background,
        relationships=relationships,
        dialogue_examples=dialogue_examples,
        first_message=first_mes,
        portrait_path=portrait_path,
        source="png_import",
    )
    db.add(card)
    db.commit()
    db.refresh(card)

    return _card_response(card)


@router.post("/{card_id}/chat")
async def chat_with_card(
    card_id: str,
    body: dict,
    db: Session = Depends(get_db),
    authorization: str = Header(...),
):
    """SSE streaming chat with a character card."""
    token = authorization.replace("Bearer ", "")
    user = get_current_user(token, db)

    card = db.query(CharacterCard).filter(
        CharacterCard.id == card_id, CharacterCard.user_id == user.id
    ).first()
    if not card:
        raise HTTPException(status_code=404, detail="Card not found")

    user_message = body.get("message", "").strip()
    if not user_message:
        raise HTTPException(status_code=400, detail="Message is empty")

    # Accept conversation history from frontend (latest last, max 30 turns)
    history = body.get("history") or []
    if isinstance(history, list):
        history = history[-60:]  # max 30 user+assistant pairs
    else:
        history = []

    # Optional lorebook for world info injection
    lorebook_id = body.get("lorebook_id") or None

    # Optional user persona
    persona_id = body.get("persona_id") or None

    provider = get_llm_provider()

    async def generate():
        try:
            # Build messages: history + current message
            messages = []
            for h in history:
                if isinstance(h, dict) and "role" in h and "content" in h:
                    role = h["role"]
                    if role in ("user", "assistant"):
                        messages.append({"role": role, "content": h["content"]})
            messages.append({"role": "user", "content": user_message})

            # Build system prompt
            # Load user dialogue_length preference
            dl = "medium"
            try:
                us = json.loads(Path("user_settings.json").read_text(encoding="utf-8"))
                dl = us.get("dialogue_length", "medium")
            except Exception:
                pass
            system_prompt, max_chars = _build_chat_system_prompt(card, dl)

            # Inject user persona if selected
            if persona_id:
                persona = db.query(UserPersona).filter(
                    UserPersona.id == persona_id, UserPersona.user_id == user.id
                ).first()
                if persona:
                    persona_text = _build_persona_block(persona)
                    system_prompt = persona_text + "\n\n" + system_prompt

            # Inject lorebook entries
            if lorebook_id:
                lorebook = db.query(Lorebook).filter(
                    Lorebook.id == lorebook_id, Lorebook.user_id == user.id
                ).first()
                if lorebook:
                    triggered = match_lorebook_entries(lorebook_id, messages, db)
                    lore_parts = []
                    if triggered.get("before_char"):
                        lore_parts.append("【世界设定】\n" + "\n---\n".join(triggered["before_char"]))
                    if triggered.get("before_chat"):
                        lore_parts.append("\n".join(triggered["before_chat"]))
                    lore_text = "\n\n".join(lore_parts)

                    if triggered.get("after_char"):
                        lore_text += "\n\n" + "\n".join(triggered["after_char"])

                    if lore_text.strip():
                        system_prompt = lore_text + "\n\n" + system_prompt

            # Estimate input tokens
            input_text = system_prompt + " " + " ".join(m.get("content", "") for m in messages)
            est_input = estimate_tokens(input_text)
            output_chars = 0
            full_text = ""

            filter_state = {'buf': ''}
            async for token in provider.stream_chat(
                system_prompt=system_prompt,
                messages=messages,
                model=get_llm_model(),
            ):
                full_text += token
                output_chars += len(token)
                # Real-time filter: strip any command tags before yielding
                clean_token = _filter_stream(token, filter_state)
                if clean_token:
                    yield f"data: {json.dumps({'text': clean_token})}\n\n"

            # Flush any remaining buffered content from the filter
            remaining = _filter_stream('\n', filter_state)
            # If filter state buffer still has content that's not a command, flush it
            if filter_state.get('buf') and not _is_command_tag(filter_state['buf']):
                remaining += filter_state['buf']
            if remaining.strip():
                yield f"data: {json.dumps({'text': remaining})}\n\n"

            # Safety net: if output wildly exceeds limit, truncate at last sentence boundary
            if output_chars > max_chars:
                truncated = full_text[:max_chars]
                # Find last sentence-ending punctuation
                for i in range(len(truncated) - 1, max(0, len(truncated) - 200), -1):
                    if truncated[i] in "。！？…~—)） ":
                        truncated = truncated[:i+1]
                        break
                truncated_chars = len(truncated)
                # Only send truncated version if we actually cut something meaningful
                if truncated_chars < output_chars - 10:
                    yield f"event: truncate\ndata: {json.dumps({'text': truncated})}\n\n"
                    output_chars = truncated_chars

            # Yield token usage estimate at end
            est_output = estimate_tokens(output_chars)
            yield f"event: usage\ndata: {json.dumps({'input_tokens': est_input, 'output_tokens': est_output, 'total_tokens': est_input + est_output})}\n\n"
            yield "event: done\ndata: {}\n\n"
        except Exception as e:
            yield f"event: error\ndata: {json.dumps({'detail': str(e)})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


def _build_persona_block(persona: UserPersona) -> str:
    parts = [f"【用户（你正在对话的对象）设定】\n姓名：{persona.name}"]
    if persona.appearance:
        parts.append(f"外貌：{persona.appearance}")
    if persona.background:
        parts.append(f"背景/性格：{persona.background}")
    return "\n".join(parts)


def _card_response(card: CharacterCard) -> dict:
    return {
        "id": card.id,
        "name": card.name,
        "personality": card.personality,
        "background": card.background,
        "relationships": card.relationships,
        "dialogue_examples": card.dialogue_examples,
        "first_message": card.first_message or "",
        "portrait_path": card.portrait_path,
        "source": card.source,
        "created_at": card.created_at.isoformat() if card.created_at else None,
    }


# Command tag prefixes that must be stripped from AI output
_CMD_PREFIXES = [
    '继续', '推进剧情', '时间流逝', '加快节奏',
    '旁白', 'OOC', '内心独白', '摄像机视角',
    '描写当前画面', '请详细描写', '❤️', '❤️❤️',
]


def _is_command_tag(text: str) -> bool:
    """Check if text inside （...） is a command tag."""
    if not (text.startswith('（') and '）' in text):
        return False
    inner = text[1:].split('）')[0]  # Content before first ）
    for prefix in _CMD_PREFIXES:
        if inner.startswith(prefix):
            return True
    return False


def _filter_stream(text: str, state: dict) -> str:
    """Filter command tags from streaming text using a state machine.
    state tracks: {'buf': str} — buffered partial （...） sequence.
    Returns clean text ready to yield.
    """
    clean = ''
    buf = state.get('buf', '')
    for ch in text:
        if buf:
            # Currently inside a potential （...） sequence
            buf += ch
            if ch == '）':
                # Check if this is a command tag
                if _is_command_tag(buf):
                    buf = ''  # Discard the command tag
                else:
                    clean += buf  # Not a command, flush as normal text
                    buf = ''
            elif len(buf) > 60:
                # Too long to be a command tag, flush
                clean += buf
                buf = ''
        elif ch == '（':
            buf = ch
        else:
            clean += ch
    state['buf'] = buf
    return clean


def _build_chat_system_prompt(card: CharacterCard, dialogue_length: str = "medium") -> tuple[str, int]:
    """Build a structured system prompt. Returns (prompt, max_chars) for truncation."""

    length_rules = {
        "short": ("目标199-299字。允许比下限少最多100字，但如果少了必须在保证文本完整收尾的前提下——宁可短不可断。超过299字为不合格。", 450),
        "medium": ("目标399-599字。允许比下限少最多100字，但如果少了必须在保证文本完整收尾的前提下——宁可短不可断。超过599字为不合格。", 750),
        "long": ("目标699-899字。允许比下限少最多100字，但如果少了必须在保证文本完整收尾的前提下——宁可短不可断。超过899字为不合格。", 1050),
        "extra": ("目标999字以上。允许比下限少最多100字，但必须保证文本完整收尾。尽情挥洒，写得越精彩越好。", 1400),
    }
    length_guidance, max_chars = length_rules.get(dialogue_length, length_rules["medium"])

    nl = "\n"

    # Build character profile
    profile_parts = [f"姓名：{card.name}"]
    if card.personality:
        profile_parts.append(f"性格：{card.personality}")
    # Short background goes inline; long background goes to separate block
    if card.background and len(card.background) <= 200:
        profile_parts.append(f"背景：{card.background}")
    if card.relationships:
        profile_parts.append(f"人际关系：{card.relationships}")
    character_profile = nl.join(profile_parts)

    # Dialogue examples — strongest enforcement
    dialogue_block = ""
    if card.dialogue_examples:
        dialogue_block = f"""

【语言风格 — 必须严格模仿】
以下是你的对话范本。你的每一句台词、每一个用词、语气、节奏都必须与范本一致。这不是参考，这是你的说话方式：
{card.dialogue_examples}
"""

    # Long background as standalone block to avoid bloating the profile section
    background_block = ""
    if card.background and len(card.background) > 200:
        background_block = f"""

【背景详述】
{card.background}"""

    prompt = f"""【输出格式 — 最高优先级】
你的每条回复由叙事描写和对话台词交织而成，像小说段落一样自然：
- 描写：用自然的中文叙事写场景、外貌、动作、神态。不要加任何前缀标签
- 对话：用中文引号"……"包裹你说的话
- 描写和对话不分彼此，流畅地交织在一起{card.dialogue_examples and "——严格模仿【语言风格】中的语气、节奏和用词" or ""}

【你的角色设定 — 这就是你，一言一行必须与此一致】
{character_profile}

以上所有信息描述的都是你本人——你的性格、你的经历、你的人际关系。你的一言一行、每一个反应、每一句话的语气，都必须来源于这些设定。{dialogue_block}
【身份规则】
- 对方是与你对话的玩家，不是你。不要把设定套用到对方身上
- 不要混淆你与对方的身份、外貌、能力、地位

【情节推进】
每条回复都必须推动情节向前发展：
- 主动引入新的动作、环境变化或情感转折，不要只被动回应
- 观察对方情绪——对方停顿、犹豫、语无伦次（如"我，，，"），说明有话说不出口。用行动接住，不要追问
- 你的角色有自己的意志和欲望，该做什么就做什么，不等明确指令
- 当察觉对方害羞、渴望、愤怒等情绪时，趁势而上——用行动把场景推向高潮

【玩家指令识别】
对方可能使用以下括号标记与你沟通。这些是给你的内部指令——你执行指令即可，严禁在你的输出中写出任何括号指令文字（包括但不限于"继续""推进剧情""时间流逝""旁白""OOC"等）。括号指令不属于你的台词，一旦出现在你的输出中就是严重错误：
- （旁白：xxx）→ 对方以叙事者身份进行旁白描写。你当作场景事实，并继续角色内的叙事
- （OOC：xxx）→ 对方跳出角色与你直接沟通。你以括号（xxx）简短回应，然后立即回到角色叙事
- （内心独白：xxx）→ 对方表达了角色的内心想法，但角色本人未说出口。你只能通过动作/神态间接回应，不可直接"读出"对方心事
- （摄像机视角：xxx）→ 对方描述镜头/画面级别的场景切换。你按新的画面构建场景
- （描写当前画面：xxx）→ 对方要求你细致描写当前场景的视觉、氛围、细节。只描写，不推进对话
- （请详细描写：xxx）→ 对方要求你对特定对象进行更详细的描写
- （继续）→ 对方希望你主动推动剧情向前发展。必须引入新事件、新动作、新情感转折，不能停滞在当前状态
- （推进剧情到下一个场景）→ 必须收尾当前场景，切换至新地点或新时间段。新场景不能重复旧场景的环境和氛围描写
- （时间流逝）→ 时间必须跳过至少数十分钟或更长。描写时间过去后的变化，而不是重复之前的时间点
- （加快节奏）→ 大幅减少环境和外貌描写。用简短段落推进关键情节。跳过非必要的细节
- （❤️ 增加好感度）→ 你的角色对对方产生更多好感，态度更亲切、温柔、主动
- （❤️❤️ 进入发情状态）→ 你的角色进入强烈的性吸引状态，主动用暗示、肢体接触、语言引诱等方式引导对方发生亲密关系。你会主动推进亲密互动，不必等对方行动

【防复读 — 最高优先级】
重复自己已经说过的话是严重写作事故。你必须遵守以下规则：
- 每一段回复必须包含至少60%的全新内容——新的描写细节、新的动作、新的台词或新的剧情推进
- 禁止重复之前出现过的完整句子或超过10字相同的片段（地名、人名、固定称谓除外）
- 描写同一场景时，每次必须从不同感官角度切入（上次写视觉，这次写听觉/触觉/气味）
- 同一句台词绝不能出现两次，即使是意思相近的表达也必须换一个说法
- 环境和氛围的描写每次都要用不同的词——不要每次都是"灯火通明""微风轻拂""河水拍打船舷"
- 如果发现自己快要在同一情节节点原地打转，立即让角色做出一个出人意料的动作来打破循环
- 动作描写必须向前推进——手指不能"反复"划过同一个地方，每一次触碰都应该不同、有进展

【禁令】
禁止输出角色对话以外的文字。禁止示例、说明、提示、教学口吻。禁止提及AI、语言模型、角色扮演等概念。严禁在输出中使用任何括号指令格式（如（继续）（推进剧情）等）。

【回复长度】
{length_guidance}{background_block}"""

    return prompt, max_chars


# Keywords SillyTavern / Character Card ecosystems use in PNG text chunks
_CARD_KEYWORDS = (
    "chara", "chardata", "character", "json", "card",
    "ccv3", "ccv2", "ccv1", "tavern", "v2", "v3",
)


def _normalize_card_data(parsed: dict) -> dict | None:
    """Unwrap nested SillyTavern/CharacterCard V2/V3 formats into flat dict."""
    if not isinstance(parsed, dict):
        return None

    # Already flat with a name at top level
    if "name" in parsed:
        return parsed

    # SillyTavern V2/V3 spec: {"data": {...}, "spec": "chara_card_v2", ...}
    if "data" in parsed and isinstance(parsed["data"], dict):
        inner = parsed["data"]
        if "name" in inner:
            return inner

    # Some formats put everything under "character" or "char"
    for key in ("character", "char"):
        if key in parsed and isinstance(parsed[key], dict):
            inner = parsed[key]
            if "name" in inner:
                return inner

    return None


def _try_decode_json(data: bytes) -> dict | None:
    """Try multiple strategies to decode chunk payload into a character card dict."""
    # 1) Direct JSON
    for encoding in ("utf-8", "latin-1"):
        try:
            parsed = json.loads(data.decode(encoding))
            result = _normalize_card_data(parsed)
            if result:
                return result
        except (json.JSONDecodeError, UnicodeDecodeError):
            pass

    # 2) Base64 encoded JSON (common in SillyTavern "chara" chunk)
    try:
        text = data.decode("ascii").strip()
        decoded = base64.b64decode(text)
        result = _try_decode_json(decoded)
        if result:
            return result
    except Exception:
        pass

    # 3) zlib-deflate compressed JSON
    try:
        decompressed = zlib.decompress(data)
        result = _try_decode_json(decompressed)
        if result:
            return result
    except Exception:
        pass

    # 4) Base64 → zlib → JSON
    try:
        text = data.decode("ascii").strip()
        decoded = base64.b64decode(text)
        decompressed = zlib.decompress(decoded)
        result = _try_decode_json(decompressed)
        if result:
            return result
    except Exception:
        pass

    return None


def _extract_json_from_text(text: str) -> dict | None:
    """Find a balanced JSON object in arbitrary text."""
    # Find every '{' that looks like the start of a character card object
    for m in re.finditer(r'\{\s*"', text):
        start = m.start()
        depth = 0
        end = start
        for i, ch in enumerate(text[start:], start=start):
            if ch == '{':
                depth += 1
            elif ch == '}':
                depth -= 1
                if depth == 0:
                    end = i + 1
                    break
        if end > start:
            try:
                parsed = json.loads(text[start:end])
                if isinstance(parsed, dict) and "name" in parsed:
                    return parsed
            except json.JSONDecodeError:
                continue
    return None


def _parse_png_text_chunk(data: bytes) -> dict | None:
    """Parse a PNG file and extract JSON from text chunks (tEXt/zTXt/iTXt)."""
    if len(data) < 8 or data[:8] != b'\x89PNG\r\n\x1a\n':
        return None

    unknown_chunks = []  # collect payloads from unrecognized text chunks for fallback

    try:
        pos = 8
        while pos + 8 <= len(data):
            chunk_len = struct.unpack(">I", data[pos:pos + 4])[0]
            chunk_type = data[pos + 4:pos + 8].decode("ascii", errors="ignore")
            pos += 8

            if chunk_type == "IEND":
                break

            chunk_end = pos + chunk_len
            if chunk_end > len(data):
                break
            chunk_data = data[pos:chunk_end]
            pos = chunk_end + 4  # skip CRC

            if chunk_type in ("tEXt", "zTXt", "iTXt"):
                result = _parse_text_chunk(chunk_type, chunk_data)
                if result:
                    return result
                # If the keyword wasn't recognized, save payload for fallback
                payload = _extract_raw_payload(chunk_type, chunk_data)
                if payload:
                    unknown_chunks.append(payload)

    except Exception:
        pass

    # Fallback 1: try decoding payloads from ALL text chunks (ignore keyword filtering)
    for payload in unknown_chunks:
        result = _try_decode_json(payload)
        if result:
            return result

    # Fallback 2: scan raw bytes for embedded JSON
    for encoding in ("utf-8", "latin-1"):
        try:
            text = data.decode(encoding, errors="ignore")
            result = _extract_json_from_text(text)
            if result:
                return result
        except Exception:
            continue

    return None


def _extract_raw_payload(chunk_type: str, chunk_data: bytes) -> bytes | None:
    """Extract raw data payload from any text chunk (ignoring keyword)."""
    try:
        null_idx = chunk_data.index(0)
    except ValueError:
        return None

    payload_start = null_idx + 1

    if chunk_type == "zTXt":
        if payload_start >= len(chunk_data):
            return None
        comp_method = chunk_data[payload_start]
        if comp_method == 0:
            try:
                return zlib.decompress(chunk_data[payload_start + 1:])
            except zlib.error:
                return None
        return chunk_data[payload_start + 1:]  # best effort

    if chunk_type == "iTXt":
        try:
            parts = chunk_data[payload_start:].split(b'\x00', 3)
        except Exception:
            parts = []
        if len(parts) >= 4:
            comp_flag = parts[0]
            comp_method = parts[1] if len(parts) > 1 else b'\x00'
            payload = parts[3] if len(parts) > 3 else b''
            if comp_flag == b'\x01' and comp_method == b'\x00':
                try:
                    return zlib.decompress(payload)
                except zlib.error:
                    return None
            return payload
        return None

    # tEXt: raw data after null
    return chunk_data[payload_start:]


def _parse_text_chunk(chunk_type: str, chunk_data: bytes) -> dict | None:
    """Parse a single tEXt / zTXt / iTXt chunk payload."""
    try:
        null_idx = chunk_data.index(0)
    except ValueError:
        return None

    keyword = chunk_data[:null_idx].decode("latin-1")
    if keyword.lower() not in _CARD_KEYWORDS:
        return None

    payload_start = null_idx + 1

    if chunk_type == "zTXt":
        # zTXt: keyword\0compression_method\0compressed_data
        if payload_start >= len(chunk_data):
            return None
        comp_method = chunk_data[payload_start]
        if comp_method == 0:  # deflate
            try:
                decompressed = zlib.decompress(chunk_data[payload_start + 1:])
                return _try_decode_json(decompressed)
            except zlib.error:
                pass

    elif chunk_type == "iTXt":
        # iTXt: keyword\0compression_flag\0compression_method\0language_tag\0translated_keyword\0data
        try:
            parts = chunk_data[payload_start:].split(b'\x00', 3)
        except Exception:
            parts = []
        if len(parts) >= 4:
            comp_flag = parts[0]
            comp_method = parts[1] if len(parts) > 1 else b'\x00'
            payload = parts[3] if len(parts) > 3 else b''
            if comp_flag == b'\x01' and comp_method == b'\x00':
                try:
                    decompressed = zlib.decompress(payload)
                    return _try_decode_json(decompressed)
                except zlib.error:
                    pass
            else:
                result = _try_decode_json(payload)
                if result:
                    return result

    else:  # tEXt
        result = _try_decode_json(chunk_data[payload_start:])
        if result:
            return result

    return None


@router.get("/portrait/{file_name}")
def serve_portrait(file_name: str):
    """Serve uploaded portrait images."""
    safe_name = Path(file_name).name
    file_path = PORTRAIT_DIR / safe_name
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Portrait not found")
    return FileResponse(file_path)
