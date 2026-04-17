import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { AdminSidebarShell } from "@/components/layout/admin-sidebar-shell";
import { SidebarProvider } from "@arclayer/ui/sidebar";

vi.mock("@/components/layout/admin-side-nav", () => ({
  AdminSiderNav: () => <div data-testid="admin-sider-nav" />,
}));

vi.mock("@/components/layout/admin-sidebar-skeleton", () => ({
  AdminSidebarMainMenuSkeleton: () => <div data-testid="admin-sidebar-main-skeleton" />,
  AdminSidebarFooterMenuSkeleton: () => <div data-testid="admin-sidebar-footer-skeleton" />,
}));

vi.mock("@/components/ui/gradual-blur", () => ({
  default: () => null,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      if (key === "common:SIDEBAR_TOGGLE") return "Toggle sidebar";
      return key;
    },
  }),
}));

function renderWithSidebar(node: React.ReactElement) {
  return render(
    <SidebarProvider defaultOpen className="h-screen">
      {node}
    </SidebarProvider>,
  );
}

describe("AdminSidebarShell", () => {
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

  it("does not show a tooltip when hovering the shared sidebar rail", async () => {
    renderWithSidebar(
      <AdminSidebarShell
        showNavSkeleton={false}
        showOrgNavErrorOverlay={false}
        mainItems={[]}
        footerItems={[]}
        collapsible="icon"
      />,
    );

    const rail = screen.getByRole("button", { name: "Toggle sidebar" });
    fireEvent.mouseEnter(rail, { clientX: 80, clientY: 120 });
    fireEvent.mouseMove(rail, { clientX: 96, clientY: 144 });

    await waitFor(() => {
      expect(document.body.querySelector('[data-slot="sidebar-rail-tooltip"]')).toBeNull();
    });
  });

  it("renders the shared sidebar rail when the desktop sidebar is collapsible", () => {
    renderWithSidebar(
      <AdminSidebarShell
        showNavSkeleton={false}
        showOrgNavErrorOverlay={false}
        mainItems={[]}
        footerItems={[]}
        collapsible="icon"
      />,
    );

    const rail = document.querySelector<HTMLButtonElement>('[data-sidebar="rail"]');
    expect(rail).not.toBeNull();
    if (!rail) throw new Error("Missing sidebar rail");
    expect(rail.className).toContain("cursor-pointer");
  });

  it("does not render the sidebar rail when the sidebar is fixed", () => {
    renderWithSidebar(
      <AdminSidebarShell
        showNavSkeleton={false}
        showOrgNavErrorOverlay={false}
        mainItems={[]}
        footerItems={[]}
        collapsible="none"
      />,
    );

    expect(screen.queryByRole("button", { name: "Toggle sidebar" })).toBeNull();
  });

  it("temporarily expands a collapsed desktop sidebar after the hover threshold and collapses after the leave delay", () => {
    vi.useFakeTimers();

    try {
      const view = render(
        <SidebarProvider defaultOpen={false} className="h-screen">
          <AdminSidebarShell
            showNavSkeleton={false}
            showOrgNavErrorOverlay={false}
            mainItems={[]}
            footerItems={[]}
            collapsible="icon"
          />
        </SidebarProvider>,
      );

      const sidebar = view.container.querySelector<HTMLElement>('[data-slot="sidebar"]');
      const sidebarContainer = view.container.querySelector<HTMLElement>(
        '[data-slot="sidebar-container"]',
      );
      const sidebarContent = view.container.querySelector<HTMLElement>(
        '[data-slot="sidebar-content"]',
      );
      const sidebarInner = view.container.querySelector<HTMLElement>('[data-slot="sidebar-inner"]');

      expect(sidebar).not.toBeNull();
      expect(sidebarContainer).not.toBeNull();
      expect(sidebarContent).not.toBeNull();
      expect(sidebarInner).not.toBeNull();
      expect(sidebar).toHaveAttribute("data-state", "collapsed");
      expect(sidebar).toHaveAttribute("data-layout-state", "collapsed");
      expect(sidebar).toHaveAttribute("data-collapsible", "icon");
      expect(sidebar).toHaveAttribute("data-layout-collapsible", "icon");
      expect(sidebar?.className).toContain("w-(--sidebar-width)");
      expect(sidebar?.className).toContain(
        "data-[layout-collapsible=icon]:w-(--sidebar-width-icon)",
      );
      expect(sidebarContent).toHaveAttribute("inert");

      act(() => {
        fireEvent.pointerEnter(sidebarContainer!);
        fireEvent.pointerMove(sidebarContainer!);
        vi.advanceTimersByTime(80);
      });
      expect(sidebar).toHaveAttribute("data-state", "collapsed");

      act(() => {
        vi.advanceTimersByTime(30);
      });
      expect(sidebar).toHaveAttribute("data-state", "expanded");
      expect(sidebar).toHaveAttribute("data-layout-state", "collapsed");
      expect(sidebar).toHaveAttribute("data-hover-preview", "true");
      expect(sidebar).toHaveAttribute("data-collapsible", "");
      expect(sidebar).toHaveAttribute("data-layout-collapsible", "icon");
      expect(sidebar?.className).toContain(
        "data-[layout-collapsible=icon]:w-(--sidebar-width-icon)",
      );
      expect(sidebarContent).not.toHaveAttribute("inert");
      expect(sidebarContainer?.className).toContain("group-data-[side=left]:border-r");
      expect(sidebarInner?.className).not.toContain("rounded-r-xl");
      expect(sidebarInner?.className).not.toContain("rounded-l-xl");
      expect(sidebarInner?.className).not.toContain("shadow-2xl");

      act(() => {
        fireEvent.pointerLeave(sidebarContainer!);
        vi.advanceTimersByTime(140);
      });
      expect(sidebar).toHaveAttribute("data-state", "expanded");
      expect(sidebar).toHaveAttribute("data-layout-state", "collapsed");
      expect(sidebar).toHaveAttribute("data-layout-collapsible", "icon");

      act(() => {
        vi.advanceTimersByTime(40);
      });
      expect(sidebar).toHaveAttribute("data-state", "collapsed");
      expect(sidebar).toHaveAttribute("data-layout-state", "collapsed");
      expect(sidebar).toHaveAttribute("data-collapsible", "icon");
      expect(sidebarContent).toHaveAttribute("inert");
    } finally {
      vi.useRealTimers();
    }
  });

  it("ignores quick pointer passes over the collapsed sidebar", () => {
    vi.useFakeTimers();

    try {
      const view = render(
        <SidebarProvider defaultOpen={false} className="h-screen">
          <AdminSidebarShell
            showNavSkeleton={false}
            showOrgNavErrorOverlay={false}
            mainItems={[]}
            footerItems={[]}
            collapsible="icon"
          />
        </SidebarProvider>,
      );

      const sidebar = view.container.querySelector<HTMLElement>('[data-slot="sidebar"]');
      const sidebarContainer = view.container.querySelector<HTMLElement>(
        '[data-slot="sidebar-container"]',
      );

      expect(sidebar).not.toBeNull();
      expect(sidebarContainer).not.toBeNull();

      act(() => {
        fireEvent.pointerEnter(sidebarContainer!);
        vi.advanceTimersByTime(80);
        fireEvent.pointerLeave(sidebarContainer!);
        vi.runAllTimers();
      });

      expect(sidebar).toHaveAttribute("data-state", "collapsed");
    } finally {
      vi.useRealTimers();
    }
  });
});
