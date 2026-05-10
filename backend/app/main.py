import os
os.environ.setdefault("CHROMA_TELEMETRY_IMPL", "none")
os.environ.setdefault("ANONYMIZED_TELEMETRY", "False")

from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.database import engine, Base

from app.api.auth import router as auth_router
from app.api.modules import router as modules_router
from app.api.characters import router as characters_router
from app.api.sessions import router as sessions_router
from app.api.locations import router as locations_router
from app.api.settings import router as settings_router
from app.api.cards import router as cards_router
from app.api.saves import router as saves_router
from app.api.lorebooks import router as lorebooks_router
from app.api.personas import router as personas_router
from app.models.location import Location  # noqa: F401
from app.models.character_card import CharacterCard  # noqa: F401
from app.models.game_save import GameSave  # noqa: F401
from app.models.lorebook import Lorebook, LorebookEntry  # noqa: F401
from app.models.user_persona import UserPersona  # noqa: F401


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    # Run safe migrations (only apply if column is missing)
    from sqlalchemy import inspect
    from sqlalchemy import text as sa_text
    with engine.connect() as conn:
        inspector = inspect(conn)
        if 'character_cards' in inspector.get_table_names():
            cols = [c['name'] for c in inspector.get_columns('character_cards')]
            if 'first_message' not in cols:
                try:
                    conn.execute(sa_text("ALTER TABLE character_cards ADD COLUMN first_message TEXT DEFAULT ''"))
                    conn.commit()
                except Exception:
                    conn.rollback()
    yield


app = FastAPI(title="COC Solo TRPG Simulator", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(modules_router)
app.include_router(characters_router)
app.include_router(sessions_router)
app.include_router(locations_router)
app.include_router(settings_router)
app.include_router(cards_router)
app.include_router(saves_router)
app.include_router(lorebooks_router)
app.include_router(personas_router)


# Serve uploaded/generated files
uploads_dir = Path("uploads")
uploads_dir.mkdir(parents=True, exist_ok=True)
app.mount("/api/uploads", StaticFiles(directory=str(uploads_dir)), name="uploads")


@app.get("/api/health")
def health():
    return {"status": "ok", "version": "0.1.0"}
