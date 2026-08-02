"""Unit tests for Extension manifest parsing and three state machines."""

from __future__ import annotations

import json
import tempfile
from pathlib import Path

import pytest

from src.core.extensions.manifest import (
    CoordinationError,
    InvalidStateTransitionError,
    ManifestParseError,
    PackageState,
    PackageStateMachine,
    ProcessState,
    ProcessStateMachine,
    WorkspaceActivationState,
    WorkspaceActivationStateMachine,
    check_can_activate,
    check_can_load,
    parse_manifest,
)

# ——— Manifest parsing ——————————————————————————————————————————————————


class TestParseManifest:
    def test_valid_minimal_manifest(self):
        data = {"name": "my-ext", "version": "1.0.0"}
        path = _write_manifest(data)
        m = parse_manifest(path)
        assert m.name == "my-ext"
        assert m.version == "1.0.0"
        assert m.entry == "src/plugin.py"
        assert m.requires.platform is None
        assert m.provides.services == []

    def test_valid_full_manifest(self):
        data = {
            "name": "arclayer-core",
            "version": "1.0.0",
            "entry": "src/plugin.py",
            "requires": {"platform": ">=1.0.0", "python": ">=3.12"},
            "provides": {"services": ["health"], "middlewares": ["audit"], "providers": ["email"]},
            "permissions": ["content.read"],
            "config_schema": {"type": "object"},
        }
        path = _write_manifest(data)
        m = parse_manifest(path)
        assert m.name == "arclayer-core"
        assert m.requires.platform == ">=1.0.0"
        assert m.requires.python == ">=3.12"
        assert m.provides.services == ["health"]
        assert m.provides.middlewares == ["audit"]
        assert m.provides.providers == ["email"]
        assert m.permissions == ["content.read"]
        assert m.config_schema == {"type": "object"}

    def test_missing_file_raises(self):
        with pytest.raises(ManifestParseError, match="not found"):
            parse_manifest(Path("/nonexistent/extension.json"))

    def test_invalid_json_raises(self):
        d = tempfile.mkdtemp()
        p = Path(d) / "extension.json"
        p.write_text("{invalid")
        with pytest.raises(ManifestParseError, match="Invalid JSON"):
            parse_manifest(p)

    def test_non_object_raises(self):
        d = tempfile.mkdtemp()
        p = Path(d) / "extension.json"
        p.write_text("[1, 2, 3]")
        with pytest.raises(ManifestParseError, match="JSON object"):
            parse_manifest(p)

    def test_invalid_name_raises(self):
        data = {"name": "Bad Name!", "version": "1.0.0"}
        path = _write_manifest(data)
        with pytest.raises(ManifestParseError, match="Invalid manifest"):
            parse_manifest(path)

    def test_invalid_version_raises(self):
        data = {"name": "my-ext", "version": "not-semver"}
        path = _write_manifest(data)
        with pytest.raises(ManifestParseError, match="Invalid manifest"):
            parse_manifest(path)

    def test_name_too_short_raises(self):
        data = {"name": "a", "version": "1.0.0"}
        path = _write_manifest(data)
        with pytest.raises(ManifestParseError):
            parse_manifest(path)

    def test_name_starting_with_hyphen_raises(self):
        data = {"name": "-badname", "version": "1.0.0"}
        path = _write_manifest(data)
        with pytest.raises(ManifestParseError):
            parse_manifest(path)

    def test_single_digit_version_raises(self):
        data = {"name": "my-ext", "version": "1"}
        path = _write_manifest(data)
        with pytest.raises(ManifestParseError):
            parse_manifest(path)

    def test_default_entry_when_omitted(self):
        data = {"name": "my-ext", "version": "1.0.0"}
        path = _write_manifest(data)
        m = parse_manifest(path)
        assert m.entry == "src/plugin.py"

    def test_extra_fields_rejected(self):
        data = {"name": "my-ext", "version": "1.0.0", "unknown_field": True}
        path = _write_manifest(data)
        with pytest.raises(ManifestParseError, match="Invalid manifest"):
            parse_manifest(path)

    def test_absolute_entry_path_rejected(self):
        data = {"name": "my-ext", "version": "1.0.0", "entry": "/etc/passwd"}
        path = _write_manifest(data)
        with pytest.raises(ManifestParseError, match="Invalid manifest"):
            parse_manifest(path)

    def test_parent_traversal_entry_rejected(self):
        data = {"name": "my-ext", "version": "1.0.0", "entry": "../outside/plugin.py"}
        path = _write_manifest(data)
        with pytest.raises(ManifestParseError, match="Invalid manifest"):
            parse_manifest(path)

    def test_semver_prerelease_accepted(self):
        data = {"name": "my-ext", "version": "1.0.0-beta.1"}
        path = _write_manifest(data)
        m = parse_manifest(path)
        assert m.version == "1.0.0-beta.1"

    def test_semver_build_metadata_accepted(self):
        data = {"name": "my-ext", "version": "1.0.0+20260101"}
        path = _write_manifest(data)
        m = parse_manifest(path)
        assert m.version == "1.0.0+20260101"

    def test_version_with_text_rejected(self):
        data = {"name": "my-ext", "version": "not-a-version"}
        path = _write_manifest(data)
        with pytest.raises(ManifestParseError):
            parse_manifest(path)

    def test_extra_fields_in_requires_rejected(self):
        data = {
            "name": "my-ext",
            "version": "1.0.0",
            "requires": {"platform": ">=1.0.0", "extra_key": "value"},
        }
        path = _write_manifest(data)
        with pytest.raises(ManifestParseError, match="Invalid manifest"):
            parse_manifest(path)

    def test_dependencies_capture_extension_identity_and_version_requirement(self):
        path = _write_manifest({
            "name": "my-ext",
            "version": "1.0.0",
            "dependencies": [{"name": "required-ext", "version_requirement": ">=2.0.0"}],
        })

        manifest = parse_manifest(path)

        assert manifest.dependencies[0].name == "required-ext"
        assert manifest.dependencies[0].version_requirement == ">=2.0.0"

    @pytest.mark.parametrize(
        "dependencies",
        [
            [{"name": "required-ext"}, {"name": "required-ext"}],
            [{"name": "my-ext"}],
        ],
    )
    def test_dependencies_reject_duplicates_and_self_reference(self, dependencies):
        path = _write_manifest({"name": "my-ext", "version": "1.0.0", "dependencies": dependencies})

        with pytest.raises(ManifestParseError, match="Invalid manifest"):
            parse_manifest(path)


