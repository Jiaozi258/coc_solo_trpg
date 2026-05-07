import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Text, Integer, DateTime, ForeignKey, JSON
from sqlalchemy.dialects.sqlite import CHAR
from app.database import Base

def utcnow():
    return datetime.now(timezone.utc)


class Module(Base):
    __tablename__ = "modules"

    id = Column(CHAR(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(CHAR(36), ForeignKey("users.id"), nullable=False, index=True)
    title = Column(String(200), nullable=False)
    filename = Column(String(200), nullable=False)
    raw_text = Column(Text, default="")
    recommended_players = Column(Integer, default=4)
    metadata_ = Column("metadata", JSON, default=dict)
    chunks_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)
