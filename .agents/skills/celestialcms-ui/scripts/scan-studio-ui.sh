#!/usr/bin/env bash
set -euo pipefail

need_cmd() { command -v "$1" >/dev/null 2>&1 || { echo "missing command: $1" >&2; exit 127; }; }
need_file() { [ -f "$1" ] || { echo "missing file: $1" >&2; exit 1; }; }

need_cmd git
need_cmd sed

ROOT="$(git rev-parse --show-toplevel)"
PROVIDERS="$ROOT/apps/studio/src/providers/app-providers.tsx"
CSS="$ROOT/apps/studio/src/index.css"

need_file "$PROVIDERS"
need_file "$CSS"

echo "== Studio entrypoints =="
echo "$PROVIDERS"
echo "$CSS"

echo
echo "== Studio AppProviders (head) =="
sed -n '1,120p' "$PROVIDERS"

echo
echo "== Studio index.css (head) =="
sed -n '1,120p' "$CSS"
