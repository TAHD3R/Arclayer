import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FileText, History, Home, Users } from "lucide-react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { getWorkspaceDetail } from "@/api/workspaces";
import { AdminSiderNav } from "@/components/layout/admin-side-nav";
import { useCommandRecentStore } from "@/stores/use-command-recent-store";
import { useFavoritesStore } from "@/stores/use-favorites-store";
import type { AdminNavItem } from "@/types/admin-nav";
import { Sidebar, SidebarProvider } from "@arclayer/ui/sidebar";

const translations: Record<string, string> = {
  "nav:NAV_FAVORITES": "Favorites",
  NAV_FAVORITES_EMPTY_TITLE: "No favorites yet",
  NAV_FAVORITES_EMPTY_DESCRIPTION: "Add your boards, docs, or dashboards for quick access.",
  NAV_FAVORITES_SECTION_ACTIONS: "Favorites actions",
  NAV_FAVORITES_FOLDER_ACTIONS: "Folder actions",
  NAV_FAVORITES_NEW_FOLDER_NAME: "New folder",
  NAV_FAVORITES_FOLDER_NAME_INPUT: "Folder name",
  NAV_FAVORITES_ACTION_NEW_FOLDER: "New folder",
  NAV_FAVORITES_ACTION_RENAME_FOLDER: "Rename folder",
  NAV_FAVORITES_ACTION_DELETE_FOLDER: "Delete folder",
  NAV_FAVORITES_ROW_ACTIONS: "Favorite actions",
  NAV_FAVORITES_ACTION_OPEN_OVERLAY: "Open in overlay",
  NAV_FAVORITES_ACTION_OPEN_TAB: "Open in new tab",
  NAV_FAVORITES_ACTION_OPEN_THIS_TAB: "Open in this tab",
  NAV_FAVORITES_ACTION_CLOSE_OVERLAY: "Close overlay",
  NAV_FAVORITES_ACTION_REMOVE: "Remove from favorites",
  NAV_FAVORITES_ACTION_EXPAND: "Expand favorites",
  NAV_FAVORITES_ACTION_COLLAPSE: "Collapse favorites",
  "nav:NAV_RECENTS": "Recents",
  "nav:NAV_RECENTS_QUICK_SEARCH_PROMPT": "Didn't find what you were looking for?",
  "nav:NAV_RECENTS_QUICK_SEARCH_ACTION": "Try quick search",
  "command:COMMAND_EMPTY_BROWSE": "No recent items, favorites, or actions yet.",
};

let mockPathname = "/";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn().mockResolvedValue(undefined),
  useRouterState: ({
    select,
  }: {
    select: (state: { location: { pathname: string; hash: string } }) => unknown;
  }) => select({ location: { pathname: mockPathname, hash: "" } }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => translations[key] ?? key,
    i18n: { language: "en-US", resolvedLanguage: "en-US" },
  }),
}));

vi.mock("@/api/workspaces", () => ({
  getWorkspaceDetail: vi.fn(),
}));

const workspaceItems: AdminNavItem[] = [
  {
    key: "dashboard",
    label: "Overview",
    icon: Home,
    to: "/w/ws-1/",
  },
  {
    key: "content",
    label: "Content",
    icon: FileText,
    children: [
      {
        key: "assets",
        label: "Assets",
        icon: FileText,
        to: "/w/ws-1/assets",
      },
    ],
  },
  {
    key: "team",
    label: "Team",
    icon: Users,
    children: [
      {
        key: "team.members",
        label: "Members",
        icon: Users,
        to: "/w/ws-1/team/members",
      },
    ],
  },
];

const globalItems: AdminNavItem[] = [
  {
    key: "global.home",
    label: "Home",
    icon: Home,
    to: "/",
  },
  {
    key: "global.recents",
    label: "Recents",
    labelKey: "nav:NAV_RECENTS",
    icon: History,
  },
  {
    key: "global.workspaces",
    label: "Workspaces",
    icon: Users,
    to: "/workspaces",
  },
];

