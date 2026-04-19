from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from src.modules.sites.graphql.hooks import graphql_hooks_manifest
from src.modules.sites.graphql.registry import graphql_schema_registry_manifest
from src.modules.sites.graphql.schema import get_graphql_schema_sdl
from src.modules.sites.graphql.subscriptions import graphql_subscription_manifest

REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_ARTIFACTS_DIR = REPO_ROOT / "apps" / "api" / "src" / "modules" / "sites" / "graphql" / "artifacts" / "v1"
DEFAULT_SCHEMA_PATH = DEFAULT_ARTIFACTS_DIR / "schema.graphql"
DEFAULT_MANIFEST_PATH = DEFAULT_ARTIFACTS_DIR / "manifest.json"


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Export versioned GraphQL schema artifacts for Arclayer delivery queries."
    )
    parser.add_argument(
        "--out",
        default=str(DEFAULT_SCHEMA_PATH),
        help="Output GraphQL SDL path. Defaults to the v1 schema snapshot path.",
    )
    parser.add_argument(
        "--manifest-out",
        default=str(DEFAULT_MANIFEST_PATH),
        help="Output manifest path. Defaults to the v1 manifest snapshot path.",
    )
    return parser.parse_args()


def render_graphql_schema() -> str:
    schema = get_graphql_schema_sdl().strip()
    return schema + "\n"


def _sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def build_manifest(*, schema_text: str, schema_path: Path) -> dict[str, object]:
    return {
        "artifactVersion": "1.0.0",
        "hooks": graphql_hooks_manifest(),
        "perspectives": ["published", "preview"],
        "queryMode": "read-only",
        "registry": graphql_schema_registry_manifest(),
        "schemaFamily": "delivery-graphql",
        "schemaFile": schema_path.name,
        "sha256": _sha256(schema_text),
        "subscriptions": graphql_subscription_manifest(),
    }


def write_schema_artifacts(*, schema_path: Path, manifest_path: Path) -> tuple[Path, Path]:
    schema_text = render_graphql_schema()
    schema_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    schema_path.write_text(schema_text, encoding="utf-8")
    manifest = build_manifest(schema_text=schema_text, schema_path=schema_path)
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    return schema_path, manifest_path


def main() -> None:
    args = _parse_args()
    schema_path = Path(args.out).expanduser().resolve()
    manifest_path = Path(args.manifest_out).expanduser().resolve()
    write_schema_artifacts(schema_path=schema_path, manifest_path=manifest_path)
    print(f"[graphql] exported schema: {schema_path.relative_to(REPO_ROOT)}")
    print(f"[graphql] exported manifest: {manifest_path.relative_to(REPO_ROOT)}")


if __name__ == "__main__":
    main()
