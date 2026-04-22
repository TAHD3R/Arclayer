import { describe, expect, it } from "vitest";

import { resolveNotificationTarget } from "@/lib/routing/notification-target";
import type { NotificationItem } from "@/types/api";

function makeNotification(targetTo: string): NotificationItem {
  return {
    id: "notification-1",
    workspaceId: "project-1",
    recipientUserId: "user-1",
    actorUserId: null,
    category: "team",
    title: "Title",
    body: "Message",
    targetTo,
    targetMeta: null,
    eventName: null,
    dedupeKey: null,
    createdAt: "2026-04-21T00:00:00.000Z",
    updatedAt: "2026-04-21T00:00:00.000Z",
    readAt: null,
    archivedAt: null,
  };
}

describe("resolveNotificationTarget", () => {
  it("maps legacy organization team targets to settings screens", () => {
    expect(resolveNotificationTarget(makeNotification("/o/org-1/team/members"))).toEqual({
      type: "settings",
      target: { screen: "workspace.members", section: "members-table" },
    });
  });

  it("keeps deleted organization extension targets out of project settings", () => {
    expect(resolveNotificationTarget(makeNotification("/o/org-1/extensions"))).toEqual({
      type: "navigate",
      to: "/projects",
    });
  });

  it("normalizes legacy workspace site settings to website content settings", () => {
    expect(
      resolveNotificationTarget(makeNotification("/w/project-1/settings/site/basics")),
    ).toEqual({
      type: "navigate",
      to: "/projects/project-1/content/general",
    });
  });
});
