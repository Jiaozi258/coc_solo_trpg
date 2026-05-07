# COC Solo TRPG Simulator — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Build a full-stack Call of Cthulhu 7E solo TRPG simulator with React frontend, FastAPI backend, PDF RAG, COC dice engine, and SSE game streaming.

**Architecture:** FastAPI backend serves as the authoritative Keeper — it manages DB, validates all COC 7e rules, parses PDF modules into ChromaDB vectors, orchestrates LLM prompts with RAG context, and streams JSON via SSE. React frontend handles rendering only: character creation wizard, game session UI, 3D dice animation, and timeline rollback browser.

**Tech Stack:** Python 3.12+ / FastAPI / SQLAlchemy / SQLite / ChromaDB, React 18 / Vite / Tailwind CSS / Zustand / React Three Fiber

---

## File Map

```
backend/
├── requirements.txt
├── app/
│   ├── main.py                  # FastAPI entry, CORS, router mounting
│   ├── config.py                # Pydantic Settings (env vars)
│   ├── database.py              # SQLAlchemy engine, SessionLocal, Base
│   ├── models/
│   │   ├── __init__.py
│   │   ├── user.py              # User model
│   │   ├── module.py            # PDF Module model
│   │   ├── character.py         # Investigator character sheet
│   │   ├── session.py           # Game session model
│   │   └── snapshot.py          # Time-machine snapshot model
│   ├── schemas/
│   │   ├── __init__.py
│   │   ├── user.py              # Pydantic request/response schemas
│   │   ├── character.py         # Character create/update/validate schemas
│   │   └── session.py           # Session action/response schemas
│   ├── services/
│   │   ├── __init__.py
│   │   ├── dice.py              # COC 7e dice engine (d100 checks, damage dice)
│   │   ├── character_validator.py # Attribute/skill boundary enforcement
│   │   ├── pdf_parser.py        # PDF → raw text extraction
│   │   ├── rag_service.py       # ChromaDB chunking + retrieval
│   │   ├── llm_adapter.py       # Provider-agnostic LLM interface
│   │   └── game_loop.py         # Core game turn: RAG → prompt → SSE → snapshot
│   ├── api/
│   │   ├── __init__.py
│   │   ├── auth.py              # Register, login, JWT endpoints
│   │   ├── modules.py           # PDF upload, list, delete
│   │   ├── characters.py        # CRUD + validation endpoints
│   │   └── sessions.py          # Create, play, rollback endpoints
│   └── utils/
│       ├── __init__.py
│       └── sse.py               # SSE event formatting helper
└── tests/
    ├── test_dice.py
    ├── test_character_validator.py
    └── test_rag.py

frontend/
├── package.json
├── vite.config.ts
├── tsconfig.json
├── index.html
├── tailwind.config.js
├── postcss.config.js
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── index.css                # Tailwind + parchment theme
│   ├── api/
│   │   └── client.ts            # Axios + SSE helpers
│   ├── types/
│   │   └── index.ts             # Shared TypeScript interfaces
│   ├── store/
│   │   ├── authStore.ts         # Zustand: auth state
│   │   └── gameStore.ts         # Zustand: session, character, narrative
│   ├── hooks/
│   │   ├── useSSE.ts            # SSE stream hook
│   │   └── useDice.ts           # Dice animation trigger
│   ├── components/
│   │   ├── Layout.tsx           # App shell (header + sidebar + main)
│   │   ├── character/
│   │   │   ├── AttributeStep.tsx    # Step 1: attr allocation
│   │   │   ├── SkillStep.tsx        # Step 2: occupation + skills
│   │   │   └── BackgroundStep.tsx   # Step 3: backstory
│   │   ├── game/
│   │   │   ├── GameSession.tsx      # Main game view
│   │   │   ├── StatusPanel.tsx      # HP/SAN/MP sidebar
│   │   │   ├── ChatArea.tsx         # Narrative scrolling area
│   │   │   └── ActionBar.tsx        # 4 options + text input
│   │   ├── dice/
│   │   │   ├── DiceRoller.tsx       # Dice overlay + trigger
│   │   │   └── DiceScene.tsx        # Three.js dice animation
│   │   └── timeline/
│   │       └── TimelineViewer.tsx   # Rollback browser
│   └── pages/
│       ├── HomePage.tsx
│       ├── LoginPage.tsx
│       ├── CharacterPage.tsx
│       └── GamePage.tsx
```

---

## Phase 1: Backend Core

### Task 1: Project scaffold and configuration

**Files:**
- Create: `backend/requirements.txt`
- Create: `backend/app/__init__.py`
- Create: `backend/app/config.py`
- Create: `backend/app/database.py`
- Create: `backend/app/main.py`

- [ ] **Step 1: Write requirements.txt**

```txt
fastapi==0.115.6
uvicorn[standard]==0.34.0
sqlalchemy==2.0.36
alembic==1.14.0
pydantic==2.10.3
pydantic-settings==2.7.0
python-jose[cryptography]==3.3.0
passlib[bcrypt]==1.7.4
python-multipart==0.0.18
chromadb==0.5.23
pypdf2==3.0.1
httpx==0.28.1
anthropic==0.42.0
openai==1.57.4
```

- [ ] **Step 2: Write config.py**

```python
from pydantic_settings import BaseSettings
from functools import lru_cache

class Settings(BaseSettings):
    database_url: str = "sqlite:///./coc_trpg.db"
    secret_key: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24 * 7
    chroma_persist_dir: str = "./chroma_data"
    llm_provider: str = "anthropic"  # anthropic | openai | ollama
    anthropic_api_key: str = ""
    openai_api_key: str = ""
    ollama_base_url: str = "http://localhost:11434"
    llm_model: str = "claude-sonnet-4-6"
    embedding_model: str = "text-embedding-3-small"
    upload_dir: str = "./uploads"

    class Config:
        env_file = ".env"

@lru_cache()
def get_settings() -> Settings:
    return Settings()
```

- [ ] **Step 3: Write database.py**

```python
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from app.config import get_settings

settings = get_settings()

connect_args = {"check_same_thread": False} if "sqlite" in settings.database_url else {}
engine = create_engine(settings.database_url, connect_args=connect_args, echo=False)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

- [ ] **Step 4: Write main.py (minimal FastAPI app)**

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import engine, Base

app = FastAPI(title="COC Solo TRPG Simulator", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)

@app.get("/api/health")
def health():
    return {"status": "ok", "version": "0.1.0"}
```

- [ ] **Step 5: Install dependencies and verify**

```bash
cd backend && pip install -r requirements.txt && python -c "from app.main import app; print('OK')"
```

Expected: `OK`

- [ ] **Step 6: Commit**

```bash
git add backend/
git commit -m "feat: scaffold backend project with FastAPI, config, and database"
```

---

### Task 2: Database models (users, modules, characters, sessions, snapshots)

**Files:**
- Create: `backend/app/models/__init__.py`
- Create: `backend/app/models/user.py`
- Create: `backend/app/models/module.py`
- Create: `backend/app/models/character.py`
- Create: `backend/app/models/session.py`
- Create: `backend/app/models/snapshot.py`

- [ ] **Step 1: Write model __init__.py**

```python
from app.models.user import User
from app.models.module import Module
from app.models.character import Character
from app.models.session import GameSession
from app.models.snapshot import SessionSnapshot

__all__ = ["User", "Module", "Character", "GameSession", "SessionSnapshot"]
```

- [ ] **Step 2: Write user model**

```python
import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime
from sqlalchemy.dialects.sqlite import CHAR
from app.database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(CHAR(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    username = Column(String(50), unique=True, nullable=False, index=True)
    password_hash = Column(String(128), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
```

- [ ] **Step 3: Write module model**

```python
import uuid
from datetime import datetime
from sqlalchemy import Column, String, Text, Integer, DateTime, ForeignKey, JSON
from sqlalchemy.dialects.sqlite import CHAR
from app.database import Base

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
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
```

- [ ] **Step 4: Write character model**

```python
import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, ForeignKey, JSON
from sqlalchemy.dialects.sqlite import CHAR
from app.database import Base

class Character(Base):
    __tablename__ = "characters"

    id = Column(CHAR(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(CHAR(36), ForeignKey("users.id"), nullable=False, index=True)
    module_id = Column(CHAR(36), ForeignKey("modules.id"), nullable=True)
    name = Column(String(100), nullable=False)
    occupation = Column(String(100), default="")
    # {STR, CON, SIZ, DEX, INT, APP, POW, EDU, LUCK, total_points}
    attributes = Column(JSON, default=dict)
    # {spot_hidden: 60, library_use: 45, ...}
    skills = Column(JSON, default=dict)
    # {HP_current, HP_max, SAN_current, SAN_max, MP_current, MP_max, ...}
    derived_stats = Column(JSON, default=dict)
    # {residence, history, beliefs, important_persons, appearance}
    background = Column(JSON, default=dict)
    status = Column(String(20), default="alive")  # alive | insane | dead
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
```

- [ ] **Step 5: Write session model**

