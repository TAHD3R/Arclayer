"""Concurrency-safe hook evidence and Codex command-status sidecars."""

from __future__ import annotations

import fcntl
import hashlib
import json
import os
import tempfile
import time
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Any

EVIDENCE_SCHEMA = 1
STATUS_CAPTURE_SCHEMA = 1
STATUS_CAPTURE_PROTOCOL = "codex-bash-exit-status-v1"
STATUS_CAPTURE_TTL_SECONDS = 24 * 60 * 60


@dataclass(frozen=True)
class EventIdentity:
    platform: str
    session_id: str
    turn_id: str


@dataclass(frozen=True)
class CapturedCommandResult:
    original_command: str
    exit_status: int | None


class EvidenceStore:
    """Persist successful gate commands without losing parallel PostToolUse writes."""

    def __init__(self, project_root: Path, state_root: Path | None = None) -> None:
        self.project_root = project_root.resolve()
        configured = os.environ.get("ARCLAYER_HOOK_STATE_DIR")
        self.state_root = (
            state_root
            or (Path(configured) if configured else None)
            or (Path(tempfile.gettempdir()) / "arclayer-agent-hooks")
        )

    def record_success(self, identity: EventIdentity | None, command: str) -> None:
        if identity is None:
            return
        with self._locked(identity) as (path, state):
            current = state or self._new_state(identity)
            commands = current["successful_validation_commands"]
            if command not in commands:
                commands.append(command)
            self._write(path, current)

    def successful_commands(self, identity: EventIdentity | None) -> tuple[str, ...]:
        if identity is None:
            return ()
        with self._locked(identity) as (_, state):
            if state is None:
                return ()
            commands = state.get("successful_validation_commands")
            if not isinstance(commands, list) or not all(isinstance(command, str) for command in commands):
                raise RuntimeError("Hook evidence has an invalid successful_validation_commands field.")
            return tuple(commands)

    def clear(self, identity: EventIdentity | None) -> None:
        if identity is None:
            return
        with self._locked(identity) as (path, _):
            path.unlink(missing_ok=True)

    def reset_session(self, platform: str, session_id: str) -> None:
        if not session_id:
            return
        session_dir = self._session_dir(platform, session_id)
        with self._session_lock(session_dir):
            for path in session_dir.glob("turn-*.json"):
                path.unlink(missing_ok=True)

    @contextmanager
    def _locked(self, identity: EventIdentity) -> Iterator[tuple[Path, dict[str, Any] | None]]:
        session_dir = self._session_dir(identity.platform, identity.session_id)
        with self._session_lock(session_dir):
            turn_digest = hashlib.sha256(identity.turn_id.encode("utf-8")).hexdigest()
            path = session_dir / f"turn-{turn_digest}.json"
            yield path, self._read(path)

    @contextmanager
    def _session_lock(self, session_dir: Path) -> Iterator[None]:
        session_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
        os.chmod(session_dir, 0o700)
        lock_path = session_dir / ".lock"
        with lock_path.open("a+", encoding="utf-8") as lock_file:
            os.chmod(lock_path, 0o600)
            fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX)
            yield

    def _session_dir(self, platform: str, session_id: str) -> Path:
        root_digest = hashlib.sha256(str(self.project_root).encode("utf-8")).hexdigest()[:32]
        session_digest = hashlib.sha256(f"{platform}\0{session_id}".encode()).hexdigest()[:32]
        return self.state_root / root_digest / session_digest

    @staticmethod
    def _new_state(identity: EventIdentity) -> dict[str, Any]:
        return {
            "schema": EVIDENCE_SCHEMA,
            "platform": identity.platform,
            "session_id": identity.session_id,
            "turn_id": identity.turn_id,
            "successful_validation_commands": [],
        }

    @staticmethod
    def _read(path: Path) -> dict[str, Any] | None:
        if not path.exists():
            return None
        try:
            value = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise RuntimeError(f"Cannot read hook evidence state {path}: {exc}") from exc
        if not isinstance(value, dict) or value.get("schema") != EVIDENCE_SCHEMA:
            raise RuntimeError(f"Unsupported hook evidence state: {path}")
        return value

    def _write(self, path: Path, state: dict[str, Any]) -> None:
        _atomic_json_write(path, state)


