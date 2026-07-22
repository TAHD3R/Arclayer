import type { ComponentType, PropsWithChildren } from "react";

import { AdminLayout } from "@/layouts/admin-layout";
import { AuthLayout } from "@/layouts/auth-layout";
import { CreationLayout } from "@/layouts/creation-layout";
import { GlobalLayout } from "@/layouts/global-layout";
import { InviteLayout } from "@/layouts/invite-layout";
import {
  isAcceptInvitePath,
  isAuthScenePath,
  isCreationEditorPath,
  isGlobalPath,
} from "@/lib/routing/route-identity";

export type SceneKey = "auth" | "invite" | "creation" | "global" | "admin";

interface SceneEntry {
  key: SceneKey;
  layout: ComponentType<PropsWithChildren>;
  match: (pathname: string) => boolean;
}

// Order matters — first match wins, "admin" is the fallback.
const SCENE_ENTRIES: SceneEntry[] = [
  { key: "auth", layout: AuthLayout, match: isAuthScenePath },
  { key: "invite", layout: InviteLayout, match: isAcceptInvitePath },
  { key: "creation", layout: CreationLayout, match: isCreationEditorPath },
  { key: "global", layout: GlobalLayout, match: isGlobalPath },
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
