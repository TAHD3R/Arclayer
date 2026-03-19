import { render, screen } from "@testing-library/react";
import { Home, Users } from "lucide-react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { AdminSiderNav } from "@/components/layout/admin-side-nav";
import type { AdminNavItem, AdminNavSection } from "@/types/admin-nav";
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

const structuredSections: AdminNavSection[] = [
  {
    key: "content",
    title: "Content",
    items,
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
    expect(menu).toHaveClass("gap-1");
    expect(menu).toHaveClass("group-data-[collapsible=icon]:gap-2");
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
      "h-7",
      "rounded-md",
      "!pl-2.5",
      "!pr-2",
      "!py-1",
      "text-callout",
    );
    expect(dashboardButton.className).not.toContain("data-[active=true]:bg-accent/50");

    expect(teamButton).toHaveClass(
      "h-7",
      "rounded-md",
      "!pl-2.5",
      "!pr-2",
      "!py-1",
      "text-callout",
    );
    expect(teamButton.className).toContain("group-data-[collapsible=icon]:size-7!");
    expect(teamButton.className).toContain("data-[active=true]:bg-transparent");
  });

  it("uses the updated section label spacing", () => {
    render(
      <SidebarProvider open onOpenChange={() => undefined} className="h-screen">
        <Sidebar collapsible="icon" animateOnHover={false}>
          <AdminSiderNav
            homeItem={{
              key: "home",
              label: "Home",
              icon: Home,
              to: "/w/ws-1/",
            }}
            sections={structuredSections}
            favoriteWorkspaceBase="/w/ws-1"
          />
        </Sidebar>
      </SidebarProvider>,
    );

    const sectionButton = screen.getByRole("button", { name: "Content" });
    const sectionShell = sectionButton.closest('[data-sidebar="group-label"]');
    const sectionChevronWrapper = sectionButton.querySelector("span:last-child");

    expect(sectionShell).toHaveClass("ml-2.5", "my-2", "!px-0");
    expect(sectionButton).toHaveClass("!pl-0", "!pr-2");
    expect(sectionChevronWrapper).toHaveClass("mr-0.5");
  });
});
