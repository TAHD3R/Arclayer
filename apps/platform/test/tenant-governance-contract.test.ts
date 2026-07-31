import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (file: string) => readFile(path.join(root, file), "utf8");

describe("Tenant Governance Platform routes", () => {
  it("opens the Workspace-first queue and keeps Users and Projects as peer views", async () => {
    const [defaultRoute, shell, workspaces, users, projects] = await Promise.all([
      read("apps/platform/src/routes/_authenticated/tenants/index.tsx"),
      read("apps/platform/src/pages/tenant-governance.tsx"),
      read("apps/platform/src/routes/_authenticated/tenants/workspaces/index.tsx"),
      read("apps/platform/src/routes/_authenticated/tenants/users/index.tsx"),
      read("apps/platform/src/routes/_authenticated/tenants/projects/index.tsx"),
    ]);

    expect(defaultRoute).toContain('redirect({ to: "/tenants/workspaces" })');
    expect(shell).toContain('to: "/tenants/workspaces"');
    expect(shell).toContain('to: "/tenants/users"');
    expect(shell).toContain('to: "/tenants/projects"');
    expect([workspaces, users, projects].join("\n")).not.toContain("overview");
  });

  it("keeps server query contracts and generated SDK ownership inside Platform", async () => {
    const [api, workspaces, users, projects] = await Promise.all([
      read("apps/platform/src/api/tenant-directory.ts"),
      read("apps/platform/src/pages/tenant-workspaces.tsx"),
      read("apps/platform/src/pages/tenant-users.tsx"),
      read("apps/platform/src/pages/tenant-projects.tsx"),
    ]);
    const sources = [api, workspaces, users, projects].join("\n");

    expect(api).toContain('from "@arclayer/platform-openapi"');
    expect(api).toContain("platformListWorkspaces");
    expect(api).toContain("platformListUsers");
    expect(api).toContain("platformListProjects");
    expect(sources).not.toMatch(/apps\/admin|@arclayer\/admin/);
    expect(sources).not.toContain("platformDelete");
  });
});
