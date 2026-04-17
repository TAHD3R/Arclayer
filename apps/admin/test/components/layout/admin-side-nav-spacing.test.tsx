import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Home, Users } from "lucide-react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { AdminSiderNav } from "@/components/layout/admin-side-nav";
import type { AdminNavItem } from "@/types/admin-nav";
import { Sidebar, SidebarProvider } from "@arclayer/ui/sidebar";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  useRouterState: ({
    select,
  }: {
    select: (state: { location: { pathname: string } }) => unknown;
  }) => select({ location: { pathname: "/w/ws-1/" } }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en-US", resolvedLanguage: "en-US" },
  }),
}));

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
    to: "/w/ws-1/team",
  },
];

const treeItems: AdminNavItem[] = [
  {
    key: "home",
    label: "Home",
    icon: Home,
    to: "/w/ws-1/",
  },
  {
    key: "content",
    label: "Content",
    icon: Users,
    groupLabelBefore: "Website",
    children: items,
  },
];

const dividerItems: AdminNavItem[] = [
  {
    key: "home",
    label: "Home",
    icon: Home,
    to: "/w/ws-1/",
  },
  {
    key: "team",
    label: "Team",
    icon: Users,
    to: "/w/ws-1/team",
    dividerBefore: true,
  },
];

describe("AdminSiderNav spacing", () => {
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

  it("uses a larger root menu gap in icon-collapsed mode", () => {
    const { container } = render(
      <SidebarProvider defaultOpen={false} className="h-screen">
        <Sidebar collapsible="icon" animateOnHover={false}>
          <AdminSiderNav items={items} />
        </Sidebar>
      </SidebarProvider>,
    );

    const menu = container.querySelector('[data-slot="sidebar-menu"]');

    expect(menu).not.toBeNull();
    expect(menu).toHaveClass("gap-1.5");
    expect(menu).toHaveClass("group-data-[collapsible=icon]:gap-2.5");
  });

  it("keeps collapsed section markers on the same divider row contract while revealing text in expanded state", () => {
    render(
      <SidebarProvider open onOpenChange={() => undefined} className="h-screen">
        <Sidebar collapsible="icon" animateOnHover={false}>
          <AdminSiderNav items={treeItems} favoriteWorkspaceBase="/w/ws-1" />
        </Sidebar>
      </SidebarProvider>,
    );

    const groupMarker = document.querySelector('[data-slot="admin-side-nav-group-marker"]');
    const groupMarkerDivider = document.querySelector(
      '[data-slot="admin-side-nav-group-marker-divider"]',
    );
    const groupLabel = document.querySelector('[data-slot="admin-side-nav-group-label"]');
    expect(groupMarker).not.toBeNull();
    expect(groupMarkerDivider).not.toBeNull();
    expect(groupLabel).not.toBeNull();
    expect(groupMarker).toHaveClass("py-3");
    expect(groupMarker?.className).toContain("group-data-[state=expanded]:px-3");
    expect(groupMarker?.className).toContain("group-data-[state=expanded]:pt-4");
    expect(groupMarker?.className).toContain("group-data-[state=expanded]:pb-2");
    expect(groupMarkerDivider).toHaveClass("border-b", "border-sidebar-border");
    expect(groupMarkerDivider?.className).toContain("group-data-[state=expanded]:opacity-0");
    expect(groupLabel).toHaveClass("text-xs", "font-semibold");
    expect(groupLabel).toHaveClass("inset-x-3", "top-1.5");
    expect(groupLabel?.className).toContain("-translate-y-1");
    expect(groupLabel?.className).toContain("group-data-[state=expanded]:translate-y-0");
    expect(groupLabel?.className).toContain("group-data-[state=expanded]:opacity-100");
  });

  it("uses the reference-style divider row spacing", () => {
    render(
      <SidebarProvider open onOpenChange={() => undefined} className="h-screen">
        <Sidebar collapsible="icon" animateOnHover={false}>
          <AdminSiderNav items={dividerItems} favoriteWorkspaceBase="/w/ws-1" />
        </Sidebar>
      </SidebarProvider>,
    );

    const dividerRow = document.querySelector('[data-slot="admin-side-nav-divider"]');

    expect(dividerRow).not.toBeNull();
    expect(dividerRow).toHaveClass("py-3");
    expect(dividerRow?.className).toContain("group-data-[state=expanded]:px-3");
    expect(dividerRow?.className).toContain("group-data-[state=expanded]:pt-4");
    expect(dividerRow?.className).toContain("group-data-[state=expanded]:pb-2");
    expect(dividerRow?.firstElementChild).toHaveClass("border-b", "border-sidebar-border");
  });

  it("keeps the sidebar inner column stretched so group markers and dividers use the full width", () => {
    const { container } = render(
      <SidebarProvider open onOpenChange={() => undefined} className="h-screen">
        <Sidebar collapsible="icon" animateOnHover={false}>
          <AdminSiderNav items={treeItems} favoriteWorkspaceBase="/w/ws-1" />
        </Sidebar>
      </SidebarProvider>,
    );

    const sidebarInner = container.querySelector('[data-slot="sidebar-inner"]');
    const groupMarker = document.querySelector('[data-slot="admin-side-nav-group-marker"]');

    expect(sidebarInner).not.toBeNull();
    expect(sidebarInner?.className).not.toContain("items-start");
    expect(sidebarInner?.className).not.toContain("items-end");
    expect(groupMarker).toHaveClass("py-3");
  });

  it("uses the updated nav item padding, height, and active styling", () => {
    render(
      <SidebarProvider open onOpenChange={() => undefined} className="h-screen">
        <Sidebar collapsible="icon" animateOnHover={false}>
          <AdminSiderNav items={items} />
        </Sidebar>
      </SidebarProvider>,
    );

    const dashboardButton = screen.getByRole("button", { name: "Overview" });
    const teamButton = screen.getByRole("button", { name: "Team" });

    expect(dashboardButton).toHaveClass(
      "h-9",
      "rounded-md",
      "!pl-3",
      "!pr-2.5",
      "!py-1.5",
      "text-callout",
    );
    expect(dashboardButton.className).not.toContain("data-[active=true]:bg-accent/50");

    expect(teamButton).toHaveClass(
      "h-9",
      "rounded-md",
      "!pl-3",
      "!pr-2.5",
      "!py-1.5",
      "text-callout",
    );
    expect(teamButton.className).not.toContain("group-data-[collapsible=icon]:size-9!");
    expect(teamButton.className).toContain("group-data-[collapsible=icon]:!pl-3");
    expect(teamButton.className).toContain("group-data-[collapsible=icon]:!pr-3");
    expect(teamButton.className).toContain("group-data-[collapsible=icon]:!py-1.5");
    expect(teamButton.className).not.toContain("group-data-[collapsible=icon]:justify-center");
    expect(teamButton.className).toContain("data-[active=true]:bg-transparent");

    const dashboardLabel = dashboardButton.querySelector("span.min-w-0.flex-1");
    const teamLabel = teamButton.querySelector("span.min-w-0.flex-1");

    expect(dashboardLabel).not.toBeNull();
    expect(teamLabel).not.toBeNull();
    expect(dashboardLabel?.className).toContain("duration-250");
    expect(teamLabel?.className).toContain("duration-250");
    expect(dashboardLabel?.className).not.toContain("translate-x-1");
    expect(teamLabel?.className).not.toContain("translate-x-1");
  });

  it("uses the top-level group trigger spacing with the new group marker row", () => {
    render(
      <SidebarProvider open onOpenChange={() => undefined} className="h-screen">
        <Sidebar collapsible="icon" animateOnHover={false}>
          <AdminSiderNav items={treeItems} favoriteWorkspaceBase="/w/ws-1" />
        </Sidebar>
      </SidebarProvider>,
    );

    const groupButton = screen.getByRole("button", { name: "Content" });
    const groupChevronWrapper = groupButton.querySelector("span:last-child");

    expect(screen.getByText("Website")).toBeVisible();
    expect(document.querySelector('[data-slot="admin-side-nav-group-marker"]')).not.toBeNull();
    expect(groupButton).toHaveClass("!pl-3", "!pr-2.5", "h-9", "rounded-md");
    expect(groupChevronWrapper).toHaveClass("ml-auto");
  });

  it("keeps expanded children aligned with their parent and removes hover background styling", async () => {
    const user = userEvent.setup();

    render(
      <SidebarProvider open onOpenChange={() => undefined} className="h-screen">
        <Sidebar collapsible="icon" animateOnHover={false}>
          <AdminSiderNav items={treeItems} favoriteWorkspaceBase="/w/ws-1" />
        </Sidebar>
      </SidebarProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Content" }));

    const contentItem = screen
      .getByRole("button", { name: "Content" })
      .closest('[data-sidebar="menu-item"]');
    const subtree = contentItem?.querySelector('[data-slot="sidebar-menu-sub"]');
    const submenuButton = within(subtree as HTMLElement).getByRole("button", { name: "Overview" });

    expect(subtree).toHaveClass("ml-0", "pl-7", "border-l-0");
    expect(subtree?.parentElement?.className).not.toContain("before:left-4");
    expect(subtree?.parentElement?.className).not.toContain("before:bg-border/60");
    expect(submenuButton).toHaveClass("[&:not([data-highlight])]:hover:bg-transparent");
  });

  it("keeps fixed sidebars on the correct border edge when collapsible is none", () => {
    const { container, rerender } = render(
      <SidebarProvider open onOpenChange={() => undefined} className="h-screen">
        <Sidebar side="left" collapsible="none" animateOnHover={false}>
          <div>left</div>
        </Sidebar>
      </SidebarProvider>,
    );

    const leftSidebar = container.querySelector('[data-slot="sidebar"]');
    expect(leftSidebar).toHaveClass("border-r", "border-border");
    expect(leftSidebar?.className).not.toContain("border-l");

    rerender(
      <SidebarProvider open onOpenChange={() => undefined} className="h-screen">
        <Sidebar side="right" collapsible="none" animateOnHover={false}>
          <div>right</div>
        </Sidebar>
      </SidebarProvider>,
    );

    const rightSidebar = container.querySelector('[data-slot="sidebar"]');
    expect(rightSidebar).toHaveClass("border-l", "border-border");
    expect(rightSidebar?.className).not.toContain("border-r");
  });
});
