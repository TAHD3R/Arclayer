from __future__ import annotations

import subprocess

import pytest

from scripts import run_api_compositions


class _Process:
    def __init__(self, *, exits_after_first_poll: bool) -> None:
        self._poll_count = 0
        self._exits_after_first_poll = exits_after_first_poll

    def poll(self) -> int | None:
        self._poll_count += 1
        if self._exits_after_first_poll and self._poll_count > 1:
            return 0
        return None

    def wait(self, timeout: float | None = None) -> int:
        if timeout is not None:
            raise subprocess.TimeoutExpired(cmd="uvicorn", timeout=timeout)
        return 0

    def terminate(self) -> None:
        return None


def test_dev_runner_starts_each_api_composition_exactly_once(monkeypatch: pytest.MonkeyPatch) -> None:
    started: list[tuple[str, int]] = []

    def start(module: str, port: int) -> _Process:
        started.append((module, port))
        return _Process(exits_after_first_poll=module == "src.main:app")

    monkeypatch.setattr(run_api_compositions, "_start", start)
    monkeypatch.setattr(run_api_compositions.signal, "signal", lambda *_args: None)

    with pytest.raises(SystemExit, match="0"):
        run_api_compositions.main()

    assert started == [("src.main:app", 8000), ("src.platform_main:app", 8001)]
