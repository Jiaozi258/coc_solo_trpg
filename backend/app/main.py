import os
os.environ.setdefault("CHROMA_TELEMETRY_IMPL", "none")
os.environ.setdefault("ANONYMIZED_TELEMETRY", "False")

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import engine, Base

from app.api.auth import router as auth_router
from app.api.modules import router as modules_router
from app.api.characters import router as characters_router
from app.api.sessions import router as sessions_router
from app.api.locations import router as locations_router
from app.models.location import Location  # noqa: F401


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
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


@app.get("/api/health")
def health():
    return {"status": "ok", "version": "0.1.0"}
