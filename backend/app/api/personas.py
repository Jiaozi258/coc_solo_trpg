from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field

from app.database import get_db
from app.models.user_persona import UserPersona
from app.api.auth import get_current_user

router = APIRouter(prefix="/api/personas", tags=["personas"])


class CreatePersonaRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    appearance: str = Field(default="", max_length=3000)
    background: str = Field(default="", max_length=3000)


class UpdatePersonaRequest(BaseModel):
    name: str = Field(default="", max_length=100)
    appearance: str = Field(default="", max_length=3000)
    background: str = Field(default="", max_length=3000)


@router.post("")
def create_persona(
    body: CreatePersonaRequest,
    db: Session = Depends(get_db),
    authorization: str = Header(...),
):
    token = authorization.replace("Bearer ", "")
    user = get_current_user(token, db)

    persona = UserPersona(
        user_id=user.id,
        name=body.name,
        appearance=body.appearance,
        background=body.background,
    )
    db.add(persona)
    db.commit()
    db.refresh(persona)
    return _persona_response(persona)


@router.get("")
def list_personas(
    db: Session = Depends(get_db),
    authorization: str = Header(...),
):
    token = authorization.replace("Bearer ", "")
    user = get_current_user(token, db)
    personas = db.query(UserPersona).filter(
        UserPersona.user_id == user.id
    ).order_by(UserPersona.updated_at.desc()).all()
    return [_persona_response(p) for p in personas]


@router.put("/{persona_id}")
def update_persona(
    persona_id: str,
    body: UpdatePersonaRequest,
    db: Session = Depends(get_db),
    authorization: str = Header(...),
):
    token = authorization.replace("Bearer ", "")
    user = get_current_user(token, db)

    persona = db.query(UserPersona).filter(
        UserPersona.id == persona_id, UserPersona.user_id == user.id
    ).first()
    if not persona:
        raise HTTPException(status_code=404, detail="Persona not found")

    if body.name:
        persona.name = body.name
    if body.appearance is not None:
        persona.appearance = body.appearance
    if body.background is not None:
        persona.background = body.background

    db.commit()
    db.refresh(persona)
    return _persona_response(persona)


@router.delete("/{persona_id}")
def delete_persona(
    persona_id: str,
    db: Session = Depends(get_db),
    authorization: str = Header(...),
):
    token = authorization.replace("Bearer ", "")
    user = get_current_user(token, db)

    persona = db.query(UserPersona).filter(
        UserPersona.id == persona_id, UserPersona.user_id == user.id
    ).first()
    if not persona:
        raise HTTPException(status_code=404, detail="Persona not found")

    db.delete(persona)
    db.commit()
    return {"detail": "Persona deleted"}


def _persona_response(persona: UserPersona) -> dict:
    return {
        "id": persona.id,
        "name": persona.name,
        "appearance": persona.appearance,
        "background": persona.background,
        "created_at": persona.created_at.isoformat() if persona.created_at else None,
        "updated_at": persona.updated_at.isoformat() if persona.updated_at else None,
    }
