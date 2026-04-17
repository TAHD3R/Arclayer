from __future__ import annotations

import argparse
import json
from pathlib import Path

from scripts.export_graphql_schema import (
    DEFAULT_MANIFEST_PATH,
    DEFAULT_SCHEMA_PATH,
    build_manifest,
    render_graphql_schema,
)


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Verify versioned GraphQL schema artifacts match the live schema.")
    parser.add_argument(
        "--schema",
        default=str(DEFAULT_SCHEMA_PATH),
        help="Schema snapshot path to verify.",
    )
    parser.add_argument(
        "--manifest",
        default=str(DEFAULT_MANIFEST_PATH),
        help="Manifest snapshot path to verify.",
    )
    return parser.parse_args()


def _read_text(path: Path) -> str:
    if not path.exists():
        raise SystemExit(f"Missing GraphQL artifact: {path}")
    return path.read_text(encoding="utf-8")


def main() -> None:
    args = _parse_args()
    schema_path = Path(args.schema).expanduser().resolve()
    manifest_path = Path(args.manifest).expanduser().resolve()

    actual_schema = render_graphql_schema()
    expected_schema = _read_text(schema_path)
    if expected_schema != actual_schema:
        raise SystemExit(f"GraphQL schema snapshot mismatch: {schema_path}")

    actual_manifest = build_manifest(schema_text=actual_schema, schema_path=schema_path)
    expected_manifest = json.loads(_read_text(manifest_path))
    if expected_manifest != actual_manifest:
        raise SystemExit(f"GraphQL schema manifest mismatch: {manifest_path}")

    print(f"[graphql] schema snapshot verified: {schema_path}")
    print(f"[graphql] manifest verified: {manifest_path}")


if __name__ == "__main__":
    main()
