import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Text, DateTime, ForeignKey
from sqlalchemy.dialects.sqlite import CHAR
from app.database import Base


def utcnow():
    return datetime.now(timezone.utc)


class GameSave(Base):
    __tablename__ = "game_saves"

    id = Column(CHAR(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(CHAR(36), ForeignKey("users.id"), nullable=False, index=True)
    type = Column(String(10), nullable=False)  # "chat" or "game"
    name = Column(String(200), nullable=False)
    data = Column(Text, nullable=False)  # JSON string
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)
