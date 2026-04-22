import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { NotificationToastContent } from "@/components/common/notification-toast-content";

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

  it("renders notification details and wires all toast actions", async () => {
    const user = userEvent.setup();
    const onOpenTarget = vi.fn().mockResolvedValue(undefined);
    const onMarkRead = vi.fn().mockResolvedValue(undefined);
    const onArchive = vi.fn().mockResolvedValue(undefined);
    const onDelete = vi.fn().mockResolvedValue(undefined);

    render(
      <NotificationToastContent
        item={{
          id: "notif-1",
          workspaceId: "ws-1",
          recipientUserId: "user-1",
          category: "team",
          title: "Review ready",
          body: "The latest changes are ready to review.",
          targetTo: "/projects/project-1",
          readAt: null,
          archivedAt: null,
          createdAt: "2026-04-22T10:05:00Z",
          updatedAt: "2026-04-22T10:05:00Z",
        }}
        onOpenTarget={onOpenTarget}
        onMarkRead={onMarkRead}
        onArchive={onArchive}
        onDelete={onDelete}
      />,
    );

    expect(screen.getByRole("button", { name: "Review ready" })).toBeInTheDocument();
    expect(screen.getByText("The latest changes are ready to review.")).toBeInTheDocument();
    expect(screen.getByText("2026-04-22 10:05")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Review ready" }));
    await user.click(screen.getByRole("button", { name: "NOTIFICATIONS_MARK_AS_READ" }));
    await user.click(screen.getByRole("button", { name: "NOTIFICATIONS_ARCHIVE" }));
    await user.click(screen.getByRole("button", { name: "NOTIFICATIONS_DELETE" }));

    expect(onOpenTarget).toHaveBeenCalledTimes(1);
    expect(onMarkRead).toHaveBeenCalledTimes(1);
    expect(onArchive).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
