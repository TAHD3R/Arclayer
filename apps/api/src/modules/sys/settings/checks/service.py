from __future__ import annotations

from typing import Protocol, cast

from src.modules.sys.settings.namespaces.schema import (
    SYS_NAMESPACE_AUTH,
    SYS_NAMESPACE_CORE_LEGACY,
    SYS_NAMESPACE_MAIL,
    SYS_NAMESPACE_OAUTH,
    SYS_NAMESPACE_STORAGE,
)
from src.modules.sys.settings.schema import SysConfigTestCheck
from src.settings.core_schema import CORE_SETTINGS_NAMESPACE


class _SysConfigCheckRunners(Protocol):
    async def _check_core_storage(self, *, full_value: dict[str, object]) -> SysConfigTestCheck: ...

    async def _check_core_mail(self, *, full_value: dict[str, object]) -> SysConfigTestCheck: ...

    async def _check_oauth_social(self, *, full_value: dict[str, object]) -> list[SysConfigTestCheck]: ...

    async def _check_auth_policy(self, *, full_value: dict[str, object]) -> list[SysConfigTestCheck]: ...


class SysConfigChecksMixin:
    async def _run_revision_checks(
        self,
        *,
        namespace: str,
        effective_core_value: dict[str, object],
    ) -> list[SysConfigTestCheck]:
        runner = cast(_SysConfigCheckRunners, self)
        checks: list[SysConfigTestCheck] = []
        if namespace in {SYS_NAMESPACE_STORAGE}:
            checks.append(await runner._check_core_storage(full_value=effective_core_value))
            return checks
        if namespace in {SYS_NAMESPACE_MAIL}:
            checks.append(await runner._check_core_mail(full_value=effective_core_value))
            return checks
        if namespace in {SYS_NAMESPACE_OAUTH}:
            checks.extend(await runner._check_oauth_social(full_value=effective_core_value))
            return checks
        if namespace in {SYS_NAMESPACE_AUTH}:
            checks.extend(await runner._check_auth_policy(full_value=effective_core_value))
            return checks
        if namespace in {CORE_SETTINGS_NAMESPACE, SYS_NAMESPACE_CORE_LEGACY}:
            checks.append(await runner._check_core_storage(full_value=effective_core_value))
            checks.append(await runner._check_core_mail(full_value=effective_core_value))
            return checks
        return []
