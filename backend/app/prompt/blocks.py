"""Prompt Manager blocks (SillyTavern Chat Completion order).

Relative blocks are sent in list order. `chat_history` marks where the chat goes;
in-chat injections (Author's Note, @depth lore, character depth notes, the harness
scene note) are placed inside the history by depth. `post_history` is sent last.
"""

from typing import Any

BLOCK_IDS: tuple[str, ...] = (
    "main_prompt",
    "harness_legend",
    "global_rules",
    "lore_before",
    "persona",
    "characters",
    "scenario",
    "lore_after",
    "memory",
    "story_so_far",
    "examples",
    "chat_history",
    "post_history",
)

# Blocks that cannot be turned off. Global rules apply to every roleplay.
REQUIRED_BLOCKS: frozenset[str] = frozenset(
    {"main_prompt", "global_rules", "chat_history", "post_history"}
)

BLOCK_LABELS: dict[str, str] = {
    "main_prompt": "Main Prompt",
    "harness_legend": "Harness Legend",
    "global_rules": "Global + Scenario Rules",
    "lore_before": "World Info (before char defs)",
    "persona": "Persona",
    "characters": "Characters",
    "scenario": "Scenario",
    "lore_after": "World Info (after char defs)",
    "memory": "Memory",
    "story_so_far": "Story So Far (summary)",
    "examples": "Example Dialogues",
    "chat_history": "Chat History",
    "post_history": "Post-History Instructions",
}


def default_block_order() -> list[dict[str, Any]]:
    return [{"id": block_id, "enabled": True, "role": "system"} for block_id in BLOCK_IDS]


def normalize_block_order(order: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    """Return a valid order: known ids only, no duplicates, missing blocks appended,
    required blocks forced on, `post_history` forced last."""
    seen: set[str] = set()
    result: list[dict[str, Any]] = []
    for item in order or []:
        block_id = item.get("id")
        if block_id not in BLOCK_IDS or block_id in seen or block_id == "post_history":
            continue
        seen.add(block_id)
        role = item.get("role", "system")
        result.append(
            {
                "id": block_id,
                "enabled": bool(item.get("enabled", True)) or block_id in REQUIRED_BLOCKS,
                "role": role if role in ("system", "user", "assistant") else "system",
            }
        )
    for block_id in BLOCK_IDS:
        if block_id not in seen and block_id != "post_history":
            result.append({"id": block_id, "enabled": True, "role": "system"})
    result.append({"id": "post_history", "enabled": True, "role": "system"})
    return result