# ——— Package state machine —————————————————————————————————————————————


class TestPackageStateMachine:
    def test_initial_state_absent(self):
        sm = PackageStateMachine()
        assert sm.state == PackageState.ABSENT

    def test_absent_to_installed(self):
        sm = PackageStateMachine()
        sm.transition_to(PackageState.INSTALLED)
        assert sm.state == PackageState.INSTALLED

    def test_installed_to_uninstalled(self):
        sm = PackageStateMachine(PackageState.INSTALLED)
        sm.transition_to(PackageState.UNINSTALLED)
        assert sm.state == PackageState.UNINSTALLED

    def test_uninstalled_to_absent(self):
        sm = PackageStateMachine(PackageState.UNINSTALLED)
        sm.transition_to(PackageState.ABSENT)
        assert sm.state == PackageState.ABSENT

    def test_uninstalled_to_installed_reinstall(self):
        sm = PackageStateMachine(PackageState.UNINSTALLED)
        sm.transition_to(PackageState.INSTALLED)
        assert sm.state == PackageState.INSTALLED

    def test_absent_to_uninstalled_illegal(self):
        sm = PackageStateMachine()
        with pytest.raises(InvalidStateTransitionError, match="Illegal Package state transition"):
            sm.transition_to(PackageState.UNINSTALLED)

    def test_installed_to_absent_illegal(self):
        sm = PackageStateMachine(PackageState.INSTALLED)
        with pytest.raises(InvalidStateTransitionError, match="Illegal Package state transition"):
            sm.transition_to(PackageState.ABSENT)

    def test_custom_initial_state(self):
        sm = PackageStateMachine(PackageState.INSTALLED)
        assert sm.state == PackageState.INSTALLED


# ——— Process state machine —————————————————————————————————————————————


