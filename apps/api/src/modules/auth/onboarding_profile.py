from __future__ import annotations

from datetime import UTC, datetime
from typing import cast
from uuid import UUID

from src.core.services import BaseService
from src.models.system.setting import SettingRecord
from src.modules.auth.schema import OnboardingProfileOut, OnboardingProfilePatchRequest
from src.settings.scopes import SCOPE_TYPE_USER

ONBOARDING_PROFILE_NAMESPACE = "onboarding.profile"


class OnboardingProfileService(BaseService):
    async def get_profile(self, *, user_id: UUID) -> OnboardingProfileOut:
        record = await self._get_record(user_id=user_id)
        if record is None:
            return OnboardingProfileOut()
        return self._parse_value(record.value)

    async def patch_profile(
        self,
        *,
        user_id: UUID,
        payload: OnboardingProfilePatchRequest,
    ) -> OnboardingProfileOut:
        record = await self._get_record(user_id=user_id)
        current = self._parse_value(record.value).model_dump(mode="json") if record else {}
        patch = payload.model_dump(exclude_unset=True, mode="json")
        next_value = {
            **current,
            **patch,
            "updated_at": datetime.now(UTC).isoformat(),
        }

        if record is None:
            await SettingRecord.create(
                scope_type=SCOPE_TYPE_USER,
                scope_id=user_id,
                namespace=ONBOARDING_PROFILE_NAMESPACE,
                value=next_value,
                updated_by=user_id,
            )
        else:
            record.value = next_value
            record.updated_by = user_id
            await record.save(update_fields=["value", "updated_by", "updated_at"])

        return self._parse_value(next_value)

    async def _get_record(self, *, user_id: UUID) -> SettingRecord | None:
        return await SettingRecord.get_or_none(
            scope_type=SCOPE_TYPE_USER,
            scope_id=user_id,
            namespace=ONBOARDING_PROFILE_NAMESPACE,
        )

    @staticmethod
    def _parse_value(value: object) -> OnboardingProfileOut:
        if not isinstance(value, dict):
            return OnboardingProfileOut()
        payload = cast(dict[str, object], value)
        return OnboardingProfileOut.model_validate({
            "job_role": payload.get("job_role"),
            "company_size": payload.get("company_size"),
            "subscribed_product_updates": (
                bool(payload["subscribed_product_updates"]) if "subscribed_product_updates" in payload else True
            ),
            "heard_about_us": payload.get("heard_about_us"),
        })
