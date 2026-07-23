import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { GlobalNotificationSurfaces } from "@/components/common/global-notification-surfaces";
import type { NotificationItem } from "@arclayer/openapi/admin-types";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

type Presentation = "inbox" | "toast" | "modal" | "banner";
type Action = {
  kind: "internal_route" | "external_https";
  label: string;
  target: string;
};
type Media = {
  assetId: string;
  kind: "image" | "video";
  altText: string;
  posterAssetId: string | null;
  captionsAssetId: string | null;
};
type BroadcastOptions = {
  id?: string;
  priority?: number;
  displayStartAt?: string | null;
  displayEndAt?: string | null;
  title?: string;
  action?: Action | null;
  primaryAction?: Action;
  secondaryAction?: Action | null;
  dismissible?: boolean;
  dismissPolicy?: "dismissible" | "action_required";
  media?: Media | null;
};

const DEFAULT_ACTION: Action = {
  kind: "internal_route",
  label: "View status",
  target: "/system/overview",
};

function presentationPayload(presentation: Presentation, options: BroadcastOptions) {
  const common = {
    title: options.title ?? "Scheduled maintenance",
    body: "Restart at 02:00 UTC.",
  };
  if (presentation === "modal") {
    return {
      ...common,
      primaryAction: options.primaryAction ?? DEFAULT_ACTION,
      secondaryAction: options.secondaryAction ?? null,
      dismissPolicy: options.dismissPolicy ?? "dismissible",
      media: options.media ?? null,
    };
  }
  if (presentation === "banner") {
    return {
      ...common,
      action: options.action === undefined ? DEFAULT_ACTION : options.action,
      dismissible: options.dismissible ?? true,
    };
  }
  return {
    ...common,
    action: options.action === undefined ? DEFAULT_ACTION : options.action,
  };
}

function createBroadcast(
  presentation: Presentation,
  options: BroadcastOptions = {},
): NotificationItem {
  const id = options.id ?? `broadcast-${presentation}`;
  return {
    id,
    workspaceId: "00000000-0000-0000-0000-000000000000",
    recipientUserId: "user-1",
    category: "system",
    title: options.title ?? "Scheduled maintenance",
    body: "Restart at 02:00 UTC.",
    targetTo: "/system/overview",
    targetMeta: {
      campaignId: `campaign-${id}`,
      deliveryId: `delivery-${id}`,
      presentation,
      priority: options.priority ?? 20,
      displayStartAt: options.displayStartAt ?? null,
      displayEndAt: options.displayEndAt ?? null,
      payload: presentationPayload(presentation, options),
    },
    eventName: "system.broadcast",
    dedupeKey: `system.broadcast:${id}`,
    readAt: null,
    archivedAt: null,
    createdAt: "2026-07-22T10:00:00Z",
    updatedAt: "2026-07-22T10:00:00Z",
  };
}

