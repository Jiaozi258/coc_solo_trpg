import os
import gc
import re
from fastapi import APIRouter, Depends, HTTPException, Header, UploadFile, File
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.module import Module
from app.services.pdf_parser import PDFParser
from app.services.rag_service import rag_service
from app.api.auth import get_current_user
from app.config import get_settings

router = APIRouter(prefix="/api/modules", tags=["modules"])
settings = get_settings()

MAX_FILE_SIZE = 20 * 1024 * 1024  # 20MB limit


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
            detail=f"File too large ({len(content) / 1024 / 1024:.1f}MB). Maximum is 20MB.",
        )
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Empty file")

    # Extract text
    try:
        text = PDFParser.extract_text_from_bytes(content)
    except MemoryError:
        raise HTTPException(status_code=500, detail="PDF is too large to process — memory exhausted")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not parse PDF: {str(e)}")

    if not text.strip():
        raise HTTPException(status_code=400, detail="Could not extract text from PDF — it may be scanned images only")

    # Limit text to ~100k words to prevent OOM during embedding
    words = text.split()
    if len(words) > 100_000:
        text = " ".join(words[:100_000])

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

    # Index with batched embedding
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

    # Extract locations via LLM
    try:
        from app.services.location_extractor import location_extractor
        locations_data = await location_extractor.extract_locations(text)
        if locations_data:
            await location_extractor.store_locations(db, module.id, locations_data)
    except Exception:
        pass  # 地点提取失败不阻断上传

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
