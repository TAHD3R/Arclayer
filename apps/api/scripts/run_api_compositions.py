from __future__ import annotations

import signal
import subprocess
import sys
import time


def _start(module: str, port: int) -> subprocess.Popen[bytes]:
    return subprocess.Popen([
        sys.executable,
        "-m",
        "uvicorn",
        module,
        "--reload",
        "--host",
        "0.0.0.0",
        "--port",
        str(port),
    ])


def main() -> None:
    processes = [_start("src.main:app", 8000), _start("src.platform_main:app", 8001)]

    def stop(_signum: int, _frame: object) -> None:
        for process in processes:
            process.terminate()

    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)

    exit_code = 0
    try:
        while True:
            completed = [code for process in processes if (code := process.poll()) is not None]
            if completed:
                exit_code = completed[0]
                break
            time.sleep(0.2)
    finally:
        for process in processes:
            if process.poll() is None:
                process.terminate()
        for process in processes:
            process.wait()

    raise SystemExit(exit_code)


if __name__ == "__main__":
    main()
