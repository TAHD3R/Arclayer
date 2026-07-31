import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createRef, useState } from "react";
import userEvent from "@testing-library/user-event";
import { Activity, Home, LayoutGrid, Settings, UserPlus, Users } from "lucide-react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { AdminSiderNav } from "@/components/layout/admin-side-nav";
import { PROJECT_NAV_ITEMS } from "@/constants/menu/project";
import { STORAGE_KEYS } from "@/constants/storage";
import { mapWorkspaceNavItems } from "@/layouts/admin-scene-utils";
import type { AdminNavItem } from "@/types/admin-nav";
import { useFavoritesStore } from "@/stores/use-favorites-store";
import { usePreferencesStore } from "@/stores/use-preference-store";
import { useSidebarNavStore } from "@/stores/use-sidebar-nav-store";
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

function expectNoVisibleSidebarTooltip() {
  const tooltip = document.body.querySelector<HTMLElement>('[data-slot="tooltip-content"]');
  if (!tooltip) {
    expect(tooltip).toBeNull();
    return;
  }
  expect(tooltip).toHaveAttribute("hidden");
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

function ControlledSidebarNav(props: { items: readonly AdminNavItem[] }) {
  const [open, setOpen] = useState(true);

  return (
    <SidebarProvider open={open} onOpenChange={setOpen} className="h-screen">
      <button type="button" onClick={() => setOpen((current) => !current)}>
        Toggle sidebar
      </button>
      <Sidebar collapsible="icon" animateOnHover={false}>
        <AdminSiderNav items={props.items} showFavorites />
      </Sidebar>
    </SidebarProvider>
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
    groupLabelBefore: "Website",
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
        key: "website.config",
        label: "Website Config",
        icon: Settings,
        to: "/w/ws-1/website/config",
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
    key: "global.projects",
    label: "Projects",
    icon: Users,
    to: "/projects",
    groupBehavior: "navigate-self-and-expand",
    children: [
      {
        key: "global.projects.project-alpha",
        label: "Alpha Project",
        icon: Home,
        to: "/projects/project-alpha",
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
    key: "global.resources",
    label: "Inspiration",
    icon: LayoutGrid,
    to: "/inspriation",
  },
  {
    key: "global.projects",
    label: "All projects",
    icon: Users,
    to: "/projects",
    insertStarredAfter: true,
  },
  {
    key: "global.recent-project.project-alpha",
    label: "Project Alpha",
    icon: Users,
    iconNode: <span data-testid="project-alpha-real-icon">PA</span>,
    to: "/projects/project-alpha",
    groupLabelBeforeKey: "nav:NAV_SECTION_PROJECTS",
  },
];

const subItemActionItems: AdminNavItem[] = [
  {
    key: "global.projects",
    label: "Projects",
    icon: Users,
    defaultExpanded: true,
    children: [
      {
        key: "global.projects.project-alpha",
        label: "Project Alpha",
        icon: Home,
        to: "/projects/project-alpha",
        renderLabel: () => <span className="min-w-0 flex-1 truncate">Project Alpha</span>,
        actionRenderer: () => (
          <button type="button" aria-label="Open project actions" className="size-6 rounded-sm">
            Actions
          </button>
        ),
      },
    ],
  },
];

const nestedProjectMarkerItems: AdminNavItem[] = [
  {
    key: "global.projects",
    label: "Projects",
    icon: Users,
    defaultExpanded: true,
    children: [
      {
        key: "global.projects.current.project-alpha",
        label: "Project Alpha",
        icon: Home,
        to: "/projects/project-alpha",
        groupLabelBeforeKey: "nav:NAV_PINNED_SECTION",
      },
      {
        key: "global.projects.other.project-beta",
        label: "Project Beta",
        icon: Home,
        to: "/projects/project-beta",
        groupLabelBeforeKey: "nav:NAV_RECENT_SECTION",
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
    usePreferencesStore.setState({ sidebarItemVisibility: { favorites: true } });
    useSidebarNavStore.setState({ collapsedKeys: [] });
  });

  it("forwards refs through SidebarMenuButton to the real button element", () => {
    const buttonRef = createRef<HTMLButtonElement>();

    render(
      <SidebarProvider defaultOpen={false} className="h-screen">
        <Sidebar collapsible="icon">
          <SidebarMenuButton ref={buttonRef}>Ref check</SidebarMenuButton>
        </Sidebar>
      </SidebarProvider>,
    );

    expect(buttonRef.current).toBeInstanceOf(HTMLButtonElement);
    expect(buttonRef.current).toHaveTextContent("Ref check");
    expect(buttonRef.current).not.toHaveAttribute("aria-selected");
  });

  it("keeps every sidebar list direct child and list item semantically valid", () => {
    const { container } = renderTreeNav({
      items: treeItems,
      favoriteWorkspaceBase: "/w/ws-1",
    });

    const rootList = screen.getByRole("button", { name: "Content" }).closest("ul");

    expect(rootList).not.toBeNull();
    expect(Array.from(rootList?.children ?? []).every((child) => child.tagName === "LI")).toBe(
      true,
    );
    expect(container.querySelectorAll("ul > div")).toHaveLength(0);
    expect(
      Array.from(container.querySelectorAll("li")).every((item) =>
        ["UL", "OL", "MENU"].includes(item.parentElement?.tagName ?? ""),
      ),
    ).toBe(true);
  });

  it("keeps collapsed leaf items free of tooltip overlays", async () => {
    const user = userEvent.setup();
    renderCollapsedNav(items);

    await waitForCollapsedRender();
    await user.hover(screen.getByRole("button", { name: "Overview" }));

    expectNoVisibleSidebarTooltip();
  });

  it("keeps collapsed favorites free of tooltip overlays across language changes", async () => {
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

    expectNoVisibleSidebarTooltip();

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

    expectNoVisibleSidebarTooltip();
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

      const favoritesHeader = screen.getByRole("button", { name: "en-US:nav:NAV_FAVORITES" });
      const favoritesContainer = favoritesHeader.closest('[data-slot="sidebar-menu-item"]');
      expect(favoritesContainer).not.toBeNull();
      const favoriteButton = within(favoritesContainer as HTMLElement).getByRole("button", {
        name: longLabel,
      });
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

  it("keeps collapsed group buttons on the plain sidebar button contract", async () => {
    renderCollapsedNav(items);

    await waitForCollapsedRender();

    expect(screen.getByRole("button", { name: "Team" })).toHaveAttribute(
      "data-slot",
      "sidebar-menu-button",
    );
  });

  it("keeps expanded sub items with action buttons on a valid DOM structure", () => {
    renderTreeNav({
      items: subItemActionItems,
      favoriteWorkspaceBase: "/projects",
      pathnameOverride: "/projects/project-alpha",
    });

    const actionButton = screen.getByRole("button", { name: "Open project actions" });
    const subItem = actionButton.closest('[data-slot="sidebar-menu-sub-item"]');

    expect(subItem).not.toBeNull();
    if (!subItem) throw new Error("Missing sidebar menu sub item");

    const subItemElement = subItem as HTMLElement;
    expect(
      within(subItemElement).getByRole("button", { name: "Project Alpha" }),
    ).toBeInTheDocument();
    expect(subItemElement.querySelector("button button")).toBeNull();
  });

  it("switches to expanded-tree behavior when the collapsed sidebar is hover-expanded", async () => {
    const user = userEvent.setup();
    renderCollapsedNav(items);

    await waitForCollapsedRender();
    const sidebarContainer = document.querySelector<HTMLElement>('[data-slot="sidebar-container"]');

    expect(sidebarContainer).not.toBeNull();
    if (!sidebarContainer) throw new Error("Missing sidebar container");

    fireEvent.pointerEnter(sidebarContainer);
    fireEvent.pointerMove(sidebarContainer);

    await user.hover(screen.getByRole("button", { name: "Team" }));
    await waitFor(() => {
      expect(document.querySelector('[data-slot="sidebar"]')).toHaveAttribute(
        "data-hover-preview",
        "true",
      );
    });
    await waitFor(() => {
      expect(screen.queryByRole("menuitem", { name: "Members" })).not.toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: "Members" })).toBeVisible();
  });

  it("renders group markers as part of the nav tree", () => {
    renderTreeNav({
      items: treeItems,
      favoriteWorkspaceBase: "/w/ws-1",
    });

    expect(screen.getByRole("button", { name: "Overview" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Content" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Team" })).toBeVisible();
    expect(screen.getByText("Website")).toBeVisible();
    expect(document.querySelector('[data-slot="admin-side-nav-group-marker"]')).not.toBeNull();
    expect(
      document.querySelector('[data-slot="admin-side-nav-group-marker-divider"]'),
    ).not.toBeNull();
    expect(document.querySelector('[data-slot="admin-side-nav-group-label"]')).toHaveClass(
      "rounded-none",
      "select-none",
    );
  });

  it("renders recent projects with their custom project icons", () => {
    renderTreeNav({
      items: globalItems,
      favoriteWorkspaceBase: "/projects",
      pathnameOverride: "/projects",
    });

    expect(screen.getByText("en-US:nav:NAV_SECTION_PROJECTS")).toBeVisible();
    expect(screen.getByRole("button", { name: "All projects" })).toBeVisible();
    expect(screen.getByTestId("project-alpha-real-icon")).toBeVisible();
    expect(screen.getByRole("button", { name: "Project Alpha" }).querySelector("svg")).toBeNull();
  });

  it("keeps the same custom project icon when the sidebar collapses", async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<ControlledSidebarNav items={globalItems} />);

    expect(screen.getByTestId("project-alpha-real-icon")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Toggle sidebar" }));
    await waitForCollapsedRender();

    expect(screen.getByTestId("project-alpha-real-icon")).toBeVisible();
  });

  it("renders translated group markers inside nested project groups", () => {
    renderTreeNav({
      items: nestedProjectMarkerItems,
      favoriteWorkspaceBase: "/projects/project-alpha",
      pathnameOverride: "/projects/project-alpha",
    });

    expect(screen.getByText("en-US:nav:NAV_PINNED_SECTION")).toBeVisible();
    expect(screen.getByText("en-US:nav:NAV_RECENT_SECTION")).toBeVisible();
    expect(screen.getByRole("button", { name: "Project Alpha" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Project Beta" })).toBeVisible();
  });

  it("collapses a labeled section through the whole label row and persists the state", async () => {
    const user = userEvent.setup();
    const view = renderTreeNav({
      items: globalItems,
      favoriteWorkspaceBase: "/w/ws-1",
    });
    const sectionLabel = screen.getByRole("button", {
      name: "en-US:nav:NAV_SECTION_PROJECTS",
    });

    expect(sectionLabel).toHaveAttribute("aria-expanded", "true");
    expect(sectionLabel.querySelector("svg")).not.toBeNull();
    expect(sectionLabel.querySelector("svg")).toHaveClass(
      "rotate-90",
      "transition-[opacity,transform,translate,scale,rotate]",
      "duration-[220ms]",
      "motion-reduce:transition-none",
    );
    const contentId = sectionLabel.getAttribute("aria-controls");
    expect(contentId).toBeTruthy();
    expect(document.getElementById(String(contentId))).toHaveClass(
      "data-[state=open]:animate-[arclayer-collapsible-down_180ms_ease-out]",
      "data-[state=closed]:animate-[arclayer-collapsible-up_140ms_ease-out]",
      "motion-reduce:animate-none",
    );

    await user.click(sectionLabel);

    expect(sectionLabel).toHaveAttribute("aria-expanded", "false");
    expect(sectionLabel.querySelector("svg")).not.toHaveClass("rotate-90");
    expect(screen.queryByRole("button", { name: "Project Alpha" })).not.toBeInTheDocument();
    expect(useSidebarNavStore.getState().collapsedKeys).toContain(
      "section:__root__:nav:NAV_SECTION_PROJECTS",
    );
    expect(localStorage.getItem(STORAGE_KEYS.sidebarNavCollapsed)).toContain(
      "section:__root__:nav:NAV_SECTION_PROJECTS",
    );

    view.unmount();
    renderTreeNav({ items: globalItems, favoriteWorkspaceBase: "/w/ws-1" });
    expect(screen.queryByRole("button", { name: "Project Alpha" })).not.toBeInTheDocument();
  });

  it("keeps open section items in the icon rail while disabling the hidden section label", async () => {
    renderTreeNav({
      items: globalItems,
      favoriteWorkspaceBase: "/w/ws-1",
      open: false,
    });

    await waitForCollapsedRender();

    const sectionLabel = screen.getByRole("button", {
      name: "en-US:nav:NAV_SECTION_PROJECTS",
    });
    expect(document.querySelector('[data-slot="sidebar"]')).toHaveAttribute(
      "data-layout-state",
      "collapsed",
    );
    expect(sectionLabel.className).toContain("pointer-events-none");
    expect(screen.getByRole("button", { name: "Project Alpha" })).toBeInTheDocument();
  });

  it("hides closed labeled sections in the icon rail and restores their marker when expanded", async () => {
    useSidebarNavStore.setState({
      collapsedKeys: ["section:__root__:nav:NAV_SECTION_PROJECTS"],
    });
    const view = renderTreeNav({
      items: globalItems,
      favoriteWorkspaceBase: "/w/ws-1",
      open: false,
    });

    await waitForCollapsedRender();

    expect(
      screen.queryByRole("button", { name: "en-US:nav:NAV_SECTION_PROJECTS" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Project Alpha" })).not.toBeInTheDocument();

    view.rerender(
      <SidebarProvider open onOpenChange={() => undefined} className="h-screen">
        <Sidebar collapsible="icon" animateOnHover={false}>
          <AdminSiderNav items={globalItems} favoriteWorkspaceBase="/w/ws-1" showFavorites />
        </Sidebar>
      </SidebarProvider>,
    );

    expect(
      await screen.findByRole("button", { name: "en-US:nav:NAV_SECTION_PROJECTS" }),
    ).toHaveAttribute("aria-expanded", "false");
  });

  it("collapses nested labeled sections independently", async () => {
    const user = userEvent.setup();
    renderTreeNav({
      items: nestedProjectMarkerItems,
      favoriteWorkspaceBase: "/projects/project-alpha",
    });

    await user.click(screen.getByRole("button", { name: "en-US:nav:NAV_PINNED_SECTION" }));

    expect(screen.queryByRole("button", { name: "Project Alpha" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Project Beta" })).toBeVisible();
  });

  it("keeps all top-level groups expanded by default", () => {
    renderTreeNav({
      items: treeItems,
      favoriteWorkspaceBase: "/w/ws-1",
    });

    expect(screen.getByRole("button", { name: "Assets" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Members" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Invitations" })).toBeVisible();
  });

  it("allows default-expanded groups to be collapsed", async () => {
    const user = userEvent.setup();
    const defaultExpandedItems: AdminNavItem[] = treeItems.map((item) =>
      item.key === "content" ? { ...item, defaultExpanded: true } : item,
    );

    renderTreeNav({
      items: defaultExpandedItems,
      favoriteWorkspaceBase: "/w/ws-1",
    });

    expect(screen.getByRole("button", { name: "Assets" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Members" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Content" }));

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Assets" })).not.toBeInTheDocument();
    });
  });

  it("persists collapsed menu items across sidebar remounts", async () => {
    const user = userEvent.setup();
    const view = renderTreeNav({ items: treeItems, favoriteWorkspaceBase: "/w/ws-1" });

    await user.click(screen.getByRole("button", { name: "Content" }));
    expect(screen.queryByRole("button", { name: "Assets" })).not.toBeInTheDocument();
    expect(localStorage.getItem(STORAGE_KEYS.sidebarNavCollapsed)).toContain("group:content");

    view.unmount();
    renderTreeNav({ items: treeItems, favoriteWorkspaceBase: "/w/ws-1" });
    expect(screen.queryByRole("button", { name: "Assets" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Members" })).toBeVisible();
  });

  it("toggles top-level groups independently without accordion behavior", async () => {
    const user = userEvent.setup();
    renderTreeNav({
      items: treeItems,
      favoriteWorkspaceBase: "/w/ws-1",
    });

    await user.click(screen.getByRole("button", { name: "Content" }));
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Assets" })).not.toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Members" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Content" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Assets" })).toBeVisible();
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

  it("renders nested group chevrons in the trailing icon slot", async () => {
    const nestedItems: AdminNavItem[] = [
      {
        key: "platform",
        label: "Platform",
        icon: LayoutGrid,
        children: [
          {
            key: "platform.operations",
            label: "Operations",
            icon: Settings,
            children: [
              {
                key: "platform.operations.jobs",
                label: "Jobs",
                icon: Activity,
                to: "/w/ws-1/platform/jobs",
              },
            ],
          },
        ],
      },
    ];

    renderTreeNav({
      items: nestedItems,
      favoriteWorkspaceBase: "/w/ws-1",
      pathnameOverride: "/w/ws-1/platform/jobs",
    });

    const subgroupButton = screen.getByRole("button", { name: "Operations" });
    const trailingIconSlot = subgroupButton.querySelector(".ml-auto.inline-flex.size-6");

    expect(trailingIconSlot).not.toBeNull();
    expect(trailingIconSlot?.querySelector("svg")).not.toBeNull();
  });

  it("keeps disabled nested placeholder items visually interactive", async () => {
    const disabledNestedItems: AdminNavItem[] = [
      {
        key: "platform",
        label: "Platform",
        icon: LayoutGrid,
        children: [
          {
            key: "platform.configuration",
            label: "Configuration",
            icon: Settings,
            to: "/projects",
            disabled: true,
          },
        ],
      },
    ];

    renderTreeNav({
      items: disabledNestedItems,
      favoriteWorkspaceBase: "/w/ws-1",
    });

    const placeholderButton = screen.getByRole("button", { name: "Configuration" });

    expect(placeholderButton.className).toContain("cursor-pointer");
    expect(placeholderButton.className).toContain("hover:bg-transparent");
    expect(placeholderButton.className).not.toContain("cursor-not-allowed");
  });

  it("shows favorites as a top-level group even when there are no favorites yet", () => {
    useFavoritesStore.setState({ paths: [], items: [], sectionExpanded: false });

    renderTreeNav({
      items: treeItems,
      favoriteWorkspaceBase: "/w/ws-1",
    });

    expect(screen.getByRole("button", { name: "en-US:nav:NAV_FAVORITES" })).toBeVisible();
  });

  it("does not render favorites when the sidebar visibility preference disables it", () => {
    useFavoritesStore.setState({ paths: [], items: [], sectionExpanded: false });
    usePreferencesStore.setState({ sidebarItemVisibility: { favorites: false } });

    renderTreeNav({
      items: treeItems,
      favoriteWorkspaceBase: "/w/ws-1",
    });

    expect(screen.queryByRole("button", { name: "en-US:nav:NAV_FAVORITES" })).toBeNull();
  });

  it("inserts favorites between all projects and recent projects", () => {
    useFavoritesStore.setState({ paths: [], items: [], sectionExpanded: false });

    renderTreeNav({
      items: globalItems,
      favoriteWorkspaceBase: "/w/ws-1",
    });

    const buttons = screen.getAllByRole("button");
    const buttonIndex = (name: string) => buttons.indexOf(screen.getByRole("button", { name }));

    expect(buttonIndex("Home")).toBeLessThan(buttonIndex("Inspiration"));
    expect(buttonIndex("Inspiration")).toBeLessThan(buttonIndex("All projects"));
    expect(buttonIndex("All projects")).toBeLessThan(buttonIndex("en-US:nav:NAV_FAVORITES"));
    expect(buttonIndex("en-US:nav:NAV_FAVORITES")).toBeLessThan(buttonIndex("Project Alpha"));
  });

  it("keeps favorites in collapsed mode during the hover-open threshold", () => {
    vi.useFakeTimers();
    useFavoritesStore.setState({ paths: [], items: [], sectionExpanded: true });

    try {
      renderCollapsedNav(treeItems);

      const sidebarContainer = document.querySelector<HTMLElement>(
        '[data-slot="sidebar-container"]',
      );

      expect(sidebarContainer).not.toBeNull();
      if (!sidebarContainer) throw new Error("Missing sidebar container");

      act(() => {
        fireEvent.pointerEnter(sidebarContainer);
        fireEvent.pointerMove(sidebarContainer);
        vi.advanceTimersByTime(50);
      });

      expect(
        screen.queryByRole("button", { name: "en-US:NAV_FAVORITES_SECTION_ACTIONS" }),
      ).not.toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(20);
      });

      expect(
        screen.getByRole("button", { name: "en-US:NAV_FAVORITES_SECTION_ACTIONS" }),
      ).toBeVisible();
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows favorites header actions on hover in expanded mode", async () => {
    const user = userEvent.setup();
    useFavoritesStore.setState({ paths: [], items: [], sectionExpanded: true });

    renderTreeNav({
      items: treeItems,
      favoriteWorkspaceBase: "/w/ws-1",
    });

    const favoritesActionsButton = screen.getByRole("button", {
      name: "en-US:NAV_FAVORITES_SECTION_ACTIONS",
    });
    expect(favoritesActionsButton.parentElement?.className).toContain("opacity-0");

    await user.hover(screen.getByRole("button", { name: "en-US:nav:NAV_FAVORITES" }));

    expect(favoritesActionsButton.parentElement?.className).toContain(
      "group-hover/nav-item:opacity-100",
    );
  });

  it("keeps favorites child rows outside the header hover group", () => {
    useFavoritesStore.setState({
      paths: ["/w/ws-1/assets"],
      items: [],
      sectionExpanded: true,
    });

    renderTreeNav({ items: treeItems, favoriteWorkspaceBase: "/w/ws-1" });

    const header = screen.getByRole("button", { name: "en-US:nav:NAV_FAVORITES" });
    const headerHoverGroup = header.closest('[class~="group/nav-item"]');
    expect(headerHoverGroup).not.toBeNull();
    expect(
      within(headerHoverGroup as HTMLElement).queryByRole("button", { name: "Assets" }),
    ).not.toBeInTheDocument();
  });

  it("hides favorites after confirming the header menu action", async () => {
    const user = userEvent.setup();
    useFavoritesStore.setState({ paths: [], items: [], sectionExpanded: true });

    renderTreeNav({
      items: treeItems,
      favoriteWorkspaceBase: "/w/ws-1",
    });

    await user.click(screen.getByRole("button", { name: "en-US:NAV_FAVORITES_SECTION_ACTIONS" }));
    await user.click(
      screen.getByRole("menuitem", { name: "en-US:NAV_FAVORITES_ACTION_HIDE_FROM_SIDEBAR" }),
    );

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "en-US:NAV_FAVORITES_HIDE_CONFIRM_TITLE" }),
      ).toBeVisible();
    });

    await user.click(
      screen.getByRole("button", { name: "en-US:NAV_FAVORITES_HIDE_CONFIRM_ACTION" }),
    );

    expect(screen.queryByRole("button", { name: "en-US:nav:NAV_FAVORITES" })).toBeNull();
    expect(useFavoritesStore.getState().items).toEqual([]);
    expect(usePreferencesStore.getState().sidebarItemVisibility.favorites).toBe(false);
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
    useSidebarNavStore.setState({ collapsedKeys: ["group:content"] });

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

  it("keeps the content branch active after Website Config navigates to its favorited route", async () => {
    const user = userEvent.setup();
    mockPathname = "/w/ws-1/";
    useFavoritesStore.setState({
      paths: ["/w/ws-1/website/config", "/w/ws-1/settings/workspace/basics"],
      sectionExpanded: false,
    });

    const view = renderTreeNav({
      items: redirectedPreferenceItems,
      favoriteWorkspaceBase: "/w/ws-1",
    });

    await user.click(screen.getByRole("button", { name: "Website Config" }));

    expect(navigateMock).toHaveBeenCalledWith({ to: "/w/ws-1/website/config" });

    mockPathname = "/w/ws-1/website/config";
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
    useSidebarNavStore.setState({ collapsedKeys: ["group:global.projects"] });

    renderTreeNav({
      items: navigateSelfAndExpandItems,
      favoriteWorkspaceBase: "/w/ws-alpha",
    });

    expect(screen.queryByRole("button", { name: "Alpha Project" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Projects" }));

    expect(navigateMock).toHaveBeenCalledWith({ to: "/projects" });
    expect(screen.getByRole("button", { name: "Alpha Project" })).toBeVisible();
  });

  it("uses the parent route as the collapsed click target for navigate-self-and-expand groups", async () => {
    mockPathname = "/";
    useSidebarNavStore.setState({ collapsedKeys: ["group:global.projects"] });

    renderCollapsedNav(navigateSelfAndExpandItems);

    await waitForCollapsedRender();
    fireEvent.click(screen.getByRole("button", { name: "Projects" }));

    expect(navigateMock).toHaveBeenCalledWith({ to: "/projects" });
  });

  it("can keep a source menu branch active while current route renders /notifications", async () => {
    const user = userEvent.setup();
    mockPathname = "/notifications";
    useSidebarNavStore.setState({ collapsedKeys: ["group:team"] });

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

  it("drives expanded group content through the closing animation when the sidebar collapses", async () => {
    const user = userEvent.setup();

    renderWithQueryClient(<ControlledSidebarNav items={items} />);

    const membersButton = screen.getByRole("button", { name: "Members" });
    const subTree = membersButton.closest('[data-slot="sidebar-menu-sub"]');
    const collapsibleContent = subTree?.closest("[data-state]");

    expect(collapsibleContent).toHaveAttribute("data-state", "open");

    await user.click(screen.getByRole("button", { name: "Toggle sidebar" }));

    expect(collapsibleContent).toHaveAttribute("data-state", "closed");

    await waitForCollapsedRender();

    expect(collapsibleContent).toHaveAttribute("data-state", "closed");
  });

  it("keeps root labels rendered during the sidebar transition phase and hides them at steady collapsed state", async () => {
    const user = userEvent.setup();

    renderWithQueryClient(<ControlledSidebarNav items={items} />);

    const overviewLabel = screen.getByText("Overview");
    const labelContainer = overviewLabel.closest(".overflow-hidden");
    const sidebar = document.querySelector<HTMLElement>('[data-slot="sidebar"]');

    expect(sidebar).not.toBeNull();
    expect(labelContainer).not.toBeNull();
    if (!sidebar || !labelContainer) throw new Error("Missing sidebar label container");

    await user.click(screen.getByRole("button", { name: "Toggle sidebar" }));

    expect(sidebar).toHaveAttribute("data-motion-phase", "collapsing");
    expect(labelContainer.className).toContain("[[data-motion-phase=collapsing]_&]:opacity-0");
    expect(labelContainer.className).toContain(
      "[[data-layout-collapsible=icon]:not([data-hover-preview=true])_&]:max-w-0",
    );
  });

  it("marks Content -> Contents active for the content create route alias", async () => {
    const workspaceItems = mapWorkspaceNavItems(PROJECT_NAV_ITEMS, "/projects/ws-1");

    renderTreeNav({
      items: workspaceItems,
      favoriteWorkspaceBase: "/projects/ws-1",
      pathnameOverride: "/projects/ws-1/content/create",
    });

    expect(screen.getByRole("button", { name: "en-US:nav:NAV_CONTENT_LIBRARY" })).toHaveAttribute(
      "data-active",
      "true",
    );
    expect(screen.getByRole("button", { name: "en-US:nav:NAV_DASHBOARD" })).toHaveAttribute(
      "data-active",
      "false",
    );
  });

  it("updates the active branch when pathnameOverride changes between workspace source pages", async () => {
    mockPathname = "/settings/personal/profile";
    const workspaceItems = mapWorkspaceNavItems(PROJECT_NAV_ITEMS, "/projects/ws-1");

    const view = renderTreeNav({
      items: workspaceItems,
      favoriteWorkspaceBase: "/projects/ws-1",
      pathnameOverride: "/projects/ws-1/website/config",
    });

    expect(screen.getByRole("button", { name: "en-US:nav:NAV_WEBSITE_CONFIG" })).toHaveAttribute(
      "data-active",
      "true",
    );
    view.rerender(
      <SidebarProvider open onOpenChange={() => undefined} className="h-screen">
        <Sidebar collapsible="icon" animateOnHover={false}>
          <AdminSiderNav
            items={workspaceItems}
            favoriteWorkspaceBase="/projects/ws-1"
            pathnameOverride="/projects/ws-1/assets"
          />
        </Sidebar>
      </SidebarProvider>,
    );

    expect(screen.getByRole("button", { name: "en-US:nav:NAV_ASSETS" })).toHaveAttribute(
      "data-active",
      "true",
    );
  });

  it("keeps Project Settings active for the project API tab route", async () => {
    const workspaceItems = mapWorkspaceNavItems(PROJECT_NAV_ITEMS, "/projects/ws-1");

    renderTreeNav({
      items: workspaceItems,
      favoriteWorkspaceBase: "/projects/ws-1",
      pathnameOverride: "/projects/ws-1/settings/api",
    });

    expect(screen.getByRole("button", { name: "en-US:nav:NAV_SETTINGS_PROJECT" })).toHaveAttribute(
      "data-active",
      "true",
    );
    expect(screen.getByRole("button", { name: "en-US:nav:NAV_WEBSITE_CONFIG" })).toHaveAttribute(
      "data-active",
      "false",
    );
  });

  it("keeps collapsed groups accessible in icon mode and restores expanded group state on expand", async () => {
    const view = renderTreeNav({
      items: treeItems,
      favoriteWorkspaceBase: "/w/ws-1",
      open: true,
    });

    expect(screen.getByRole("button", { name: "Assets" })).toBeVisible();

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
    expect(screen.getByRole("button", { name: "Members" })).toBeVisible();
  });
});
