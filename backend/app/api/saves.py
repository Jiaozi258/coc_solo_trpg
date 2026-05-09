import json
from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field

from app.database import get_db
from app.models.game_save import GameSave
from app.api.auth import get_current_user

router = APIRouter(prefix="/api/saves", tags=["game_saves"])


class SaveRequest(BaseModel):
    type: str = Field(..., pattern="^(chat|game)$")
    name: str = Field(..., min_length=1, max_length=200)
    data: dict


@router.post("")
def create_save(
    body: SaveRequest,
    db: Session = Depends(get_db),
    authorization: str = Header(...),
):
    token = authorization.replace("Bearer ", "")
    user = get_current_user(token, db)

    save = GameSave(
        user_id=user.id,
        type=body.type,
        name=body.name,
        data=json.dumps(body.data, ensure_ascii=False),
    )
    db.add(save)
    db.commit()
    db.refresh(save)
    return _save_response(save)


@router.get("")
def list_saves(
    type: str = None,
    db: Session = Depends(get_db),
    authorization: str = Header(...),
):
    token = authorization.replace("Bearer ", "")
    user = get_current_user(token, db)

    q = db.query(GameSave).filter(GameSave.user_id == user.id)
    if type and type in ("chat", "game"):
        q = q.filter(GameSave.type == type)
    saves = q.order_by(GameSave.updated_at.desc()).all()
    return [_save_response(s) for s in saves]


@router.get("/{save_id}")
def get_save(
    save_id: str,
    db: Session = Depends(get_db),
    authorization: str = Header(...),
):
    token = authorization.replace("Bearer ", "")
    user = get_current_user(token, db)

    save = db.query(GameSave).filter(
        GameSave.id == save_id, GameSave.user_id == user.id
    ).first()
    if not save:
        raise HTTPException(status_code=404, detail="Save not found")
    return _save_response(save)


@router.delete("/{save_id}")
def delete_save(
    save_id: str,
    db: Session = Depends(get_db),
    authorization: str = Header(...),
):
    token = authorization.replace("Bearer ", "")
    user = get_current_user(token, db)

    save = db.query(GameSave).filter(
        GameSave.id == save_id, GameSave.user_id == user.id
    ).first()
    if not save:
        raise HTTPException(status_code=404, detail="Save not found")

    db.delete(save)
    db.commit()
    return {"detail": "Save deleted"}


def _save_response(save: GameSave) -> dict:
    return {
        "id": save.id,
        "type": save.type,
        "name": save.name,
        "data": json.loads(save.data) if save.data else {},
        "created_at": save.created_at.isoformat() if save.created_at else None,
        "updated_at": save.updated_at.isoformat() if save.updated_at else None,
    }
