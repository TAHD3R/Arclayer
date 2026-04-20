import * as React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { AdminSidebarShell } from "@/components/layout/admin-sidebar-shell";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuIconItem,
  DropdownMenuTrigger,
} from "@arclayer/ui/dropdown-menu";
import { SidebarProvider } from "@arclayer/ui/sidebar";

const { navClickSpy } = vi.hoisted(() => ({
  navClickSpy: vi.fn(),
}));

vi.mock("@/components/layout/admin-side-nav", () => ({
  AdminSiderNav: () => (
    <button type="button" data-testid="admin-sider-nav" onClick={() => navClickSpy()}>
      Nav item
    </button>
  ),
}));

vi.mock("@/components/layout/admin-sidebar-skeleton", () => ({
  AdminSidebarMainMenuSkeleton: () => <div data-testid="admin-sidebar-main-skeleton" />,
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

function TestLayoutMenu() {
  const [open, setOpen] = React.useState(false);

  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Open layout menu
      </button>
      <button type="button" onClick={() => setOpen(false)}>
        Close layout menu
      </button>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button type="button">Layout menu trigger</button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuIconItem onSelect={() => setOpen(false)}>Menu action</DropdownMenuIconItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
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

  beforeEach(() => {
    navClickSpy.mockClear();
  });

  it("does not show a tooltip when hovering the shared sidebar rail", async () => {
    renderWithSidebar(
      <AdminSidebarShell
        showNavSkeleton={false}
        showOrgNavErrorOverlay={false}
        mainItems={[]}
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
        collapsible="none"
      />,
    );

    expect(screen.queryByRole("button", { name: "Toggle sidebar" })).toBeNull();
  });

  it("keeps the expanded visual tree through the desktop collapse width transition", () => {
    vi.useFakeTimers();

    try {
      const view = renderWithSidebar(
        <AdminSidebarShell
          showNavSkeleton={false}
          showOrgNavErrorOverlay={false}
          mainItems={[]}
          collapsible="icon"
        />,
      );

      const sidebar = view.container.querySelector<HTMLElement>('[data-slot="sidebar"]');
      const rail = screen.getByRole("button", { name: "Toggle sidebar" });

      expect(sidebar).not.toBeNull();
      expect(sidebar).toHaveAttribute("data-state", "expanded");
      expect(sidebar).toHaveAttribute("data-layout-state", "expanded");

      act(() => {
        fireEvent.click(rail);
      });

      expect(sidebar).toHaveAttribute("data-state", "expanded");
      expect(sidebar).toHaveAttribute("data-layout-state", "collapsed");
      expect(sidebar).toHaveAttribute("data-layout-collapsible", "icon");
      expect(sidebar).toHaveAttribute("data-collapsible", "");

      act(() => {
        vi.advanceTimersByTime(249);
      });

      expect(sidebar).toHaveAttribute("data-state", "expanded");

      act(() => {
        vi.advanceTimersByTime(1);
      });

      expect(sidebar).toHaveAttribute("data-state", "collapsed");
      expect(sidebar).toHaveAttribute("data-layout-state", "collapsed");
      expect(sidebar).toHaveAttribute("data-collapsible", "icon");
    } finally {
      vi.useRealTimers();
    }
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
      expect(sidebarContent).not.toHaveAttribute("inert");

      act(() => {
        fireEvent.pointerEnter(sidebarContainer!);
        fireEvent.pointerMove(sidebarContainer!);
        vi.advanceTimersByTime(50);
      });
      expect(sidebar).toHaveAttribute("data-state", "collapsed");

      act(() => {
        vi.advanceTimersByTime(20);
      });
      expect(sidebar).toHaveAttribute("data-state", "expanded");
      expect(sidebar).toHaveAttribute("data-layout-state", "collapsed");
      expect(sidebar).toHaveAttribute("data-hover-preview", "true");
      expect(sidebar).toHaveAttribute("data-collapsible", "");
      expect(sidebar).toHaveAttribute("data-layout-collapsible", "icon");
      expect(sidebar?.className).toContain(
        "data-[layout-collapsible=icon]:w-(--sidebar-width-icon)",
      );
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
      expect(sidebar).toHaveAttribute("data-hover-preview", "true");

      act(() => {
        vi.advanceTimersByTime(40);
      });
      expect(sidebar).toHaveAttribute("data-state", "expanded");
      expect(sidebar).toHaveAttribute("data-layout-state", "collapsed");
      expect(sidebar).toHaveAttribute("data-hover-preview", "");
      expect(sidebar).toHaveAttribute("data-collapsible", "");

      act(() => {
        vi.advanceTimersByTime(249);
      });
      expect(sidebar).toHaveAttribute("data-state", "expanded");

      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(sidebar).toHaveAttribute("data-state", "collapsed");
      expect(sidebar).toHaveAttribute("data-layout-state", "collapsed");
      expect(sidebar).toHaveAttribute("data-collapsible", "icon");
      expect(sidebarContent).not.toHaveAttribute("inert");
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
        vi.advanceTimersByTime(50);
        fireEvent.pointerLeave(sidebarContainer!);
        vi.runAllTimers();
      });

      expect(sidebar).toHaveAttribute("data-state", "collapsed");
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps collapsed navigation content interactive before hover preview expands", () => {
    const view = render(
      <SidebarProvider defaultOpen={false} className="h-screen">
        <AdminSidebarShell
          showNavSkeleton={false}
          showOrgNavErrorOverlay={false}
          mainItems={[]}
          collapsible="icon"
        />
      </SidebarProvider>,
    );

    const sidebarContent = view.container.querySelector<HTMLElement>(
      '[data-slot="sidebar-content"]',
    );
    const navButton = screen.getByTestId("admin-sider-nav");

    expect(sidebarContent).not.toHaveAttribute("inert");
    fireEvent.click(navButton);
    expect(navClickSpy).toHaveBeenCalledTimes(1);
  });

  it("keeps hover preview expanded while a layout dropdown menu stays open", () => {
    vi.useFakeTimers();

    try {
      const view = render(
        <SidebarProvider defaultOpen={false} className="h-screen">
          <AdminSidebarShell
            showNavSkeleton={false}
            showOrgNavErrorOverlay={false}
            mainItems={[]}
            collapsible="icon"
          />
          <div className="p-8">
            <TestLayoutMenu />
          </div>
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
        fireEvent.pointerMove(sidebarContainer!);
        vi.advanceTimersByTime(70);
      });

      expect(sidebar).toHaveAttribute("data-state", "expanded");
      expect(sidebar).toHaveAttribute("data-hover-preview", "true");

      act(() => {
        fireEvent.click(screen.getByRole("button", { name: "Open layout menu" }));
      });

      expect(screen.getByText("Menu action")).toBeInTheDocument();

      act(() => {
        fireEvent.pointerLeave(sidebarContainer!);
        vi.advanceTimersByTime(180);
        vi.advanceTimersByTime(250);
      });

      expect(sidebar).toHaveAttribute("data-state", "expanded");
      expect(sidebar).toHaveAttribute("data-hover-preview", "true");

      act(() => {
        fireEvent.click(screen.getByText("Close layout menu"));
      });

      expect(screen.queryByText("Menu action")).toBeNull();

      act(() => {
        vi.advanceTimersByTime(179);
      });

      expect(sidebar).toHaveAttribute("data-state", "expanded");

      act(() => {
        vi.runOnlyPendingTimers();
      });

      expect(sidebar).toHaveAttribute("data-state", "expanded");
      expect(sidebar).toHaveAttribute("data-hover-preview", "");

      act(() => {
        vi.runOnlyPendingTimers();
      });

      expect(sidebar).toHaveAttribute("data-state", "collapsed");
      expect(sidebar).toHaveAttribute("data-layout-state", "collapsed");
    } finally {
      vi.useRealTimers();
    }
  });
});
