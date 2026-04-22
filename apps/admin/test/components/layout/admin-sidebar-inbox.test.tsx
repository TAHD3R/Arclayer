import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { AdminSidebarInbox } from "@/components/layout/admin-sidebar-inbox";
import { SettingsScreenProvider } from "@/components/layout/settings-screen-provider";
import { archiveNotification, listNotifications, markNotificationRead } from "@/api/notifications";
import { listMyWorkspaces } from "@/api/workspaces";

const navigateMock = vi.fn().mockResolvedValue(undefined);

const translations: Record<string, string> = {
  NOTIFICATIONS_FILTER_LABEL: "Filter notifications",
  NOTIFICATIONS_FILTER_MIXED: "Unread and read",
  NOTIFICATIONS_FILTER_UNREAD_ONLY: "Unread only",
  NOTIFICATIONS_FILTER_ARCHIVED_ONLY: "Archived only",
  NOTIFICATIONS_FILTER_ALL_UPDATES: "All updates",
  NOTIFICATIONS_EDIT_FILTER: "Edit filter",
  NOTIFICATIONS_EMPTY_UNREAD_TITLE: "You're all caught up",
  NOTIFICATIONS_EMPTY_UNREAD_DESC: "No unread notifications right now.",
  NOTIFICATIONS_EMPTY_ALL_TITLE: "No notifications yet",
  NOTIFICATIONS_EMPTY_ALL_DESC: "When something needs your attention, it will show up here.",
  NOTIFICATIONS_EMPTY_ARCHIVED_TITLE: "No archived notifications",
  NOTIFICATIONS_EMPTY_ARCHIVED_DESC: "Notifications you archive will appear here.",
  NOTIFICATIONS_TARGET_FORBIDDEN: "Forbidden",
  NOTIFICATIONS_MARK_AS_READ: "Mark as read",
  NOTIFICATIONS_ARCHIVE: "Archive",
  NOTIFICATIONS_OPEN_CENTER: "Open notification center",
  NOTIFICATIONS_OPEN_CENTER_CTA: "Go to notification center",
};

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigateMock,
  useRouterState: ({ select }: { select: (state: { location: { pathname: string } }) => string }) =>
    select({ location: { pathname: "/projects/project-alpha/assets" } }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => translations[key] ?? key,
    i18n: { language: "en-US" },
  }),
}));

vi.mock("@/api/notifications", () => ({
  listNotifications: vi.fn(),
  markNotificationRead: vi
    .fn()
    .mockResolvedValue({ id: "n-unread", readAt: new Date().toISOString() }),
  archiveNotification: vi
    .fn()
    .mockResolvedValue({ id: "n-unread", archivedAt: new Date().toISOString() }),
}));

vi.mock("@/api/workspaces", () => ({
  listMyWorkspaces: vi.fn(),
}));

function renderWithProviders() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <SettingsScreenProvider>
        <div className="flex h-[640px] w-[320px]">
          <AdminSidebarInbox />
        </div>
      </SettingsScreenProvider>
    </QueryClientProvider>,
  );
}

function createNotification(
  overrides: Partial<{
    id: string;
    title: string;
    body: string | null;
    readAt: string | null;
    archivedAt: string | null;
    createdAt: string;
  }> = {},
) {
  return {
    id: overrides.id ?? "notification-id",
    workspaceId: "ws-1",
    recipientUserId: "user-1",
    actorUserId: "user-2",
    category: "team" as const,
    title: overrides.title ?? "Notification title",
    body: overrides.body ?? "Notification body",
    targetTo: "/projects/project-alpha/assets",
    targetMeta: null,
    eventName: null,
    dedupeKey: null,
    readAt: overrides.readAt ?? null,
    archivedAt: overrides.archivedAt ?? null,
    createdAt: overrides.createdAt ?? "2026-04-22T10:00:00.000Z",
    updatedAt: overrides.createdAt ?? "2026-04-22T10:00:00.000Z",
  };
}

