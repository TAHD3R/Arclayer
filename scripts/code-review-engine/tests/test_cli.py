from __future__ import annotations

import json
from pathlib import Path

from code_review_engine.cli import main


def test_cli_json_empty_report(capsys, tmp_path: Path) -> None:
    exit_code = main(["--repo-root", str(tmp_path), "--scope", "backend", "--format", "json"])

    captured = capsys.readouterr()
    payload = json.loads(captured.out)
    assert exit_code == 0
    assert payload["selector"]["scope"] == "backend"
    assert payload["summary"]["total_findings"] == 0
    assert "service.no-direct-orm" in payload["rules_applied"]


def test_cli_module_scope_requires_module(capsys, tmp_path: Path) -> None:
    exit_code = main(["--repo-root", str(tmp_path), "--scope", "module"])

    captured = capsys.readouterr()
    assert exit_code == 2
    assert "--scope module requires --module" in captured.err


def test_cli_rules_filter(capsys, tmp_path: Path) -> None:
    exit_code = main(
        [
            "--repo-root",
            str(tmp_path),
            "--rules",
            "service.no-direct-orm",
            "--format",
            "json",
        ]
    )

    captured = capsys.readouterr()
    payload = json.loads(captured.out)
    assert exit_code == 0
    assert payload["selector"]["scope"] == "rules"
    assert payload["rules_applied"] == ["service.no-direct-orm"]
