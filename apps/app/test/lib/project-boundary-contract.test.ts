import { describe, expect, test } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(__dirname, "../../../..");

function read(relativePath: string): string {
  return readFileSync(resolve(repoRoot, relativePath), "utf8");
}

describe("project boundary contract", () => {
  test("project routes pass projectId to project-owned surfaces", () => {
    const routeFiles = [
      "apps/app/src/routes/projects/$projectId/content/models/index.lazy.tsx",
      "apps/app/src/routes/projects/$projectId/content/automation/index.lazy.tsx",
      "apps/app/src/routes/projects/$projectId/content/site-builder/index.lazy.tsx",
      "apps/app/src/routes/projects/$projectId/content/library/$itemId/index.lazy.tsx",
    ];

    const violations = routeFiles.flatMap((relativePath) => {
      const source = read(relativePath);
      return [
        source.includes("workspaceId ?? projectId")
          ? `${relativePath} uses workspaceId ?? projectId`
          : null,
        source.includes("currentWorkspaceId") ? `${relativePath} reads currentWorkspaceId` : null,
        source.includes("lastWorkspaceId") ? `${relativePath} reads lastWorkspaceId` : null,
      ].filter(Boolean);
    });

    expect(violations).toEqual([]);
  });

  test("project-owned Admin pages live under pages/projects", () => {
    const workspaceProjectPageFolders = [
      "apps/app/src/pages/workspaces/content",
      "apps/app/src/pages/workspaces/settings/site",
      "apps/app/src/pages/workspaces/settings/workspace/content",
    ];

    const violations = workspaceProjectPageFolders.filter((relativePath) =>
      existsSync(resolve(repoRoot, relativePath)),
    );

    expect(violations).toEqual([]);
  });

  test("project content route helpers use project naming and projectId inputs", () => {
    const source = read("apps/app/src/lib/routing/project-content-routing.ts");
    const forbiddenMarkers = ["workspaceId;", "currentWorkspaceId", "lastWorkspaceId"];

    const violations = forbiddenMarkers.filter((marker) => source.includes(marker));

    expect(violations).toEqual([]);
  });

  test("Admin content and automation APIs use project paths for project-owned CMS management", () => {
    const sources = [
      "apps/app/src/api/content.ts",
      "apps/app/src/api/automation.ts",
      "apps/app/src/api/project-site.ts",
    ].map((relativePath) => [relativePath, read(relativePath)] as const);

    const violations = sources.flatMap(([relativePath, source]) => {
      const projectOwnedMarkers = [
        "workspacePath(workspaceId, `/content/",
        'workspacePath(workspaceId, "/content/',
        'workspacePath(workspaceId, "/publish',
        'workspacePath(workspaceId, "/releases',
        'workspacePath(workspaceId, "/automation',
        'workspacePath(workspaceId, "/site',
      ];
      return projectOwnedMarkers
        .filter((marker) => source.includes(marker))
        .map((marker) => `${relativePath} contains ${marker}`);
    });

    expect(violations).toEqual([]);
  });

  test("stale project settings and extensions routes are removed from project admin surfaces", () => {
    const forbiddenProjectRoutes = [
      "apps/app/src/routes/projects/$projectId/extensions/index.tsx",
      "apps/app/src/routes/projects/$projectId/extensions/index.lazy.tsx",
      "apps/app/src/routes/projects/$projectId/extensions/$extensionSlug/index.tsx",
      "apps/app/src/routes/projects/$projectId/extensions/$extensionSlug/index.lazy.tsx",
      "apps/app/src/routes/projects/$projectId/settings/members/index.tsx",
      "apps/app/src/api/project-themes.ts",
      "apps/app/src/pages/projects/extensions",
    ];

    const violations = forbiddenProjectRoutes.filter((relativePath) =>
      existsSync(resolve(repoRoot, relativePath)),
    );

    const projectNavSource = read("apps/app/src/constants/menu/project.ts");
    if (projectNavSource.includes('to: "/settings/members"')) {
      violations.push("apps/app/src/constants/menu/project.ts points Project Settings to members");
    }

    expect(violations).toEqual([]);
  });
});