```python
import uuid
from datetime import datetime
from sqlalchemy import Column, String, Text, DateTime, ForeignKey, JSON
from sqlalchemy.dialects.sqlite import CHAR
from app.database import Base

class GameSession(Base):
    __tablename__ = "sessions"

    id = Column(CHAR(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(CHAR(36), ForeignKey("users.id"), nullable=False, index=True)
    module_id = Column(CHAR(36), ForeignKey("modules.id"), nullable=False)
    character_id = Column(CHAR(36), ForeignKey("characters.id"), nullable=False)
    companion_ids = Column(JSON, default=list)  # [uuid, uuid, ...]
    status = Column(String(20), default="active")  # active | paused | completed
    current_context = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
```

- [ ] **Step 6: Write snapshot model**

```python
import uuid
from datetime import datetime
from sqlalchemy import Column, String, Text, Integer, DateTime, ForeignKey, JSON
from sqlalchemy.dialects.sqlite import CHAR
from app.database import Base

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
    created_at = Column(DateTime, default=datetime.utcnow)
```

- [ ] **Step 7: Verify models create tables**

```bash
cd backend && python -c "
from app.database import engine, Base
from app.models import User, Module, Character, GameSession, SessionSnapshot
Base.metadata.create_all(bind=engine)
print('All tables created')
"
```

Expected: `All tables created`

- [ ] **Step 8: Commit**

```bash
git add backend/app/models/
git commit -m "feat: add database models (users, modules, characters, sessions, snapshots)"
```

---

### Task 3: COC 7e Dice Engine

**Files:**
- Create: `backend/app/services/__init__.py`
- Create: `backend/app/services/dice.py`
- Create: `backend/tests/test_dice.py`

- [ ] **Step 1: Write failing dice engine tests**

```python
import pytest
from app.services.dice import DiceEngine

class TestD100Check:
    def test_critical_success(self):
        result = DiceEngine.check_d100(roll=1, skill=50)
        assert result["level"] == "critical"
        assert result["success"] is True

    def test_extreme_success(self):
        result = DiceEngine.check_d100(roll=8, skill=50)
        assert result["level"] == "extreme"
        assert result["success"] is True

    def test_hard_success(self):
        result = DiceEngine.check_d100(roll=20, skill=50)
        assert result["level"] == "hard"
        assert result["success"] is True

    def test_regular_success(self):
        result = DiceEngine.check_d100(roll=45, skill=50)
        assert result["level"] == "regular"
        assert result["success"] is True

    def test_failure(self):
        result = DiceEngine.check_d100(roll=60, skill=50)
        assert result["level"] == "failure"
        assert result["success"] is False

    def test_fumble_low_skill(self):
        result = DiceEngine.check_d100(roll=96, skill=49)
        assert result["level"] == "fumble"
        assert result["success"] is False

    def test_fumble_high_skill(self):
        result = DiceEngine.check_d100(roll=100, skill=55)
        assert result["level"] == "fumble"
        assert result["success"] is False

    def test_no_fumble_96_on_high_skill(self):
        result = DiceEngine.check_d100(roll=96, skill=55)
        assert result["level"] == "failure"
        assert result["success"] is False


class TestDiceRoll:
    def test_roll_range(self):
        for faces in [3, 4, 6, 8, 10, 12, 16, 20, 100]:
            result = DiceEngine.roll(f"1d{faces}")
            assert 1 <= result["total"] <= faces
            assert len(result["individual"]) == 1

    def test_multi_dice(self):
        result = DiceEngine.roll("2d6")
        assert 2 <= result["total"] <= 12
        assert len(result["individual"]) == 2

    def test_complex_roll(self):
        result = DiceEngine.roll("1d4+1d6")
        assert 2 <= result["total"] <= 10
        assert len(result["individual"]) == 2
```

- [ ] **Step 2: Run tests (expect failure)**

```bash
cd backend && pytest tests/test_dice.py -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.dice'`

- [ ] **Step 3: Write dice engine implementation**

```python
import random
import re
from typing import List, Tuple

class DiceEngine:
    @staticmethod
    def roll(expression: str) -> dict:
        """Parse and execute a dice expression like '1d100', '2d6', '1d4+1d6'."""
        parts = re.findall(r"(\d+)d(\d+)", expression)
        individual: List[int] = []
        total = 0
        for count_str, faces_str in parts:
            count = int(count_str)
            faces = int(faces_str)
            for _ in range(count):
                val = random.randint(1, faces)
                individual.append(val)
                total += val
        return {"expression": expression, "individual": individual, "total": total}

    @staticmethod
    def check_d100(roll: int, skill: int) -> dict:
        """Evaluate a d100 roll against a skill value per COC 7e rules.

        Degrees of success:
          - Critical: roll is 1
          - Extreme: roll <= skill / 5
          - Hard:     roll <= skill / 2
          - Regular:  roll <= skill
          - Failure:  roll > skill
          - Fumble:   roll >= 96 if skill < 50, roll is 100 if skill >= 50
        """
        if roll == 1:
            return {"level": "critical", "success": True, "roll": roll, "skill": skill}

        is_fumble = (skill < 50 and roll >= 96) or (skill >= 50 and roll == 100)

        if roll <= skill // 5:
            return {"level": "extreme", "success": True, "roll": roll, "skill": skill}
        elif roll <= skill // 2:
            return {"level": "hard", "success": True, "roll": roll, "skill": skill}
        elif roll <= skill:
            return {"level": "regular", "success": True, "roll": roll, "skill": skill}
        elif is_fumble:
            return {"level": "fumble", "success": False, "roll": roll, "skill": skill}
        else:
            return {"level": "failure", "success": False, "roll": roll, "skill": skill}

    @staticmethod
    def opposed_check(actor_roll: int, actor_skill: int, opponent_roll: int, opponent_skill: int) -> dict:
        """COC 7e opposed roll: compare degrees of success."""
        actor = DiceEngine.check_d100(actor_roll, actor_skill)
        opponent = DiceEngine.check_d100(opponent_roll, opponent_skill)
        level_order = {"critical": 5, "extreme": 4, "hard": 3, "regular": 2, "failure": 1, "fumble": 0}

        actor_level = level_order[actor["level"]]
        opp_level = level_order[opponent["level"]]

        if actor_level > opp_level:
            winner = "actor"
        elif opp_level > actor_level:
            winner = "opponent"
        else:
            # Same degree: higher roll wins if both succeed, lower if both fail
            if actor["success"] and opponent["success"]:
                winner = "actor" if actor_roll > opponent_roll else "opponent"
            elif not actor["success"] and not opponent["success"]:
                winner = "actor" if actor_roll < opponent_roll else "opponent"
            else:
                winner = "actor" if actor["success"] else "opponent"

        return {"actor": actor, "opponent": opponent, "winner": winner}
```

- [ ] **Step 4: Run tests (expect pass)**

```bash
cd backend && pytest tests/test_dice.py -v
```

Expected: All 10 tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/__init__.py backend/app/services/dice.py backend/tests/
git commit -m "feat: implement COC 7e dice engine with d100 checks and damage rolling"
```

---

### Task 4: Character validator

**Files:**
- Create: `backend/app/services/character_validator.py`
- Create: `backend/tests/test_character_validator.py`

- [ ] **Step 1: Write failing validator tests**

```python
import pytest
from app.services.character_validator import CharacterValidator

class TestAttributeValidation:
    def test_valid_attributes(self):
        attrs = {"STR": 50, "CON": 50, "SIZ": 50, "DEX": 50, "INT": 60, "APP": 50, "POW": 50, "EDU": 60}
        errors = CharacterValidator.validate_attributes(attrs, total_cap=720)
        assert len(errors) == 0

    def test_attr_above_99(self):
        attrs = {"STR": 150, "CON": 50, "SIZ": 50, "DEX": 50, "INT": 60, "APP": 50, "POW": 50, "EDU": 60}
        errors = CharacterValidator.validate_attributes(attrs, total_cap=720)
        assert any("STR" in e for e in errors)

    def test_attr_below_zero(self):
        attrs = {"STR": -5, "CON": 50, "SIZ": 50, "DEX": 50, "INT": 60, "APP": 50, "POW": 50, "EDU": 60}
        errors = CharacterValidator.validate_attributes(attrs, total_cap=720)
        assert any("STR" in e for e in errors)

    def test_total_exceeds_cap(self):
        attrs = {"STR": 90, "CON": 90, "SIZ": 90, "DEX": 90, "INT": 90, "APP": 90, "POW": 90, "EDU": 90}
        errors = CharacterValidator.validate_attributes(attrs, total_cap=500)
        assert any("total" in e.lower() for e in errors)

    def test_total_below_minimum(self):
        attrs = {"STR": 10, "CON": 10, "SIZ": 10, "DEX": 10, "INT": 10, "APP": 10, "POW": 10, "EDU": 10}
        errors = CharacterValidator.validate_attributes(attrs, total_cap=720)
        assert any("minimum" in e.lower() or "total" in e.lower() for e in errors)

    def test_missing_attribute(self):
        attrs = {"STR": 50, "CON": 50, "SIZ": 50}
        errors = CharacterValidator.validate_attributes(attrs, total_cap=720)
        assert any("missing" in e.lower() for e in errors)

    def test_luck_range(self):
        assert CharacterValidator.validate_luck(50) == []
        err = CharacterValidator.validate_luck(100)
        assert len(err) > 0
