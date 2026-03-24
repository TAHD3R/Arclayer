import { act, render, screen, waitFor } from "@testing-library/react";
import { createRef } from "react";
import userEvent from "@testing-library/user-event";
import { Activity, Home, LayoutGrid, Settings, UserPlus, Users } from "lucide-react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { AdminSiderNav } from "@/components/layout/admin-side-nav";
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

function renderCollapsedNav(items: readonly AdminNavItem[]) {
  return render(
    <SidebarProvider defaultOpen={false} className="h-screen">
      <Sidebar collapsible="icon" animateOnHover={false}>
        <AdminSiderNav items={items} />
      </Sidebar>
    </SidebarProvider>,
  );
}

async function waitForCollapsedRender() {
  await act(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 450));
  });
}

async function waitMs(ms: number) {
  await act(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, ms));
  });
}

function renderTreeNav(args: {
  items: readonly AdminNavItem[];
  favoriteWorkspaceBase: string;
  open?: boolean;
}) {
  return render(
    <SidebarProvider open={args.open ?? true} onOpenChange={() => undefined} className="h-screen">
      <Sidebar collapsible="icon" animateOnHover={false}>
        <AdminSiderNav items={args.items} favoriteWorkspaceBase={args.favoriteWorkspaceBase} />
      </Sidebar>
    </SidebarProvider>,
  );
}

const items: AdminNavItem[] = [
  {
    key: "dashboard",
    label: "Dashboard",
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
        key: "settings.general",
        label: "General",
        icon: Settings,
        to: "/w/ws-1/settings/general",
      },
    ],
  },
];

const treeItems: AdminNavItem[] = [
  {
    key: "dashboard",
    label: "Dashboard",
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
    useFavoritesStore.setState({ paths: [] });
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
    await user.hover(screen.getByRole("button", { name: "Dashboard" }));

    await waitFor(() => {
      const tooltip = document.body.querySelector('[data-slot="tooltip-content"]');
      expect(tooltip).not.toBeNull();
      expect(tooltip).toHaveTextContent("Dashboard");
    });
  });

  it("updates favorite tooltip text when language changes", async () => {
    const user = userEvent.setup();
    useFavoritesStore.setState({ paths: ["/w/ws-1/"] });

    const favoriteItems: AdminNavItem[] = [
      {
        key: "dashboard",
        label: "Dashboard",
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
          <AdminSiderNav items={favoriteItems} />
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
    await waitMs(80);

    expect(document.body.querySelectorAll('[role="menu"]')).toHaveLength(1);
    expect(screen.queryByRole("menuitem", { name: "Workspace" })).not.toBeInTheDocument();

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

    expect(screen.getByRole("button", { name: "Dashboard" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Content" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Team" })).toBeVisible();
    expect(document.querySelector('[data-sidebar="group-label"]')).toBeNull();
  });

  it("opens only the active top-level group by default", async () => {
    renderTreeNav({
      items: treeItems,
      favoriteWorkspaceBase: "/w/ws-1",
    });

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Assets" })).not.toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Members" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Invitations" })).toBeVisible();
  });

  it("toggles top-level groups as an accordion", async () => {
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

  it("shows starred as a top-level group only when favorites exist", () => {
    useFavoritesStore.setState({ paths: ["/w/ws-1/assets"] });

    renderTreeNav({
      items: treeItems,
      favoriteWorkspaceBase: "/w/ws-1",
    });

    expect(screen.getByRole("button", { name: "en-US:nav:NAV_STARRED" })).toBeVisible();
  });

  it("keeps collapsed groups accessible in icon mode and restores accordion state on expand", async () => {
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
          <AdminSiderNav items={treeItems} favoriteWorkspaceBase="/w/ws-1" />
        </Sidebar>
      </SidebarProvider>,
    );

    await waitForCollapsedRender();
    expect(screen.getByRole("button", { name: "Content" })).toBeVisible();

    view.rerender(
      <SidebarProvider open onOpenChange={() => undefined} className="h-screen">
        <Sidebar collapsible="icon" animateOnHover={false}>
          <AdminSiderNav items={treeItems} favoriteWorkspaceBase="/w/ws-1" />
        </Sidebar>
      </SidebarProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Assets" })).toBeVisible();
    });
  });
});
