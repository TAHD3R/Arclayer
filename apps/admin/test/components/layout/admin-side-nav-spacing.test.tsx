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
    label: "Dashboard",
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
    children: items,
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

  it("uses the updated nav item padding, height, and active styling", () => {
    render(
      <SidebarProvider open onOpenChange={() => undefined} className="h-screen">
        <Sidebar collapsible="icon" animateOnHover={false}>
          <AdminSiderNav items={items} />
        </Sidebar>
      </SidebarProvider>,
    );

    const dashboardButton = screen.getByRole("button", { name: "Dashboard" });
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
    expect(teamButton.className).toContain("group-data-[collapsible=icon]:size-9!");
    expect(teamButton.className).toContain("data-[active=true]:bg-transparent");
  });

  it("uses the top-level group trigger spacing without section labels", () => {
    render(
      <SidebarProvider open onOpenChange={() => undefined} className="h-screen">
        <Sidebar collapsible="icon" animateOnHover={false}>
          <AdminSiderNav items={treeItems} favoriteWorkspaceBase="/w/ws-1" />
        </Sidebar>
      </SidebarProvider>,
    );

    const groupButton = screen.getByRole("button", { name: "Content" });
    const groupChevronWrapper = groupButton.querySelector("span:last-child");

    expect(document.querySelector('[data-sidebar="group-label"]')).toBeNull();
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
    const submenuButton = within(subtree as HTMLElement).getByRole("button", { name: "Dashboard" });

    expect(subtree).toHaveClass("ml-0", "pl-7", "border-l-0");
    expect(subtree?.parentElement).toHaveClass("before:left-4");
    expect(submenuButton).toHaveClass("[&:not([data-highlight])]:hover:bg-transparent");
  });
});