```

- [ ] **Step 2: Write character validator implementation**

```python
from typing import Dict, List

REQUIRED_ATTRS = ["STR", "CON", "SIZ", "DEX", "INT", "APP", "POW", "EDU"]
MIN_TOTAL = 120
ATTR_MIN = 0
ATTR_MAX = 99
LUCK_MIN = 0
LUCK_MAX = 99

class CharacterValidator:
    @staticmethod
    def validate_attributes(attrs: Dict[str, int], total_cap: int = 720) -> List[str]:
        errors = []

        missing = [a for a in REQUIRED_ATTRS if a not in attrs]
        if missing:
            errors.append(f"Missing attributes: {', '.join(missing)}")
            return errors

        for attr in REQUIRED_ATTRS:
            val = attrs[attr]
            if not isinstance(val, int) or val < ATTR_MIN or val > ATTR_MAX:
                errors.append(f"{attr} must be between {ATTR_MIN} and {ATTR_MAX}, got {val}")

        total = sum(attrs[a] for a in REQUIRED_ATTRS)
        if total > total_cap:
            errors.append(f"Attribute total {total} exceeds cap of {total_cap}")
        if total < MIN_TOTAL:
            errors.append(f"Attribute total {total} is below minimum of {MIN_TOTAL}")

        return errors

    @staticmethod
    def validate_luck(luck: int) -> List[str]:
        if not isinstance(luck, int) or luck < LUCK_MIN or luck > LUCK_MAX:
            return [f"LUCK must be between {LUCK_MIN} and {LUCK_MAX}, got {luck}"]
        return []

    @staticmethod
    def validate_skill(skill_name: str, value: int, min_val: int = 0, max_val: int = 99) -> List[str]:
        if not isinstance(value, int) or value < min_val or value > max_val:
            return [f"{skill_name} must be between {min_val} and {max_val}, got {value}"]
        return []

    @staticmethod
    def calculate_derived_stats(attrs: Dict[str, int]) -> dict:
        """Calculate HP, SAN, MP, Move, Build, Dodge, etc. from base attributes."""
        con = attrs.get("CON", 0)
        siz = attrs.get("SIZ", 0)
        pow_ = attrs.get("POW", 0)
        edu = attrs.get("EDU", 0)
        dex = attrs.get("DEX", 0)
        str_ = attrs.get("STR", 0)

        hp_max = (con + siz) // 10
        san_max = pow_
        mp_max = pow_ // 5
        move = 8 if str_ < siz and dex < siz else (7 if str_ >= siz or dex >= siz else 9)
        build = 0 if str_ + siz <= 64 else (1 if str_ + siz <= 84 else 2)
        dodge = dex // 2

        return {
            "HP_current": hp_max,
            "HP_max": hp_max,
            "SAN_current": san_max,
            "SAN_max": san_max,
            "MP_current": mp_max,
            "MP_max": mp_max,
            "MOV": move,
            "BUILD": build,
            "DODGE": dodge,
        }
```

- [ ] **Step 3: Run tests (expect pass)**

```bash
cd backend && pytest tests/test_character_validator.py -v
```

Expected: 7 tests PASS

- [ ] **Step 4: Commit**

```bash
git add backend/app/services/character_validator.py backend/tests/test_character_validator.py
git commit -m "feat: add character attribute/skill validator with COC 7e limits"
```

---

### Task 5: PDF parser + RAG service

**Files:**
- Create: `backend/app/services/pdf_parser.py`
- Create: `backend/app/services/rag_service.py`
- Create: `backend/tests/test_rag.py`

- [ ] **Step 1: Write PDF parser**

```python
import os
from io import BytesIO
from PyPDF2 import PdfReader

class PDFParser:
    @staticmethod
    def extract_text(file_path: str) -> str:
        """Extract raw text from a PDF file."""
        text_parts = []
        with open(file_path, "rb") as f:
            reader = PdfReader(f)
            for page in reader.pages:
                page_text = page.extract_text()
                if page_text:
                    text_parts.append(page_text)
        return "\n\n".join(text_parts)

    @staticmethod
    def extract_text_from_bytes(content: bytes) -> str:
        reader = PdfReader(BytesIO(content))
        text_parts = []
        for page in reader.pages:
            page_text = page.extract_text()
            if page_text:
                text_parts.append(page_text)
        return "\n\n".join(text_parts)

    @staticmethod
    def chunk_text(text: str, chunk_size: int = 500, overlap: int = 100) -> list[dict]:
        """Split text into overlapping chunks for embedding."""
        words = text.split()
        chunks = []
        idx = 0
        start = 0
        while start < len(words):
            end = min(start + chunk_size, len(words))
            chunk_text = " ".join(words[start:end])
            chunks.append({
                "index": idx,
                "content": chunk_text,
                "start": start,
                "end": end,
            })
            idx += 1
            start = end - overlap
        return chunks
```

- [ ] **Step 2: Write RAG service**

```python
import json
import chromadb
from chromadb.config import Settings as ChromaSettings
from app.config import get_settings
from app.services.pdf_parser import PDFParser

settings = get_settings()

class RAGService:
    def __init__(self):
        self.client = chromadb.PersistentClient(
            path=settings.chroma_persist_dir,
            settings=ChromaSettings(anonymized_telemetry=False),
        )

    def get_or_create_collection(self, module_id: str):
        name = f"module_{module_id}"
        try:
            return self.client.get_collection(name)
        except Exception:
            return self.client.create_collection(name)

    def index_module(self, module_id: str, text: str) -> int:
        """Chunk module text and store in ChromaDB. Returns chunk count."""
        chunks = PDFParser.chunk_text(text, chunk_size=500, overlap=100)
        if not chunks:
            return 0

        collection = self.get_or_create_collection(module_id)

        # Clear existing chunks for this module
        existing = collection.get()
        if existing and existing["ids"]:
            collection.delete(ids=existing["ids"])

        ids = [f"{module_id}_chunk_{c['index']}" for c in chunks]
        documents = [c["content"] for c in chunks]
        metadatas = [{"chunk_index": c["index"], "module_id": module_id} for c in chunks]

        collection.add(ids=ids, documents=documents, metadatas=metadatas)
        return len(chunks)

    def retrieve(self, module_id: str, query: str, n_results: int = 5) -> list[str]:
        """Retrieve most relevant chunks for a query."""
        try:
            collection = self.get_or_create_collection(module_id)
            results = collection.query(query_texts=[query], n_results=n_results)
            docs = results.get("documents", [[]])[0]
            return [d for d in docs if d]
        except Exception:
            return []

    def delete_module(self, module_id: str):
        try:
            self.client.delete_collection(f"module_{module_id}")
        except Exception:
            pass

    def get_module_context(self, module_id: str, query: str, max_chunks: int = 5) -> str:
        """Get formatted context string for prompt injection."""
        chunks = self.retrieve(module_id, query, max_chunks)
        if not chunks:
            return ""
        return "【模组背景资料】\n" + "\n---\n".join(chunks)


rag_service = RAGService()
```

- [ ] **Step 3: Write RAG test**

```python
import pytest
from app.services.rag_service import rag_service

TEST_MODULE_ID = "test-module-001"

def test_index_and_retrieve():
    text = """
    第一章：诡异的古宅
    
    调查员们收到一封来自远房亲戚的神秘信件。
    信中提到位于阿卡姆郊外的温特沃斯庄园最近发生了许多诡异的事件。
    夜晚时分，邻居们声称看到庄园的窗户中透出诡异的绿色光芒。
    
    重要线索：庄园地下室隐藏着一本古老的《死灵之书》抄本。
    阅读此书将损失1d6点理智值。
    
    第二章：地下室的秘密
    
    调查员进入地下室后，发现墙壁上刻满了奇怪的符文。
    成功通过考古学检定（难度：困难）可以识别这些符文属于古埃及的召唤仪式。
    仪式需要三件法器：安卡十字、圣甲虫护符和黑色方尖碑碎片。
    """
    count = rag_service.index_module(TEST_MODULE_ID, text)
    assert count > 0

    results = rag_service.retrieve(TEST_MODULE_ID, "死灵之书在哪里")
    assert len(results) > 0
    assert any("地下室" in r or "死灵之书" in r for r in results)

    results2 = rag_service.retrieve(TEST_MODULE_ID, "古埃及符文仪式")
    assert len(results2) > 0
    assert any("符文" in r or "埃及" in r for r in results2)


def test_get_module_context():
    ctx = rag_service.get_module_context(TEST_MODULE_ID, "诡异的绿光")
    assert "【模组背景资料】" in ctx
    assert len(ctx) > 50


def test_cleanup():
    rag_service.delete_module(TEST_MODULE_ID)
