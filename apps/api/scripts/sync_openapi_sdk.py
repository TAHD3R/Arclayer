from __future__ import annotations

import subprocess
from dataclasses import dataclass
from pathlib import Path

from scripts.export_openapi import build_openapi_schema, render_openapi_schema

REPO_ROOT = Path(__file__).resolve().parents[3]


@dataclass(frozen=True)
class OpenApiTarget:
    composition: str
    package_dir: Path

    @property
    def schema_path(self) -> Path:
        return self.package_dir / "openapi.json"

    @property
    def sdk_marker_path(self) -> Path:
        return self.package_dir / "src" / "generated" / "client.gen.ts"


OPENAPI_TARGETS = (
    OpenApiTarget(composition="product", package_dir=REPO_ROOT / "packages" / "openapi"),
    OpenApiTarget(composition="platform", package_dir=REPO_ROOT / "packages" / "platform-openapi"),
)


def _read_existing_schema(target: OpenApiTarget) -> str | None:
    if not target.schema_path.exists():
        return None
    return target.schema_path.read_text(encoding="utf-8")


def _write_schema(target: OpenApiTarget, schema_text: str) -> None:
    target.schema_path.parent.mkdir(parents=True, exist_ok=True)
    target.schema_path.write_text(schema_text, encoding="utf-8")


def _generate_sdk(target: OpenApiTarget) -> None:
    subprocess.run(["pnpm", "generate:sdk"], cwd=target.package_dir, check=True)


def _sync_target(target: OpenApiTarget) -> None:
    schema_text = render_openapi_schema(build_openapi_schema(composition=target.composition))
    previous_schema = _read_existing_schema(target)
    schema_changed = previous_schema != schema_text
    sdk_missing = not target.sdk_marker_path.exists()

    if schema_changed:
        _write_schema(target, schema_text)
        print(f"[openapi:{target.composition}] updated schema: {target.schema_path.relative_to(REPO_ROOT)}")
    elif sdk_missing:
        print(f"[openapi:{target.composition}] schema unchanged but generated SDK is missing; regenerating")
    else:
        print(f"[openapi:{target.composition}] schema unchanged; skipping SDK generation")
        return

    _generate_sdk(target)
    print(f"[openapi:{target.composition}] SDK synchronized")


def main() -> None:
    for target in OPENAPI_TARGETS:
        _sync_target(target)


if __name__ == "__main__":
    main()
