from fastapi import APIRouter, Depends, HTTPException, Header
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
from app.utils.sse import sse_stream, estimate_tokens

from app.models.module import Module

router = APIRouter(prefix="/api/sessions", tags=["sessions"])
game_loop = GameLoop()


@router.post("/", response_model=SessionResponse)
def create_session(
    body: SessionCreate,
    db: Session = Depends(get_db),
    authorization: str = Header(...),
):
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
        companion_ids=[],
        current_context="游戏开始。",
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return _session_to_response(session)


@router.get("/{session_id}")
def get_session(
    session_id: str,
    db: Session = Depends(get_db),
    authorization: str = Header(...),
):
    token = authorization.replace("Bearer ", "")
    user = get_current_user(token, db)

    session = db.query(GameSessionModel).filter(
        GameSessionModel.id == session_id, GameSessionModel.user_id == user.id
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    char = db.query(Character).filter(Character.id == session.character_id).first()
    mod = db.query(Module).filter(Module.id == session.module_id).first()

    char_data = None
    if char:
        char_data = {
            "id": char.id,
            "name": char.name,
            "occupation": char.occupation,
            "attributes": char.attributes,
            "skills": char.skills,
            "derived_stats": char.derived_stats,
            "background": char.background,
            "status": char.status,
        }

    return {
        "id": session.id,
        "user_id": session.user_id,
        "module_id": session.module_id,
        "character_id": session.character_id,
        "companion_ids": session.companion_ids or [],
        "status": session.status,
        "module_title": mod.title if mod else "",
        "character": char_data,
        "created_at": session.created_at.isoformat() if session.created_at else None,
    }


@router.get("/", response_model=List[SessionResponse])
def list_sessions(
    db: Session = Depends(get_db),
    authorization: str = Header(...),
):
    token = authorization.replace("Bearer ", "")
    user = get_current_user(token, db)
    sessions = db.query(GameSessionModel).filter(
        GameSessionModel.user_id == user.id
    ).all()
    return [_session_to_response(s) for s in sessions]


@router.post("/{session_id}/action")
async def player_action(
    session_id: str,
    body: PlayerAction,
    db: Session = Depends(get_db),
    authorization: str = Header(...),
):
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

    char_state = {
        "name": char.name,
        "occupation": char.occupation,
        "attributes": char.attributes,
        "skills": char.skills,
        "derived_stats": char.derived_stats,
    }

    snapshots = (
        db.query(SessionSnapshot)
        .filter(SessionSnapshot.session_id == session_id)
        .order_by(SessionSnapshot.turn_number.desc())
        .limit(20)
        .all()
    )

    chat_history: list[dict] = []
    for snap in reversed(snapshots):
        chat_history.append({"role": "user", "content": snap.player_action})
        chat_history.append({"role": "assistant", "content": snap.narrative_chunk})

    action_text = body.action
    if body.dice_result:
        # Resolve dice result if a dice request was pending
        action_text += f"\n[检定结果: {body.dice_result}]"

    current_turn = len(snapshots)
    dice_result_data = body.dice_result or {}
    snapshot = SessionSnapshot(
        session_id=session_id,
        turn_number=current_turn,
        character_snapshot={
            "attributes": dict(char.attributes or {}),
            "skills": dict(char.skills or {}),
            "derived_stats": dict(char.derived_stats or {}),
        },
        player_action=action_text,
        dice_results=dice_result_data,
    )
    db.add(snapshot)
    db.flush()

    async def event_generator():
        full_narrative = ""
        status_changes = None
        output_chars = 0

        try:
            async for event_type, payload in game_loop.run_turn(
                module_id=session.module_id,
                character_state=char_state,
                chat_history=chat_history,
                player_action=action_text,
            ):
                if event_type == "narrative":
                    text = payload.get("text", "")
                    if payload.get("final"):
                        full_narrative = text
                    else:
                        full_narrative += text
                    output_chars += len(text)
                    yield (event_type, payload)
                elif event_type == "status_update":
                    status_changes = payload
                    ds = dict(char.derived_stats)
                    if "HP_change" in payload:
                        ds["HP_current"] = max(0, min(
                            ds.get("HP_max", 99),
                            ds.get("HP_current", 0) + payload["HP_change"],
                        ))
                    if "SAN_change" in payload:
                        ds["SAN_current"] = max(0, min(
                            ds.get("SAN_max", 99),
                            ds.get("SAN_current", 0) + payload["SAN_change"],
                        ))
                    if "MP_change" in payload:
                        ds["MP_current"] = max(0, min(
                            ds.get("MP_max", 99),
                            ds.get("MP_current", 0) + payload["MP_change"],
                        ))
                    char.derived_stats = ds
                    yield (event_type, payload)
                elif event_type == "done":
                    # Emit token usage before done (sse_stream returns on done)
                    system_prompt = game_loop.build_system_prompt(session.module_id, char_state, action_text)
                    input_text = system_prompt + " " + " ".join(m.get("content", "") for m in chat_history) + " " + action_text
                    est_input = estimate_tokens(input_text)
                    est_output = estimate_tokens(output_chars)
                    yield ("usage", {"input_tokens": est_input, "output_tokens": est_output, "total_tokens": est_input + est_output})
                    yield (event_type, payload)
                else:
                    yield (event_type, payload)
        except Exception as e:
            yield ("error", {"detail": str(e)})
            db.rollback()
            return

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
def get_snapshots(
    session_id: str,
    db: Session = Depends(get_db),
    authorization: str = Header(...),
):
    token = authorization.replace("Bearer ", "")
    user = get_current_user(token, db)
    snapshots = (
        db.query(SessionSnapshot)
        .join(GameSessionModel)
        .filter(SessionSnapshot.session_id == session_id, GameSessionModel.user_id == user.id)
        .order_by(SessionSnapshot.turn_number)
        .all()
    )
    result = []
    for s in snapshots:
        narrative_preview = s.narrative_chunk or ""
        if len(narrative_preview) > 200:
            narrative_preview = narrative_preview[:200] + "..."
        result.append({
            "id": s.id,
            "turn_number": s.turn_number,
            "narrative_chunk": narrative_preview,
            "player_action": (s.player_action or "")[:100],
            "created_at": s.created_at.isoformat() if s.created_at else None,
        })
    return result


@router.post("/{session_id}/rollback/{snapshot_id}")
def rollback_session(
    session_id: str,
    snapshot_id: str,
    db: Session = Depends(get_db),
    authorization: str = Header(...),
):
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

    db.query(SessionSnapshot).filter(
        SessionSnapshot.session_id == session_id,
        SessionSnapshot.turn_number > snapshot.turn_number,
    ).delete()
    db.commit()

    return {
        "detail": f"Rolled back to turn {snapshot.turn_number}",
        "turn_number": snapshot.turn_number,
    }


@router.delete("/{session_id}")
async def delete_session(session_id: str, db: Session = Depends(get_db), authorization: str = Header(...)):
    """Delete a game session and its snapshots."""
    token = authorization.replace("Bearer ", "")
    get_current_user(token, db)

    session = db.query(GameSessionModel).filter(GameSessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Delete all snapshots for this session
    db.query(SessionSnapshot).filter(SessionSnapshot.session_id == session_id).delete()
    # Delete the session itself
    db.delete(session)
    db.commit()

    return {"detail": "Session deleted"}


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
