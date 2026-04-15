import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import { createRef } from "react";
import userEvent from "@testing-library/user-event";
import { Activity, Home, LayoutGrid, Settings, UserPlus, Users } from "lucide-react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { AdminSiderNav } from "@/components/layout/admin-side-nav";
import { WORKSPACE_NAV_ITEMS } from "@/constants/menu/workspaces";
import { mapWorkspaceNavItems } from "@/layouts/admin-scene-utils";
import type { AdminNavItem } from "@/types/admin-nav";
import { useFavoritesStore } from "@/stores/use-favorites-store";
import { Sidebar, SidebarMenuButton, SidebarProvider } from "@arclayer/ui/sidebar";

const navigateMock = vi.fn().mockResolvedValue(undefined);
const mockT = (key: string) => `${mockLanguage}:${key}`;
let mockLanguage = "en-US";
let mockPathname = "/w/ws-1/team/invitations";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigateMock,
  useRouterState: ({
    select,
  }: {
    select: (state: { location: { pathname: string } }) => unknown;
  }) => select({ location: { pathname: mockPathname } }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: mockT,
    i18n: { language: mockLanguage, resolvedLanguage: mockLanguage },
  }),
}));

function renderWithQueryClient(component: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  const view = render(<QueryClientProvider client={queryClient}>{component}</QueryClientProvider>);

  return {
    ...view,
    rerender: (next: React.ReactElement) =>
      view.rerender(<QueryClientProvider client={queryClient}>{next}</QueryClientProvider>),
  };
}

function renderCollapsedNav(items: readonly AdminNavItem[]) {
  return renderWithQueryClient(
    <SidebarProvider defaultOpen={false} className="h-screen">
      <Sidebar collapsible="icon" animateOnHover={false}>
        <AdminSiderNav items={items} showFavorites />
      </Sidebar>
    </SidebarProvider>,
  );
}

async function waitForCollapsedRender() {
  await act(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 450));
  });
}

function renderTreeNav(args: {
  items: readonly AdminNavItem[];
  favoriteWorkspaceBase: string;
  open?: boolean;
  pathnameOverride?: string;
}) {
  return renderWithQueryClient(
    <SidebarProvider open={args.open ?? true} onOpenChange={() => undefined} className="h-screen">
      <Sidebar collapsible="icon" animateOnHover={false}>
        <AdminSiderNav
          items={args.items}
          favoriteWorkspaceBase={args.favoriteWorkspaceBase}
          pathnameOverride={args.pathnameOverride}
          showFavorites
        />
      </Sidebar>
    </SidebarProvider>,
  );
}

const items: AdminNavItem[] = [
  {
    key: "dashboard",
    label: "Overview",
    icon: Home,
    to: "/w/ws-1/",
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
      {
        key: "team.invitations",
        label: "Invitations",
        icon: UserPlus,
        to: "/w/ws-1/team/invitations",
      },
      {
        key: "team.roles",
        label: "Roles",
        icon: Settings,
        to: "/w/ws-1/team/roles",
      },
    ],
  },
  {
    key: "activity",
    label: "Activity",
    icon: Activity,
    to: "/w/ws-1/activity",
  },
  {
    key: "settings",
    label: "Settings",
    icon: LayoutGrid,
    children: [
      {
        key: "settings.workspace",
        label: "Workspace",
        icon: LayoutGrid,
        to: "/w/ws-1/settings/workspace",
      },
      {
        key: "settings.site",
        label: "General",
        icon: Settings,
        to: "/w/ws-1/settings/site",
      },
    ],
  },
];

