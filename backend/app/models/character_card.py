import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Text, DateTime, ForeignKey
from sqlalchemy.dialects.sqlite import CHAR
from app.database import Base


def utcnow():
    return datetime.now(timezone.utc)


class CharacterCard(Base):
    __tablename__ = "character_cards"

    id = Column(CHAR(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(CHAR(36), ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    personality = Column(Text, default="")
    background = Column(Text, default="")
    relationships = Column(Text, default="")
    dialogue_examples = Column(Text, default="")
    first_message = Column(Text, default="")  # card's own opening/greeting
    portrait_path = Column(String(500), default="")
    source = Column(String(20), default="manual")  # "manual" or "png_import"
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)
