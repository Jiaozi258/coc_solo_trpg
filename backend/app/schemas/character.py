from pydantic import BaseModel, Field
from typing import Optional


class AttributesSchema(BaseModel):
    STR: int = Field(default=50, ge=0, le=99)
    CON: int = Field(default=50, ge=0, le=99)
    SIZ: int = Field(default=50, ge=0, le=99)
    DEX: int = Field(default=50, ge=0, le=99)
    INT: int = Field(default=50, ge=0, le=99)
    APP: int = Field(default=50, ge=0, le=99)
    POW: int = Field(default=50, ge=0, le=99)
    EDU: int = Field(default=50, ge=0, le=99)
    LUCK: int = Field(default=50, ge=0, le=99)


class CharacterCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    module_id: Optional[str] = None
    occupation: str = ""
    attributes: AttributesSchema
    skills: dict = Field(default_factory=dict)
    background: dict = Field(default_factory=dict)
    total_cap: int = Field(default=720, ge=120, le=720)


class CharacterUpdate(BaseModel):
    name: Optional[str] = None
    occupation: Optional[str] = None
    attributes: Optional[AttributesSchema] = None
    skills: Optional[dict] = None
    background: Optional[dict] = None


class CharacterResponse(BaseModel):
    id: str
    user_id: str
    name: str
    occupation: str
    attributes: dict
    skills: dict
    derived_stats: dict
    background: dict
    status: str
    created_at: str | None = None
