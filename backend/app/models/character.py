import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, ForeignKey, JSON
from sqlalchemy.dialects.sqlite import CHAR
from app.database import Base

def utcnow():
    return datetime.now(timezone.utc)


class Character(Base):
    __tablename__ = "characters"

    id = Column(CHAR(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(CHAR(36), ForeignKey("users.id"), nullable=False, index=True)
    module_id = Column(CHAR(36), ForeignKey("modules.id"), nullable=True)
    name = Column(String(100), nullable=False)
    occupation = Column(String(100), default="")
    attributes = Column(JSON, default=dict)
    skills = Column(JSON, default=dict)
    derived_stats = Column(JSON, default=dict)
    background = Column(JSON, default=dict)
    status = Column(String(20), default="alive")
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)
