import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: Record<string, unknown>) => config,
  lazyRouteComponent: () => () => null,
}));
vi.mock("@/pages/system/directory/users/page", () => ({
  SystemDirectoryUsersPage: () => null,
}));
vi.mock("@/pages/system/directory/workspaces/page", () => ({
  SystemDirectoryWorkspacesPage: () => null,
}));
vi.mock("@/pages/system/directory/projects/page", () => ({
  SystemDirectoryProjectsPage: () => null,
}));

import { Route as ProjectsRoute } from "@/routes/system/tenants/projects/index";
import { Route as UsersRoute } from "@/routes/system/tenants/users/index";
import { Route as WorkspacesRoute } from "@/routes/system/tenants/workspaces/index";

type SearchRoute = {
  validateSearch: (search: Record<string, unknown>) => Record<string, unknown>;
};

function validate(route: unknown, search: Record<string, unknown>) {
  return (route as SearchRoute).validateSearch(search);
}

describe("system directory route search", () => {
  it("preserves valid user search, ordering, and account filters", () => {
    expect(
      validate(UsersRoute, {
        q: "  philip  ",
        ordering: "-last_login_at",
        status: "active",
        isSuperAdmin: "true",
        hasPassword: false,
        twoFactorEnabled: "false",
        oauthProvider: "any",
        createdFrom: "2026-07-01T08:00:00.000Z",
        createdTo: "2026-07-15T08:00:00.000Z",
        lastLoginFrom: "2026-07-10T08:00:00.000Z",
        lastLoginTo: "2026-07-20T08:00:00.000Z",
        workspaceMemberOfId: "workspace-1",
        projectMemberOfId: "project-1",
        ownedWorkspaceId: "workspace-2",
        ownedProjectId: "project-2",
      }),
    ).toEqual({
      q: "philip",
      ordering: "-last_login_at",
      status: "active",
      isSuperAdmin: true,
      hasPassword: false,
      twoFactorEnabled: false,
      oauthProvider: "any",
      createdFrom: "2026-07-01T08:00:00.000Z",
      createdTo: "2026-07-15T08:00:00.000Z",
      lastLoginFrom: "2026-07-10T08:00:00.000Z",
      lastLoginTo: "2026-07-20T08:00:00.000Z",
      workspaceMemberOfId: "workspace-1",
      projectMemberOfId: "project-1",
      ownedWorkspaceId: "workspace-2",
      ownedProjectId: "project-2",
    });
  });

  it("preserves valid workspace and project directory filters", () => {
    expect(
      validate(WorkspacesRoute, {
        q: "commerce",
        ordering: "-renewal_at",
        isArchived: "false",
        isActive: true,
        ownerUserId: "user-1",
        planCode: "pro",
        subscriptionStatus: "past_due",
        commerceRisk: "attention_required",
        createdFrom: "2026-07-01T08:00:00.000Z",
        createdTo: "2026-07-15T08:00:00.000Z",
        activityFrom: "2026-07-10T08:00:00.000Z",
        activityTo: "2026-07-20T08:00:00.000Z",
      }),
    ).toEqual({
      q: "commerce",
      ordering: "-renewal_at",
      isArchived: false,
      isActive: true,
      ownerUserId: "user-1",
      planCode: "pro",
      subscriptionStatus: "past_due",
      commerceRisk: "attention_required",
      createdFrom: "2026-07-01T08:00:00.000Z",
      createdTo: "2026-07-15T08:00:00.000Z",
      activityFrom: "2026-07-10T08:00:00.000Z",
      activityTo: "2026-07-20T08:00:00.000Z",
    });
    expect(
      validate(ProjectsRoute, {
        q: "storefront",
        ordering: "-activity_at",
        workspaceId: "workspace-1",
        isActive: "false",
        ownerUserId: "user-1",
        runtimeHealth: "degraded",
        domainState: "attention_required",
        releaseState: "scheduled",
        createdFrom: "2026-07-01T08:00:00.000Z",
        createdTo: "2026-07-15T08:00:00.000Z",
        activityFrom: "2026-07-10T08:00:00.000Z",
        activityTo: "2026-07-20T08:00:00.000Z",
      }),
    ).toEqual({
      q: "storefront",
      ordering: "-activity_at",
      workspaceId: "workspace-1",
      isActive: false,
      ownerUserId: "user-1",
      runtimeHealth: "degraded",
      domainState: "attention_required",
      releaseState: "scheduled",
      createdFrom: "2026-07-01T08:00:00.000Z",
      createdTo: "2026-07-15T08:00:00.000Z",
      activityFrom: "2026-07-10T08:00:00.000Z",
      activityTo: "2026-07-20T08:00:00.000Z",
    });
  });

  it("drops malformed directory route values", () => {
    expect(
      validate(UsersRoute, {
        ordering: "password_hash",
        status: "deleted",
        isSuperAdmin: "yes",
        oauthProvider: "github",
        createdFrom: "not-a-date",
        lastLoginTo: {},
      }),
    ).toEqual({
      q: undefined,
      ordering: undefined,
      status: undefined,
      isSuperAdmin: undefined,
      hasPassword: undefined,
      twoFactorEnabled: undefined,
      oauthProvider: undefined,
      createdFrom: undefined,
      createdTo: undefined,
      lastLoginFrom: undefined,
      lastLoginTo: undefined,
      workspaceMemberOfId: undefined,
      projectMemberOfId: undefined,
      ownedWorkspaceId: undefined,
      ownedProjectId: undefined,
    });
    expect(
      validate(WorkspacesRoute, {
        ordering: "renewal_date",
        isActive: "1",
        subscriptionStatus: "paused",
        commerceRisk: "unknown",
        createdFrom: "not-a-date",
        activityTo: {},
      }),
    ).toEqual({
      q: undefined,
      ordering: undefined,
      isArchived: undefined,
      isActive: undefined,
      ownerUserId: undefined,
      planCode: undefined,
      subscriptionStatus: undefined,
      commerceRisk: undefined,
      createdFrom: undefined,
      createdTo: undefined,
      activityFrom: undefined,
      activityTo: undefined,
    });
    expect(
      validate(ProjectsRoute, {
        ordering: "health",
        isActive: null,
        runtimeHealth: "unknown",
        domainState: "pending",
        releaseState: "draft",
        createdFrom: "not-a-date",
        activityTo: {},
      }),
    ).toEqual({
      q: undefined,
      ordering: undefined,
      workspaceId: undefined,
      isActive: undefined,
      ownerUserId: undefined,
      runtimeHealth: undefined,
      domainState: undefined,
      releaseState: undefined,
      createdFrom: undefined,
      createdTo: undefined,
      activityFrom: undefined,
      activityTo: undefined,
    });
  });
});
