import json
import re
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Header, UploadFile, File
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field

from app.database import get_db
from app.models.lorebook import Lorebook, LorebookEntry
from app.api.auth import get_current_user

router = APIRouter(prefix="/api/lorebooks", tags=["lorebooks"])


# ── Request/Response schemas ──

class CreateLorebookRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: str = Field(default="", max_length=2000)


class UpdateLorebookRequest(BaseModel):
    name: Optional[str] = Field(default=None, max_length=200)
    description: str = Field(default="", max_length=2000)


class CreateEntryRequest(BaseModel):
    keywords: list[str] = Field(default_factory=list)
    content: str = Field(default="", max_length=10000)
    trigger_mode: str = Field(default="keyword", pattern="^(keyword|always|manual)$")
    search_range: str = Field(default="all", pattern="^(all|last_n|user_input)$")
    search_n: int = Field(default=5, ge=1, le=50)
    priority: int = Field(default=50, ge=0, le=100)
    insert_position: str = Field(default="before_char", pattern="^(before_char|after_char|before_chat)$")
    enabled: int = Field(default=1, ge=0, le=1)
    sort_order: int = Field(default=0, ge=0)


class UpdateEntryRequest(BaseModel):
    keywords: list[str] = None
    content: str = None
    trigger_mode: str = None
    search_range: str = None
    search_n: int = None
    priority: int = None
    insert_position: str = None
    enabled: int = None
    sort_order: int = None


class ImportEntriesRequest(BaseModel):
    entries: list[dict]


# ── Lorebook CRUD ──

@router.post("")
def create_lorebook(
    body: CreateLorebookRequest,
    db: Session = Depends(get_db),
    authorization: str = Header(...),
):
    token = authorization.replace("Bearer ", "")
    user = get_current_user(token, db)

    lorebook = Lorebook(
        user_id=user.id,
        name=body.name,
        description=body.description,
    )
    db.add(lorebook)
    db.commit()
    db.refresh(lorebook)
    return _lorebook_response(lorebook)


@router.get("")
def list_lorebooks(
    db: Session = Depends(get_db),
    authorization: str = Header(...),
):
    token = authorization.replace("Bearer ", "")
    user = get_current_user(token, db)

    lorebooks = db.query(Lorebook).filter(
        Lorebook.user_id == user.id
    ).order_by(Lorebook.updated_at.desc()).all()
    return [_lorebook_response(lb, include_entries=False) for lb in lorebooks]


@router.get("/{lorebook_id}")
def get_lorebook(
    lorebook_id: str,
    db: Session = Depends(get_db),
    authorization: str = Header(...),
):
    token = authorization.replace("Bearer ", "")
    user = get_current_user(token, db)

    lorebook = db.query(Lorebook).filter(
        Lorebook.id == lorebook_id, Lorebook.user_id == user.id
    ).first()
    if not lorebook:
        raise HTTPException(status_code=404, detail="Lorebook not found")
    entries = db.query(LorebookEntry).filter(
        LorebookEntry.lorebook_id == lorebook_id
    ).order_by(LorebookEntry.sort_order).all()
    return _lorebook_response(lorebook, entries=entries, include_entries=True)


@router.put("/{lorebook_id}")
def update_lorebook(
    lorebook_id: str,
    body: UpdateLorebookRequest,
    db: Session = Depends(get_db),
    authorization: str = Header(...),
):
    token = authorization.replace("Bearer ", "")
    user = get_current_user(token, db)

    lorebook = db.query(Lorebook).filter(
        Lorebook.id == lorebook_id, Lorebook.user_id == user.id
    ).first()
    if not lorebook:
        raise HTTPException(status_code=404, detail="Lorebook not found")

    if body.name is not None:
        lorebook.name = body.name
    if body.description:
        lorebook.description = body.description
    db.commit()
    db.refresh(lorebook)
    return _lorebook_response(lorebook, include_entries=True)


@router.delete("/{lorebook_id}")
def delete_lorebook(
    lorebook_id: str,
    db: Session = Depends(get_db),
    authorization: str = Header(...),
):
    token = authorization.replace("Bearer ", "")
    user = get_current_user(token, db)

    lorebook = db.query(Lorebook).filter(
        Lorebook.id == lorebook_id, Lorebook.user_id == user.id
    ).first()
    if not lorebook:
        raise HTTPException(status_code=404, detail="Lorebook not found")

    # Entries cascade-deleted by FK
    db.delete(lorebook)
    db.commit()
    return {"detail": "Lorebook deleted"}


# ── Entry CRUD ──

