from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields

from src.common.models.base import BaseModel
from src.models.skills._enums import SkillPackageScope


class AgentRunSkillSnapshotV1Record(BaseModel):
    run = fields.ForeignKeyField(
        "models.AgentRunV1Record",
        related_name="skill_snapshots",
        on_delete=fields.CASCADE,
    )
    agent_assignment_id = fields.UUIDField(db_index=True)
    agent_version_id = fields.UUIDField(db_index=True)
    agent_order = fields.IntField()
    skill_order = fields.IntField()
    installation_id = fields.UUIDField(db_index=True)
    package_scope = fields.CharEnumField(SkillPackageScope, max_length=16)
    package_id = fields.UUIDField(db_index=True)
    skill_version_id = fields.UUIDField(db_index=True)
    package_checksum = fields.CharField(max_length=71)
    validation_policy_version = fields.IntField()
    validation_finding_hash = fields.CharField(max_length=71)
    context_byte_size = fields.IntField()

    if TYPE_CHECKING:
        run_id: UUID

    class Meta(BaseModel.Meta):
        table = "ai_run_skill_snapshots"
        table_description = "Exact immutable Skill references pinned when an Agent Run is created."
        abstract = False
        unique_together = (("run_id", "agent_assignment_id", "installation_id"),)
        indexes = (
            ("run_id", "agent_order", "skill_order"),
            ("installation_id", "created_at"),
            ("skill_version_id", "created_at"),
        )
