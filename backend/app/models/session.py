import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Text, DateTime, ForeignKey, JSON
from sqlalchemy.dialects.sqlite import CHAR
from app.database import Base

def utcnow():
    return datetime.now(timezone.utc)


class GameSession(Base):
    __tablename__ = "sessions"

    id = Column(CHAR(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(CHAR(36), ForeignKey("users.id"), nullable=False, index=True)
    module_id = Column(CHAR(36), ForeignKey("modules.id"), nullable=False)
    character_id = Column(CHAR(36), ForeignKey("characters.id"), nullable=False)
    companion_ids = Column(JSON, default=list)
    status = Column(String(20), default="active")
    current_context = Column(Text, default="")
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)
