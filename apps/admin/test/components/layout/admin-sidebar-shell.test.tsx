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

const { platformState } = vi.hoisted(() => ({
  platformState: { current: "windows" as "windows" | "mac" | "other" },
}));

vi.mock("@arclayer/hooks/use-client-platform", () => ({
  useClientPlatform: () => platformState.current,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { shortcut?: string }) => {
      if (key === "common:SIDEBAR_TOGGLE") return "Toggle sidebar";
      if (key === "common:SIDEBAR_RAIL_TOOLTIP") return "Collapse or expand the sidebar";
      if (key === "common:SIDEBAR_RAIL_TOOLTIP_SHORTCUT") {
        return `Click or ${options?.shortcut ?? ""}`;
      }
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

  it("shows a tooltip when hovering the shared sidebar rail on windows", async () => {
    platformState.current = "windows";

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
      const tooltip = document.body.querySelector<HTMLElement>(
        '[data-slot="sidebar-rail-tooltip"]',
      );
      expect(tooltip).toHaveTextContent("Collapse or expand the sidebar");
      expect(tooltip).toHaveTextContent("Click or Ctrl+B");
      expect(tooltip?.querySelector(".text-label-secondary")).toHaveTextContent("Click or Ctrl+B");
      expect(tooltip?.style.left).toBe("110px");
      expect(tooltip?.style.top).toBe("144px");
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

  it("shows a tooltip when hovering the shared sidebar rail on mac", async () => {
    platformState.current = "mac";

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
      const tooltip = document.body.querySelector<HTMLElement>(
        '[data-slot="sidebar-rail-tooltip"]',
      );
      expect(tooltip).toHaveTextContent("Collapse or expand the sidebar");
      expect(tooltip).toHaveTextContent("Click or ⌘B");
      expect(tooltip?.style.left).toBe("110px");
      expect(tooltip?.style.top).toBe("144px");
    });
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

      expect(sidebar).not.toBeNull();
      expect(sidebarContainer).not.toBeNull();
      expect(sidebar).toHaveAttribute("data-state", "collapsed");
      expect(sidebar).toHaveAttribute("data-layout-state", "collapsed");
      expect(sidebar).toHaveAttribute("data-collapsible", "icon");
      expect(sidebar).toHaveAttribute("data-layout-collapsible", "icon");

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
      expect(sidebar).toHaveAttribute("data-collapsible", "");
      expect(sidebar).toHaveAttribute("data-layout-collapsible", "icon");

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
