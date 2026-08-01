import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (file: string) => readFile(path.join(root, file), "utf8");

describe("Workspaces Platform routes", () => {
  it("exposes one canonical Workspace directory without deferred peer routes", async () => {
    const [registry, workspaces, routeTree] = await Promise.all([
      read("apps/platform/src/capabilities/module-registry.ts"),
      read("apps/platform/src/routes/_authenticated/workspaces/index.tsx"),
      read("apps/platform/src/routeTree.gen.ts"),
    ]);

    expect(registry).toContain('path: "/workspaces"');
    expect(registry).not.toContain('path: "/users"');
    expect(registry).not.toContain('path: "/projects"');
    expect(workspaces).toContain('createFileRoute("/_authenticated/workspaces/")');
    expect(routeTree).not.toContain("/_authenticated/users");
    expect(routeTree).not.toContain("/_authenticated/projects");
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
  });
});
