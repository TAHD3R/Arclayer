from __future__ import annotations

from collections.abc import Sequence
from uuid import UUID

from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.models.projects.source import ProjectSourceFileRecord


class ProjectSourceRepository(TortoiseORMRepository):
    async def list_project_files(self, *, project_id: UUID) -> Sequence[ProjectSourceFileRecord]:
        return await ProjectSourceFileRecord.filter(project_id=project_id).order_by("path").all()

    async def get_project_file(self, *, project_id: UUID, path: str) -> ProjectSourceFileRecord | None:
        return await ProjectSourceFileRecord.filter(project_id=project_id, path=path).first()

    async def upsert_project_file(
        self,
        *,
        project_id: UUID,
        path: str,
        role: str,
        language: str,
        contents: str,
        actor_user_id: UUID,
        is_deleted: bool = False,
    ) -> ProjectSourceFileRecord:
        record = await self.get_project_file(project_id=project_id, path=path)
        if record is None:
            return await ProjectSourceFileRecord.create(
                project_id=project_id,
                path=path,
                role=role,
                language=language,
                contents=contents,
                is_deleted=is_deleted,
                created_by_user_id=actor_user_id,
                updated_by_user_id=actor_user_id,
            )

        return await self.update_fields(
            record,
            fields={
                "role": role,
                "language": language,
                "contents": contents,
                "is_deleted": is_deleted,
                "updated_by_user_id": actor_user_id,
            },
        )

    async def delete_project_file(self, *, project_id: UUID, path: str) -> int:
        return await ProjectSourceFileRecord.filter(project_id=project_id, path=path).delete()
