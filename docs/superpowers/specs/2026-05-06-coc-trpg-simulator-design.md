# COC Solo TRPG Simulator — Design Spec

**Date:** 2026-05-06
**Status:** Approved → Implementation

## Overview

A full-stack web app for solo Call of Cthulhu 7th Edition TRPG sessions. Backend acts as Keeper (game master), using RAG to feed PDF module content to an LLM, enforcing COC 7e rules, and streaming narrative via SSE. Frontend renders the game UI with 3D dice.

## Architecture

```
Frontend (React+Vite+Tailwind) ←REST+SSE→ FastAPI Backend ←→ SQLite/PostgreSQL + ChromaDB
                                              ↕
                                         LLM API (Anthropic/OpenAI/Ollama)
```

- **Frontend never calls LLM directly.** All AI traffic goes through backend.
- **Backend is the sole rules authority.** Dice results, stat changes, validation — all server-side.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, Tailwind CSS, React Three Fiber (3D dice) |
| Backend | Python 3.12+, FastAPI, SQLAlchemy, Alembic |
| Database | SQLite (default) / PostgreSQL (configurable) |
| Vector Store | ChromaDB (embedded) |
| LLM SDK | Provider-agnostic adapter (Anthropic, OpenAI, Ollama) |
| Auth | JWT (access + refresh tokens) |

## Database Schema

5 core tables: **users**, **modules** (PDF metadata), **characters** (full sheet as JSONB), **sessions** (game state), **session_snapshots** (time machine rollback).

Plus **module_chunks** in ChromaDB for vector search.

## COC 7e Rules Engine

- d100 for skill/attribute checks: Critical (1), Extreme (≤1/5), Hard (≤1/2), Regular (≤skill), Failure (>skill), Fumble (96-100 if skill<50, 100 if skill≥50)
- d3/d4/d6/d8/d10/d12/d20 for damage, SAN loss, random events
- Character creation: 8 attributes (STR/CON/SIZ/DEX/INT/APP/POW/EDU), range 0-99 each, total 120-720 cap. LUCK separate. Occupation skills + 3 personal interest skills.
- All validation server-side (anti-cheat).

## Game Loop (SSE)

1. Player action → POST /api/session/{id}/action
2. Backend: RAG retrieval → prompt construction → LLM stream via SSE
3. SSE events: `narrative` (text chunk), `dice_request` (need roll), `options` (4 choices), `status_update` (HP/SAN/etc)
4. Frontend buffers JSON before parsing, streams narrative text immediately

## Rollback (Time Machine)

Every turn saved as `session_snapshots` row. Player browses history, selects turn N → session state + character rolled back to that point.

## Implementation Phases

1. Backend skeleton + DB models + migrations
2. COC dice engine + character validation
3. PDF parsing + RAG pipeline (ChromaDB)
4. LLM orchestrator + SSE game loop
5. Frontend skeleton + character creator
6. Game session UI + dice animations
7. Timeline viewer + rollback
8. Polish (theming, accessibility, edge cases)
