from __future__ import annotations

import os
import tempfile
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from scripts.agent_hooks.evidence import (
    STATUS_CAPTURE_TTL_SECONDS,
    CommandStatusStore,
    EventIdentity,
    EvidenceStore,
)

PROJECT_ROOT = Path(__file__).resolve().parents[3]


class EvidenceStoreTests(unittest.TestCase):
    def test_parallel_results_accumulate_without_lost_updates(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            store = EvidenceStore(PROJECT_ROOT, Path(temp_dir))
            identity = EventIdentity("codex", "parallel-session", "turn-1")
            commands = [f"rtk pnpm --filter package-{index} test" for index in range(20)]
            with ThreadPoolExecutor(max_workers=8) as executor:
                list(executor.map(lambda command: store.record_success(identity, command), commands))
            self.assertEqual(set(store.successful_commands(identity)), set(commands))

    def test_reset_session_removes_turnless_evidence(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            store = EvidenceStore(PROJECT_ROOT, Path(temp_dir))
            identity = EventIdentity("claude", "session-only", "session")
            store.record_success(identity, "rtk pnpm api:check")
            store.reset_session("claude", "session-only")
            self.assertEqual(store.successful_commands(identity), ())


class CommandStatusStoreTests(unittest.TestCase):
    def test_expired_orphan_sidecars_are_removed(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            store = CommandStatusStore(Path(temp_dir))
            status_path = store.prepare("old-session", "old-tool", "rtk pnpm hooks:test")
            status_path.write_text("0\n", encoding="ascii")
            old_time = time.time() - STATUS_CAPTURE_TTL_SECONDS - 1
            for path in Path(temp_dir).iterdir():
                os.utime(path, (old_time, old_time))
            store.cleanup_expired()
            self.assertEqual(list(Path(temp_dir).iterdir()), [])


if __name__ == "__main__":
    unittest.main()
