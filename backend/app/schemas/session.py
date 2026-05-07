from pydantic import BaseModel, Field
from typing import Optional


class SessionCreate(BaseModel):
    module_id: str
    character_id: str
    companion_count: int = Field(default=0, ge=0, le=8)


class PlayerAction(BaseModel):
    action: str = Field(..., min_length=1)
    dice_result: Optional[dict] = None


class SessionResponse(BaseModel):
    id: str
    user_id: str
    module_id: str
    character_id: str
    companion_ids: list
    status: str
    created_at: str | None = None


class SnapshotResponse(BaseModel):
    id: str
    turn_number: int
    narrative_chunk: str
    player_action: str
    created_at: str | None = None
