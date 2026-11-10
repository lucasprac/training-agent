"""HarnessState: everything the harness decided for one turn."""

from dataclasses import dataclass, field
from typing import Any

from app.models import MemoryItem
from app.sage.labels import LabelSet
from app.worldinfo.activation import SelectedLore


@dataclass
class HarnessState:
    labels: LabelSet
    lore: list[SelectedLore] = field(default_factory=list)
    lore_dropped: list[SelectedLore] = field(default_factory=list)
    memory: list[MemoryItem] = field(default_factory=list)
    guard: dict[str, bool | None] = field(default_factory=lambda: {"ooc": None, "limits": None})
    guidance: list[str] = field(default_factory=list)
    degraded: list[str] = field(default_factory=list)
    sage: dict[str, Any] = field(default_factory=dict)  # request size, errors, latency

    @property
    def blocked(self) -> bool:
        return self.guard.get("limits") is True

    @property
    def ooc(self) -> bool:
        return self.guard.get("ooc") is True

    def snapshot(self) -> dict[str, Any]:
        """Stored on the user message; regenerate rebuilds the state from it."""
        return {
            "labels": self.labels.model_dump(),
            "lore": [
                {"id": s.entry.id, "title": s.entry.title, "source": s.source} for s in self.lore
            ],
            "lore_dropped": [
                {"id": s.entry.id, "title": s.entry.title, "source": s.source}
                for s in self.lore_dropped
            ],
            "memory": [m.id for m in self.memory],
            "guard": dict(self.guard),
            "guidance": list(self.guidance),
            "degraded": list(self.degraded),
            "sage": dict(self.sage),
        }

    def public(self) -> dict[str, Any]:
        """Shape sent to the browser inspector."""
        data = self.snapshot()
        data["memory"] = [
            {"id": m.id, "kind": m.kind, "content": m.content, "known_by": m.known_by}
            for m in self.memory
        ]
        return data
