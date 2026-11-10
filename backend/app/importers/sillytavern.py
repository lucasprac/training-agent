"""SillyTavern character card import (V2 / V3 JSON, or PNG with a tEXt "chara" chunk).

Only the standard library is used. The card becomes a scenario with one character;
an embedded `character_book` becomes the scenario lorebook.
"""

import base64
import json
import struct
import zlib
from typing import Any

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


class CardError(ValueError):
    pass


def _png_text_chunks(data: bytes) -> dict[str, str]:
    if not data.startswith(PNG_SIGNATURE):
        raise CardError("not a PNG file")
    chunks: dict[str, str] = {}
    pos = len(PNG_SIGNATURE)
    while pos + 8 <= len(data):
        length, ctype = struct.unpack(">I4s", data[pos : pos + 8])
        body = data[pos + 8 : pos + 8 + length]
        pos += 12 + length
        if ctype == b"tEXt" and b"\x00" in body:
            key, value = body.split(b"\x00", 1)
            chunks[key.decode("latin-1").lower()] = value.decode("latin-1")
        elif ctype == b"zTXt" and b"\x00" in body:
            key, rest = body.split(b"\x00", 1)
            chunks[key.decode("latin-1").lower()] = zlib.decompress(rest[1:]).decode("latin-1")
        elif ctype == b"IEND":
            break
    return chunks


def parse_card_bytes(data: bytes, filename: str = "") -> dict[str, Any]:
    if data.startswith(PNG_SIGNATURE):
        chunks = _png_text_chunks(data)
        encoded = chunks.get("ccv3") or chunks.get("chara")
        if not encoded:
            raise CardError("PNG has no character card data")
        try:
            return json.loads(base64.b64decode(encoded).decode("utf-8"))
        except (ValueError, UnicodeDecodeError) as exc:
            raise CardError("card data in PNG is not valid") from exc
    try:
        return json.loads(data.decode("utf-8-sig"))
    except (ValueError, UnicodeDecodeError) as exc:
        raise CardError(f"{filename or 'file'} is not a JSON card or PNG card") from exc


def _position(ext: dict[str, Any], entry: dict[str, Any]) -> tuple[str, int, str]:
    """Map ST numeric positions (0 before, 1 after, 2 AN top, 3 AN bottom, 4 @depth)."""
    pos = ext.get("position", entry.get("position"))
    depth = int(ext.get("depth", 4) or 4)
    role = {0: "system", 1: "user", 2: "assistant"}.get(ext.get("role", 0), "system")
    mapping = {0: "before_char", 1: "after_char", 2: "an_top", 3: "an_bottom", 4: "at_depth",
               "before_char": "before_char", "after_char": "after_char"}
    return mapping.get(pos, "after_char"), depth, role


def _logic(value: Any) -> str:
    return {0: "and_any", 1: "not_all", 2: "not_any", 3: "and_all"}.get(value, "and_any")


def card_to_entities(card: dict[str, Any]) -> dict[str, Any]:
    """Return {"scenario": {...}, "character": {...}, "lore": [{...}]} as plain dicts."""
    data = card.get("data") if isinstance(card.get("data"), dict) else card
    name = (data.get("name") or "Unnamed").strip()
    scenario = {
        "title": name,
        "summary": (data.get("creator_notes") or "")[:500],
        "world": data.get("scenario") or "",
        "themes": [str(t).strip() for t in (data.get("tags") or []) if str(t).strip()][:12],
        "opening_message": data.get("first_mes") or "",
        "main_prompt_override": data.get("system_prompt") or "",
        "post_history_override": data.get("post_history_instructions") or "",
    }
    ext = data.get("extensions") or {}
    depth_prompt = ext.get("depth_prompt") or {}
    character = {
        "name": name,
        "description": data.get("description") or "",
        "personality": data.get("personality") or "",
        "first_message": data.get("first_mes") or "",
        "example_dialogues": data.get("mes_example") or "",
        "depth_note": depth_prompt.get("prompt") or "",
        "depth_note_depth": int(depth_prompt.get("depth", 4) or 4),
    }
    lore: list[dict[str, Any]] = []
    book = data.get("character_book") or {}
    for entry in book.get("entries") or []:
        entry_ext = entry.get("extensions") or {}
        position, depth, role = _position(entry_ext, entry)
        keys = entry.get("keys") or []
        lore.append(
            {
                "title": entry.get("comment") or entry.get("name") or (keys[0] if keys else "Entry"),
                "content": entry.get("content") or "",
                "keys": [str(k) for k in keys],
                "secondary_keys": [str(k) for k in entry.get("secondary_keys") or []],
                "selective_logic": _logic(entry_ext.get("selectiveLogic")),
                "constant": bool(entry.get("constant")),
                "position": position,
                "depth": depth,
                "role": role,
                "order": int(entry.get("insertion_order", 100) or 100),
                "probability": int(entry_ext.get("probability", 100) or 100),
                "case_sensitive": bool(entry.get("case_sensitive") or False),
                "enabled": entry.get("enabled", True) is not False,
            }
        )
    return {"scenario": scenario, "character": character, "lore": lore}
