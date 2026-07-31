from __future__ import annotations

from datetime import UTC, datetime
from typing import Protocol
from uuid import UUID

from src.core.services import BaseService
from src.modules.platform_capabilities.registry import (
    PLATFORM_CAPABILITY_REGISTRY,
    PlatformCapabilityRegistration,
)
from src.modules.platform_capabilities.schema import (
    PlatformCapabilityCatalogOut,
    PlatformCapabilityEnablementState,
    PlatformCapabilityNavigationTargetOut,
    PlatformCapabilityOut,
    PlatformCapabilityPermissionMatch,
    PlatformCapabilityReadinessState,
    PlatformCapabilitySupportState,
)
from src.modules.platform_identity.permissions import PlatformPermissionCode
from src.modules.platform_identity.session_schema import PlatformSessionPrincipal


class PlatformCapabilityPermissionReader(Protocol):
    async def list_effective_permission_codes(
        self,
        *,
        operator_id: UUID,
        at: datetime,
    ) -> frozenset[str]: ...


class PlatformCapabilityCatalogService(BaseService):
    def __init__(
        self,
        repository: PlatformCapabilityPermissionReader,
        *,
        registrations: tuple[PlatformCapabilityRegistration, ...] = PLATFORM_CAPABILITY_REGISTRY,
    ) -> None:
        super().__init__()
        self._repository = repository
        self._registrations = registrations

    async def list_catalog(
        self,
        principal: PlatformSessionPrincipal,
        *,
        at: datetime | None = None,
    ) -> PlatformCapabilityCatalogOut:
        permission_codes = await self._permission_codes(principal, at=at)
        items = tuple(
            item
            for registration in self._registrations
            if (item := self._visible_item(registration, permission_codes, principal.is_instance_owner)) is not None
        )
        return PlatformCapabilityCatalogOut(items=items)

    async def _permission_codes(
        self,
        principal: PlatformSessionPrincipal,
        *,
        at: datetime | None,
    ) -> frozenset[str]:
        if principal.is_instance_owner or principal.operator_id is None:
            return frozenset()
        return await self._repository.list_effective_permission_codes(
            operator_id=principal.operator_id,
            at=at or datetime.now(UTC),
        )

    @staticmethod
    def _visible_item(
        registration: PlatformCapabilityRegistration,
        permission_codes: frozenset[str],
        is_instance_owner: bool,
    ) -> PlatformCapabilityOut | None:
        can_manage = is_instance_owner or PlatformCapabilityCatalogService._has_permissions(
            registration.required_manage_permissions,
            registration.manage_permission_match,
            permission_codes,
        )
        navigation_targets = tuple(
            PlatformCapabilityNavigationTargetOut(**target.model_dump())
            for target in registration.navigation_targets
            if is_instance_owner
            or PlatformCapabilityCatalogService._has_permissions(
                target.required_view_permissions,
                target.view_permission_match,
                permission_codes,
            )
        )
        is_enabled = registration.enablement_state is PlatformCapabilityEnablementState.ENABLED
        is_supported = registration.support_state is PlatformCapabilitySupportState.SUPPORTED
        if not is_instance_owner and not can_manage and not (is_supported and is_enabled and navigation_targets):
            return None

        navigation_candidate = (
            is_supported
            and is_enabled
            and registration.readiness_state is PlatformCapabilityReadinessState.READY
            and bool(navigation_targets)
        )
        activation_available = (
            registration.support_state is PlatformCapabilitySupportState.SUPPORTED
            and registration.enablement_state is PlatformCapabilityEnablementState.DISABLED_ACTIVATABLE
            and can_manage
        )
        return PlatformCapabilityOut(
            **registration.model_dump(exclude={"navigation_targets"}),
            navigation_targets=navigation_targets,
            navigation_candidate=navigation_candidate,
            activation_available=activation_available,
        )

    @staticmethod
    def _has_permissions(
        required: tuple[PlatformPermissionCode, ...],
        match: PlatformCapabilityPermissionMatch,
        granted: frozenset[str],
    ) -> bool:
        if not required:
            return False
        checks = (permission.value in granted for permission in required)
        if match is PlatformCapabilityPermissionMatch.ALL:
            return all(checks)
        return any(checks)
