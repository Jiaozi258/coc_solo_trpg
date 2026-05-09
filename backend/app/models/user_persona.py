import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Text, DateTime, ForeignKey
from sqlalchemy.dialects.sqlite import CHAR
from app.database import Base


def utcnow():
    return datetime.now(timezone.utc)


class UserPersona(Base):
    __tablename__ = "user_personas"

    id = Column(CHAR(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(CHAR(36), ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    appearance = Column(Text, default="")  # 外貌描述
    background = Column(Text, default="")  # 背景/personality
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)
