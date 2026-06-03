from __future__ import annotations

import json
import re
from enum import StrEnum
from pathlib import Path
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator


class PackageState(StrEnum):
    """Lifecycle states for an Extension package on disk.

    ABSENT  — no trace of the extension exists in the plugins/ directory.
    INSTALLED  — extension directory with a valid manifest is present.
    UNINSTALLED — manifest exists but the package is marked as removed
                  (preserves workspace activation records until cleanup).
    """

    ABSENT = "absent"
    INSTALLED = "installed"
    UNINSTALLED = "uninstalled"


class ProcessState(StrEnum):
    """Runtime lifecycle of an Extension in the current process.

    UNLOADED   — manifest parsed but code not imported.
    LOADED     — entry module imported, plugin instance created.
    REGISTERED — plugin hook called (arclayer_register), resources registered.
    READY      — bootstrap + ready hooks complete.
    DESTROYED  — shutdown hook complete, resources released.
    """

    UNLOADED = "unloaded"
    LOADED = "loaded"
    REGISTERED = "registered"
    READY = "ready"
    DESTROYED = "destroyed"


class WorkspaceActivationState(StrEnum):
    """Per-workspace toggle for an Extension.

    INACTIVE — Extension is loaded in-process but does not serve this workspace.
    ACTIVE   — Extension is active for this workspace (hooks fire, services resolve).
    """

    INACTIVE = "inactive"
    ACTIVE = "active"


# ——— Transition tables ————————————————————————————————————————————————

_PACKAGE_TRANSITIONS: dict[PackageState, set[PackageState]] = {
    PackageState.ABSENT: {PackageState.INSTALLED},
    PackageState.INSTALLED: {PackageState.UNINSTALLED},
    PackageState.UNINSTALLED: {PackageState.ABSENT, PackageState.INSTALLED},
}

# DESTROYED is reachable from any non-terminal state as a pragmatic shutdown rule.
_PROCESS_TRANSITIONS: dict[ProcessState, set[ProcessState]] = {
    ProcessState.UNLOADED: {ProcessState.LOADED, ProcessState.DESTROYED},
    ProcessState.LOADED: {ProcessState.REGISTERED, ProcessState.DESTROYED},
    ProcessState.REGISTERED: {ProcessState.READY, ProcessState.DESTROYED},
    ProcessState.READY: {ProcessState.DESTROYED},
    ProcessState.DESTROYED: set(),
}

_WORKSPACE_ACTIVATION_TRANSITIONS: dict[WorkspaceActivationState, set[WorkspaceActivationState]] = {
    WorkspaceActivationState.INACTIVE: {WorkspaceActivationState.ACTIVE},
    WorkspaceActivationState.ACTIVE: {WorkspaceActivationState.INACTIVE},
}


class InvalidStateTransitionError(RuntimeError):
    """Raised when a state machine transition is illegal."""


class ManifestParseError(ValueError):
    """Raised when an extension.json file is missing, malformed, or invalid."""


# ——— Manifest model ————————————————————————————————————————————————————


# Accepts semver-like: MAJOR.MINOR[.PATCH][-PRERELEASE][+BUILD]
_SEMVER_RE = re.compile(
    r"^(0|[1-9]\d*)\.(0|[1-9]\d*)(?:\.(0|[1-9]\d*))?(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$"
)

_ENTRY_PATH_RE = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_.-]*(?:/[a-zA-Z0-9][a-zA-Z0-9_.-]*)*\.py$")


class ExtensionRequires(BaseModel):
    """Constraints the extension declares on the host platform."""

    model_config = ConfigDict(extra="forbid")

    platform: str | None = Field(default=None, description='Platform version constraint (e.g. ">=1.0.0")')
    python: str | None = Field(default=None, description='Python version constraint (e.g. ">=3.12")')


class ExtensionProvides(BaseModel):
    """Capabilities the extension exposes to the platform."""

    model_config = ConfigDict(extra="forbid")

    services: list[str] = Field(default_factory=list)
    middlewares: list[str] = Field(default_factory=list)
    providers: list[str] = Field(default_factory=list)
    content_types: list[str] = Field(default_factory=list)