class TestProcessStateMachine:
    def test_initial_state_unloaded(self):
        sm = ProcessStateMachine()
        assert sm.state == ProcessState.UNLOADED

    def test_full_lifecycle(self):
        sm = ProcessStateMachine()
        sm.transition_to(ProcessState.LOADED)
        assert sm.state == ProcessState.LOADED
        sm.transition_to(ProcessState.REGISTERED)
        assert sm.state == ProcessState.REGISTERED
        sm.transition_to(ProcessState.READY)
        assert sm.state == ProcessState.READY
        sm.transition_to(ProcessState.DESTROYED)
        assert sm.state == ProcessState.DESTROYED

    def test_unloaded_to_destroyed_direct(self):
        sm = ProcessStateMachine()
        sm.transition_to(ProcessState.DESTROYED)
        assert sm.state == ProcessState.DESTROYED

    def test_loaded_to_destroyed(self):
        sm = ProcessStateMachine(ProcessState.LOADED)
        sm.transition_to(ProcessState.DESTROYED)
        assert sm.state == ProcessState.DESTROYED

    def test_registered_to_destroyed(self):
        sm = ProcessStateMachine(ProcessState.REGISTERED)
        sm.transition_to(ProcessState.DESTROYED)
        assert sm.state == ProcessState.DESTROYED

    def test_ready_to_destroyed(self):
        sm = ProcessStateMachine(ProcessState.READY)
        sm.transition_to(ProcessState.DESTROYED)
        assert sm.state == ProcessState.DESTROYED

    def test_destroyed_no_transitions(self):
        sm = ProcessStateMachine(ProcessState.DESTROYED)
        for target in ProcessState:
            with pytest.raises(InvalidStateTransitionError):
                sm.transition_to(target)

    def test_unloaded_to_registered_skip_illegal(self):
        sm = ProcessStateMachine()
        with pytest.raises(InvalidStateTransitionError, match="Illegal Process state transition"):
            sm.transition_to(ProcessState.REGISTERED)

    def test_unloaded_to_ready_skip_illegal(self):
        sm = ProcessStateMachine()
        with pytest.raises(InvalidStateTransitionError, match="Illegal Process state transition"):
            sm.transition_to(ProcessState.READY)

    def test_loaded_to_ready_skip_illegal(self):
        sm = ProcessStateMachine(ProcessState.LOADED)
        with pytest.raises(InvalidStateTransitionError, match="Illegal Process state transition"):
            sm.transition_to(ProcessState.READY)


# ——— Workspace Activation state machine ————————————————————————————————


class TestWorkspaceActivationStateMachine:
    def test_initial_state_inactive(self):
        sm = WorkspaceActivationStateMachine()
        assert sm.state == WorkspaceActivationState.INACTIVE

    def test_inactive_to_active(self):
        sm = WorkspaceActivationStateMachine()
        sm.transition_to(WorkspaceActivationState.ACTIVE)
        assert sm.state == WorkspaceActivationState.ACTIVE

    def test_active_to_inactive(self):
        sm = WorkspaceActivationStateMachine(WorkspaceActivationState.ACTIVE)
        sm.transition_to(WorkspaceActivationState.INACTIVE)
        assert sm.state == WorkspaceActivationState.INACTIVE

    def test_inactive_to_inactive_illegal(self):
        sm = WorkspaceActivationStateMachine()
        with pytest.raises(InvalidStateTransitionError, match="Illegal Workspace Activation transition"):
            sm.transition_to(WorkspaceActivationState.INACTIVE)

    def test_active_to_active_illegal(self):
        sm = WorkspaceActivationStateMachine(WorkspaceActivationState.ACTIVE)
        with pytest.raises(InvalidStateTransitionError, match="Illegal Workspace Activation transition"):
            sm.transition_to(WorkspaceActivationState.ACTIVE)


# ——— Coordination rules ———————————————————————————————————————————————


class TestCoordinationRules:
    def test_can_load_when_package_installed_and_process_unloaded(self):
        check_can_load(PackageState.INSTALLED, ProcessState.UNLOADED)

    def test_cannot_load_when_package_absent(self):
        with pytest.raises(CoordinationError, match="package state is absent"):
            check_can_load(PackageState.ABSENT, ProcessState.UNLOADED)

    def test_cannot_load_when_package_uninstalled(self):
        with pytest.raises(CoordinationError, match="package state is uninstalled"):
            check_can_load(PackageState.UNINSTALLED, ProcessState.UNLOADED)

    def test_cannot_load_when_process_already_loaded(self):
        with pytest.raises(CoordinationError, match="process state is loaded"):
            check_can_load(PackageState.INSTALLED, ProcessState.LOADED)

    def test_can_activate_when_process_ready(self):
        check_can_activate(ProcessState.READY)

    def test_cannot_activate_when_process_not_ready(self):
        for state in [ProcessState.UNLOADED, ProcessState.LOADED, ProcessState.REGISTERED, ProcessState.DESTROYED]:
            with pytest.raises(CoordinationError, match=f"process state is {state.value}"):
                check_can_activate(state)


# ——— helpers ———————————————————————————————————————————————————————————


def _write_manifest(data: dict) -> Path:
    d = tempfile.mkdtemp()
    p = Path(d) / "extension.json"
    p.write_text(json.dumps(data), encoding="utf-8")
    return p