const treeItems: AdminNavItem[] = [
  {
    key: "dashboard",
    label: "Overview",
    icon: Home,
    to: "/w/ws-1/",
  },
  {
    key: "content",
    label: "Content",
    icon: LayoutGrid,
    children: [
      {
        key: "assets",
        label: "Assets",
        icon: Activity,
        to: "/w/ws-1/assets",
      },
      {
        key: "content.seo-analyze",
        label: "SEO Analyze",
        icon: Activity,
        to: "/w/ws-1/content/seo-analyze",
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
      {
        key: "team.invitations",
        label: "Invitations",
        icon: UserPlus,
        to: "/w/ws-1/team/invitations",
      },
    ],
  },
];

const samePathPreferenceItems: AdminNavItem[] = [
  {
    key: "dashboard",
    label: "Overview",
    icon: Home,
    to: "/w/ws-1/",
  },
  {
    key: "content",
    label: "Content",
    icon: LayoutGrid,
    children: [
      {
        key: "content.seo-analyze",
        label: "SEO Analyze",
        icon: Activity,
        to: "/w/ws-1/content/seo-analyze",
      },
    ],
  },
];

const redirectedPreferenceItems: AdminNavItem[] = [
  {
    key: "dashboard",
    label: "Overview",
    icon: Home,
    to: "/w/ws-1/",
  },
  {
    key: "content",
    label: "Content",
    icon: LayoutGrid,
    children: [
      {
        key: "settings.site",
        label: "Site Settings",
        icon: Settings,
        to: "/w/ws-1/settings/site",
      },
    ],
  },
  {
    key: "workspace",
    label: "Workspace",
    icon: LayoutGrid,
    children: [
      {
        key: "settings.workspace",
        label: "Workspace Settings",
        icon: Settings,
        to: "/w/ws-1/settings/workspace",
      },
    ],
  },
];

const navigateSelfAndExpandItems: AdminNavItem[] = [
  {
    key: "dashboard",
    label: "Overview",
    icon: Home,
    to: "/",
  },
  {
    key: "global.workspaces",
    label: "Workspaces",
    icon: Users,
    to: "/workspaces",
    groupBehavior: "navigate-self-and-expand",
    children: [
      {
        key: "global.workspaces.ws-alpha",
        label: "Alpha Workspace",
        icon: Home,
        to: "/w/ws-alpha",
      },
    ],
  },
];

describe("AdminSiderNav collapsed groups", () => {
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
    vi.clearAllMocks();
    mockLanguage = "en-US";
    mockPathname = "/w/ws-1/team/invitations";
    useFavoritesStore.setState({ paths: [], items: [], sectionExpanded: false });
  });

  it("forwards refs through SidebarMenuButton to the real button element", () => {
    const buttonRef = createRef<HTMLButtonElement>();

    render(
      <SidebarProvider defaultOpen={false} className="h-screen">
        <Sidebar collapsible="icon" animateOnHover={false}>
          <SidebarMenuButton ref={buttonRef}>Ref check</SidebarMenuButton>
        </Sidebar>
      </SidebarProvider>,
    );

    expect(buttonRef.current).toBeInstanceOf(HTMLButtonElement);
    expect(buttonRef.current).toHaveTextContent("Ref check");
  });

  it("shows tooltip for collapsed leaf items on hover", async () => {
    const user = userEvent.setup();
    renderCollapsedNav(items);

    await waitForCollapsedRender();
    await user.hover(screen.getByRole("button", { name: "Overview" }));

    await waitFor(() => {
      const tooltip = document.body.querySelector('[data-slot="tooltip-content"]');
      expect(tooltip).not.toBeNull();
      expect(tooltip).toHaveTextContent("Overview");
    });
  });

  it("updates favorite tooltip text when language changes", async () => {
    const user = userEvent.setup();
    useFavoritesStore.setState({ paths: ["/w/ws-1/"], sectionExpanded: false });

    const favoriteItems: AdminNavItem[] = [
      {
        key: "dashboard",
        label: "Overview",
        labelKey: "nav:NAV_DASHBOARD",
        icon: Home,
        to: "/w/ws-1/",
      },
    ];

    const view = renderCollapsedNav(favoriteItems);

    await waitForCollapsedRender();
    await user.hover(screen.getAllByRole("button", { name: "en-US:nav:NAV_DASHBOARD" })[0]);

    await waitFor(() => {
      const tooltip = document.body.querySelector('[data-slot="tooltip-content"]');
      expect(tooltip).toHaveTextContent("en-US:nav:NAV_DASHBOARD");
    });

    mockLanguage = "zh-CN";
    view.rerender(
      <SidebarProvider defaultOpen={false} className="h-screen">
        <Sidebar collapsible="icon" animateOnHover={false}>
          <AdminSiderNav items={favoriteItems} showFavorites />
        </Sidebar>
      </SidebarProvider>,
    );

    await waitForCollapsedRender();
    const updatedFavoriteButton = screen.getAllByRole("button", {
      name: "zh-CN:nav:NAV_DASHBOARD",
    })[0];
    await user.unhover(updatedFavoriteButton);
    await user.hover(updatedFavoriteButton);

    await waitFor(() => {
      const tooltip = document.body.querySelector('[data-slot="tooltip-content"]');
      expect(tooltip).toHaveTextContent("zh-CN:nav:NAV_DASHBOARD");
    });
  });

  it("shows the full label tooltip for expanded favorites items when the name truncates", async () => {
    const user = userEvent.setup();
    const longLabel = "Workspace with an exceptionally long title for favorites tooltip";
    const overflowItems: AdminNavItem[] = [
      {
        key: "dashboard",
        label: "Overview",
        icon: Home,
        to: "/w/ws-1/",
      },
      {
        key: "content",
        label: "Content",
        icon: LayoutGrid,
        children: [
          {
            key: "content.long-workspace-entry",
            label: longLabel,
            icon: Activity,
            to: "/w/ws-1/content/long-workspace-entry",
          },
        ],
      },
    ];

    const scrollWidthDescriptor = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "scrollWidth",
    );
    const clientWidthDescriptor = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "clientWidth",
    );

    Object.defineProperty(HTMLElement.prototype, "scrollWidth", {
      configurable: true,
      get() {
        return this.textContent?.includes(longLabel) ? 240 : 100;
      },
    });
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get() {
        return this.textContent?.includes(longLabel) ? 80 : 100;
      },
    });

    useFavoritesStore.setState({
      paths: ["/w/ws-1/content/long-workspace-entry"],
      sectionExpanded: true,
    });

    try {
      renderTreeNav({
        items: overflowItems,
        favoriteWorkspaceBase: "/w/ws-1",
      });

      const favoriteButton = screen.getByRole("button", { name: longLabel });
      await user.hover(favoriteButton);

      await waitFor(() => {
        const tooltip = document.body.querySelector('[data-slot="tooltip-content"]');
        expect(tooltip).toHaveTextContent(longLabel);
      });
    } finally {
      if (scrollWidthDescriptor) {
        Object.defineProperty(HTMLElement.prototype, "scrollWidth", scrollWidthDescriptor);
      }
      if (clientWidthDescriptor) {
        Object.defineProperty(HTMLElement.prototype, "clientWidth", clientWidthDescriptor);
      }
    }
  });

  it("forwards dropdown trigger props onto collapsed group button", async () => {
    renderCollapsedNav(items);

    await waitForCollapsedRender();

    expect(screen.getByRole("button", { name: "Team" })).toHaveAttribute(
      "data-slot",
      "dropdown-menu-trigger",
    );
  });

  it("opens the collapsed group dropdown on hover and marks the active child", async () => {
    const user = userEvent.setup();
    renderCollapsedNav(items);

    await waitForCollapsedRender();
    await user.hover(screen.getByRole("button", { name: "Team" }));

    const activeItem = await screen.findByRole("menuitem", { name: "Invitations" });
    expect(activeItem).toHaveAttribute("aria-current", "page");
    await waitFor(() => {
      expect(screen.getByRole("menuitem", { name: "Members" })).toBeVisible();
    });
  });

  it("closes the collapsed group dropdown when moving onto a leaf item", async () => {
    const user = userEvent.setup();
    renderCollapsedNav(items);

    await waitForCollapsedRender();
    await user.hover(screen.getByRole("button", { name: "Team" }));
    await screen.findByRole("menuitem", { name: "Members" });

    await user.hover(screen.getByRole("button", { name: "Activity" }));

    await waitFor(() => {
      expect(screen.queryByRole("menuitem", { name: "Members" })).not.toBeInTheDocument();
    });
  });

  it("switches collapsed group dropdowns without keeping two menus mounted", async () => {
    const user = userEvent.setup();
    renderCollapsedNav(items);

    await waitForCollapsedRender();
    await user.hover(screen.getByRole("button", { name: "Team" }));
    await screen.findByRole("menuitem", { name: "Members" });

    await user.hover(screen.getByRole("button", { name: "Settings" }));
    await waitFor(() => {
      expect(document.body.querySelectorAll('[role="menu"]')).toHaveLength(1);
    });

    await waitFor(() => {
      expect(screen.getByRole("menuitem", { name: "Workspace" })).toBeVisible();
    });

    expect(document.body.querySelectorAll('[role="menu"]')).toHaveLength(1);
    expect(screen.queryByRole("menuitem", { name: "Members" })).not.toBeInTheDocument();
  });

  it("navigates to the active child when clicking a collapsed group trigger", async () => {
    const user = userEvent.setup();
    renderCollapsedNav(items);

    await waitForCollapsedRender();
    await user.click(screen.getByRole("button", { name: "Team" }));

    expect(navigateMock).toHaveBeenCalledWith({ to: "/w/ws-1/team/invitations" });
  });

  it("renders a unified tree without section label rows", () => {
    renderTreeNav({
      items: treeItems,
      favoriteWorkspaceBase: "/w/ws-1",
    });

    expect(screen.getByRole("button", { name: "Overview" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Content" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Team" })).toBeVisible();
    expect(document.querySelector('[data-sidebar="group-label"]')).toBeNull();
  });

  it("keeps all top-level groups collapsed by default", () => {
    renderTreeNav({
      items: treeItems,
      favoriteWorkspaceBase: "/w/ws-1",
    });

    expect(screen.queryByRole("button", { name: "Assets" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Members" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Invitations" })).not.toBeInTheDocument();
  });

  it("toggles top-level groups independently without accordion behavior", async () => {
    const user = userEvent.setup();
    renderTreeNav({
      items: treeItems,
      favoriteWorkspaceBase: "/w/ws-1",
    });

    await user.click(screen.getByRole("button", { name: "Content" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Assets" })).toBeVisible();
    });
    expect(screen.queryByRole("button", { name: "Members" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Content" }));
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Assets" })).not.toBeInTheDocument();
    });
  });

  it("keeps the expanded group chevron stable while hovering the trigger", async () => {
    const user = userEvent.setup();

    renderTreeNav({
      items: treeItems,
      favoriteWorkspaceBase: "/w/ws-1",
    });

    const groupButton = screen.getByRole("button", { name: "Team" });
    const chevronBeforeHover = groupButton.querySelector("svg");

    expect(chevronBeforeHover).not.toBeNull();

    await user.hover(groupButton);

    await waitFor(() => {
      expect(groupButton.querySelector("svg")).toBe(chevronBeforeHover);
    });
  });

  it("shows favorites as a top-level group even when there are no favorites yet", () => {
    useFavoritesStore.setState({ paths: [], items: [], sectionExpanded: false });

    renderTreeNav({
      items: treeItems,
      favoriteWorkspaceBase: "/w/ws-1",
    });

    expect(screen.getByRole("button", { name: "en-US:nav:NAV_FAVORITES" })).toBeVisible();
  });

  it("creates a new favorites folder and immediately focuses the rename input", async () => {
    const user = userEvent.setup();
    useFavoritesStore.setState({ paths: [], items: [], sectionExpanded: true });

    renderTreeNav({
      items: treeItems,
      favoriteWorkspaceBase: "/w/ws-1",
    });

    await user.click(screen.getByRole("button", { name: "en-US:NAV_FAVORITES_SECTION_ACTIONS" }));
    await user.click(
      screen.getByRole("menuitem", { name: "en-US:NAV_FAVORITES_ACTION_NEW_FOLDER" }),
    );

    const input = await screen.findByRole("textbox", {
      name: "en-US:NAV_FAVORITES_FOLDER_NAME_INPUT",
    });

    expect(input).toHaveFocus();
    expect(input).toHaveValue("en-US:NAV_FAVORITES_NEW_FOLDER_NAME");

    await user.clear(input);
    await user.type(input, "Pinned{enter}");

    await waitFor(() => {
      expect(useFavoritesStore.getState().items).toEqual([
        expect.objectContaining({
          type: "folder",
          name: "Pinned",
        }),
      ]);
    });
  });

  it("does not render an empty nested subtree for expanded favorites folders without children", () => {
    useFavoritesStore.setState({
      paths: [],
      items: [
        {
          id: "folder:empty",
          type: "folder",
          name: "Pinned",
          expanded: true,
          children: [],
        },
      ],
      sectionExpanded: true,
    });

    renderTreeNav({
      items: treeItems,
      favoriteWorkspaceBase: "/w/ws-1",
    });

    const folderButton = screen.getByRole("button", { name: "Pinned" });
    const folderWrapper = folderButton.closest(".flex.flex-col.gap-1");

    expect(folderWrapper).not.toBeNull();
    expect(folderWrapper?.querySelector(".pt-1\\.5.overflow-hidden")).toBeNull();
  });

  it("keeps favorites inside folders aligned without adding another subtree indent", () => {
    useFavoritesStore.setState({
      paths: ["/w/ws-1/assets"],
      items: [
        {
          id: "folder:launches",
          type: "folder",
          name: "Pinned",
          expanded: true,
          children: [{ id: "item:/w/ws-1/assets", type: "item", path: "/w/ws-1/assets" }],
        },
      ],
      sectionExpanded: true,
    });

    renderTreeNav({
      items: treeItems,
      favoriteWorkspaceBase: "/w/ws-1",
    });

    const folderWrapper = screen
      .getByRole("button", { name: "Pinned" })
      .closest(".flex.flex-col.gap-1");
    expect(folderWrapper).not.toBeNull();
    const assetsButton = within(folderWrapper as HTMLElement).getByRole("button", {
      name: "Assets",
    });
    const nestedSubtree = assetsButton
      .closest(".pt-1\\.5.overflow-hidden")
      ?.querySelector(".flex.flex-col");

    expect(nestedSubtree?.className).not.toContain("pl-7");
  });

  it("keeps favorites collapsed by default even when the active page comes from Favorites", async () => {
    const user = userEvent.setup();
    mockPathname = "/w/ws-1/content/seo-analyze";
    useFavoritesStore.setState({
      paths: ["/w/ws-1/content/seo-analyze"],
      sectionExpanded: false,
    });

    renderTreeNav({
      items: treeItems,
      favoriteWorkspaceBase: "/w/ws-1",
    });

    expect(screen.getByRole("button", { name: "en-US:nav:NAV_FAVORITES" })).toHaveAttribute(
      "data-active",
      "true",
    );
    expect(screen.getByRole("button", { name: "Content" })).toHaveAttribute("data-active", "false");
    expect(screen.queryByRole("button", { name: "SEO Analyze" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "en-US:nav:NAV_FAVORITES" }));

    expect(screen.getByRole("button", { name: "SEO Analyze" })).toHaveAttribute(
      "data-active",
      "true",
    );
  });

  it("lets users switch the active trail back to the base nav for the same favorited page", async () => {
    const user = userEvent.setup();
    mockPathname = "/w/ws-1/content/seo-analyze";
    useFavoritesStore.setState({
      paths: ["/w/ws-1/content/seo-analyze"],
      sectionExpanded: false,
    });

    renderTreeNav({
      items: samePathPreferenceItems,
      favoriteWorkspaceBase: "/w/ws-1",
    });

    expect(screen.getByRole("button", { name: "en-US:nav:NAV_FAVORITES" })).toHaveAttribute(
      "data-active",
      "true",
    );
    expect(screen.getByRole("button", { name: "Content" })).toHaveAttribute("data-active", "false");

    await user.click(screen.getByRole("button", { name: "Content" }));

    expect(screen.getByRole("button", { name: "Content" })).toHaveAttribute("data-active", "true");
    expect(screen.getByRole("button", { name: "en-US:nav:NAV_FAVORITES" })).toHaveAttribute(
      "data-active",
      "false",
    );
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("keeps the content branch active after navigating from overview to a favorited page via base nav", async () => {
    const user = userEvent.setup();
    mockPathname = "/w/ws-1/";
    useFavoritesStore.setState({
      paths: ["/w/ws-1/content/seo-analyze"],
      sectionExpanded: false,
    });

    const view = renderTreeNav({
      items: treeItems,
      favoriteWorkspaceBase: "/w/ws-1",
    });

    await user.click(screen.getByRole("button", { name: "Content" }));
    await user.click(screen.getByRole("button", { name: "SEO Analyze" }));

    expect(navigateMock).toHaveBeenCalledWith({ to: "/w/ws-1/content/seo-analyze" });

    mockPathname = "/w/ws-1/content/seo-analyze";
    view.rerender(
      <SidebarProvider open onOpenChange={() => undefined} className="h-screen">
        <Sidebar collapsible="icon" animateOnHover={false}>
          <AdminSiderNav items={treeItems} favoriteWorkspaceBase="/w/ws-1" showFavorites />
        </Sidebar>
      </SidebarProvider>,
    );

    expect(screen.getByRole("button", { name: "Content" })).toHaveAttribute("data-active", "true");
    expect(screen.getByRole("button", { name: "en-US:nav:NAV_FAVORITES" })).toHaveAttribute(
      "data-active",
      "false",
    );
  });

  it("keeps the content branch active after Site Settings redirects to its favorited child route", async () => {
    const user = userEvent.setup();
    mockPathname = "/w/ws-1/";
    useFavoritesStore.setState({
      paths: ["/w/ws-1/settings/site/basics", "/w/ws-1/settings/workspace/basics"],
      sectionExpanded: false,
    });

    const view = renderTreeNav({
      items: redirectedPreferenceItems,
      favoriteWorkspaceBase: "/w/ws-1",
    });

    await user.click(screen.getByRole("button", { name: "Content" }));
    await user.click(screen.getByRole("button", { name: "Site Settings" }));

    expect(navigateMock).toHaveBeenCalledWith({ to: "/w/ws-1/settings/site" });

    mockPathname = "/w/ws-1/settings/site/basics";
    view.rerender(
      <SidebarProvider open onOpenChange={() => undefined} className="h-screen">
        <Sidebar collapsible="icon" animateOnHover={false}>
          <AdminSiderNav
            items={redirectedPreferenceItems}
            favoriteWorkspaceBase="/w/ws-1"
            showFavorites
          />
        </Sidebar>
      </SidebarProvider>,
    );

    expect(screen.getByRole("button", { name: "Content" })).toHaveAttribute("data-active", "true");
    expect(screen.getByRole("button", { name: "en-US:nav:NAV_FAVORITES" })).toHaveAttribute(
      "data-active",
      "false",
    );
  });

  it("keeps the workspace branch active after Workspace Settings redirects to its favorited child route", async () => {
    const user = userEvent.setup();
    mockPathname = "/w/ws-1/";
    useFavoritesStore.setState({
      paths: ["/w/ws-1/settings/site/basics", "/w/ws-1/settings/workspace/basics"],
      sectionExpanded: false,
    });

    const view = renderTreeNav({
      items: redirectedPreferenceItems,
      favoriteWorkspaceBase: "/w/ws-1",
    });

    await user.click(screen.getByRole("button", { name: "Workspace" }));
    await user.click(screen.getByRole("button", { name: "Workspace Settings" }));

    expect(navigateMock).toHaveBeenCalledWith({ to: "/w/ws-1/settings/workspace" });

    mockPathname = "/w/ws-1/settings/workspace/basics";
    view.rerender(
      <SidebarProvider open onOpenChange={() => undefined} className="h-screen">
        <Sidebar collapsible="icon" animateOnHover={false}>
          <AdminSiderNav
            items={redirectedPreferenceItems}
            favoriteWorkspaceBase="/w/ws-1"
            showFavorites
          />
        </Sidebar>
      </SidebarProvider>,
    );

    expect(screen.getByRole("button", { name: "Workspace" })).toHaveAttribute(
      "data-active",
      "true",
    );
    expect(screen.getByRole("button", { name: "en-US:nav:NAV_FAVORITES" })).toHaveAttribute(
      "data-active",
      "false",
    );
  });

  it("navigates to the parent route and expands children for navigate-self-and-expand groups", async () => {
    const user = userEvent.setup();
    mockPathname = "/";

    renderTreeNav({
      items: navigateSelfAndExpandItems,
      favoriteWorkspaceBase: "/w/ws-alpha",
    });

    expect(screen.queryByRole("button", { name: "Alpha Workspace" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Workspaces" }));

    expect(navigateMock).toHaveBeenCalledWith({ to: "/workspaces" });
    expect(screen.getByRole("button", { name: "Alpha Workspace" })).toBeVisible();
  });

  it("uses the parent route as the collapsed click target for navigate-self-and-expand groups", async () => {
    const user = userEvent.setup();
    mockPathname = "/";

    renderCollapsedNav(navigateSelfAndExpandItems);

    await waitForCollapsedRender();
    await user.click(screen.getByRole("button", { name: "Workspaces" }));

    expect(navigateMock).toHaveBeenCalledWith({ to: "/workspaces" });
  });

  it("can keep a source menu branch active while current route renders /notifications", async () => {
    const user = userEvent.setup();
    mockPathname = "/notifications";

    renderTreeNav({
      items: treeItems,
      favoriteWorkspaceBase: "/w/ws-1",
      pathnameOverride: "/w/ws-1/team/members",
    });

    expect(screen.getByRole("button", { name: "Team" })).toHaveAttribute("data-active", "true");
    expect(screen.queryByRole("button", { name: "Members" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Team" }));

    expect(screen.getByRole("button", { name: "Members" })).toHaveAttribute("data-active", "true");
  });

  it("marks Content -> Contents active for the content create route alias", async () => {
    const user = userEvent.setup();
    const workspaceItems = mapWorkspaceNavItems(WORKSPACE_NAV_ITEMS, "/w/ws-1");

    renderTreeNav({
      items: workspaceItems,
      favoriteWorkspaceBase: "/w/ws-1",
      pathnameOverride: "/w/ws-1/content/create",
    });

    expect(screen.getByRole("button", { name: "en-US:nav:NAV_SECTION_CONTENT" })).toHaveAttribute(
      "data-active",
      "true",
    );
    expect(screen.getByRole("button", { name: "en-US:nav:NAV_DASHBOARD" })).toHaveAttribute(
      "data-active",
      "false",
    );

    await user.click(screen.getByRole("button", { name: "en-US:nav:NAV_SECTION_CONTENT" }));

    expect(screen.getByRole("button", { name: "en-US:nav:NAV_CONTENT_LIBRARY" })).toHaveAttribute(
      "data-active",
      "true",
    );
  });

  it("updates the active branch when pathnameOverride changes between workspace source pages", async () => {
    const user = userEvent.setup();
    mockPathname = "/usercenter/profile";
    const workspaceItems = mapWorkspaceNavItems(WORKSPACE_NAV_ITEMS, "/w/ws-1");

    const view = renderTreeNav({
      items: workspaceItems,
      favoriteWorkspaceBase: "/w/ws-1",
      pathnameOverride: "/w/ws-1/team/members",
    });

    expect(screen.getByRole("button", { name: "en-US:nav:NAV_SECTION_TEAM" })).toHaveAttribute(
      "data-active",
      "true",
    );

    await user.click(screen.getByRole("button", { name: "en-US:nav:NAV_SECTION_TEAM" }));

    expect(
      screen.getByRole("button", { name: "en-US:nav:NAV_SETTINGS_TEAM_MEMBER_LIST" }),
    ).toHaveAttribute("data-active", "true");

    view.rerender(
      <SidebarProvider open onOpenChange={() => undefined} className="h-screen">
        <Sidebar collapsible="icon" animateOnHover={false}>
          <AdminSiderNav
            items={workspaceItems}
            favoriteWorkspaceBase="/w/ws-1"
            pathnameOverride="/w/ws-1/assets"
          />
        </Sidebar>
      </SidebarProvider>,
    );

    expect(screen.getByRole("button", { name: "en-US:nav:NAV_SECTION_CONTENT" })).toHaveAttribute(
      "data-active",
      "true",
    );
    expect(screen.getByRole("button", { name: "en-US:nav:NAV_SECTION_TEAM" })).toHaveAttribute(
      "data-active",
      "false",
    );

    await user.click(screen.getByRole("button", { name: "en-US:nav:NAV_SECTION_CONTENT" }));

    expect(screen.getByRole("button", { name: "en-US:nav:NAV_ASSETS" })).toHaveAttribute(
      "data-active",
      "true",
    );
  });

  it("keeps collapsed groups accessible in icon mode and restores expanded group state on expand", async () => {
    const user = userEvent.setup();
    const view = renderTreeNav({
      items: treeItems,
      favoriteWorkspaceBase: "/w/ws-1",
      open: true,
    });

    await user.click(screen.getByRole("button", { name: "Content" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Assets" })).toBeVisible();
    });

    view.rerender(
      <SidebarProvider open={false} onOpenChange={() => undefined} className="h-screen">
        <Sidebar collapsible="icon" animateOnHover={false}>
          <AdminSiderNav items={treeItems} favoriteWorkspaceBase="/w/ws-1" showFavorites />
        </Sidebar>
      </SidebarProvider>,
    );

    await waitForCollapsedRender();
    expect(screen.getByRole("button", { name: "Content" })).toBeVisible();

    view.rerender(
      <SidebarProvider open onOpenChange={() => undefined} className="h-screen">
        <Sidebar collapsible="icon" animateOnHover={false}>
          <AdminSiderNav items={treeItems} favoriteWorkspaceBase="/w/ws-1" showFavorites />
        </Sidebar>
      </SidebarProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Assets" })).toBeVisible();
    });
    expect(screen.queryByRole("button", { name: "Members" })).not.toBeInTheDocument();
  });
});
