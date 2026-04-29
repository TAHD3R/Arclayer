from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class PopulationConfig:
    relations: list[str] = field(default_factory=list)
    max_depth: int = 3

    @property
    def has_relations(self) -> bool:
        return len(self.relations) > 0


def parse_populate(raw: list[str] | None, *, max_depth: int = 3) -> PopulationConfig:
    if raw is None or not isinstance(raw, list):
        return PopulationConfig(max_depth=max_depth)
    return PopulationConfig(
        relations=[str(item) for item in raw if isinstance(item, str) and item.strip()],
        max_depth=max_depth,
    )
