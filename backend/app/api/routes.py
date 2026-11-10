"""API routes: preset + global rules, sessions (SSE turns), memory, labels, import, models."""

import json
from collections.abc import AsyncIterator
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlmodel import Session, select

from app.api.crud import crud_router
from app.clients.openrouter import OpenRouterError
from app.db import get_db
from app.harness.orchestrator import Harness, initial_labels, opening_message
from app.importers.sillytavern import CardError, card_to_entities, parse_card_bytes
from app.models import (
    Character,
    CharacterBase,
    GlobalRule,
    GlobalRuleBase,
    LoreEntry,
    LoreEntryBase,
    MemoryItem,
    MemoryItemBase,
    Message,
    Persona,
    PersonaBase,
    PromptPreset,
    PromptPresetBase,
    RoleplaySession,
    Scenario,
    ScenarioBase,
    SessionBase,
    TurnTrace,
)
from app.prompt.blocks import BLOCK_LABELS, REQUIRED_BLOCKS, normalize_block_order
from app.sage.labels import Label, LabelSet
from app.sage.registry import REGISTRY

router = APIRouter(prefix="/api")


def harness_of(request: Request) -> Harness:
    return request.app.state.harness


# ----------------------------------------------------------------- world building


def _delete_scenario_children(db: Session, scenario: Scenario) -> None:
    for model in (Character, LoreEntry, Persona):
        for row in db.exec(select(model).where(model.scenario_id == scenario.id)):
            db.delete(row)
    for session in db.exec(select(RoleplaySession).where(RoleplaySession.scenario_id == scenario.id)):
        _delete_session_children(db, session)
        db.delete(session)


def _delete_session_children(db: Session, session: RoleplaySession) -> None:
    for model in (Message, MemoryItem, TurnTrace):
        for row in db.exec(select(model).where(model.session_id == session.id)):
            db.delete(row)


router.include_router(crud_router(Scenario, ScenarioBase, "/scenarios", "scenario", on_delete=_delete_scenario_children))
router.include_router(crud_router(Character, CharacterBase, "/characters", "character", parent_field="scenario_id"))
router.include_router(crud_router(LoreEntry, LoreEntryBase, "/lore", "lore", parent_field="scenario_id"))
router.include_router(crud_router(Persona, PersonaBase, "/personas", "persona", parent_field="scenario_id"))


# ----------------------------------------------------------------- preset + global rules


def _preset(db: Session) -> PromptPreset:
    preset = db.exec(select(PromptPreset).order_by(PromptPreset.id)).first()
    if preset is None:
        raise HTTPException(500, "no prompt preset")
    return preset


@router.get("/preset")
def get_preset(db: Session = Depends(get_db)) -> dict[str, Any]:
    preset = _preset(db)
    data = preset.model_dump()
    data["block_order"] = normalize_block_order(preset.block_order)
    data["block_labels"] = BLOCK_LABELS
    data["required_blocks"] = sorted(REQUIRED_BLOCKS)
    return data


@router.put("/preset")
def update_preset(payload: dict[str, Any], db: Session = Depends(get_db)) -> dict[str, Any]:
    preset = _preset(db)
    allowed = set(PromptPresetBase.model_fields)
    data = PromptPresetBase.model_validate({**preset.model_dump(), **{k: v for k, v in payload.items() if k in allowed}})
    for key in allowed:
        setattr(preset, key, getattr(data, key))
    preset.block_order = normalize_block_order(preset.block_order)
    if preset.sage_reasoning not in ("off", "auto", "on"):
        raise HTTPException(400, "sage_reasoning must be off, auto or on")
    db.add(preset)
    db.commit()
    return get_preset(db)


router.include_router(crud_router(GlobalRule, GlobalRuleBase, "/rules", "rule"))


# ----------------------------------------------------------------- sessions


class SessionCreate(SessionBase):
    pass


