#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo
echo "### scan-admin-ui-anchors"
bash "$DIR/scan-admin-ui-anchors.sh"

echo
echo "### scan-tokens-summary"
bash "$DIR/scan-tokens-summary.sh"

echo
echo "### scan-studio-ui"
bash "$DIR/scan-studio-ui.sh"
