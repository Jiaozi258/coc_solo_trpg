import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Text, DateTime, ForeignKey, Integer, JSON
from sqlalchemy.dialects.sqlite import CHAR
from app.database import Base


def utcnow():
    return datetime.now(timezone.utc)


class Lorebook(Base):
    __tablename__ = "lorebooks"

    id = Column(CHAR(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(CHAR(36), ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String(200), nullable=False)
    description = Column(Text, default="")
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)


class LorebookEntry(Base):
    __tablename__ = "lorebook_entries"

    id = Column(CHAR(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    lorebook_id = Column(CHAR(36), ForeignKey("lorebooks.id", ondelete="CASCADE"), nullable=False, index=True)
    keywords = Column(JSON, default=list)  # list of keyword strings
    content = Column(Text, default="")
    trigger_mode = Column(String(20), default="keyword")  # "keyword", "always", "manual"
    search_range = Column(String(20), default="all")  # "all", "last_n", "user_input"
    search_n = Column(Integer, default=5)  # number of recent messages to search (for "last_n")
    priority = Column(Integer, default=50)  # 0-100, higher = more important
    insert_position = Column(String(20), default="before_char")  # "before_char", "after_char", "before_chat"
    enabled = Column(Integer, default=1)  # 0=disabled, 1=enabled
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)
