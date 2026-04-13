from __future__ import annotations

import subprocess
from pathlib import Path

from scripts.export_openapi import build_openapi_schema, render_openapi_schema

REPO_ROOT = Path(__file__).resolve().parents[3]
OPENAPI_PACKAGE_DIR = REPO_ROOT / "packages" / "openapi"
OPENAPI_SCHEMA_PATH = OPENAPI_PACKAGE_DIR / "openapi.json"
SDK_MARKER_PATH = OPENAPI_PACKAGE_DIR / "src" / "generated" / "client.gen.ts"


def _read_existing_schema() -> str | None:
    if not OPENAPI_SCHEMA_PATH.exists():
        return None
    return OPENAPI_SCHEMA_PATH.read_text(encoding="utf-8")


def _write_schema(schema_text: str) -> None:
    OPENAPI_SCHEMA_PATH.parent.mkdir(parents=True, exist_ok=True)
    OPENAPI_SCHEMA_PATH.write_text(schema_text, encoding="utf-8")


def _generate_sdk() -> None:
    subprocess.run(["pnpm", "generate:sdk"], cwd=OPENAPI_PACKAGE_DIR, check=True)


def main() -> None:
    schema_text = render_openapi_schema(build_openapi_schema())
    previous_schema = _read_existing_schema()
    schema_changed = previous_schema != schema_text
    sdk_missing = not SDK_MARKER_PATH.exists()

    if schema_changed:
        _write_schema(schema_text)
        print(f"[openapi] updated schema: {OPENAPI_SCHEMA_PATH.relative_to(REPO_ROOT)}")
    elif sdk_missing:
        print("[openapi] schema unchanged but generated SDK is missing; regenerating")
    else:
        print("[openapi] schema unchanged; skipping SDK generation")
        return

    _generate_sdk()
    print("[openapi] SDK synchronized")


if __name__ == "__main__":
    main()