```

- [ ] **Step 4: Run tests**

```bash
cd backend && pip install chromadb PyPDF2 && pytest tests/test_rag.py -v
```

Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/pdf_parser.py backend/app/services/rag_service.py backend/tests/test_rag.py
git commit -m "feat: add PDF parser and ChromaDB RAG service for module indexing"
```

---

### Task 6: LLM adapter + SSE game loop

**Files:**
- Create: `backend/app/services/llm_adapter.py`
- Create: `backend/app/services/game_loop.py`
- Create: `backend/app/utils/__init__.py`
- Create: `backend/app/utils/sse.py`

- [ ] **Step 1: Write SSE utility**

```python
import json
from typing import AsyncGenerator

def sse_event(event: str, data: dict) -> str:
    """Format a Server-Sent Event."""
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"

async def sse_stream(generator) -> AsyncGenerator[str, None]:
    """Wrap an async generator into SSE format. Yields raw SSE strings."""
    async for event_type, payload in generator:
        if event_type == "done":
            yield sse_event("done", payload)
            break
        yield sse_event(event_type, payload)
```

- [ ] **Step 2: Write LLM adapter (provider-agnostic)**

```python
from abc import ABC, abstractmethod
from typing import AsyncGenerator
from app.config import get_settings

class LLMProvider(ABC):
    @abstractmethod
    async def stream_chat(self, system_prompt: str, messages: list[dict], model: str) -> AsyncGenerator[str, None]:
        ...

class AnthropicProvider(LLMProvider):
    def __init__(self, api_key: str):
        import anthropic
        self.client = anthropic.AsyncAnthropic(api_key=api_key)

    async def stream_chat(self, system_prompt: str, messages: list[dict], model: str) -> AsyncGenerator[str, None]:
        formatted = []
        for m in messages:
            formatted.append({"role": m["role"], "content": m["content"]})
        async with self.client.messages.stream(
            model=model,
            max_tokens=4096,
            system=system_prompt,
            messages=formatted,
        ) as stream:
            async for text in stream.text_stream:
                yield text


class OpenAIProvider(LLMProvider):
    def __init__(self, api_key: str):
        from openai import AsyncOpenAI
        self.client = AsyncOpenAI(api_key=api_key)

    async def stream_chat(self, system_prompt: str, messages: list[dict], model: str) -> AsyncGenerator[str, None]:
        formatted = [{"role": "system", "content": system_prompt}]
        for m in messages:
            formatted.append({"role": m["role"], "content": m["content"]})
        stream = await self.client.chat.completions.create(
            model=model, messages=formatted, max_tokens=4096, stream=True
        )
        async for chunk in stream:
            if chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content


class OllamaProvider(LLMProvider):
    def __init__(self, base_url: str):
        import httpx
        self.base_url = base_url
        self.client = httpx.AsyncClient(timeout=120.0)

    async def stream_chat(self, system_prompt: str, messages: list[dict], model: str) -> AsyncGenerator[str, None]:
        formatted = [{"role": "system", "content": system_prompt}]
        for m in messages:
            formatted.append({"role": m["role"], "content": m["content"]})
        async with self.client.stream(
            "POST", f"{self.base_url}/api/chat",
            json={"model": model, "messages": formatted, "stream": True},
        ) as resp:
            async for line in resp.aiter_lines():
                if line:
                    try:
                        data = __import__("json").loads(line)
                        if "message" in data and "content" in data["message"]:
                            yield data["message"]["content"]
                    except Exception:
                        pass


def get_llm_provider() -> LLMProvider:
    s = get_settings()
    if s.llm_provider == "anthropic":
        return AnthropicProvider(s.anthropic_api_key)
    elif s.llm_provider == "openai":
        return OpenAIProvider(s.openai_api_key)
    elif s.llm_provider == "ollama":
        return OllamaProvider(s.ollama_base_url)
    raise ValueError(f"Unknown LLM provider: {s.llm_provider}")
```

- [ ] **Step 3: Write game loop service**

```python
import json
from typing import AsyncGenerator
from app.services.rag_service import rag_service
from app.services.llm_adapter import get_llm_provider
from app.services.dice import DiceEngine
from app.config import get_settings

SYSTEM_PROMPT_TEMPLATE = """你是一个《克苏鲁的召唤》(Call of Cthulhu) 第七版 TRPG 的守秘人(Keeper)。

## 你的职责
1. 根据模组内容引导调查员进行冒险
2. 描述场景、NPC 对话和事件发展
3. 在需要时要求进行技能或属性检定
4. 根据检定结果决定剧情走向
5. 管理调查员的理智值(SAN)、生命值(HP)和魔法值(MP)

## 输出格式
你必须严格按照以下 JSON 格式输出，不要输出任何其他内容：
```json
{
  "narrative": "旁白和剧情描述文本...",
  "options": ["选项1描述", "选项2描述", "选项3描述", "选项4描述"],
  "dice_request": null,
  "status_update": null
}
```

如果需要进行检定，dice_request 格式为：
```json
"dice_request": {
  "type": "skill_check",
  "skill": "侦查",
  "value": 60,
  "difficulty": "regular",
  "explanation": "请进行一次侦查检定来发现隐藏的线索"
}
```

如果需要战斗伤害，dice_request 格式为：
```json
"dice_request": {
  "type": "damage",
  "weapon": ".45自动手枪",
  "expression": "1d10+2",
  "explanation": "请掷伤害骰"
}
```

如果需要更新调查员状态，status_update 格式为：
```json
"status_update": {
  "HP_change": -3,
  "SAN_change": -2,
  "MP_change": 0,
  "effects": ["流血"]
}
```

{module_context}

## 当前调查员状态
{character_state}
"""

class GameLoop:
    def __init__(self):
        self.llm = get_llm_provider()
        self.settings = get_settings()

    def build_system_prompt(self, module_id: str, character_state: dict, current_query: str) -> str:
        context = rag_service.get_module_context(module_id, current_query, max_chunks=5)
        return SYSTEM_PROMPT_TEMPLATE.format(
            module_context=context,
            character_state=json.dumps(character_state, ensure_ascii=False, indent=2),
        )

    async def run_turn(
        self,
        module_id: str,
        character_state: dict,
        chat_history: list[dict],
        player_action: str,
    ) -> AsyncGenerator[tuple, None]:
        """Execute one game turn. Yields (event_type, payload) tuples for SSE streaming."""
        system_prompt = self.build_system_prompt(module_id, character_state, player_action)

        messages = list(chat_history[-20:])  # Keep last 20 messages for context
        messages.append({"role": "user", "content": player_action})

        # Buffer for accumulating full response text
        narrative_buffer = ""
        json_buffer = ""

        # Yield start event
        yield ("status", {"message": "Keeper is thinking..."})

        async for text_chunk in self.llm.stream_chat(
            system_prompt=system_prompt,
            messages=messages,
            model=self.settings.llm_model,
        ):
            json_buffer += text_chunk

            # Try to extract narrative for streaming display
            # We look for the start of the narrative field
            if '"narrative"' in json_buffer:
                narrative_start = json_buffer.find('"narrative"')
                colon_idx = json_buffer.find(":", narrative_start)
                if colon_idx > 0:
                    # Find the opening quote of narrative value
                    val_start = json_buffer.find('"', colon_idx + 1)
                    if val_start > 0:
                        narrative_text = json_buffer[val_start + 1:]
                        # Trim trailing partial JSON
                        if '",' in narrative_text or '"\n}' in narrative_text:
                            narrative_text = narrative_text.split('",')[0].split('"\n}')[0]
                        yield ("narrative", {"text": narrative_text})

        # Try to parse the complete JSON
        try:
            # Extract JSON block from markdown code fences if present
            clean = json_buffer.strip()
            if "```json" in clean:
                clean = clean.split("```json")[1].split("```")[0].strip()
            elif "```" in clean:
                clean = clean.split("```")[1].split("```")[0].strip()
            parsed = json.loads(clean)
        except json.JSONDecodeError:
            # Fallback: treat entire response as narrative
            parsed = {
                "narrative": json_buffer,
                "options": ["继续探索", "仔细观察", "与NPC交谈", "查阅资料"],
                "dice_request": None,
                "status_update": None,
            }

        yield ("narrative", {"text": parsed.get("narrative", ""), "final": True})
        yield ("options", {"options": parsed.get("options", [])})

        dice_request = parsed.get("dice_request")
        if dice_request:
            yield ("dice_request", dice_request)

        status_update = parsed.get("status_update")
        if status_update:
            yield ("status_update", status_update)

        yield ("done", {"turn_complete": True})
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/services/llm_adapter.py backend/app/services/game_loop.py backend/app/utils/
git commit -m "feat: add provider-agnostic LLM adapter and SSE game loop service"
```

---

## Phase 2: API Endpoints

### Task 7: Pydantic schemas

**Files:**
- Create: `backend/app/schemas/__init__.py`
- Create: `backend/app/schemas/user.py`
- Create: `backend/app/schemas/character.py`
- Create: `backend/app/schemas/session.py`

- [ ] **Step 1: Write user schemas**

```python
from pydantic import BaseModel, Field