@router.post("/{lorebook_id}/entries")
def create_entry(
    lorebook_id: str,
    body: CreateEntryRequest,
    db: Session = Depends(get_db),
    authorization: str = Header(...),
):
    token = authorization.replace("Bearer ", "")
    user = get_current_user(token, db)

    lorebook = db.query(Lorebook).filter(
        Lorebook.id == lorebook_id, Lorebook.user_id == user.id
    ).first()
    if not lorebook:
        raise HTTPException(status_code=404, detail="Lorebook not found")

    entry = LorebookEntry(
        lorebook_id=lorebook_id,
        keywords=body.keywords,
        content=body.content,
        trigger_mode=body.trigger_mode,
        search_range=body.search_range,
        search_n=body.search_n,
        priority=body.priority,
        insert_position=body.insert_position,
        enabled=body.enabled,
        sort_order=body.sort_order,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return _entry_response(entry)


@router.get("/{lorebook_id}/entries")
def list_entries(
    lorebook_id: str,
    db: Session = Depends(get_db),
    authorization: str = Header(...),
):
    token = authorization.replace("Bearer ", "")
    user = get_current_user(token, db)

    lorebook = db.query(Lorebook).filter(
        Lorebook.id == lorebook_id, Lorebook.user_id == user.id
    ).first()
    if not lorebook:
        raise HTTPException(status_code=404, detail="Lorebook not found")

    entries = db.query(LorebookEntry).filter(
        LorebookEntry.lorebook_id == lorebook_id
    ).order_by(LorebookEntry.sort_order).all()
    return [_entry_response(e) for e in entries]


@router.put("/{lorebook_id}/entries/{entry_id}")
def update_entry(
    lorebook_id: str,
    entry_id: str,
    body: UpdateEntryRequest,
    db: Session = Depends(get_db),
    authorization: str = Header(...),
):
    token = authorization.replace("Bearer ", "")
    user = get_current_user(token, db)

    lorebook = db.query(Lorebook).filter(
        Lorebook.id == lorebook_id, Lorebook.user_id == user.id
    ).first()
    if not lorebook:
        raise HTTPException(status_code=404, detail="Lorebook not found")

    entry = db.query(LorebookEntry).filter(
        LorebookEntry.id == entry_id, LorebookEntry.lorebook_id == lorebook_id
    ).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    updates = body.model_dump(exclude_unset=True)
    for key, value in updates.items():
        setattr(entry, key, value)

    db.commit()
    db.refresh(entry)
    return _entry_response(entry)


@router.delete("/{lorebook_id}/entries/{entry_id}")
def delete_entry(
    lorebook_id: str,
    entry_id: str,
    db: Session = Depends(get_db),
    authorization: str = Header(...),
):
    token = authorization.replace("Bearer ", "")
    user = get_current_user(token, db)

    entry = db.query(LorebookEntry).join(Lorebook).filter(
        LorebookEntry.id == entry_id,
        LorebookEntry.lorebook_id == lorebook_id,
        Lorebook.user_id == user.id,
    ).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    db.delete(entry)
    db.commit()
    return {"detail": "Entry deleted"}


# ── Import / Export ──

@router.post("/import")
async def import_lorebook(
    name: str = None,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    authorization: str = Header(...),
):
    """Import a lorebook from a JSON file. Supports simple arrays and SillyTavern format."""
    token = authorization.replace("Bearer ", "")
    user = get_current_user(token, db)

    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 5MB)")

    try:
        data = json.loads(content.decode("utf-8"))
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON file")

    # Normalize to entries list
    entries_data = _normalize_import_data(data)
    if not entries_data:
        raise HTTPException(status_code=400, detail="No entries found in file")

    lb_name = name or file.filename.rsplit(".", 1)[0] or "Imported Lorebook"
    lorebook = Lorebook(user_id=user.id, name=lb_name)
    db.add(lorebook)
    db.commit()
    db.refresh(lorebook)

    count = 0
    for i, entry_data in enumerate(entries_data):
        if not isinstance(entry_data, dict):
            continue
        entry = LorebookEntry(
            lorebook_id=lorebook.id,
            keywords=entry_data.get("keywords") or entry_data.get("keys") or [],
            content=entry_data.get("content") or entry_data.get("text", ""),
            trigger_mode=entry_data.get("trigger_mode", "keyword"),
            search_range=entry_data.get("search_range", "all"),
            search_n=entry_data.get("search_n", 5),
            priority=entry_data.get("priority", 50),
            insert_position=entry_data.get("insert_position", "before_char"),
            enabled=entry_data.get("enabled", 1),
            sort_order=i,
        )
        db.add(entry)
        count += 1

    db.commit()
    return {"id": lorebook.id, "name": lorebook.name, "entries_count": count}


