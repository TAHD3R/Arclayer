import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { NotificationToastContent } from "@/components/common/notification-toast-content";
import type { NotificationOut as NotificationItem } from "@arclayer/openapi";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@/hooks/use-admin-date-time-formatter", () => ({
  useAdminDateTimeFormatter: () => ({
    formatDateTime: () => "2026-04-22 10:05",
  }),
}));

describe("NotificationToastContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders campaign toast payload details and wires all toast actions", async () => {
    const user = userEvent.setup();
    const onOpenTarget = vi.fn().mockResolvedValue(undefined);
    const onMarkRead = vi.fn().mockResolvedValue(undefined);
    const onArchive = vi.fn().mockResolvedValue(undefined);
    const onDelete = vi.fn().mockResolvedValue(undefined);
    const actionTarget = {
      kind: "project",
      projectId: "project-1",
      destination: "website_releases",
    } satisfies NotificationItem["target"];
    const campaignSurface = {
      campaignId: "campaign-1",
      deliveryId: "delivery-1",
      presentation: "toast",
      priority: 20,
      payload: {
        title: "Release ready",
        body: "The latest changes are ready to review.",
        action: {
          kind: "internal_route",
          label: "Review release",
          target: actionTarget,
        },
      },
    } satisfies Extract<
      NonNullable<NotificationItem["campaignSurface"]>,
      { presentation: "toast" }
    >;
    const item: NotificationItem = {
      id: "notif-1",
      workspaceId: "ws-1",
      recipientUserId: "user-1",
      category: "team",
      title: "Unread notification title",
      body: "Unread notification body",
      target: { kind: "inbox" },
      campaignSurface,
      readAt: null,
      archivedAt: null,
      createdAt: "2026-04-22T10:05:00Z",
      updatedAt: "2026-04-22T10:05:00Z",
    };

    render(
      <NotificationToastContent
        item={item}
        title={campaignSurface.payload.title}
        body={campaignSurface.payload.body}
        actionLabel={campaignSurface.payload.action?.label}
        onOpenTarget={onOpenTarget}
        onMarkRead={onMarkRead}
        onArchive={onArchive}
        onDelete={onDelete}
      />,
    );

    expect(screen.getByRole("button", { name: "Release ready" })).toBeInTheDocument();
    expect(screen.getByText("The latest changes are ready to review.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review release" })).toBeInTheDocument();
    expect(screen.getByText("2026-04-22 10:05")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Release ready" }));
    await user.click(screen.getByRole("button", { name: "Review release" }));
    await user.click(screen.getByRole("button", { name: "NOTIFICATIONS_MARK_AS_READ" }));
    await user.click(screen.getByRole("button", { name: "NOTIFICATIONS_ARCHIVE" }));
    await user.click(screen.getByRole("button", { name: "NOTIFICATIONS_DELETE" }));

    expect(onOpenTarget).toHaveBeenCalledTimes(2);
    expect(onMarkRead).toHaveBeenCalledTimes(1);
    expect(onArchive).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