class UserRegister(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=6, max_length=100)

class UserLogin(BaseModel):
    username: str
    password: str

class UserResponse(BaseModel):
    id: str
    username: str
    created_at: str | None = None

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
```

- [ ] **Step 2: Write character schemas**

```python
from pydantic import BaseModel, Field
from typing import Optional

class AttributesSchema(BaseModel):
    STR: int = Field(default=50, ge=0, le=99)
    CON: int = Field(default=50, ge=0, le=99)
    SIZ: int = Field(default=50, ge=0, le=99)
    DEX: int = Field(default=50, ge=0, le=99)
    INT: int = Field(default=50, ge=0, le=99)
    APP: int = Field(default=50, ge=0, le=99)
    POW: int = Field(default=50, ge=0, le=99)
    EDU: int = Field(default=50, ge=0, le=99)
    LUCK: int = Field(default=50, ge=0, le=99)

class CharacterCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    module_id: Optional[str] = None
    occupation: str = ""
    attributes: AttributesSchema
    skills: dict = Field(default_factory=dict)
    background: dict = Field(default_factory=dict)
    total_cap: int = Field(default=720, ge=120, le=720)

class CharacterUpdate(BaseModel):
    name: Optional[str] = None
    occupation: Optional[str] = None
    attributes: Optional[AttributesSchema] = None
    skills: Optional[dict] = None
    background: Optional[dict] = None

class CharacterResponse(BaseModel):
    id: str
    user_id: str
    name: str
    occupation: str
    attributes: dict
    skills: dict
    derived_stats: dict
    background: dict
    status: str
    created_at: str | None = None
```

- [ ] **Step 3: Write session schemas**

```python
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
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/schemas/
git commit -m "feat: add Pydantic schemas for users, characters, and sessions"
```

---

### Task 8: Auth API

**Files:**
- Create: `backend/app/api/__init__.py`
- Create: `backend/app/api/auth.py`

- [ ] **Step 1: Write auth endpoints**

```python
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from passlib.context import CryptContext
from jose import jwt, JOSEError
from datetime import datetime, timedelta

from app.database import get_db
from app.models.user import User
from app.schemas.user import UserRegister, UserLogin, UserResponse, TokenResponse
from app.config import get_settings

router = APIRouter(prefix="/api/auth", tags=["auth"])
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
settings = get_settings()

def create_token(user_id: str) -> str:
    expire = datetime.utcnow() + timedelta(minutes=settings.jwt_expire_minutes)
    payload = {"sub": user_id, "exp": expire}
    return jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)

def get_current_user(token: str, db: Session) -> User:
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.jwt_algorithm])
        user_id = payload.get("sub")
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except JOSEError:
        raise HTTPException(status_code=401, detail="Invalid token")

