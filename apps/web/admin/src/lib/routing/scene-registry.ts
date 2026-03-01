import type { ComponentType, PropsWithChildren } from "react";

import { AdminLayout } from "@/layouts/admin-layout";
import { AuthLayout } from "@/layouts/auth-layout";
import { DevLayout } from "@/layouts/dev-layout";
import { EditorLayout } from "@/layouts/editor-layout";
import { InviteLayout } from "@/layouts/invite-layout";
import { SetupLayout } from "@/layouts/setup-layout";
import {
  isAcceptInvitePath,
  isAuthScenePath,
  isDevToolsPath,
  isEditorPath,
  isSetupPath,
} from "@/lib/routing/route-identity";

export type SceneKey = "dev" | "setup" | "auth" | "invite" | "editor" | "admin";

interface SceneEntry {
  key: SceneKey;
  layout: ComponentType<PropsWithChildren>;
  match: (pathname: string) => boolean;
}

// Order matters — first match wins, "admin" is the fallback.
const SCENE_ENTRIES: SceneEntry[] = [
  { key: "dev", layout: DevLayout, match: isDevToolsPath },
  { key: "setup", layout: SetupLayout, match: isSetupPath },
  { key: "auth", layout: AuthLayout, match: isAuthScenePath },
  { key: "invite", layout: InviteLayout, match: isAcceptInvitePath },
  { key: "editor", layout: EditorLayout, match: isEditorPath },
  { key: "admin", layout: AdminLayout, match: () => true },
];

const LAYOUT_BY_KEY = Object.fromEntries(SCENE_ENTRIES.map((e) => [e.key, e.layout])) as Record<
  SceneKey,
  ComponentType<PropsWithChildren>
>;

export function resolveSceneKey(pathname: string): SceneKey {
  return SCENE_ENTRIES.find((e) => e.match(pathname))?.key ?? "admin";
}

export function getSceneLayout(key: SceneKey): ComponentType<PropsWithChildren> {
  return LAYOUT_BY_KEY[key];
}
