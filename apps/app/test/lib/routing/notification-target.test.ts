import { describe, expect, it } from "vitest";

import {
  canAccessNotificationNavigationTarget,
  resolveNotificationTarget,
} from "@/lib/routing/notification-target";
import type { NotificationOut as NotificationItem } from "@arclayer/openapi";

const GLOBAL_WORKSPACE_ID = "00000000-0000-0000-0000-000000000000";

function makeNotification(target: NotificationItem["target"]): NotificationItem {
  return {
    id: "notification-1",
    workspaceId: "workspace-1",
    recipientUserId: "user-1",
    actorUserId: null,
    category: "team",
    title: "Title",
    body: "Message",
    target,
    campaignSurface: null,
    eventName: null,
    dedupeKey: null,
    createdAt: "2026-04-21T00:00:00.000Z",
    updatedAt: "2026-04-21T00:00:00.000Z",
    readAt: null,
    archivedAt: null,
  };
}

describe("resolveNotificationTarget", () => {
  it("resolves inbox and typed workspace settings targets", () => {
    expect(resolveNotificationTarget(makeNotification({ kind: "inbox" }))).toEqual({
      type: "navigate",
      to: "/notifications",
    });
    expect(
      resolveNotificationTarget(
        makeNotification({ kind: "workspace_settings", destination: "general" }),
      ),
    ).toEqual({ type: "settings", target: { screen: "workspace.general" } });
    expect(
      resolveNotificationTarget(
        makeNotification({ kind: "workspace_settings", destination: "plan_usage" }),
      ),
    ).toEqual({ type: "settings", target: { screen: "workspace.plan-usage" } });
    expect(
      resolveNotificationTarget(
        makeNotification({
          kind: "workspace_settings",
          destination: "people",
          section: "pending-invitations",
        }),
      ),
    ).toEqual({
      type: "settings",
      target: { screen: "workspace.people", section: "pending-invitations" },
    });
    expect(
      resolveNotificationTarget(
        makeNotification({
          kind: "workspace_settings",
          destination: "roles",
          section: "roles-table",
        }),
      ),
    ).toEqual({
      type: "settings",
      target: { screen: "workspace.roles", section: "roles-table" },
    });
  });

  it("resolves typed project destinations", () => {
    expect(
      resolveNotificationTarget(
        makeNotification({ kind: "project", projectId: "project-1", destination: "overview" }),
      ),
    ).toEqual({ type: "navigate", to: "/projects/project-1/" });
    expect(
      resolveNotificationTarget(
        makeNotification({
          kind: "project",
          projectId: "project-1",
          destination: "settings_api",
        }),
      ),
    ).toEqual({ type: "navigate", to: "/projects/project-1/settings/api" });
    expect(
      resolveNotificationTarget(
        makeNotification({
          kind: "project",
          projectId: "project-1",
          destination: "content_library",
          entityId: "entry/1",
        }),
      ),
    ).toEqual({ type: "navigate", to: "/projects/project-1/content/library/entry%2F1" });
    expect(
      resolveNotificationTarget(
        makeNotification({
          kind: "project",
          projectId: "project-1",
          destination: "website_releases",
        }),
      ),
    ).toEqual({ type: "navigate", to: "/projects/project-1/website/project-releases" });
  });

  it("resolves typed feedback tickets", () => {
    expect(
      resolveNotificationTarget(
        makeNotification({ kind: "feedback_ticket", ticketId: "ticket-1" }),
      ),
    ).toEqual({ type: "feedback", ticketId: "ticket-1" });
  });

  it("authorizes global, current-workspace, and project targets by accessible scope", () => {
    const workspaceTarget = { kind: "workspace_settings", destination: "general" } as const;
    const projectTarget = {
      kind: "project",
      projectId: "project-1",
      destination: "overview",
    } as const;

    expect(
      canAccessNotificationNavigationTarget({
        notificationWorkspaceId: GLOBAL_WORKSPACE_ID,
        currentWorkspaceId: "workspace-current",
        target: workspaceTarget,
        accessibleWorkspaceIds: new Set(["workspace-current"]),
        accessibleProjectIds: new Set(),
      }),
    ).toBe(true);
    expect(
      canAccessNotificationNavigationTarget({
        notificationWorkspaceId: "workspace-current",
        currentWorkspaceId: "workspace-current",
        target: workspaceTarget,
        accessibleWorkspaceIds: new Set(["workspace-current"]),
        accessibleProjectIds: new Set(),
      }),
    ).toBe(true);
    expect(
      canAccessNotificationNavigationTarget({
        notificationWorkspaceId: "workspace-current",
        currentWorkspaceId: "workspace-current",
        target: workspaceTarget,
        accessibleWorkspaceIds: new Set(["workspace-other"]),
        accessibleProjectIds: new Set(),
      }),
    ).toBe(false);
    expect(
      canAccessNotificationNavigationTarget({
        notificationWorkspaceId: "workspace-current",
        currentWorkspaceId: "workspace-current",
        target: projectTarget,
        accessibleWorkspaceIds: new Set(),
        accessibleProjectIds: new Set(["project-1"]),
      }),
    ).toBe(true);
    expect(
      canAccessNotificationNavigationTarget({
        notificationWorkspaceId: "workspace-current",
        currentWorkspaceId: "workspace-current",
        target: projectTarget,
        accessibleWorkspaceIds: new Set(),
        accessibleProjectIds: new Set(),
      }),
    ).toBe(false);
  });

  it("throws explicit errors for invalid workspace setting sections", () => {
    expect(() =>
      resolveNotificationTarget(
        makeNotification({
          kind: "workspace_settings",
          destination: "people",
          section: "roles-table",
        }),
      ),
    ).toThrow("NOTIFICATION_WORKSPACE_PEOPLE_SECTION_INVALID");
    expect(() =>
      resolveNotificationTarget(
        makeNotification({
          kind: "workspace_settings",
          destination: "roles",
          section: "members-table",
        }),
      ),
    ).toThrow("NOTIFICATION_WORKSPACE_ROLES_SECTION_INVALID");
  });
});
