#!/usr/bin/env bash
set -euo pipefail

need_cmd() { command -v "$1" >/dev/null 2>&1 || { echo "missing command: $1" >&2; exit 127; }; }
need_file() { [ -f "$1" ] || { echo "missing file: $1" >&2; exit 1; }; }

need_cmd git
need_cmd rg

ROOT="$(git rev-parse --show-toplevel)"

DESIGN_GUIDE="$ROOT/docs/guidelines/design-guideline.md"
TOKENS="$ROOT/packages/ui/tokens/src/tokens.css"

ANCHOR_BASICS="$ROOT/apps/admin/src/pages/workspaces/settings/workspace/basics/components/workspace-settings-basics-view.tsx"
ANCHOR_ASSETS="$ROOT/apps/admin/src/pages/workspaces/assets/components/assets-page-view.tsx"
ANCHOR_ROLES="$ROOT/apps/admin/src/pages/workspaces/team/roles/components/team-roles-view.tsx"
ANCHOR_INVITE="$ROOT/apps/admin/src/pages/workspaces/team/shared/components/invite-members-dialog.tsx"

need_file "$DESIGN_GUIDE"
need_file "$TOKENS"
need_file "$ANCHOR_BASICS"
need_file "$ANCHOR_ASSETS"
need_file "$ANCHOR_ROLES"
need_file "$ANCHOR_INVITE"

echo "== Admin anchors: ok =="
printf "%s\n" "$ANCHOR_BASICS" "$ANCHOR_ASSETS" "$ANCHOR_ROLES" "$ANCHOR_INVITE"

echo
echo "== Key patterns (must exist) =="
rg -n "DefaultPage" "$ANCHOR_BASICS" >/dev/null || { echo "Expected DefaultPage in basics view." >&2; exit 1; }
rg -n "ContentGuard" "$ANCHOR_BASICS" >/dev/null || { echo "Expected ContentGuard in basics view." >&2; exit 1; }
rg -n "SettingDialog" "$ANCHOR_INVITE" >/dev/null || { echo "Expected SettingDialog in invite dialog." >&2; exit 1; }
rg -n "autoInsertSpace\\s*=\\s*\\{false\\}" "$ANCHOR_ASSETS" "$ANCHOR_ROLES" "$ANCHOR_INVITE" >/dev/null || {
  echo "Expected Antd Button autoInsertSpace={false} in anchors." >&2
  exit 1
}

echo
echo "== Overlay popup container hints =="
rg -n "getPopupContainerWithinOverlay|getPopupContainer\\s*=" "$ANCHOR_INVITE" || true

echo
echo "== DefaultPage header rhythm (reference) =="
rg -n "text-largetitle|text-label-secondary|extra\\s*=" "$ROOT/apps/admin/src/components/common/default-page.tsx" || true
