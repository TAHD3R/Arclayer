from __future__ import annotations

import json
import os
import shutil
import stat
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts.agent_hooks.evidence import CommandStatusStore, EventIdentity
from scripts.agent_hooks.policy import LONG_RUNNING_OPT_IN, command_violation, has_explicit_validation_omission_reason
from scripts.agent_hooks.runtime import STATUS_CAPTURE_OWNER, HookRuntime, Platform, ResultKind
from scripts.agent_hooks.validation import API_CHECK_COMMAND, CROSS_APP_CHECK_COMMAND, validation_plan

PROJECT_ROOT = Path(__file__).resolve().parents[3]
FIXTURES = Path(__file__).parent / "fixtures"


def load_fixture(name: str) -> dict[str, object]:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


class CommandPolicyTests(unittest.TestCase):
    def test_long_running_command_requires_explicit_opt_in(self) -> None:
        self.assertIsNotNone(command_violation("rtk pnpm dev"))
        approved = f"rtk proxy env {LONG_RUNNING_OPT_IN} pnpm dev"
        self.assertIsNone(command_violation(approved))

    def test_detached_docker_compose_is_not_treated_as_long_running(self) -> None:
        self.assertIsNone(command_violation("rtk docker compose up -d"))

    def test_explicit_omission_requires_a_reason(self) -> None:
        self.assertFalse(has_explicit_validation_omission_reason("验证未运行。"))
        self.assertTrue(has_explicit_validation_omission_reason("验证未运行：本次只修改文档，没有适用的运行时检查。"))

    def test_shared_package_plan_includes_package_and_consumer_gates(self) -> None:
        changed = PROJECT_ROOT / "packages" / "delivery-sdk" / "src" / "index.ts"
        plan = validation_plan(PROJECT_ROOT, (changed,))
        self.assertIn("rtk pnpm --filter @arclayer/delivery-sdk typecheck", plan.commands)
        self.assertIn("rtk pnpm --filter @arclayer/delivery-sdk test", plan.commands)
        self.assertIn(CROSS_APP_CHECK_COMMAND, plan.commands)

    def test_plugin_plan_includes_extension_and_consumer_gates(self) -> None:
        changed = PROJECT_ROOT / "plugins" / "arclayer-core" / "src" / "plugin.py"
        plan = validation_plan(PROJECT_ROOT, (changed,))
        self.assertIn(API_CHECK_COMMAND, plan.commands)
        self.assertIn(CROSS_APP_CHECK_COMMAND, plan.commands)


class CodexPayloadTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        root = Path(self.temp_dir.name)
        self.status_root = root / "status"
        self.runtime = HookRuntime(Platform.CODEX, PROJECT_ROOT, root / "evidence", self.status_root)
        self.fake_bin = root / "bin"
        self.fake_bin.mkdir()
        fake_rtk = self.fake_bin / "rtk"
        fake_rtk.write_text(
            '#!/bin/sh\nif [ "$1" = proxy ]; then shift; exec "$@"; fi\nexit "${FAKE_RTK_EXIT:-0}"\n',
            encoding="utf-8",
        )
        fake_rtk.chmod(0o755)

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def _execute_pre_wrapper(self, fixture: str, exit_code: int) -> str:
        result = self.runtime.handle(load_fixture(fixture))
        self.assertIsNotNone(result)
        assert result is not None
        self.assertEqual(result.kind, ResultKind.UPDATED_INPUT)
        environment = {
            **os.environ,
            "PATH": f"{self.fake_bin}{os.pathsep}{os.environ['PATH']}",
            "FAKE_RTK_EXIT": str(exit_code),
        }
        completed = subprocess.run(
            result.updated_command,
            shell=True,
            executable="/bin/sh",
            text=True,
            capture_output=True,
            env=environment,
            check=False,
        )
        self.assertEqual(completed.returncode, exit_code, completed.stderr)
        return result.updated_command

    def test_apply_patch_command_field_is_checked(self) -> None:
        result = self.runtime.handle(load_fixture("codex_pre_apply_patch.json"))
        self.assertIsNotNone(result)
        assert result is not None
        self.assertEqual(result.kind, ResultKind.BLOCK)
        self.assertIn("pnpm-lock.yaml", result.message)

    def test_raw_tool_response_uses_sidecar_and_original_command(self) -> None:
        wrapped = self._execute_pre_wrapper("codex_pre_validation.json", 0)
        post = load_fixture("codex_post_validation_success.json")
        post["tool_input"] = {"command": wrapped}
        self.assertIsNone(self.runtime.handle(post))
        captured = self.runtime.command_status.read("codex-session", "tool-success")
        self.assertIsNotNone(captured)
        assert captured is not None
        self.assertEqual(captured.original_command, "rtk pnpm hooks:test")
        self.assertEqual(captured.exit_status, 0)
        self.assertIsNone(self.runtime.handle(load_fixture("codex_stop_completion.json")))

    def test_sidecar_is_repeatable_for_global_and_project_post_order(self) -> None:
        self._execute_pre_wrapper("codex_pre_validation.json", 0)
        second_reader = CommandStatusStore(self.status_root)
        first = self.runtime.command_status.read("codex-session", "tool-success")
        second = second_reader.read("codex-session", "tool-success")
        self.assertEqual(first, second)
        status_file = next(self.status_root.glob("exit-*.status"))
        metadata_file = next(self.status_root.glob("meta-*.json"))
        self.assertEqual(stat.S_IMODE(status_file.stat().st_mode), 0o600)
        self.assertEqual(stat.S_IMODE(metadata_file.stat().st_mode), 0o600)
        self.assertEqual(stat.S_IMODE(self.status_root.stat().st_mode), 0o700)

    def test_failed_sidecar_is_not_validation_evidence(self) -> None:
        wrapped = self._execute_pre_wrapper("codex_pre_validation_failure.json", 7)
        post = load_fixture("codex_post_validation_failure.json")
        post["tool_input"] = {"command": wrapped}
        result = self.runtime.handle(post)
        self.assertIsNotNone(result)
        assert result is not None
        self.assertEqual(result.kind, ResultKind.CONTEXT)
        stop = load_fixture("codex_stop_completion.json")
        stop["session_id"] = "codex-failed-session"
        self.assertEqual(self.runtime.handle(stop).kind, ResultKind.BLOCK)  # type: ignore[union-attr]

    def test_raw_output_without_sidecar_is_not_guessed_as_success(self) -> None:
        post = load_fixture("codex_post_validation_success.json")
        post["session_id"] = "missing-sidecar-session"
        post["tool_use_id"] = "missing-sidecar-tool"
        result = self.runtime.handle(post)
        self.assertIsNotNone(result)
        assert result is not None
        self.assertIn("no command metadata", result.message)

    def test_validation_evidence_is_scoped_to_the_turn(self) -> None:
        wrapped = self._execute_pre_wrapper("codex_pre_validation.json", 0)
        post = load_fixture("codex_post_validation_success.json")
        post["tool_input"] = {"command": wrapped}
        self.assertIsNone(self.runtime.handle(post))
        stop = load_fixture("codex_stop_completion.json")
        stop["turn_id"] = "turn-2"
        self.assertEqual(self.runtime.handle(stop).kind, ResultKind.BLOCK)  # type: ignore[union-attr]

    def test_user_prompt_submit_clears_turnless_session_evidence(self) -> None:
        identity = EventIdentity("codex", "turnless-session", "session")
        self.runtime.evidence.record_success(identity, "rtk pnpm hooks:test")
        prompt = {"hook_event_name": "UserPromptSubmit", "session_id": "turnless-session"}
        self.assertIsNone(self.runtime.handle(prompt))
        self.assertEqual(self.runtime.evidence.successful_commands(identity), ())

    def test_command_text_without_post_tool_success_is_not_evidence(self) -> None:
        stop = load_fixture("codex_stop_completion.json")
        stop["session_id"] = "codex-text-only-session"
        self.assertEqual(self.runtime.handle(stop).kind, ResultKind.BLOCK)  # type: ignore[union-attr]

    def test_stop_hook_reentry_never_blocks(self) -> None:
        self.assertIsNone(self.runtime.handle(load_fixture("codex_stop_reentry.json")))

    def test_rg_does_not_trigger_automatic_gitnexus_augment(self) -> None:
        payload = {
            "hook_event_name": "PreToolUse",
            "session_id": "search-session",
            "turn_id": "turn-1",
            "tool_use_id": "search-tool",
            "tool_name": "Bash",
            "tool_input": {"command": "rtk rg -n hook scripts"},
        }
        with patch("scripts.agent_hooks.repo_context.subprocess.run") as run:
            result = self.runtime.handle(payload)
        run.assert_not_called()
        self.assertEqual(result.kind, ResultKind.UPDATED_INPUT)  # type: ignore[union-attr]

    def test_owner_marker_matches_global_coordination_protocol(self) -> None:
        marker = json.loads(
            (PROJECT_ROOT / ".codex" / "hooks" / "status-capture-owner.json").read_text(encoding="utf-8")
        )
        self.assertEqual(marker, STATUS_CAPTURE_OWNER)

    def test_invalid_owner_marker_denies_codex_bash(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            project_root = Path(temp_dir)
            marker = project_root / ".codex" / "hooks" / "status-capture-owner.json"
            marker.parent.mkdir(parents=True)
            marker.write_text('{"schema": 1, "owner": "invalid"}', encoding="utf-8")
            runtime = HookRuntime(
                Platform.CODEX,
                project_root,
                project_root / ".evidence",
                project_root / ".status",
            )
            result = runtime.handle(load_fixture("codex_pre_validation.json"))
            self.assertIsNotNone(result)
            assert result is not None
            self.assertEqual(result.kind, ResultKind.BLOCK)


class AdapterPortabilityTests(unittest.TestCase):
    def test_adapters_run_from_a_different_clone_path(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            clone = Path(temp_dir) / "relocated-arclayer"
            shutil.copytree(
                PROJECT_ROOT / "scripts" / "agent_hooks",
                clone / "scripts" / "agent_hooks",
                ignore=shutil.ignore_patterns("__pycache__", "*.pyc"),
            )
            target = clone / ".codex" / "hooks"
            target.mkdir(parents=True)
            shutil.copy2(PROJECT_ROOT / ".codex" / "hooks" / "arclayer-hook.py", target)
            shutil.copy2(
                PROJECT_ROOT / ".codex" / "hooks" / "status-capture-owner.json",
                clone / ".codex" / "hooks",
            )

            payload = {"hook_event_name": "SessionStart", "session_id": "portable-session"}
            environment = {
                **os.environ,
                "ARCLAYER_HOOK_STATE_DIR": str(clone / ".evidence"),
                "AGENT_HOOK_STATE_DIR": str(clone / ".status"),
                "PYTHONDONTWRITEBYTECODE": "1",
            }
            result = subprocess.run(
                [sys.executable, str(clone / ".codex" / "hooks" / "arclayer-hook.py")],
                cwd=clone,
                input=json.dumps(payload),
                text=True,
                capture_output=True,
                env=environment,
                check=False,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("No Arclayer GitNexus index is present", result.stdout)

    def test_tracked_adapters_contain_no_checkout_specific_path(self) -> None:
        adapter = PROJECT_ROOT / ".codex" / "hooks" / "arclayer-hook.py"
        self.assertNotIn("/home/philip/Arclayer", adapter.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
