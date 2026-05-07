import uuid
from sqlalchemy import Column, String, Text, Boolean, Integer, ForeignKey
from sqlalchemy.dialects.sqlite import CHAR
from app.database import Base


class Location(Base):
    __tablename__ = "locations"

    id = Column(CHAR(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    module_id = Column(CHAR(36), ForeignKey("modules.id"), nullable=False, index=True)
    name = Column(String(200), nullable=False)
    parent_id = Column(CHAR(36), ForeignKey("locations.id"), nullable=True)
    description = Column(Text, default="")
    icon_type = Column(String(50), default="generic")
    has_quest = Column(Boolean, default=False)
    sort_order = Column(Integer, default=0)