class ExtensionManifest(BaseModel):
    """Parsed representation of an extension.json file.

    This is the canonical contract between an Extension author and the
    Arclayer platform.  Every field is validated at parse time.
    """

    model_config = ConfigDict(extra="forbid")

    name: str = Field(..., min_length=2, max_length=64, pattern=r"^[a-z0-9][a-z0-9._-]*[a-z0-9]$")
    version: str = Field(..., min_length=1, max_length=64)
    entry: str = Field(default="src/plugin.py", description="Path relative to extension root")
    requires: ExtensionRequires = Field(default_factory=ExtensionRequires)
    provides: ExtensionProvides = Field(default_factory=ExtensionProvides)
    permissions: list[str] = Field(default_factory=list)
    config_schema: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def _validate_version(self) -> ExtensionManifest:
        if not _SEMVER_RE.match(self.version):
            raise ValueError(f"version must be semver-compatible, got {self.version!r}")
        return self

    @model_validator(mode="after")
    def _validate_entry_path(self) -> ExtensionManifest:
        entry = str(self.entry).replace("\\", "/")
        if entry.startswith("/"):
            raise ValueError(f"entry must be relative, got {self.entry!r}")
        if ".." in entry.split("/"):
            raise ValueError(f"entry must not contain path traversal, got {self.entry!r}")
        if not _ENTRY_PATH_RE.match(entry):
            raise ValueError(f"entry must be a safe relative Python path, got {self.entry!r}")
        return self


# ——— Manifest parser ————————————————————————————————————————————————————


def parse_manifest(path: Path | str) -> ExtensionManifest:
    """Parse and validate an extension.json file.

    Returns an ExtensionManifest on success.
    Raises ManifestParseError if the file is missing or invalid.
    """
    manifest_path = Path(path)
    if not manifest_path.is_file():
        raise ManifestParseError(f"extension.json not found at {manifest_path}")

    try:
        raw = json.loads(manifest_path.read_text())
    except json.JSONDecodeError as exc:
        raise ManifestParseError(f"Invalid JSON in {manifest_path}: {exc}") from exc

    if not isinstance(raw, dict):
        raise ManifestParseError(f"extension.json must contain a JSON object, got {type(raw).__name__}")

    try:
        return ExtensionManifest.model_validate(raw)
    except Exception as exc:
        raise ManifestParseError(f"Invalid manifest at {manifest_path}: {exc}") from exc


# ——— State machines —————————————————————————————————————————————————————


class PackageStateMachine:
    """Tracks the on-disk lifecycle of a single Extension package."""

    def __init__(self, state: PackageState = PackageState.ABSENT) -> None:
        self._state = state

    @property
    def state(self) -> PackageState:
        return self._state

    def transition_to(self, target: PackageState) -> None:
        allowed = _PACKAGE_TRANSITIONS.get(self._state, set())
        if target not in allowed:
            raise InvalidStateTransitionError(
                f"Illegal Package state transition: {self._state.value} → {target.value}"
            )
        self._state = target


class ProcessStateMachine:
    """Tracks the in-process runtime lifecycle of a single Extension."""

    def __init__(self, state: ProcessState = ProcessState.UNLOADED) -> None:
        self._state = state

    @property
    def state(self) -> ProcessState:
        return self._state

    def transition_to(self, target: ProcessState) -> None:
        allowed = _PROCESS_TRANSITIONS.get(self._state, set())
        if target not in allowed:
            raise InvalidStateTransitionError(
                f"Illegal Process state transition: {self._state.value} → {target.value}"
            )
        self._state = target


class WorkspaceActivationStateMachine:
    """Tracks activation for a single (Extension × Workspace) pair."""

    def __init__(self, state: WorkspaceActivationState = WorkspaceActivationState.INACTIVE) -> None:
        self._state = state

    @property
    def state(self) -> WorkspaceActivationState:
        return self._state

    def transition_to(self, target: WorkspaceActivationState) -> None:
        allowed = _WORKSPACE_ACTIVATION_TRANSITIONS.get(self._state, set())
        if target not in allowed:
            raise InvalidStateTransitionError(
                f"Illegal Workspace Activation transition: {self._state.value} → {target.value}"
            )
        self._state = target


# ——— Coordination rules —————————————————————————————————————————————————


class CoordinationError(RuntimeError):
    """Raised when a valid individual state transition violates cross-machine rules."""


def check_can_load(package_state: PackageState, process_state: ProcessState) -> None:
    """LOAD is only legal when the package is INSTALLED and process is UNLOADED."""
    if package_state is not PackageState.INSTALLED:
        raise CoordinationError(
            f"Cannot load extension: package state is {package_state.value}, must be {PackageState.INSTALLED.value}"
        )
    if process_state is not ProcessState.UNLOADED:
        raise CoordinationError(
            f"Cannot load extension: process state is {process_state.value}, must be {ProcessState.UNLOADED.value}"
        )


def check_can_activate(process_state: ProcessState) -> None:
    """Workspace activation requires the process to be READY."""
    if process_state is not ProcessState.READY:
        raise CoordinationError(
            f"Cannot activate workspace extension: process state is {process_state.value}, "
            f"must be {ProcessState.READY.value}"
        )