describe("AdminSidebarInbox", () => {
  beforeAll(() => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    class ResizeObserverMock {
      observe() {
        return undefined;
      }
      unobserve() {
        return undefined;
      }
      disconnect() {
        return undefined;
      }
    }

    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
    class IntersectionObserverMock {
      observe() {
        return undefined;
      }
      unobserve() {
        return undefined;
      }
      disconnect() {
        return undefined;
      }
    }

    vi.stubGlobal("IntersectionObserver", IntersectionObserverMock);
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      value: vi.fn(),
      writable: true,
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(listMyWorkspaces).mockResolvedValue({
      items: [
        {
          workspaceId: "ws-1",
          projectId: "project-alpha",
          organizationId: "org-1",
          name: "Workspace Alpha",
          kind: "team",
        },
      ],
      switcher: { teams: [] },
      instanceSetup: { status: "ready", repairReason: null },
    } as never);

    const unreadItem = createNotification({
      id: "n-unread",
      title: "Unread update",
      createdAt: "2026-04-22T10:00:00.000Z",
    });
    const readItem = createNotification({
      id: "n-read",
      title: "Read update",
      readAt: "2026-04-22T09:30:00.000Z",
      createdAt: "2026-04-22T09:30:00.000Z",
    });
    const archivedItem = createNotification({
      id: "n-archived",
      title: "Archived update",
      readAt: "2026-04-22T08:30:00.000Z",
      archivedAt: "2026-04-22T08:45:00.000Z",
      createdAt: "2026-04-22T08:30:00.000Z",
    });

    vi.mocked(listNotifications).mockImplementation(async (params) => {
      const status = params.status ?? "unread";
      const items =
        status === "unread"
          ? [unreadItem]
          : status === "archived"
            ? [archivedItem]
            : [unreadItem, readItem];

      return {
        items,
        total: items.length,
        page: 1,
        size: 20,
        pages: 1,
        next: null,
        prev: null,
      };
    });
  });

  it("renders the unread notification list with filter and open-center controls", async () => {
    renderWithProviders();

    expect(await screen.findByText("Unread update")).toBeInTheDocument();
    expect(screen.queryByText("Read update")).toBeNull();
    expect(screen.getByRole("combobox", { name: "Unread only" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Go to notification center" })).toBeInTheDocument();
  });

  it("shows all filter options and loads archived items for all-updates", async () => {
    const user = userEvent.setup();

    renderWithProviders();

    const filterTrigger = await screen.findByRole("combobox", { name: "Unread only" });
    await user.click(filterTrigger);

    expect(screen.getByRole("option", { name: "Unread and read" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Unread only" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Archived only" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "All updates" })).toBeInTheDocument();

    await user.click(screen.getByRole("option", { name: "All updates" }));

    await waitFor(() => {
      expect(screen.getByText("Archived update")).toBeInTheDocument();
    });
    expect(listNotifications).toHaveBeenCalledWith(
      expect.objectContaining({ status: "all", page: 1, size: 20 }),
    );
    expect(listNotifications).toHaveBeenCalledWith(
      expect.objectContaining({ status: "archived", page: 1, size: 20 }),
    );
  });

  it("opens the notifications center with workspace source context", async () => {
    const user = userEvent.setup();

    renderWithProviders();

    await screen.findByText("Unread update");
    await user.click(screen.getByRole("button", { name: "Go to notification center" }));

    expect(navigateMock).toHaveBeenCalledWith({
      to: "/notifications",
      search: {
        sourceKind: "workspace",
        sourcePath: "/projects/project-alpha/assets",
      },
    });
  });

  it("marks notifications as read and archives them through the compact row actions", async () => {
    const user = userEvent.setup();

    renderWithProviders();

    await screen.findByText("Unread update");
    const unreadCard = screen
      .getByText("Unread update")
      .closest('[data-slot="item"]') as HTMLElement | null;

    expect(unreadCard).not.toBeNull();
    if (!unreadCard) {
      throw new Error("Unread notification card not found");
    }

    await user.click(within(unreadCard).getByRole("button", { name: "Mark as read" }));
    await user.click(within(unreadCard).getByRole("button", { name: "Archive" }));

    expect(markNotificationRead).toHaveBeenCalledWith("n-unread");
    expect(archiveNotification).toHaveBeenCalledWith("n-unread");
  });

  it("replaces filter and footer with an empty state action when the selected view is empty", async () => {
    const user = userEvent.setup();
    vi.mocked(listNotifications).mockImplementation(async (params) => {
      const status = params.status ?? "unread";
      const items =
        status === "archived"
          ? []
          : [createNotification({ id: "n-unread", title: "Unread update" })];

      return {
        items,
        total: items.length,
        page: 1,
        size: 20,
        pages: 1,
        next: null,
        prev: null,
      };
    });

    renderWithProviders();

    await user.click(await screen.findByRole("combobox", { name: "Unread only" }));
    await user.click(screen.getByRole("option", { name: "Archived only" }));

    await waitFor(() => {
      expect(screen.getByText("No archived notifications")).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: "Go to notification center" })).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Archived only" })).toBeNull();
    expect(screen.getByRole("combobox", { name: "Edit filter" })).toBeInTheDocument();
  });
});
