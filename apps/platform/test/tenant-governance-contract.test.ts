import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { PLATFORM_CAPABILITY_MODULES } from "@/capabilities/module-registry";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (file: string) => readFile(path.join(root, file), "utf8");

describe("Workspaces Platform routes", () => {
  it("exposes the three canonical Workspace peer routes without aliases", async () => {
    const [registry, workspaces, users, projects, routeTree] = await Promise.all([
      read("apps/platform/src/capabilities/module-registry.ts"),
      read("apps/platform/src/routes/_authenticated/workspaces/index.tsx"),
      read("apps/platform/src/routes/_authenticated/users.tsx"),
      read("apps/platform/src/routes/_authenticated/projects.tsx"),
      read("apps/platform/src/routeTree.gen.ts"),
    ]);

    expect(registry).toContain('path: "/workspaces"');
    expect(registry).toContain('path: "/users"');
    expect(registry).toContain('path: "/projects"');
    expect(
      PLATFORM_CAPABILITY_MODULES["tenants.workspaces"].destinations.map(({ path }) => path),
    ).toEqual(["/workspaces", "/users", "/projects"]);
    expect(workspaces).toContain('createFileRoute("/_authenticated/workspaces/")');
    expect(users).toContain('createFileRoute("/_authenticated/users")');
    expect(projects).toContain('createFileRoute("/_authenticated/projects")');
    expect(routeTree).toContain("/_authenticated/workspaces/");
    expect(routeTree).toContain("/_authenticated/users");
    expect(routeTree).toContain("/_authenticated/projects");
    expect(routeTree).toContain("/_authenticated/attention/$signalId");
    expect(routeTree).not.toContain("/_authenticated/operations/jobs");
    expect(routeTree).not.toMatch(/["']\/(?:system|platform|tenants)(?:\/|["'])/);
  });

  it("keeps Workspace discovery and lifecycle actions inside the Platform SDK boundary", async () => {
    const [api, workspaces, detail, dialogs] = await Promise.all([
      read("apps/platform/src/api/tenant-directory.ts"),
      read("apps/platform/src/pages/tenant-workspaces.tsx"),
      read("apps/platform/src/components/tenant-workspace-detail.tsx"),
      read("apps/platform/src/components/tenant-workspace-dialogs.tsx"),
    ]);
    const sources = [api, workspaces, detail, dialogs].join("\n");

    expect(api).toContain('from "@arclayer/platform-openapi"');
    expect(api).toContain("platformListWorkspaces");
    expect(api).toContain("platformUpdateWorkspace");
    expect(api).toContain("platformDisableWorkspace");
    expect(api).toContain("platformEnableWorkspace");
    expect(api).toContain("platformArchiveWorkspace");
    expect(api).toContain("platformRestoreWorkspace");
    expect(sources).not.toMatch(/apps\/admin|@arclayer\/admin/);
    expect(workspaces).toContain("TenantWorkspaceDetail");
    expect(detail).toContain("WorkspaceAccessDialog");
    expect(dialogs).toContain("accessAttempt.current?.fingerprint === fingerprint");
    expect(dialogs).toContain("accessAttempt.current = null");
  });
});
