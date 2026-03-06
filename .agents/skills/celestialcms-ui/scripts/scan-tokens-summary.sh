#!/usr/bin/env bash
set -euo pipefail

need_cmd() { command -v "$1" >/dev/null 2>&1 || { echo "missing command: $1" >&2; exit 127; }; }
need_file() { [ -f "$1" ] || { echo "missing file: $1" >&2; exit 1; }; }

need_cmd git
need_cmd rg

ROOT="$(git rev-parse --show-toplevel)"
TOKENS="$ROOT/packages/ui/tokens/src/tokens.css"
need_file "$TOKENS"

echo "== Tokens summary: $TOKENS =="
echo
echo "-- Primary / destructive / border / radius --"
rg -n "^\\s*--primary:|^\\s*--destructive:|^\\s*--border:|^\\s*--radius:" "$TOKENS"

echo
echo "-- Typography scale (semantic) --"
rg -n "^\\s*--font-size-(largetitle|title2|body|callout|footnote|caption):" "$TOKENS"
rg -n "^\\s*--line-height-(largetitle|title2|body|callout|footnote|caption):" "$TOKENS"
rg -n "^\\s*--font-weight-(largetitle|title2|body|callout|footnote|caption):" "$TOKENS"

echo
echo "-- Label colors --"
rg -n "^\\s*--text-(primary|secondary|tertiary|quaternary):" "$TOKENS"
