import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Text, Integer, DateTime, ForeignKey, JSON
from sqlalchemy.dialects.sqlite import CHAR
from app.database import Base

def utcnow():
    return datetime.now(timezone.utc)


class SessionSnapshot(Base):
    __tablename__ = "session_snapshots"

    id = Column(CHAR(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id = Column(CHAR(36), ForeignKey("sessions.id"), nullable=False, index=True)
    turn_number = Column(Integer, nullable=False)
    character_snapshot = Column(JSON, default=dict)
    narrative_chunk = Column(Text, default="")
    player_action = Column(Text, default="")
    dice_results = Column(JSON, default=dict)
    status_changes = Column(JSON, default=dict)
    created_at = Column(DateTime, default=utcnow)
