from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from typing import List

from app.database import get_db
from app.models.character import Character
from app.schemas.character import CharacterCreate, CharacterUpdate, CharacterResponse
from app.services.character_validator import CharacterValidator, VALID_SKILLS
from app.api.auth import get_current_user

router = APIRouter(prefix="/api/characters", tags=["characters"])


@router.post("/", response_model=CharacterResponse)
def create_character(
    body: CharacterCreate,
    db: Session = Depends(get_db),
    authorization: str = Header(...),
):
    token = authorization.replace("Bearer ", "")
    user = get_current_user(token, db)

    attrs = body.attributes.model_dump()
    errors = CharacterValidator.validate_attributes(attrs, body.total_cap)
    if errors:
        raise HTTPException(status_code=422, detail=errors)

    luck_val = attrs.pop("LUCK", 50)
    errors_luck = CharacterValidator.validate_luck(luck_val)
    if errors_luck:
        raise HTTPException(status_code=422, detail=errors_luck)

    skill_errors = CharacterValidator.validate_skills(body.skills)
    if skill_errors:
        raise HTTPException(status_code=422, detail=skill_errors)

    derived = CharacterValidator.calculate_derived_stats(attrs)

    char = Character(
        user_id=user.id,
        module_id=body.module_id,
        name=body.name,
        occupation=body.occupation,
        attributes={**attrs, "LUCK": luck_val},
        skills=body.skills,
        derived_stats=derived,
        background=body.background,
    )
    db.add(char)
    db.commit()
    db.refresh(char)
    return _char_to_response(char)


@router.get("/", response_model=List[CharacterResponse])
def list_characters(
    db: Session = Depends(get_db),
    authorization: str = Header(...),
):
    token = authorization.replace("Bearer ", "")
    user = get_current_user(token, db)
    chars = db.query(Character).filter(Character.user_id == user.id).all()
    return [_char_to_response(c) for c in chars]


@router.get("/{character_id}", response_model=CharacterResponse)
def get_character(
    character_id: str,
    db: Session = Depends(get_db),
    authorization: str = Header(...),
):
    token = authorization.replace("Bearer ", "")
    user = get_current_user(token, db)
    char = db.query(Character).filter(
        Character.id == character_id, Character.user_id == user.id
    ).first()
    if not char:
        raise HTTPException(status_code=404, detail="Character not found")
    return _char_to_response(char)


@router.put("/{character_id}", response_model=CharacterResponse)
def update_character(
    character_id: str,
    body: CharacterUpdate,
    db: Session = Depends(get_db),
    authorization: str = Header(...),
):
    token = authorization.replace("Bearer ", "")
    user = get_current_user(token, db)
    char = db.query(Character).filter(
        Character.id == character_id, Character.user_id == user.id
    ).first()
    if not char:
        raise HTTPException(status_code=404, detail="Character not found")

    if body.attributes:
        attrs = body.attributes.model_dump(exclude_unset=True)
        merged = {**char.attributes, **attrs}
        errors = CharacterValidator.validate_attributes(merged)
        if errors:
            raise HTTPException(status_code=422, detail=errors)
        char.attributes = merged
        char.derived_stats = CharacterValidator.calculate_derived_stats(merged)

    if body.name is not None:
        char.name = body.name
    if body.occupation is not None:
        char.occupation = body.occupation
    if body.skills is not None:
        char.skills = body.skills
    if body.background is not None:
        char.background = body.background

    db.commit()
    db.refresh(char)
    return _char_to_response(char)


@router.delete("/{character_id}")
def delete_character(
    character_id: str,
    db: Session = Depends(get_db),
    authorization: str = Header(...),
):
    token = authorization.replace("Bearer ", "")
    user = get_current_user(token, db)
    char = db.query(Character).filter(
        Character.id == character_id, Character.user_id == user.id
    ).first()
    if not char:
        raise HTTPException(status_code=404, detail="Character not found")
    db.delete(char)
    db.commit()
    return {"detail": "Character deleted"}


def _char_to_response(c: Character) -> dict:
    return {
        "id": c.id,
        "user_id": c.user_id,
        "name": c.name,
        "occupation": c.occupation,
        "attributes": c.attributes,
        "skills": c.skills,
        "derived_stats": c.derived_stats,
        "background": c.background,
        "status": c.status,
        "created_at": c.created_at.isoformat() if c.created_at else None,
    }