@router.get("/{lorebook_id}/export")
def export_lorebook(
    lorebook_id: str,
    db: Session = Depends(get_db),
    authorization: str = Header(...),
):
    """Export a lorebook as JSON."""
    token = authorization.replace("Bearer ", "")
    user = get_current_user(token, db)

    lorebook = db.query(Lorebook).filter(
        Lorebook.id == lorebook_id, Lorebook.user_id == user.id
    ).first()
    if not lorebook:
        raise HTTPException(status_code=404, detail="Lorebook not found")

    entries = db.query(LorebookEntry).filter(
        LorebookEntry.lorebook_id == lorebook_id
    ).order_by(LorebookEntry.sort_order).all()

    return {
        "name": lorebook.name,
        "description": lorebook.description,
        "entries": [_entry_response(e) for e in entries],
    }


# ── Keyword matching for chat ──

def match_lorebook_entries(
    lorebook_id: str,
    messages: list[dict],
    db: Session,
) -> dict:
    """Match lorebook entries against conversation messages.

    Returns {"before_char": [...], "after_char": [...], "before_chat": [...]}
    """
    result = {"before_char": [], "after_char": [], "before_chat": []}

    entries = db.query(LorebookEntry).filter(
        LorebookEntry.lorebook_id == lorebook_id,
        LorebookEntry.enabled == 1,
    ).order_by(LorebookEntry.priority.desc()).all()

    if not entries:
        return result

    # Build combined text for keyword matching based on search_range
    always_entries = []
    keyword_entries = []

    for entry in entries:
        if entry.trigger_mode == "always":
            always_entries.append(entry)
        elif entry.trigger_mode == "keyword":
            keyword_entries.append(entry)

    # Always-active entries
    for entry in always_entries:
        if entry.content.strip():
            result[entry.insert_position].append(entry.content)

    # Keyword matching entries
    if keyword_entries:
        # Determine which messages to scan
        scan_messages = messages
        for entry in keyword_entries:
            search_text = ""
            if entry.search_range == "user_input":
                # Last user message
                for m in reversed(messages):
                    if m.get("role") == "user":
                        search_text = m.get("content", "")
                        break
            elif entry.search_range == "last_n":
                n = entry.search_n or 5
                recent = messages[-n:] if len(messages) > n else messages
                search_text = " ".join(m.get("content", "") for m in recent)
            else:  # "all"
                search_text = " ".join(m.get("content", "") for m in messages)

            if _keywords_match(entry.keywords, search_text):
                if entry.content.strip():
                    result[entry.insert_position].append(entry.content)

    return result


def _keywords_match(keywords: list[str], text: str) -> bool:
    """Check if any keyword matches the given text (case-insensitive)."""
    if not keywords or not text:
        return False
    text_lower = text.lower()
    for kw in keywords:
        if kw and kw.lower() in text_lower:
            return True
    return False


def _normalize_import_data(data: dict | list) -> list:
    """Normalize various lorebook import formats to a list of entry dicts."""
    if isinstance(data, list):
        return data

    if isinstance(data, dict):
        # SillyTavern lorebook format: {"entries": {...}, "name": "..."}
        entries = data.get("entries")
        if isinstance(entries, dict):
            return list(entries.values())
        if isinstance(entries, list):
            return entries
        # {"data": {"entries": [...]}} nested
        inner = data.get("data")
        if isinstance(inner, dict):
            return _normalize_import_data(inner)
        # Single entry
        if "content" in data or "text" in data or "keys" in data or "keywords" in data:
            return [data]

    return []


# ── Response helpers ──

def _lorebook_response(lb: Lorebook, entries: list = None, include_entries: bool = False) -> dict:
    resp = {
        "id": lb.id,
        "name": lb.name,
        "description": lb.description,
        "created_at": lb.created_at.isoformat() if lb.created_at else None,
        "updated_at": lb.updated_at.isoformat() if lb.updated_at else None,
    }
    if include_entries and entries is not None:
        resp["entries"] = [_entry_response(e) for e in entries]
        resp["entries_count"] = len(entries)
    elif include_entries:
        resp["entries"] = []
        resp["entries_count"] = 0
    return resp


def _entry_response(entry: LorebookEntry) -> dict:
    return {
        "id": entry.id,
        "lorebook_id": entry.lorebook_id,
        "keywords": entry.keywords or [],
        "content": entry.content or "",
        "trigger_mode": entry.trigger_mode,
        "search_range": entry.search_range,
        "search_n": entry.search_n,
        "priority": entry.priority,
        "insert_position": entry.insert_position,
        "enabled": entry.enabled,
        "sort_order": entry.sort_order,
        "created_at": entry.created_at.isoformat() if entry.created_at else None,
        "updated_at": entry.updated_at.isoformat() if entry.updated_at else None,
    }
