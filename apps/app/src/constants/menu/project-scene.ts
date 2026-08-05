import { getProjectNavItems } from "@/constants/menu/project";
import { mapWorkspaceNavItems } from "@/layouts/admin-scene-utils";
import { projectHomePath } from "@/lib/routing/workspace-routing";
import type { AdminNavItem } from "@/types/admin-nav";

export function resolveProjectSceneNavItems(projectId: string): AdminNavItem[] {
  return mapWorkspaceNavItems(getProjectNavItems(), projectHomePath(projectId));
}