async function waitForCollapsedRender() {
  await act(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 450));
  });
}

function renderSidebar(component: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(<QueryClientProvider client={queryClient}>{component}</QueryClientProvider>);
}

function getVisibleButtonByName(name: string) {
  const matches = screen.getAllByRole("button", { name });
  const match = matches.at(-1);
  expect(match).toBeDefined();
  return match as HTMLButtonElement;
}

describe("AdminSiderNav capability nodes", () => {
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
  });

  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
    mockPathname = "/";
    useFavoritesStore.setState({ paths: [], items: [], sectionExpanded: false });
    useCommandRecentStore.setState({ records: [] });
    vi.mocked(getWorkspaceDetail).mockResolvedValue({
      id: "ws-1",
      organizationId: "org-1",
      slug: "workspace-one",
      name: "Workspace One",
      kind: "team",
      iconMode: "initials",
      iconColor: "#337ea9",
      iconGlyph: null,
      iconEmoji: null,
      iconUrl: null,
    });
  });

  it("shows favorites in the global sidebar and renders the empty state when expanded", async () => {
    const user = userEvent.setup();

    renderSidebar(
      <SidebarProvider open onOpenChange={() => undefined} className="h-screen">
        <Sidebar collapsible="icon" animateOnHover={false}>
          <AdminSiderNav items={globalItems} showFavorites />
        </Sidebar>
      </SidebarProvider>,
    );

    expect(screen.queryByRole("button", { name: "Favorites actions" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Favorites" }));

    const emptyTitle = screen.getByText("No favorites yet");
    const emptyDescription = screen.getByText(
      "Add your boards, docs, or dashboards for quick access.",
    );

    expect(emptyTitle).toBeVisible();
    expect(emptyTitle).toHaveClass("text-callout");
    expect(emptyDescription).toBeVisible();
    expect(emptyDescription).toHaveClass("text-caption");
    expect(screen.getByTestId("favorites-empty-illustration")).toBeVisible();
    expect(screen.getByRole("button", { name: "Favorites actions" })).toBeVisible();
  });

  it("renders folder rows and toggles nested favorites inline", async () => {
    useFavoritesStore.setState({
      paths: ["/w/ws-1/assets"],
      items: [
        {
          id: "folder:launches",
          type: "folder",
          name: "Launches",
          expanded: true,
          children: [{ id: "item:/w/ws-1/assets", type: "item", path: "/w/ws-1/assets" }],
        },
      ],
      sectionExpanded: true,
    });

    renderSidebar(
      <SidebarProvider open onOpenChange={() => undefined} className="h-screen">
        <Sidebar collapsible="icon" animateOnHover={false}>
          <AdminSiderNav items={workspaceItems} favoriteWorkspaceBase="/w/ws-1" showFavorites />
        </Sidebar>
      </SidebarProvider>,
    );

    expect(screen.getByRole("button", { name: "Launches" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Assets" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Launches" }));

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Assets" })).not.toBeInTheDocument();
    });
  });

  it("opens favorite overlay with content-only route embedding and action chrome", async () => {
    const user = userEvent.setup();
    const windowOpenSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    useFavoritesStore.setState({
      paths: ["/w/ws-1/assets"],
      items: [{ id: "item:/w/ws-1/assets", type: "item", path: "/w/ws-1/assets" }],
      sectionExpanded: true,
    });

    renderSidebar(
      <SidebarProvider open onOpenChange={() => undefined} className="h-screen">
        <Sidebar collapsible="icon" animateOnHover={false}>
          <AdminSiderNav items={workspaceItems} favoriteWorkspaceBase="/w/ws-1" showFavorites />
        </Sidebar>
      </SidebarProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Favorite actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Open in overlay" }));

    const iframe = await screen.findByTitle("Assets");
    expect(iframe).toHaveAttribute("src", "/w/ws-1/assets?arclayer_favorite_overlay=content-only");
    await waitFor(() => {
      expect(screen.getByLabelText("breadcrumb")).toHaveTextContent("Workspace One");
    });
    expect(screen.getByText("Content")).toBeVisible();
    expect(screen.getByText("Assets")).toBeVisible();
    const openInNewTabButton = getVisibleButtonByName("Open in new tab");
    const openInThisTabButton = getVisibleButtonByName("Open in this tab");
    const closeOverlayButton = getVisibleButtonByName("Close overlay");

    expect(openInNewTabButton).toBeInTheDocument();
    expect(openInThisTabButton).toBeInTheDocument();
    expect(closeOverlayButton).toBeInTheDocument();

    await user.click(openInNewTabButton);

    expect(windowOpenSpy).toHaveBeenCalledWith("/w/ws-1/assets", "_blank", "noopener,noreferrer");
  });

  it("keeps the active favorite section collapsed until the user expands it", async () => {
    const user = userEvent.setup();
    mockPathname = "/w/ws-1/assets";
    useFavoritesStore.setState({
      paths: ["/w/ws-1/assets"],
      sectionExpanded: false,
    });

    renderSidebar(
      <SidebarProvider open onOpenChange={() => undefined} className="h-screen">
        <Sidebar collapsible="icon" animateOnHover={false}>
          <AdminSiderNav items={workspaceItems} favoriteWorkspaceBase="/w/ws-1" showFavorites />
        </Sidebar>
      </SidebarProvider>,
    );

    expect(screen.getByRole("button", { name: "Favorites" })).toHaveAttribute(
      "data-active",
      "true",
    );
    expect(screen.queryByRole("button", { name: "Assets" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Favorites" }));

    expect(screen.getByRole("button", { name: "Assets" })).toBeVisible();
  });

  it("opens the global recents popover and bridges quick search into the command trigger", async () => {
    const user = userEvent.setup();
    const onCommandOpen = vi.fn();
    useCommandRecentStore.setState({
      records: [
        {
          key: "page:/workspaces",
          kind: "page",
          title: "Workspaces",
          subtitle: "/workspaces",
          keywords: ["Workspaces", "/workspaces"],
          to: "/workspaces",
          visitedAt: "2026-04-15T00:00:00.000Z",
        },
      ],
    });
    window.addEventListener("arclayer:admin-command-open", onCommandOpen);

    renderSidebar(
      <SidebarProvider open onOpenChange={() => undefined} className="h-screen">
        <Sidebar collapsible="icon" animateOnHover={false}>
          <AdminSiderNav items={globalItems} showFavorites />
        </Sidebar>
      </SidebarProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Recents" }));

    expect(await screen.findByRole("button", { name: "Workspaces" })).toBeVisible();
    expect(screen.getByText("Didn't find what you were looking for?")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Try quick search" }));

    await waitFor(() => {
      expect(onCommandOpen).toHaveBeenCalledTimes(1);
    });

    window.removeEventListener("arclayer:admin-command-open", onCommandOpen);
  });

  it("keeps favorites accessible in collapsed mode through the capability popover", async () => {
    const user = userEvent.setup();
    mockPathname = "/w/ws-1/";
    useFavoritesStore.setState({
      paths: ["/w/ws-1/assets"],
      sectionExpanded: false,
    });

    renderSidebar(
      <SidebarProvider defaultOpen={false} className="h-screen">
        <Sidebar collapsible="icon" animateOnHover={false}>
          <AdminSiderNav items={workspaceItems} favoriteWorkspaceBase="/w/ws-1" showFavorites />
        </Sidebar>
      </SidebarProvider>,
    );

    await waitForCollapsedRender();
    await user.click(screen.getByRole("button", { name: "Favorites" }));
    await user.click(screen.getByRole("button", { name: "Expand favorites" }));

    expect(await screen.findByRole("button", { name: "Assets" })).toBeVisible();
  });
});