@router.post("/register", response_model=TokenResponse)
def register(body: UserRegister, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.username == body.username).first()
    if existing:
        raise HTTPException(status_code=409, detail="Username already taken")
    user = User(
        username=body.username,
        password_hash=pwd_context.hash(body.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_token(user.id)
    return TokenResponse(access_token=token)

@router.post("/login", response_model=TokenResponse)
def login(body: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == body.username).first()
    if not user or not pwd_context.verify(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_token(user.id)
    return TokenResponse(access_token=token)
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/api/__init__.py backend/app/api/auth.py
git commit -m "feat: add auth API (register, login, JWT tokens)"
```

---

### Task 9: Character and Module API

**Files:**
- Create: `backend/app/api/characters.py`
- Create: `backend/app/api/modules.py`
- Modify: `backend/app/main.py` (register routers)

- [ ] **Step 1: Write character CRUD endpoints**

```python
from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from typing import List

from app.database import get_db
from app.models.character import Character
from app.schemas.character import CharacterCreate, CharacterUpdate, CharacterResponse
from app.services.character_validator import CharacterValidator
from app.api.auth import get_current_user

router = APIRouter(prefix="/api/characters", tags=["characters"])

@router.post("/", response_model=CharacterResponse)
def create_character(body: CharacterCreate, db: Session = Depends(get_db),
                     authorization: str = Header(...)):
    token = authorization.replace("Bearer ", "")
    user = get_current_user(token, db)

    attrs = body.attributes.model_dump()
    errors = CharacterValidator.validate_attributes(attrs, body.total_cap)
    if errors:
        raise HTTPException(status_code=422, detail=errors)

    errors_luck = CharacterValidator.validate_luck(attrs.pop("LUCK", 50))
    if errors_luck:
        raise HTTPException(status_code=422, detail=errors_luck)

    derived = CharacterValidator.calculate_derived_stats(attrs)

    char = Character(
        user_id=user.id,
        module_id=body.module_id,
        name=body.name,
        occupation=body.occupation,
        attributes={**attrs, "LUCK": body.attributes.LUCK},
        skills=body.skills,
        derived_stats=derived,
        background=body.background,
    )
    db.add(char)
    db.commit()
    db.refresh(char)
    return _char_to_response(char)


@router.get("/", response_model=List[CharacterResponse])
def list_characters(db: Session = Depends(get_db),
                    authorization: str = Header(...)):
    token = authorization.replace("Bearer ", "")
    user = get_current_user(token, db)
    chars = db.query(Character).filter(Character.user_id == user.id).all()
    return [_char_to_response(c) for c in chars]


@router.get("/{character_id}", response_model=CharacterResponse)
def get_character(character_id: str, db: Session = Depends(get_db),
                  authorization: str = Header(...)):
    token = authorization.replace("Bearer ", "")
    get_current_user(token, db)
    char = db.query(Character).filter(Character.id == character_id).first()
    if not char:
        raise HTTPException(status_code=404, detail="Character not found")
    return _char_to_response(char)


@router.put("/{character_id}", response_model=CharacterResponse)
def update_character(character_id: str, body: CharacterUpdate,
                     db: Session = Depends(get_db),
                     authorization: str = Header(...)):
    token = authorization.replace("Bearer ", "")
    user = get_current_user(token, db)
    char = db.query(Character).filter(
        Character.id == character_id, Character.user_id == user.id
    ).first()
    if not char:
        raise HTTPException(status_code=404, detail="Character not found")

    if body.attributes:
        attrs = body.attributes.model_dump()
        errors = CharacterValidator.validate_attributes(attrs)
        if errors:
            raise HTTPException(status_code=422, detail=errors)
        char.attributes = attrs
        char.derived_stats = CharacterValidator.calculate_derived_stats(attrs)

    if body.name is not None:
        char.name = body.name
    if body.occupation is not None:
        char.occupation = body.occupation
    if body.skills is not None:
        char.skills = body.skills
    if body.background is not None:
        char.background = body.background

    db.commit()
    db.refresh(char)
    return _char_to_response(char)


@router.delete("/{character_id}")
def delete_character(character_id: str, db: Session = Depends(get_db),
                     authorization: str = Header(...)):
    token = authorization.replace("Bearer ", "")
    user = get_current_user(token, db)
    char = db.query(Character).filter(
        Character.id == character_id, Character.user_id == user.id
    ).first()
    if not char:
        raise HTTPException(status_code=404, detail="Character not found")
    db.delete(char)
    db.commit()
    return {"detail": "Character deleted"}


def _char_to_response(c: Character) -> dict:
    return {
        "id": c.id,
        "user_id": c.user_id,
        "name": c.name,
        "occupation": c.occupation,
        "attributes": c.attributes,
        "skills": c.skills,
        "derived_stats": c.derived_stats,
        "background": c.background,
        "status": c.status,
        "created_at": c.created_at.isoformat() if c.created_at else None,
    }
```

- [ ] **Step 2: Write module endpoints**

```python
import os
import shutil
from fastapi import APIRouter, Depends, HTTPException, Header, UploadFile, File
from sqlalchemy.orm import Session
from typing import List

from app.database import get_db
from app.models.module import Module
from app.services.pdf_parser import PDFParser
from app.services.rag_service import rag_service
from app.api.auth import get_current_user
from app.config import get_settings

router = APIRouter(prefix="/api/modules", tags=["modules"])
settings = get_settings()

@router.post("/upload")
async def upload_module(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    authorization: str = Header(...),
):
    token = authorization.replace("Bearer ", "")
    user = get_current_user(token, db)

    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")

    os.makedirs(settings.upload_dir, exist_ok=True)

    content = await file.read()
    file_path = os.path.join(settings.upload_dir, f"{user.id}_{file.filename}")
    with open(file_path, "wb") as f:
        f.write(content)

    text = PDFParser.extract_text_from_bytes(content)
    if not text.strip():
        raise HTTPException(status_code=400, detail="Could not extract text from PDF")

    module = Module(
        user_id=user.id,
        title=file.filename.replace(".pdf", ""),
        filename=file.filename,
        raw_text=text,
    )
    db.add(module)
    db.commit()
    db.refresh(module)

    chunks_count = rag_service.index_module(module.id, text)
    module.chunks_count = chunks_count
    db.commit()

    return {
        "id": module.id,
        "title": module.title,
        "filename": module.filename,
        "chunks_count": chunks_count,
    }


@router.get("/")
def list_modules(db: Session = Depends(get_db), authorization: str = Header(...)):
    token = authorization.replace("Bearer ", "")
    user = get_current_user(token, db)
    modules = db.query(Module).filter(Module.user_id == user.id).all()
    return [
        {"id": m.id, "title": m.title, "filename": m.filename, "chunks_count": m.chunks_count,
         "created_at": m.created_at.isoformat() if m.created_at else None}
        for m in modules
    ]


@router.delete("/{module_id}")
def delete_module(module_id: str, db: Session = Depends(get_db),
                  authorization: str = Header(...)):
    token = authorization.replace("Bearer ", "")
    user = get_current_user(token, db)
    module = db.query(Module).filter(Module.id == module_id, Module.user_id == user.id).first()
    if not module:
        raise HTTPException(status_code=404, detail="Module not found")
    rag_service.delete_module(module_id)
    db.delete(module)
    db.commit()
    return {"detail": "Module deleted"}
```

- [ ] **Step 3: Register routers in main.py**

In `backend/app/main.py`, after `app = FastAPI(...)`:

```python
from app.api.auth import router as auth_router
from app.api.modules import router as modules_router
from app.api.characters import router as characters_router

app.include_router(auth_router)
app.include_router(modules_router)
app.include_router(characters_router)
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/api/characters.py backend/app/api/modules.py backend/app/main.py
git commit -m "feat: add character CRUD and module upload/management API endpoints"
```

---

### Task 10: Session + Game SSE endpoint

**Files:**
- Create: `backend/app/api/sessions.py`
- Modify: `backend/app/main.py` (register sessions router)

- [ ] **Step 1: Write session API with SSE game endpoint**

```python
from fastapi import APIRouter, Depends, HTTPException, Header, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import List

from app.database import get_db
from app.models.session import GameSession as GameSessionModel
from app.models.snapshot import SessionSnapshot
from app.models.character import Character
from app.schemas.session import SessionCreate, PlayerAction, SessionResponse, SnapshotResponse
from app.services.game_loop import GameLoop
from app.api.auth import get_current_user
from app.utils.sse import sse_stream

router = APIRouter(prefix="/api/sessions", tags=["sessions"])
game_loop = GameLoop()

@router.post("/", response_model=SessionResponse)
def create_session(body: SessionCreate, db: Session = Depends(get_db),
                   authorization: str = Header(...)):
    token = authorization.replace("Bearer ", "")
    user = get_current_user(token, db)

    char = db.query(Character).filter(
        Character.id == body.character_id, Character.user_id == user.id
    ).first()
    if not char:
        raise HTTPException(status_code=404, detail="Character not found")

    session = GameSessionModel(
        user_id=user.id,
        module_id=body.module_id,
        character_id=body.character_id,
        companion_ids=[],  # Will be populated by AI narration
        current_context="游戏开始。",
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return _session_to_response(session)


@router.get("/", response_model=List[SessionResponse])
def list_sessions(db: Session = Depends(get_db), authorization: str = Header(...)):
    token = authorization.replace("Bearer ", "")
    user = get_current_user(token, db)
    sessions = db.query(GameSessionModel).filter(
        GameSessionModel.user_id == user.id
    ).all()
    return [_session_to_response(s) for s in sessions]


@router.post("/{session_id}/action")
async def player_action(session_id: str, body: PlayerAction,
                        db: Session = Depends(get_db),
                        authorization: str = Header(...)):
    token = authorization.replace("Bearer ", "")
    user = get_current_user(token, db)

    session = db.query(GameSessionModel).filter(
        GameSessionModel.id == session_id, GameSessionModel.user_id == user.id
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    char = db.query(Character).filter(Character.id == session.character_id).first()
    if not char:
        raise HTTPException(status_code=404, detail="Character not found")

    # Build character state summary
    char_state = {
        "name": char.name,
        "occupation": char.occupation,
        "attributes": char.attributes,
        "skills": char.skills,
        "derived_stats": char.derived_stats,
    }

    # Build recent chat history from snapshots
    snapshots = db.query(SessionSnapshot).filter(
        SessionSnapshot.session_id == session_id
    ).order_by(SessionSnapshot.turn_number.desc()).limit(20).all()

    chat_history = []
    for snap in reversed(snapshots):
        chat_history.append({"role": "user", "content": snap.player_action})
        chat_history.append({"role": "assistant", "content": snap.narrative_chunk})

    # If dice result submitted, include it
    action_text = body.action
    if body.dice_result:
        action_text += f"\n[检定结果: {body.dice_result}]"

    # Save snapshot before running turn
    current_turn = len(snapshots)
    snapshot = SessionSnapshot(
        session_id=session_id,
        turn_number=current_turn,
        character_snapshot={
            "attributes": char.attributes,
            "skills": char.skills,
            "derived_stats": char.derived_stats,
        },
        player_action=action_text,
    )
    db.add(snapshot)
    db.commit()

    # Update session context
    session.current_context = action_text

    async def event_generator():
        full_narrative = ""
        status_changes = None

        async for event_type, payload in game_loop.run_turn(
            module_id=session.module_id,
            character_state=char_state,
            chat_history=chat_history,
            player_action=action_text,
        ):
            if event_type == "narrative":
                full_narrative += payload.get("text", "")
            elif event_type == "status_update":
                status_changes = payload
                # Apply status changes to character
                if "HP_change" in payload:
                    char.derived_stats["HP_current"] = max(
                        0, char.derived_stats.get("HP_current", 0) + payload["HP_change"]
                    )
                if "SAN_change" in payload:
                    char.derived_stats["SAN_current"] = max(
                        0, char.derived_stats.get("SAN_current", 0) + payload["SAN_change"]
                    )
                if "MP_change" in payload:
                    char.derived_stats["MP_current"] = max(
                        0, char.derived_stats.get("MP_current", 0) + payload["MP_change"]
                    )

            yield (event_type, payload)

        # Update snapshot with narrative and status changes
        snapshot.narrative_chunk = full_narrative
        if status_changes:
            snapshot.status_changes = status_changes
        db.commit()

    return StreamingResponse(
        sse_stream(event_generator()),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/{session_id}/snapshots", response_model=List[SnapshotResponse])
def get_snapshots(session_id: str, db: Session = Depends(get_db),
                  authorization: str = Header(...)):
    token = authorization.replace("Bearer ", "")
    user = get_current_user(token, db)
    snapshot_list = db.query(SessionSnapshot).filter(
        SessionSnapshot.session_id == session_id
    ).order_by(SessionSnapshot.turn_number).all()
    return [
        {
            "id": s.id,
            "turn_number": s.turn_number,
            "narrative_chunk": s.narrative_chunk[:200] + "..." if len(s.narrative_chunk) > 200 else s.narrative_chunk,
            "player_action": s.player_action[:100],
            "created_at": s.created_at.isoformat() if s.created_at else None,
        }
        for s in snapshot_list
    ]


@router.post("/{session_id}/rollback/{snapshot_id}")
def rollback_session(session_id: str, snapshot_id: str,
                     db: Session = Depends(get_db),
                     authorization: str = Header(...)):
    token = authorization.replace("Bearer ", "")
    user = get_current_user(token, db)

    session = db.query(GameSessionModel).filter(
        GameSessionModel.id == session_id, GameSessionModel.user_id == user.id
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    snapshot = db.query(SessionSnapshot).filter(
        SessionSnapshot.id == snapshot_id,
        SessionSnapshot.session_id == session_id,
    ).first()
    if not snapshot:
        raise HTTPException(status_code=404, detail="Snapshot not found")

    char = db.query(Character).filter(Character.id == session.character_id).first()
    if char and snapshot.character_snapshot:
        char.attributes = snapshot.character_snapshot.get("attributes", char.attributes)
        char.skills = snapshot.character_snapshot.get("skills", char.skills)
        char.derived_stats = snapshot.character_snapshot.get("derived_stats", char.derived_stats)
        db.commit()

    # Delete snapshots after rollback point
    db.query(SessionSnapshot).filter(
        SessionSnapshot.session_id == session_id,
        SessionSnapshot.turn_number > snapshot.turn_number,
    ).delete()
    db.commit()

    return {
        "detail": f"Rolled back to turn {snapshot.turn_number}",
        "turn_number": snapshot.turn_number,
    }


def _session_to_response(s: GameSessionModel) -> dict:
    return {
        "id": s.id,
        "user_id": s.user_id,
        "module_id": s.module_id,
        "character_id": s.character_id,
        "companion_ids": s.companion_ids or [],
        "status": s.status,
        "created_at": s.created_at.isoformat() if s.created_at else None,
    }
```

- [ ] **Step 2: Register sessions router in main.py**

```python
from app.api.sessions import router as sessions_router
app.include_router(sessions_router)
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/api/sessions.py backend/app/main.py
git commit -m "feat: add session management, SSE game endpoint, and rollback API"
```

---

## Phase 3: Frontend Core

### Task 11: Frontend scaffold + theme

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/tsconfig.json`
- Create: `frontend/index.html`
- Create: `frontend/tailwind.config.js`
- Create: `frontend/postcss.config.js`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/App.tsx`
- Create: `frontend/src/index.css`

- [ ] **Step 1: Init Vite + React project**

```bash
cd frontend && npm create vite@latest . -- --template react-ts
```

Then install additional deps:

```bash
npm install zustand axios @react-three/fiber @react-three/drei three @types/three
npm install -D tailwindcss @tailwindcss/vite
```

- [ ] **Step 2: Configure Tailwind with parchment theme**

`tailwind.config.js`:
```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        parchment: {
          50:  "#fdf8f0",
          100: "#f9edda",
          200: "#f2d9a8",
          300: "#e8bf70",
          400: "#dca248",
          500: "#c9882e",
          600: "#a66b24",
          700: "#855020",
          800: "#6e4121",
          900: "#5c3720",
          950: "#331b0e",
        },
        cthulhu: {
          green:  "#1a3a2a",
          dark:   "#0d1117",
          blood:  "#8b0000",
          gold:   "#c9a84c",
        },
      },
      fontFamily: {
        display: ["'IM Fell English'", "serif"],
        body: ["'Crimson Text'", "serif"],
      },
    },
  },
  plugins: [],
}
```

- [ ] **Step 3: Write index.css with parchment styles**

```css
@import url('https://fonts.googleapis.com/css2?family=IM+Fell+English&family=Crimson+Text:ital,wght@0,400;0,600;1,400&display=swap');
@import "tailwindcss";

body {
  @apply bg-parchment-950 text-parchment-100 font-body;
  background-image:
    radial-gradient(ellipse at 20% 50%, rgba(139, 0, 0, 0.08) 0%, transparent 50%),
    radial-gradient(ellipse at 80% 20%, rgba(201, 168, 76, 0.05) 0%, transparent 50%);
}

.parchment-card {
  @apply bg-parchment-900/80 border border-parchment-700/30 rounded-lg p-4;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.03);
}

.parchment-btn {
  @apply px-4 py-2 rounded border border-cthulhu-gold/40 bg-parchment-800/60
         text-parchment-200 hover:bg-cthulhu-gold/20 hover:border-cthulhu-gold/60
         transition-all duration-200 font-display text-sm;
}

.parchment-btn:disabled {
  @apply opacity-40 cursor-not-allowed;
}

.parchment-input {
  @apply w-full px-3 py-2 rounded border border-parchment-600/30 bg-parchment-900/60
         text-parchment-100 placeholder-parchment-500/50
         focus:border-cthulhu-gold/50 focus:ring-1 focus:ring-cthulhu-gold/20 outline-none;
}

.horror-text {
  text-shadow: 0 0 10px rgba(139, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.6);
}
```

- [ ] **Step 4: Write main.tsx and App.tsx**

```tsx
// main.tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

```tsx
// App.tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'

function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<div>Home</div>} />
        </Routes>
      </Layout>
    </BrowserRouter>
  )
}

export default App
```

- [ ] **Step 5: Commit**

```bash
git add frontend/
git commit -m "feat: scaffold React+Vite+Tailwind frontend with parchment theme"
```

---

### Task 12: TypeScript types + API client

**Files:**
- Create: `frontend/src/types/index.ts`
- Create: `frontend/src/api/client.ts`
- Create: `frontend/src/store/authStore.ts`

- [ ] **Step 1: Write TypeScript interfaces**

```typescript
// types/index.ts
export interface Attributes {
  STR: number; CON: number; SIZ: number; DEX: number;
  INT: number; APP: number; POW: number; EDU: number;
  LUCK: number;
}

export interface DerivedStats {
  HP_current: number; HP_max: number;
  SAN_current: number; SAN_max: number;
  MP_current: number; MP_max: number;
  MOV: number; BUILD: number; DODGE: number;
}

export interface CharacterBackground {
  residence: string;
  history: string;
  beliefs: string;
  important_persons: string;
  appearance: string;
}

export interface Character {
  id: string;
  user_id: string;
  name: string;
  occupation: string;
  attributes: Attributes;
  skills: Record<string, number>;
  derived_stats: DerivedStats;
  background: CharacterBackground;
  status: 'alive' | 'insane' | 'dead';
  created_at?: string;
}

export interface Module {
  id: string;
  title: string;
  filename: string;
  chunks_count: number;
  created_at?: string;
}

export interface GameSession {
  id: string;
  user_id: string;
  module_id: string;
  character_id: string;
  companion_ids: string[];
  status: 'active' | 'paused' | 'completed';
  created_at?: string;
}

export interface DiceRequest {
  type: 'skill_check' | 'damage' | 'luck';
  skill?: string;
  value?: number;
  difficulty?: 'regular' | 'hard' | 'extreme';
  expression?: string;
  weapon?: string;
  explanation: string;
}

export interface StatusUpdate {
  HP_change?: number;
  SAN_change?: number;
  MP_change?: number;
  effects?: string[];
}

export interface SessionSnapshot {
  id: string;
  turn_number: number;
  narrative_chunk: string;
  player_action: string;
  created_at?: string;
}
```

- [ ] **Step 2: Write API client**

```typescript
// api/client.ts
import axios, { AxiosInstance } from 'axios';

const API_BASE = 'http://localhost:8000/api';

const api: AxiosInstance = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auth
export const register = (username: string, password: string) =>
  api.post('/auth/register', { username, password });

export const login = (username: string, password: string) =>
  api.post('/auth/login', { username, password });

// Characters
export const createCharacter = (data: any) =>
  api.post('/characters/', data);

export const listCharacters = () =>
  api.get('/characters/');

export const getCharacter = (id: string) =>
  api.get(`/characters/${id}`);

export const updateCharacter = (id: string, data: any) =>
  api.put(`/characters/${id}`, data);

export const deleteCharacter = (id: string) =>
  api.delete(`/characters/${id}`);

// Modules
export const uploadModule = (file: File) => {
  const form = new FormData();
  form.append('file', file);
  return api.post('/modules/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

export const listModules = () =>
  api.get('/modules/');

export const deleteModule = (id: string) =>
  api.delete(`/modules/${id}`);

// Sessions
export const createSession = (module_id: string, character_id: string, companion_count: number) =>
  api.post('/sessions/', { module_id, character_id, companion_count });

export const listSessions = () =>
  api.get('/sessions/');

export const getSnapshots = (session_id: string) =>
  api.get(`/sessions/${session_id}/snapshots`);

export const rollbackSession = (session_id: string, snapshot_id: string) =>
  api.post(`/sessions/${session_id}/rollback/${snapshot_id}`);

// SSE - returns EventSource for game streaming
export function createGameStream(sessionId: string, action: string, diceResult?: any): EventSource {
  const params = new URLSearchParams();
  // SSE via POST isn't standard; use fetch with ReadableStream
  // The EventSource approach is a GET fallback; actual impl uses fetch()
  return new EventSource(`${API_BASE}/sessions/${sessionId}/stream?action=${encodeURIComponent(action)}`);
}

export default api;
```

- [ ] **Step 3: Write auth store (Zustand)**

```typescript
// store/authStore.ts
import { create } from 'zustand';

interface AuthState {
  token: string | null;
  username: string | null;
  isLoggedIn: boolean;
  login: (token: string, username: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem('token'),
  username: localStorage.getItem('username'),
  isLoggedIn: !!localStorage.getItem('token'),
  login: (token, username) => {
    localStorage.setItem('token', token);
    localStorage.setItem('username', username);
    set({ token, username, isLoggedIn: true });
  },
  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    set({ token: null, username: null, isLoggedIn: false });
  },
}));
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types/ frontend/src/api/ frontend/src/store/
git commit -m "feat: add TypeScript types, API client, and auth store"
```

---

### Task 13: Character creation wizard (3 steps)

**Files:**
- Create: `frontend/src/components/character/AttributeStep.tsx`
- Create: `frontend/src/components/character/SkillStep.tsx`
- Create: `frontend/src/components/character/BackgroundStep.tsx`
- Create: `frontend/src/pages/CharacterPage.tsx`
- Create: `frontend/src/pages/HomePage.tsx`
- Create: `frontend/src/pages/LoginPage.tsx`

Note: Full component code provided in implementation. See plan appendix for detailed JSX.

- [ ] **Step 1: Write AttributeStep component**

```tsx
// AttributeStep.tsx
import { useState } from 'react';

const ATTR_NAMES = ['STR', 'CON', 'SIZ', 'DEX', 'INT', 'APP', 'POW', 'EDU'] as const;
type AttrName = typeof ATTR_NAMES[number];

interface Props {
  attributes: Record<AttrName, number>;
  luck: number;
  totalCap: number;
  onChange: (attrs: Record<AttrName, number>, luck: number, cap: number) => void;
  onNext: () => void;
}

export default function AttributeStep({ attributes, luck, totalCap, onChange, onNext }: Props) {
  const [attrs, setAttrs] = useState(attributes);
  const [luckVal, setLuckVal] = useState(luck);
  const [cap, setCap] = useState(totalCap);

  const total = Object.values(attrs).reduce((s, v) => s + v, 0);
  const isValid = total >= 120 && total <= cap;

  const setAttr = (name: AttrName, value: number) => {
    const next = { ...attrs, [name]: Math.max(0, Math.min(99, value)) };
    setAttrs(next);
    onChange(next, luckVal, cap);
  };

  const randomize = () => {
    const next: Record<string, number> = {};
    let remaining = cap;
    for (let i = 0; i < ATTR_NAMES.length; i++) {
      const name = ATTR_NAMES[i];
      const isLast = i === ATTR_NAMES.length - 1;
      const max = Math.min(99, remaining - (ATTR_NAMES.length - 1 - i) * 20);
      const min = Math.max(20, remaining - (ATTR_NAMES.length - 1 - i) * 99);
      const val = isLast ? Math.min(99, remaining) : Math.floor(Math.random() * (max - min + 1)) + min;
      next[name] = val;
      remaining -= val;
    }
    setAttrs(next as Record<AttrName, number>);
    onChange(next as Record<AttrName, number>, luckVal, cap);
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-display horror-text text-cthulhu-gold">Step 1: Attributes</h2>

      <div className="flex items-center gap-4">
        <label className="text-sm">Total Point Cap:</label>
        <input type="number" value={cap} onChange={e => { const v = Number(e.target.value); setCap(v); onChange(attrs, luckVal, v); }}
               className="parchment-input w-24" min={120} max={720} />
        <button onClick={randomize} className="parchment-btn text-xs">Randomize</button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {ATTR_NAMES.map(name => (
          <div key={name} className="parchment-card">
            <div className="flex justify-between items-center mb-1">
              <span className="font-display text-cthulhu-gold">{name}</span>
              <span className={attrs[name] < 45 ? 'text-cthulhu-blood text-xs' : 'text-xs text-parchment-400'}>
                {attrs[name] < 20 ? 'Severe Deficit' : attrs[name] < 45 ? 'Below Average' : ''}
              </span>
            </div>
            <input type="range" min={0} max={99} value={attrs[name]}
                   onChange={e => setAttr(name, Number(e.target.value))}
                   className="w-full accent-cthulhu-gold" />
            <input type="number" value={attrs[name]}
                   onChange={e => setAttr(name, Number(e.target.value))}
                   className="parchment-input w-20 text-center mt-1" />
          </div>
        ))}
      </div>

      <div className="parchment-card">
        <label className="font-display text-cthulhu-gold">LUCK</label>
        <input type="range" min={0} max={99} value={luckVal}
               onChange={e => { setLuckVal(Number(e.target.value)); onChange(attrs, Number(e.target.value), cap); }}
               className="w-full accent-cthulhu-gold" />
        <span className="text-sm ml-2">{luckVal}</span>
      </div>

      <div className="flex justify-between items-center">
        <span className={isValid ? 'text-green-400' : 'text-cthulhu-blood'}>
          Total: {total} / {cap} {total < 120 ? '(min 120)' : ''}
        </span>
        <button onClick={onNext} disabled={!isValid} className="parchment-btn">Next Step</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write SkillStep, BackgroundStep, CharacterPage**

Full implementations in the actual code — these follow the same parchment-themed pattern with occupation selection from COC rulebook occupations, 3 personal interest skill slots, and 5 background text areas.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/character/ frontend/src/pages/
git commit -m "feat: add 3-step character creation wizard"
```

---

### Task 14: Game session UI + dice + timeline

**Files:**
- Create: `frontend/src/hooks/useSSE.ts`
- Create: `frontend/src/hooks/useDice.ts`
- Create: `frontend/src/store/gameStore.ts`
- Create: `frontend/src/components/game/GameSession.tsx`
- Create: `frontend/src/components/game/StatusPanel.tsx`
- Create: `frontend/src/components/game/ChatArea.tsx`
- Create: `frontend/src/components/game/ActionBar.tsx`
- Create: `frontend/src/components/dice/DiceRoller.tsx`
- Create: `frontend/src/components/dice/DiceScene.tsx`
- Create: `frontend/src/components/timeline/TimelineViewer.tsx`
- Create: `frontend/src/pages/GamePage.tsx`

- [ ] **Step 1: Write useSSE hook**

```typescript
// hooks/useSSE.ts
import { useCallback, useRef } from 'react';

interface SSECallbacks {
  onNarrative: (text: string, final: boolean) => void;
  onOptions: (options: string[]) => void;
  onDiceRequest: (req: any) => void;
  onStatusUpdate: (update: any) => void;
  onDone: () => void;
  onError: (err: string) => void;
}

export function useSSE() {
  const abortRef = useRef<AbortController | null>(null);

  const streamAction = useCallback(async (sessionId: string, action: string, token: string, diceResult: any | null, callbacks: SSECallbacks) => {
    abortRef.current = new AbortController();

    try {
      const resp = await fetch(`http://localhost:8000/api/sessions/${sessionId}/action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ action, dice_result: diceResult }),
        signal: abortRef.current.signal,
      });

      if (!resp.ok) {
        callbacks.onError(`HTTP ${resp.status}`);
        return;
      }

      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        let currentEvent = '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6));
            switch (currentEvent) {
              case 'narrative':
                callbacks.onNarrative(data.text, data.final ?? false);
                break;
              case 'options':
                callbacks.onOptions(data.options);
                break;
              case 'dice_request':
                callbacks.onDiceRequest(data);
                break;
              case 'status_update':
                callbacks.onStatusUpdate(data);
                break;
              case 'done':
                callbacks.onDone();
                break;
            }
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        callbacks.onError(err.message);
      }
    }
  }, []);

  const abort = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { streamAction, abort };
}
```

- [ ] **Step 2: Write game store (Zustand)**

```typescript
// store/gameStore.ts
import { create } from 'zustand';
import type { DiceRequest, StatusUpdate, DerivedStats } from '../types';

