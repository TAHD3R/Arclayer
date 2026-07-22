import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ConfigurableDashboard,
  type DashboardWidget,
} from "@/pages/system/observability/components/dashboard-layout";

const { responsiveProps } = vi.hoisted(() => ({
  responsiveProps: { current: null as Record<string, unknown> | null },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { title?: string }) =>
      options?.title ? `${key}:${options.title}` : key,
  }),
}));
vi.mock("react-grid-layout", () => ({
  Responsive: ({ children, ...props }: PropsWithChildren<Record<string, unknown>>) => {
    responsiveProps.current = props;
    return <div>{children}</div>;
  },
  useContainerWidth: () => ({ width: 1200, containerRef: { current: null }, mounted: true }),
  verticalCompactor: {},
}));
vi.mock("@arclayer/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: PropsWithChildren) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: PropsWithChildren) => <>{children}</>,
  DropdownMenuContent: ({ children }: PropsWithChildren) => <div>{children}</div>,
  DropdownMenuLabel: ({ children }: PropsWithChildren) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuCheckboxItem: ({
    children,
    checked,
    onCheckedChange,
  }: PropsWithChildren<{ checked: boolean; onCheckedChange: (checked: boolean) => void }>) => (
    <button type="button" aria-pressed={checked} onClick={() => onCheckedChange(!checked)}>
      {children}
    </button>
  ),
  DropdownMenuIconItem: ({ children, onSelect }: PropsWithChildren<{ onSelect: () => void }>) => (
    <button type="button" onClick={onSelect}>
      {children}
    </button>
  ),
}));

const WIDGETS: readonly DashboardWidget[] = [
  { id: "alpha", title: "Alpha", content: <div>alpha content</div> },
  { id: "beta", title: "Beta", content: <div>beta content</div>, defaultSpan: 6 },
];

function renderDashboard() {
  return render(
    <ConfigurableDashboard dashboardId="test" widgets={WIDGETS} ariaLabel="Test dashboard" />,
  );
}

function visibleWidgetIds(container: HTMLElement) {
  return [...container.querySelectorAll("[data-dashboard-widget]")].map((element) =>
    element.getAttribute("data-dashboard-widget"),
  );
}

function readStoredLayout() {
  const raw = window.localStorage.getItem("arclayer:dashboard-layout:v2:test");
  if (!raw) throw new Error("Expected dashboard layout to be persisted");
  return JSON.parse(raw) as {
    version: number;
    layouts: { lg: Array<{ i: string; x: number; w: number; h: number }> };
    hiddenWidgetIds: string[];
  };
}

describe("ConfigurableDashboard", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
    responsiveProps.current = null;
  });

  it("renders and persists the default responsive layout", async () => {
    const { container } = renderDashboard();

    expect(visibleWidgetIds(container)).toEqual(["alpha", "beta"]);
    expect(responsiveProps.current?.dragConfig).toMatchObject({ enabled: false });
    expect(responsiveProps.current?.resizeConfig).toMatchObject({ enabled: false });
    expect(
      screen.queryByRole("button", { name: "DASHBOARD_DRAG_WIDGET:Alpha" }),
    ).not.toBeInTheDocument();
    await waitFor(() => {
      const stored = readStoredLayout();
      expect(stored.version).toBe(2);
      expect(stored.layouts.lg).toEqual([
        expect.objectContaining({ i: "alpha", x: 0, w: 3, h: 10 }),
        expect.objectContaining({ i: "beta", x: 3, w: 6, h: 10 }),
      ]);
    });
  });

  it("hides and restores a widget from the customization menu", async () => {
    const user = userEvent.setup();
    const { container } = renderDashboard();

    await user.click(screen.getByRole("button", { name: "DASHBOARD_EDIT_LAYOUT" }));
    await user.click(screen.getByRole("button", { name: "DASHBOARD_HIDE_WIDGET:Alpha" }));
    expect(visibleWidgetIds(container)).toEqual(["beta"]);

    await user.click(screen.getByRole("button", { name: "Alpha" }));
    expect(visibleWidgetIds(container)).toEqual(["alpha", "beta"]);
  });

  it("persists keyboard movement for the active breakpoint", async () => {
    const user = userEvent.setup();
    renderDashboard();

    await user.click(screen.getByRole("button", { name: "DASHBOARD_EDIT_LAYOUT" }));
    expect(responsiveProps.current?.dragConfig).toMatchObject({ enabled: true });
    expect(responsiveProps.current?.resizeConfig).toMatchObject({ enabled: true });
    const handle = screen.getByRole("button", { name: "DASHBOARD_DRAG_WIDGET:Alpha" });
    handle.focus();
    await user.keyboard("{ArrowRight}");
    await waitFor(() => {
      expect(readStoredLayout().layouts.lg.find((item) => item.i === "alpha")?.x).toBe(1);
    });
  });

  it("persists width changes from the widget menu", async () => {
    const user = userEvent.setup();
    renderDashboard();
    const alphaWidget = screen.getByText("alpha content").closest("[data-dashboard-widget]");
    expect(alphaWidget).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "DASHBOARD_EDIT_LAYOUT" }));
    await user.click(
      within(alphaWidget as HTMLElement).getByRole("button", { name: "DASHBOARD_WIDTH_6" }),
    );

    await waitFor(() => {
      expect(readStoredLayout().layouts.lg.find((item) => item.i === "alpha")?.w).toBe(6);
    });
  });

  it("rejects an unsupported stored layout version and restores defaults", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    window.localStorage.setItem(
      "arclayer:dashboard-layout:v2:test",
      JSON.stringify({ version: 99, layouts: {}, hiddenWidgetIds: [] }),
    );

    const { container } = renderDashboard();

    expect(visibleWidgetIds(container)).toEqual(["alpha", "beta"]);
    expect(consoleError).toHaveBeenCalledWith(
      "Failed to read dashboard layout preferences.",
      expect.any(Error),
    );
  });
});