@router.get("/sessions")
def list_sessions(scenario_id: int | None = None, db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    query = select(RoleplaySession).order_by(RoleplaySession.created_at.desc())
    if scenario_id is not None:
        query = query.where(RoleplaySession.scenario_id == scenario_id)
    return [s.model_dump() for s in db.exec(query)]


@router.post("/sessions")
def create_session(payload: SessionCreate, db: Session = Depends(get_db)) -> dict[str, Any]:
    scenario = db.get(Scenario, payload.scenario_id)
    if scenario is None:
        raise HTTPException(404, "scenario not found")
    persona = db.get(Persona, payload.persona_id) if payload.persona_id else None
    if payload.persona_id and (persona is None or persona.scenario_id != scenario.id):
        raise HTTPException(400, "persona does not belong to this scenario")
    characters = list(db.exec(select(Character).where(Character.scenario_id == scenario.id).order_by(Character.id)))
    session = RoleplaySession.model_validate(payload.model_dump())
    session.title = session.title or scenario.title
    session.labels = initial_labels(characters).model_dump()
    db.add(session)
    db.commit()
    db.refresh(session)
    result = session.model_dump()  # read before the next commit expires the instance
    text = opening_message(scenario, characters, persona)
    if text:
        db.add(Message(session_id=session.id, turn_index=0, role="assistant", content=text))
        db.commit()
    return result


def _session(db: Session, session_id: int) -> RoleplaySession:
    session = db.get(RoleplaySession, session_id)
    if session is None:
        raise HTTPException(404, "session not found")
    return session


@router.get("/sessions/{session_id}")
def get_session(session_id: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    return _session(db, session_id).model_dump()


@router.patch("/sessions/{session_id}")
def update_session(session_id: int, payload: dict[str, Any], db: Session = Depends(get_db)) -> dict[str, Any]:
    session = _session(db, session_id)
    for key in ("title", "model", "persona_id", "authors_note", "authors_note_depth", "authors_note_frequency", "summary", "pacing_note"):
        if key in payload:
            setattr(session, key, payload[key])
    db.add(session)
    db.commit()
    db.refresh(session)
    return session.model_dump()


@router.delete("/sessions/{session_id}")
def delete_session(session_id: int, db: Session = Depends(get_db)) -> dict[str, bool]:
    session = _session(db, session_id)
    _delete_session_children(db, session)
    db.delete(session)
    db.commit()
    return {"ok": True}


@router.get("/sessions/{session_id}/messages")
def list_messages(session_id: int, db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    _session(db, session_id)
    rows = db.exec(select(Message).where(Message.session_id == session_id).order_by(Message.turn_index, Message.id))
    return [m.model_dump() for m in rows]


@router.patch("/messages/{message_id}")
def edit_message(message_id: int, payload: dict[str, Any], db: Session = Depends(get_db)) -> dict[str, Any]:
    message = db.get(Message, message_id)
    if message is None:
        raise HTTPException(404, "message not found")
    if "content" in payload:
        message.content = str(payload["content"])
        message.blocked = False
    db.add(message)
    db.commit()
    db.refresh(message)
    return message.model_dump()


@router.delete("/messages/{message_id}")
def delete_message(message_id: int, db: Session = Depends(get_db)) -> dict[str, bool]:
    message = db.get(Message, message_id)
    if message is None:
        raise HTTPException(404, "message not found")
    db.delete(message)
    db.commit()
    return {"ok": True}


class TurnRequest(BaseModel):
    text: str = ""


async def _sse(events: AsyncIterator[dict[str, Any]]) -> AsyncIterator[str]:
    try:
        async for event in events:
            yield f"event: {event['event']}\ndata: {json.dumps(event['data'], default=str)}\n\n"
    except Exception as exc:  # report, then end the stream
        yield f"event: error\ndata: {json.dumps({'message': f'harness error: {exc}'})}\n\n"


def _stream(events: AsyncIterator[dict[str, Any]]) -> StreamingResponse:
    return StreamingResponse(
        _sse(events),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/sessions/{session_id}/turn")
async def turn(session_id: int, payload: TurnRequest, request: Request) -> StreamingResponse:
    return _stream(harness_of(request).run_turn(session_id, payload.text))


@router.post("/sessions/{session_id}/regenerate")
async def regenerate(session_id: int, request: Request) -> StreamingResponse:
    return _stream(harness_of(request).run_turn(session_id, None, regenerate=True))


class PreviewRequest(BaseModel):
    text: str = ""
    call_sage: bool = False


@router.post("/sessions/{session_id}/prompt-preview")
async def prompt_preview(session_id: int, payload: PreviewRequest, request: Request) -> dict[str, Any]:
    try:
        return await harness_of(request).preview(session_id, payload.text, payload.call_sage)
    except LookupError as exc:
        raise HTTPException(404, str(exc)) from exc


@router.get("/sessions/{session_id}/traces")
def list_traces(session_id: int, limit: int = 20, db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    rows = db.exec(
        select(TurnTrace).where(TurnTrace.session_id == session_id).order_by(TurnTrace.id.desc()).limit(limit)
    )
    return [t.model_dump() for t in rows]


# ----------------------------------------------------------------- memory


@router.get("/sessions/{session_id}/memory")
def list_memory(session_id: int, db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    rows = db.exec(select(MemoryItem).where(MemoryItem.session_id == session_id).order_by(MemoryItem.id.desc()))
    return [m.model_dump() for m in rows]


@router.post("/sessions/{session_id}/memory")
def add_memory(session_id: int, payload: MemoryItemBase, db: Session = Depends(get_db)) -> dict[str, Any]:
    session = _session(db, session_id)
    item = MemoryItem(**payload.model_dump(), session_id=session_id, source_turn=session.turn_count)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item.model_dump()


@router.patch("/memory/{item_id}")
def update_memory(item_id: int, payload: dict[str, Any], db: Session = Depends(get_db)) -> dict[str, Any]:
    item = db.get(MemoryItem, item_id)
    if item is None:
        raise HTTPException(404, "memory item not found")
    data = MemoryItemBase.model_validate({**item.model_dump(), **{k: v for k, v in payload.items() if k in MemoryItemBase.model_fields}})
    for key in MemoryItemBase.model_fields:
        setattr(item, key, getattr(data, key))
    db.add(item)
    db.commit()
    db.refresh(item)
    return item.model_dump()


@router.delete("/memory/{item_id}")
def delete_memory(item_id: int, db: Session = Depends(get_db)) -> dict[str, bool]:
    item = db.get(MemoryItem, item_id)
    if item is None:
        raise HTTPException(404, "memory item not found")
    db.delete(item)
    db.commit()
    return {"ok": True}


# ----------------------------------------------------------------- labels


@router.get("/sessions/{session_id}/labels")
def get_labels(session_id: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    session = _session(db, session_id)
    return {
        "labels": LabelSet.from_json(session.labels).model_dump(),
        "registry": [
            {"key": s.key, "kind": s.kind, "phase": s.phase, "null_policy": s.null_policy,
             "renders_to": s.renders_to, "threshold": s.threshold, "lockable": s.lockable}
            for s in REGISTRY
        ],
    }


class LabelPatch(BaseModel):
    key: str
    value: Any = None
    locked: bool = True


@router.patch("/sessions/{session_id}/labels")
def patch_label(session_id: int, payload: LabelPatch, db: Session = Depends(get_db)) -> dict[str, Any]:
    """Lock a label to a user value, or unlock it (locked=false keeps the value)."""
    session = _session(db, session_id)
    lockable = {s.key for s in REGISTRY if s.lockable}
    if payload.key not in lockable:
        raise HTTPException(400, f"label {payload.key} cannot be set by the user")
    labels = LabelSet.from_json(session.labels)
    current = labels.get(payload.key)
    if payload.locked:
        labels.put(Label(key=payload.key, value=payload.value, certainty="high", source="user", turn=session.turn_count, locked=True))
    elif current is not None:
        labels.put(current.model_copy(update={"locked": False}))
    session.labels = labels.model_dump()
    db.add(session)
    db.commit()
    return labels.model_dump()


# ----------------------------------------------------------------- import, models, health


@router.post("/import/card")
async def import_card(file: UploadFile = File(...), db: Session = Depends(get_db)) -> dict[str, Any]:
    data = await file.read()
    if len(data) > 20 * 1024 * 1024:
        raise HTTPException(413, "file is larger than 20 MB")
    try:
        entities = card_to_entities(parse_card_bytes(data, file.filename or ""))
    except CardError as exc:
        raise HTTPException(400, str(exc)) from exc
    scenario = Scenario(**entities["scenario"])
    db.add(scenario)
    db.commit()
    db.refresh(scenario)
    result = scenario.model_dump()
    db.add(Character(**entities["character"], scenario_id=scenario.id))
    for entry in entities["lore"]:
        db.add(LoreEntry(**entry, scenario_id=scenario.id))
    db.commit()
    return {"scenario": result, "lore_count": len(entities["lore"])}


@router.get("/models")
async def list_models(request: Request) -> list[dict[str, Any]]:
    try:
        return await harness_of(request).openrouter.list_models()
    except OpenRouterError as exc:
        raise HTTPException(502, str(exc)) from exc


@router.get("/health")
async def health(request: Request) -> dict[str, Any]:
    harness = harness_of(request)
    return {
        "ok": True,
        "openrouter_configured": harness.openrouter.configured,
        "sage_configured": harness.sage.configured,
        "sage_ready": await harness.sage.ready(),
        "default_model": harness.settings.default_model,
        "summary_model": harness.settings.summary_model,
    }