class CommandStatusStore:
    """Implement the shared global/project Codex exit-status sidecar protocol."""

    def __init__(self, state_root: Path | None = None) -> None:
        configured = os.environ.get("AGENT_HOOK_STATE_DIR")
        self.state_root = (
            state_root
            or (Path(configured) if configured else None)
            or (Path.home() / ".cache" / "agent-hooks" / "turn-state")
        )

    def prepare(self, session_id: str, tool_use_id: str, original_command: str) -> Path:
        self._require_identity(session_id, tool_use_id)
        self._ensure_state_root()
        status_path, metadata_path = self._paths(session_id, tool_use_id)
        status_path.unlink(missing_ok=True)
        _atomic_json_write(
            metadata_path,
            {
                "schema": STATUS_CAPTURE_SCHEMA,
                "platform": "codex",
                "original_command": original_command,
                "created_at": time.time(),
            },
        )
        return status_path

    def read(self, session_id: str, tool_use_id: str) -> CapturedCommandResult | None:
        if not session_id or not tool_use_id:
            return None
        status_path, metadata_path = self._paths(session_id, tool_use_id)
        if not metadata_path.exists():
            return None
        try:
            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise RuntimeError(f"Cannot read Codex command metadata {metadata_path}: {exc}") from exc
        if not isinstance(metadata, dict) or metadata.get("schema") != STATUS_CAPTURE_SCHEMA:
            raise RuntimeError(f"Unsupported Codex command metadata: {metadata_path}")
        if metadata.get("platform") != "codex" or not isinstance(metadata.get("original_command"), str):
            raise RuntimeError(f"Invalid Codex command metadata: {metadata_path}")
        return CapturedCommandResult(
            original_command=metadata["original_command"],
            exit_status=self._read_status(status_path),
        )

    def reset_session(self, session_id: str) -> None:
        if not session_id:
            return
        self._ensure_state_root()
        session_digest = self._session_digest(session_id)
        for prefix, suffix in (("exit", "status"), ("meta", "json")):
            for path in self.state_root.glob(f"{prefix}-{session_digest}-*.{suffix}"):
                path.unlink(missing_ok=True)
        self.cleanup_expired()

    def cleanup_expired(self, now: float | None = None) -> None:
        if not self.state_root.exists():
            return
        cutoff = (time.time() if now is None else now) - STATUS_CAPTURE_TTL_SECONDS
        for pattern in ("exit-*.status", "meta-*.json"):
            for path in self.state_root.glob(pattern):
                try:
                    if path.stat().st_mtime < cutoff:
                        path.unlink(missing_ok=True)
                except FileNotFoundError:
                    continue

    def _paths(self, session_id: str, tool_use_id: str) -> tuple[Path, Path]:
        session_digest = self._session_digest(session_id)
        tool_digest = hashlib.sha256(tool_use_id.encode("utf-8")).hexdigest()[:32]
        stem = f"{session_digest}-{tool_digest}"
        return self.state_root / f"exit-{stem}.status", self.state_root / f"meta-{stem}.json"

    @staticmethod
    def _session_digest(session_id: str) -> str:
        return hashlib.sha256(f"codex\0{session_id}".encode()).hexdigest()[:32]

    @staticmethod
    def _read_status(path: Path) -> int | None:
        if not path.exists():
            return None
        try:
            value = path.read_text(encoding="ascii").strip()
        except OSError as exc:
            raise RuntimeError(f"Cannot read Codex exit status {path}: {exc}") from exc
        if not value or not value.lstrip("-").isdigit():
            raise RuntimeError(f"Codex exit status is not numeric: {path}")
        return int(value)

    def _ensure_state_root(self) -> None:
        self.state_root.mkdir(mode=0o700, parents=True, exist_ok=True)
        os.chmod(self.state_root, 0o700)

    @staticmethod
    def _require_identity(session_id: str, tool_use_id: str) -> None:
        if not session_id or not tool_use_id:
            raise RuntimeError("Codex status capture requires session_id and tool_use_id.")


def _atomic_json_write(path: Path, state: dict[str, Any]) -> None:
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    payload = json.dumps(state, ensure_ascii=True, sort_keys=True)
    fd, raw_temp_path = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    temp_path = Path(raw_temp_path)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as temp_file:
            temp_file.write(payload)
            temp_file.write("\n")
            temp_file.flush()
            os.fsync(temp_file.fileno())
        os.chmod(temp_path, 0o600)
        os.replace(temp_path, path)
    finally:
        temp_path.unlink(missing_ok=True)