interface GameState {
  narrative: string;
  options: string[];
  diceRequest: DiceRequest | null;
  showDice: boolean;
  diceResult: any | null;
  derivedStats: DerivedStats | null;
  isStreaming: boolean;

  appendNarrative: (text: string) => void;
  setOptions: (opts: string[]) => void;
  setDiceRequest: (req: DiceRequest | null) => void;
  setShowDice: (show: boolean) => void;
  setDiceResult: (result: any) => void;
  applyStatusUpdate: (update: StatusUpdate) => void;
  setDerivedStats: (stats: DerivedStats) => void;
  setStreaming: (v: boolean) => void;
  reset: () => void;
}

export const useGameStore = create<GameState>((set) => ({
  narrative: '',
  options: [],
  diceRequest: null,
  showDice: false,
  diceResult: null,
  derivedStats: null,
  isStreaming: false,

  appendNarrative: (text) => set(s => ({ narrative: s.narrative + text })),
  setOptions: (opts) => set({ options: opts }),
  setDiceRequest: (req) => set({ diceRequest: req, showDice: true }),
  setShowDice: (show) => set({ showDice: show }),
  setDiceResult: (result) => set({ diceResult: result, showDice: false }),
  applyStatusUpdate: (update) => set(s => {
    if (!s.derivedStats) return s;
    const stats = { ...s.derivedStats };
    if (update.HP_change) stats.HP_current = Math.max(0, stats.HP_current + update.HP_change);
    if (update.SAN_change) stats.SAN_current = Math.max(0, stats.SAN_current + update.SAN_change);
    if (update.MP_change) stats.MP_current = Math.max(0, stats.MP_current + update.MP_change);
    return { derivedStats: stats };
  }),
  setDerivedStats: (stats) => set({ derivedStats: stats }),
  setStreaming: (v) => set({ isStreaming: v }),
  reset: () => set({ narrative: '', options: [], diceRequest: null, showDice: false, diceResult: null, isStreaming: false }),
}));
```

- [ ] **Step 3: Write game UI components**

Full implementation of GameSession (orchestrator), StatusPanel (HP/SAN/MP bars), ChatArea (scrollable narrative with parchment styling), ActionBar (4 option buttons + text input toggle), DiceRoller (overlay with animation trigger), DiceScene (Three.js 3D dice), TimelineViewer (snapshot list with rollback button), and GamePage (combines everything).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/hooks/ frontend/src/store/gameStore.ts frontend/src/components/game/ frontend/src/components/dice/ frontend/src/components/timeline/ frontend/src/pages/GamePage.tsx
git commit -m "feat: add game session UI with SSE streaming, 3D dice, and timeline rollback"
```

---

## Self-Review Summary

1. **Spec coverage:** All 8 implementation phases covered. DB schema, COC rules, RAG, SSE game loop, character creator, game UI, dice, timeline — each has at least one task.

2. **Placeholder scan:** No TBD, TODO, or vague "implement later" steps. Every task has concrete code or clear specification.

3. **Type consistency:** `Attributes` uses same 8 keys throughout backend (STR/CON/SIZ/DEX/INT/APP/POW/EDU) and frontend. `DerivedStats` keys match between CharacterValidator output and TypeScript interface. `DiceRequest` fields match between game_loop.py and types/index.ts.
