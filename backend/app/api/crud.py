"""Small CRUD router factory for the world-building tables."""

from collections.abc import Callable
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, SQLModel, select

from app.db import get_db


def crud_router(
    model: type[SQLModel],
    base: type[SQLModel],
    path: str,
    tag: str,
    parent_field: str | None = None,
    on_delete: Callable[[Session, Any], None] | None = None,
) -> APIRouter:
    """Routes: GET {path}[?parent], POST {path}, GET/PATCH/DELETE {path}/{id}."""
    router = APIRouter(tags=[tag])
    order_column = getattr(model, "order", None) if parent_field == "scenario_id" and hasattr(model, "order") else None

    @router.get(path)
    def list_items(scenario_id: int | None = None, db: Session = Depends(get_db)) -> list[dict[str, Any]]:
        query = select(model)
        if parent_field and scenario_id is not None:
            query = query.where(getattr(model, parent_field) == scenario_id)
        query = query.order_by(order_column if order_column is not None else model.id)
        return [item.model_dump() for item in db.exec(query)]

    @router.post(path)
    def create_item(payload: base, db: Session = Depends(get_db)) -> dict[str, Any]:  # type: ignore[valid-type]
        item = model.model_validate(payload.model_dump())
        db.add(item)
        db.commit()
        db.refresh(item)
        return item.model_dump()

    @router.get(path + "/{item_id}")
    def get_item(item_id: int, db: Session = Depends(get_db)) -> dict[str, Any]:
        item = db.get(model, item_id)
        if item is None:
            raise HTTPException(404, f"{tag} {item_id} not found")
        return item.model_dump()

    @router.patch(path + "/{item_id}")
    def update_item(item_id: int, payload: dict[str, Any], db: Session = Depends(get_db)) -> dict[str, Any]:
        item = db.get(model, item_id)
        if item is None:
            raise HTTPException(404, f"{tag} {item_id} not found")
        allowed = set(base.model_fields) - ({parent_field} if parent_field else set())
        data = base.model_validate({**item.model_dump(), **{k: v for k, v in payload.items() if k in allowed}})
        for key in allowed:
            setattr(item, key, getattr(data, key))
        db.add(item)
        db.commit()
        db.refresh(item)
        return item.model_dump()

    @router.delete(path + "/{item_id}")
    def delete_item(item_id: int, db: Session = Depends(get_db)) -> dict[str, bool]:
        item = db.get(model, item_id)
        if item is None:
            raise HTTPException(404, f"{tag} {item_id} not found")
        if on_delete is not None:
            on_delete(db, item)
        db.delete(item)
        db.commit()
        return {"ok": True}

    return router
