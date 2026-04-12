from __future__ import annotations

from typing import Literal

from pydantic import ConfigDict, Field, model_validator

from src.common.schemas import BaseSchema
from src.modules.sites.design.nodes.schema import DesignNodeV1, _is_safe_node_id


class PageBlueprint(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    version: Literal[1] = Field(1, description="PageBlueprint version.")
    root_id: str = Field(..., alias="rootId", min_length=1, description="Root node id (must be page_root).")
    nodes_by_id: dict[str, DesignNodeV1] = Field(default_factory=dict, alias="nodesById", description="Node table.")

    @model_validator(mode="after")
    def _validate_graph(self) -> PageBlueprint:
        if not _is_safe_node_id(self.root_id):
            raise ValueError("Invalid rootId")

        # root must exist and be page_root.
        root = self.nodes_by_id.get(self.root_id)
        if root is None:
            raise ValueError("Missing root node")
        if getattr(root, "type", None) != "page_root":
            raise ValueError("rootId must point to a page_root node")

        # key <-> node.id consistency
        for key, node in self.nodes_by_id.items():
            if not _is_safe_node_id(key):
                raise ValueError("Invalid node key")
            if node.id != key:
                raise ValueError("Node id mismatch")

        # children references must exist
        for node in self.nodes_by_id.values():
            children = getattr(node, "children", None)
            if children is None:
                continue
            for child_id in children:
                if child_id not in self.nodes_by_id:
                    raise ValueError("Dangling child reference")

        # prefab slotChildren references must exist
        for node in self.nodes_by_id.values():
            if getattr(node, "type", None) != "prefab_instance":
                continue
            slot_children = getattr(node, "slot_children", None)
            if not slot_children:
                continue
            for ids in slot_children.values():
                for child_id in ids:
                    if child_id not in self.nodes_by_id:
                        raise ValueError("Dangling slotChildren reference")

        return self


class PageBlueprintFragment(BaseSchema):
    """
    Reusable PageBlueprint fragment (insertable subtree).

    Unlike `PageBlueprint`, a fragment may have one or multiple roots, and roots are not required
    to be `page_root`.
    """

    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    version: Literal[1] = Field(1, description="PageBlueprintFragment version.")
    root_ids: list[str] = Field(default_factory=list, alias="rootIds", description="Root node ids.")
    nodes_by_id: dict[str, DesignNodeV1] = Field(default_factory=dict, alias="nodesById", description="Node table.")

    @model_validator(mode="after")
    def _validate_fragment(self) -> PageBlueprintFragment:
        # key <-> node.id consistency + safe ids
        for key, node in self.nodes_by_id.items():
            if not _is_safe_node_id(key):
                raise ValueError("Invalid node key")
            if node.id != key:
                raise ValueError("Node id mismatch")

        # roots must exist (when provided)
        for rid in self.root_ids:
            if not _is_safe_node_id(rid):
                raise ValueError("Invalid rootId")
            if rid not in self.nodes_by_id:
                raise ValueError("Missing root node")

        # children references must exist
        for node in self.nodes_by_id.values():
            children = getattr(node, "children", None)
            if children is None:
                continue
            for child_id in children:
                if child_id not in self.nodes_by_id:
                    raise ValueError("Dangling child reference")

        # prefab slotChildren references must exist
        for node in self.nodes_by_id.values():
            if getattr(node, "type", None) != "prefab_instance":
                continue
            slot_children = getattr(node, "slot_children", None)
            if not slot_children:
                continue
            for ids in slot_children.values():
                for child_id in ids:
                    if child_id not in self.nodes_by_id:
                        raise ValueError("Dangling slotChildren reference")

        return self
