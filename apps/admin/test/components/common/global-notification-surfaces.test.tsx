import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { GlobalNotificationSurfaces } from "@/components/common/global-notification-surfaces";
import type { NotificationItem } from "@arclayer/openapi/admin-types";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

function createBroadcast(presentation: "inbox" | "toast" | "modal" | "banner"): NotificationItem {
  return {
    id: `broadcast-${presentation}`,
    workspaceId: "00000000-0000-0000-0000-000000000000",
    recipientUserId: "user-1",
    category: "system",
    title: "Scheduled maintenance",
    body: "Restart at 02:00 UTC.",
    targetTo: "/system/overview",
    targetMeta: {
      presentation,
      severity: "warning",
      actionLabel: "View status",
    },
    eventName: "system.broadcast",
    dedupeKey: `system.broadcast:${presentation}`,
    readAt: null,
    archivedAt: null,
    createdAt: "2026-07-22T10:00:00Z",
    updatedAt: "2026-07-22T10:00:00Z",
  };
}

describe("GlobalNotificationSurfaces", () => {
  it("shows an unread banner on initial render and marks it read when dismissed", async () => {
    const user = userEvent.setup();
    const item = createBroadcast("banner");
    const markRead = vi.fn().mockResolvedValue(true);

    render(
      <GlobalNotificationSurfaces
        items={[item]}
        onMarkRead={markRead}
        onOpenTarget={vi.fn().mockResolvedValue(true)}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Scheduled maintenance");
    await user.click(screen.getByRole("button", { name: "NOTIFICATIONS_BROADCAST_DISMISS" }));

    expect(markRead).toHaveBeenCalledWith(item);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows an unread opening dialog and follows its configured action", async () => {
    const user = userEvent.setup();
    const item = createBroadcast("modal");
    const openTarget = vi.fn().mockResolvedValue(true);

    render(
      <GlobalNotificationSurfaces
        items={[item]}
        onMarkRead={vi.fn().mockResolvedValue(true)}
        onOpenTarget={openTarget}
      />,
    );

    expect(screen.getByRole("dialog")).toHaveTextContent("Restart at 02:00 UTC.");
    await user.click(screen.getByRole("button", { name: "View status" }));

    expect(openTarget).toHaveBeenCalledWith(item);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("keeps inbox-only and toast broadcasts out of persistent surfaces", () => {
    render(
      <GlobalNotificationSurfaces
        items={[createBroadcast("inbox"), createBroadcast("toast")]}
        onMarkRead={vi.fn().mockResolvedValue(true)}
        onOpenTarget={vi.fn().mockResolvedValue(true)}
      />,
    );

    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