describe("GlobalNotificationSurfaces", () => {
  it("orders banners by priority and durably dismisses before advancing the queue", async () => {
    const user = userEvent.setup();
    const high = createBroadcast("banner", { id: "high", priority: 90, title: "Urgent notice" });
    const low = createBroadcast("banner", { id: "low", priority: 10, title: "Routine notice" });
    const recordInteraction = vi.fn().mockResolvedValue(true);

    render(
      <GlobalNotificationSurfaces
        items={[low, high]}
        onRecordInteraction={recordInteraction}
        onOpenTarget={vi.fn().mockResolvedValue(true)}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Urgent notice");
    await user.click(screen.getByRole("button", { name: "NOTIFICATIONS_BROADCAST_DISMISS" }));

    await waitFor(() => expect(recordInteraction).toHaveBeenCalledWith(high, "dismiss"));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Routine notice"));
  });

  it("shows only notifications inside their display window", () => {
    const now = Date.now();
    const active = createBroadcast("banner", { id: "active", priority: 1, title: "Active" });
    const future = createBroadcast("banner", {
      id: "future",
      priority: 100,
      title: "Future",
      displayStartAt: new Date(now + 60_000).toISOString(),
    });
    const expired = createBroadcast("banner", {
      id: "expired",
      priority: 200,
      title: "Expired",
      displayEndAt: new Date(now - 60_000).toISOString(),
    });

    render(
      <GlobalNotificationSurfaces
        items={[future, expired, active]}
        onRecordInteraction={vi.fn().mockResolvedValue(true)}
        onOpenTarget={vi.fn().mockResolvedValue(true)}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Active");
    expect(screen.queryByText("Future")).not.toBeInTheDocument();
    expect(screen.queryByText("Expired")).not.toBeInTheDocument();
  });

  it("records a banner click only after its typed target opens", async () => {
    const user = userEvent.setup();
    const item = createBroadcast("banner");
    const openTarget = vi.fn().mockResolvedValue(true);
    const recordInteraction = vi.fn().mockResolvedValue(true);

    render(
      <GlobalNotificationSurfaces
        items={[item]}
        onRecordInteraction={recordInteraction}
        onOpenTarget={openTarget}
      />,
    );

    await user.click(screen.getByRole("button", { name: "View status" }));

    await waitFor(() =>
      expect(openTarget).toHaveBeenCalledWith(
        expect.objectContaining({ id: item.id, targetTo: "/system/overview" }),
      ),
    );
    await waitFor(() => expect(recordInteraction).toHaveBeenCalledWith(item, "click"));
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
  });

  it("keeps a banner visible when durable dismissal fails", async () => {
    const user = userEvent.setup();
    const item = createBroadcast("banner");

    render(
      <GlobalNotificationSurfaces
        items={[item]}
        onRecordInteraction={vi.fn().mockResolvedValue(false)}
        onOpenTarget={vi.fn().mockResolvedValue(true)}
      />,
    );

    await user.click(screen.getByRole("button", { name: "NOTIFICATIONS_BROADCAST_DISMISS" }));

    expect(screen.getByRole("status")).toHaveTextContent("Scheduled maintenance");
  });

  it("keeps an external-action banner visible when the browser blocks the target", async () => {
    const user = userEvent.setup();
    const item = createBroadcast("banner", {
      action: {
        kind: "external_https",
        label: "Open status site",
        target: "https://status.example.com",
      },
    });
    const recordInteraction = vi.fn().mockResolvedValue(true);
    const openWindow = vi.spyOn(window, "open").mockReturnValue(null);

    render(
      <GlobalNotificationSurfaces
        items={[item]}
        onRecordInteraction={recordInteraction}
        onOpenTarget={vi.fn().mockResolvedValue(true)}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Open status site" }));

    expect(openWindow).toHaveBeenCalledWith(
      "https://status.example.com",
      "_blank",
      "noopener,noreferrer",
    );
    expect(recordInteraction).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("renders modal media and both typed actions", async () => {
    const user = userEvent.setup();
    const secondaryAction: Action = {
      kind: "internal_route",
      label: "Release notes",
      target: "/system/audit-log",
    };
    const item = createBroadcast("modal", {
      secondaryAction,
      media: {
        assetId: "019cfd68-b551-7e67-8e24-a864312e60ba",
        kind: "image",
        altText: "Release cover",
        posterAssetId: null,
        captionsAssetId: null,
      },
    });
    const openTarget = vi.fn().mockResolvedValue(true);
    const recordInteraction = vi.fn().mockResolvedValue(true);

    render(
      <GlobalNotificationSurfaces
        items={[item]}
        onRecordInteraction={recordInteraction}
        onOpenTarget={openTarget}
      />,
    );

    expect(screen.getByRole("img", { name: "Release cover" })).toHaveAttribute(
      "src",
      expect.stringContaining("019cfd68-b551-7e67-8e24-a864312e60ba"),
    );
    expect(screen.getByRole("button", { name: "View status" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Release notes" }));

    await waitFor(() =>
      expect(openTarget).toHaveBeenCalledWith(
        expect.objectContaining({ id: item.id, targetTo: "/system/audit-log" }),
      ),
    );
    await waitFor(() => expect(recordInteraction).toHaveBeenCalledWith(item, "click"));
  });

  it("keeps an action-required video modal open without a dismiss control", async () => {
    const user = userEvent.setup();
    const item = createBroadcast("modal", {
      dismissPolicy: "action_required",
      media: {
        assetId: "019cfd68-b551-7e67-8e24-a864312e60bb",
        kind: "video",
        altText: "Release demo",
        posterAssetId: "019cfd68-b551-7e67-8e24-a864312e60bc",
        captionsAssetId: "019cfd68-b551-7e67-8e24-a864312e60bd",
      },
    });

    render(
      <GlobalNotificationSurfaces
        items={[item]}
        onRecordInteraction={vi.fn().mockResolvedValue(true)}
        onOpenTarget={vi.fn().mockResolvedValue(true)}
      />,
    );

    const video = screen.getByLabelText("Release demo");
    expect(video).toHaveAttribute("controls");
    expect(video).toHaveAttribute(
      "poster",
      expect.stringContaining("019cfd68-b551-7e67-8e24-a864312e60bc"),
    );
    expect(video.querySelector('track[kind="captions"]')).toHaveAttribute(
      "src",
      expect.stringContaining("019cfd68-b551-7e67-8e24-a864312e60bd"),
    );
    expect(
      screen.queryByRole("button", { name: "NOTIFICATIONS_BROADCAST_DISMISS" }),
    ).not.toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("keeps inbox and toast deliveries out of persistent surfaces", () => {
    render(
      <GlobalNotificationSurfaces
        items={[createBroadcast("inbox"), createBroadcast("toast")]}
        onRecordInteraction={vi.fn().mockResolvedValue(true)}
        onOpenTarget={vi.fn().mockResolvedValue(true)}
      />,
    );

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
