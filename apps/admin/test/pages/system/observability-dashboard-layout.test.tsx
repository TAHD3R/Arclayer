import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Children, cloneElement, isValidElement, type PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ConfigurableDashboard,
  type DashboardWidget,
} from "@/pages/system/observability/components/dashboard-layout";

type ResponsiveRender = Readonly<{
  childIds: readonly string[];
  layouts: Readonly<Record<string, ReadonlyArray<{ i: string; w: number; h: number }>>>;
}>;

const { responsiveProps, responsiveRenders } = vi.hoisted(() => ({
  responsiveProps: { current: null as Record<string, unknown> | null },
  responsiveRenders: [] as ResponsiveRender[],
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
    const childIds = Children.toArray(children).flatMap((child) => {
      if (!isValidElement<{ widget?: { id?: string } }>(child)) return [];
      return child.props.widget?.id ? [child.props.widget.id] : [];
    });
    const layouts = props.layouts as
      | Record<string, Array<{ i: string; w: number; h: number }>>
      | undefined;
    responsiveRenders.push({
      childIds,
      layouts: Object.fromEntries(
        Object.entries(layouts ?? {}).map(([breakpoint, layout]) => [
          breakpoint,
          layout.map(({ i, w, h }) => ({ i, w, h })),
        ]),
      ),
    });
    return (
      <div>
        {Children.map(children, (child) =>
          isValidElement<Record<string, unknown>>(child)
            ? cloneElement(child, {
                className: "react-grid-item cssTransforms",
                children: (
                  <span
                    className="react-resizable-handle react-resizable-handle-se"
                    data-grid-resize-handle
                  />
                ),
                style: {
                  position: "absolute",
                  width: 300,
                  height: 128,
                  transform: "translate(0px, 0px)",
                },
              })
            : child,
        )}
      </div>
    );
  },
  useContainerWidth: () => ({ width: 1200, containerRef: { current: null }, mounted: true }),
  verticalCompactor: { type: "vertical" },
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
  const raw = window.localStorage.getItem("arclayer:dashboard-layout:v5:test");
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
    responsiveRenders.length = 0;
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
      expect(stored.version).toBe(5);
      expect(responsiveProps.current?.compactor).toEqual({ type: "vertical" });
      expect(responsiveProps.current?.breakpoints).toEqual({ lg: 1024, md: 720, sm: 480, xs: 0 });
      expect(stored.layouts.lg).toEqual([
        expect.objectContaining({ i: "alpha", x: 0, w: 3, h: 10 }),
        expect.objectContaining({ i: "beta", x: 6, w: 6, h: 10 }),
      ]);
      const responsiveLayouts = responsiveProps.current?.layouts as Record<
        string,
        Array<{ i: string; w: number }>
      >;
      expect(responsiveLayouts.md.find((item) => item.i === "alpha")?.w).toBe(4);
      expect(responsiveLayouts.sm.find((item) => item.i === "alpha")?.w).toBe(4);
    });
  });

  it("keeps content-driven minimum dimensions without imposing a maximum height", () => {
    const widgets: readonly DashboardWidget[] = [
      {
        id: "tall",
        title: "Tall",
        content: <div>tall content</div>,
        defaultSpan: 4,
        minSpan: 4,
        defaultHeight: 1200,
        minHeight: 368,
      },
    ];

    render(<ConfigurableDashboard dashboardId="tall" widgets={widgets} ariaLabel="Tall" />);

    const layouts = responsiveProps.current?.layouts;
    expect(layouts).toBeDefined();
    const item = (
      layouts as Record<
        string,
        Array<{ i: string; w: number; h: number; minW: number; minH: number; maxH?: number }>
      >
    ).lg[0];
    expect(item).toMatchObject({ i: "tall", w: 4, h: 76, minW: 4, minH: 24 });
    expect(item.maxH).toBeUndefined();
  });

  it("keeps widgets with different height semantics on separate shelves", () => {
    const widgets: readonly DashboardWidget[] = [
      ...Array.from({ length: 6 }, (_, index) => ({
        id: `metric-${index}`,
        title: `Metric ${index}`,
        content: <div>metric {index}</div>,
        defaultSpan: 3 as const,
        defaultHeight: 144,
      })),
      ...Array.from({ length: 2 }, (_, index) => ({
        id: `chart-${index}`,
        title: `Chart ${index}`,
        content: <div>chart {index}</div>,
        defaultSpan: 6 as const,
        defaultHeight: 400,
      })),
    ];

    render(<ConfigurableDashboard dashboardId="shelves" widgets={widgets} ariaLabel="Shelves" />);

    const layouts = responsiveProps.current?.layouts;
    expect(layouts).toBeDefined();
    const layout = (layouts as Record<string, Array<{ i: string; x: number; y: number }>>).lg;
    expect(layout.filter((item) => item.i.startsWith("metric-")).map((item) => item.y)).toEqual([
      0, 0, 0, 0, 10, 10,
    ]);
    expect(layout.filter((item) => item.i.startsWith("chart-")).map((item) => item.y)).toEqual([
      20, 20,
    ]);
    expect(
      layout.filter((item) => ["metric-4", "metric-5"].includes(item.i)).map((item) => item.x),
    ).toEqual([0, 9]);
  });

  it("reports resize preview dimensions in pixels", () => {
    renderDashboard();
    const onResize = responsiveProps.current?.onResize as (
      layout: unknown,
      oldItem: unknown,
      newItem: { i: string; w: number; h: number },
    ) => void;

    act(() => onResize([], null, { i: "alpha", w: 6, h: 25 }));

    expect(screen.getByText("592 × 392 px")).toBeVisible();
  });

  it("forwards grid positioning props to each widget DOM node", () => {
    const { container } = renderDashboard();
    const alphaWidget = container.querySelector('[data-dashboard-widget="alpha"]');

    expect(alphaWidget).toHaveClass("react-grid-item", "cssTransforms");
    expect(alphaWidget).toHaveStyle({
      position: "absolute",
      width: "300px",
      height: "128px",
      transform: "translate(0px, 0px)",
    });
    expect(alphaWidget?.querySelector("[data-grid-resize-handle]")).toBeInTheDocument();
  });

  it("provides a complete layout before asynchronously added widgets reach the grid", () => {
    const initialWidgets = WIDGETS.slice(0, 1);
    const { rerender } = render(
      <ConfigurableDashboard
        dashboardId="test"
        widgets={initialWidgets}
        ariaLabel="Test dashboard"
      />,
    );
    responsiveRenders.length = 0;

    rerender(
      <ConfigurableDashboard dashboardId="test" widgets={WIDGETS} ariaLabel="Test dashboard" />,
    );

    const rendersWithBeta = responsiveRenders.filter((entry) => entry.childIds.includes("beta"));
    expect(rendersWithBeta.length).toBeGreaterThan(0);
    for (const entry of rendersWithBeta) {
      expect(entry.layouts.lg).toContainEqual(expect.objectContaining({ i: "beta", w: 6, h: 10 }));
      expect(entry.layouts.md).toContainEqual(expect.objectContaining({ i: "beta", w: 4, h: 10 }));
    }
  });

  it("does not let transient loading widgets overwrite a persisted stable layout", async () => {
    window.localStorage.setItem(
      "arclayer:dashboard-layout:v5:test",
      JSON.stringify({
        version: 5,
        layouts: {
          lg: [
            { i: "alpha", x: 5, y: 0, w: 3, h: 10 },
            { i: "beta", x: 0, y: 10, w: 6, h: 10 },
          ],
          md: [],
          sm: [],
          xs: [],
        },
        hiddenWidgetIds: [],
      }),
    );
    const transientWidgets: readonly DashboardWidget[] = [
      {
        id: "loading",
        title: "Loading",
        content: <div>loading content</div>,
        defaultSpan: 12,
        transient: true,
      },
    ];
    const { rerender } = render(
      <ConfigurableDashboard
        dashboardId="test"
        widgets={transientWidgets}
        ariaLabel="Test dashboard"
      />,
    );

    expect(screen.queryByRole("button", { name: "DASHBOARD_EDIT_LAYOUT" })).not.toBeInTheDocument();
    const storedWhileLoading = JSON.parse(
      window.localStorage.getItem("arclayer:dashboard-layout:v5:test") ?? "{}",
    ) as { layouts: { lg: Array<{ i: string; x: number }> } };
    expect(storedWhileLoading.layouts.lg.find((item) => item.i === "alpha")?.x).toBe(5);

    rerender(
      <ConfigurableDashboard dashboardId="test" widgets={WIDGETS} ariaLabel="Test dashboard" />,
    );

    await waitFor(() => {
      const layout = responsiveProps.current?.layouts as Record<
        string,
        Array<{ i: string; x: number }>
      >;
      expect(layout.lg.find((item) => item.i === "alpha")?.x).toBe(5);
    });
    expect(screen.getByRole("button", { name: "DASHBOARD_EDIT_LAYOUT" })).toBeVisible();
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
      "arclayer:dashboard-layout:v5:test",
      JSON.stringify({ version: 99, layouts: {}, hiddenWidgetIds: [] }),
    );

    const { container } = renderDashboard();

    expect(visibleWidgetIds(container)).toEqual(["alpha", "beta"]);
    expect(consoleError).toHaveBeenCalledWith(
      "Failed to read dashboard layout preferences.",
      expect.any(Error),
    );
  });

  it("repairs persisted items that are smaller than the grid constraints", async () => {
    window.localStorage.setItem(
      "arclayer:dashboard-layout:v5:test",
      JSON.stringify({
        version: 5,
        layouts: { lg: [{ i: "alpha", x: 0, y: 0, w: 1, h: 1 }] },
        hiddenWidgetIds: [],
      }),
    );

    renderDashboard();

    await waitFor(() => {
      expect(readStoredLayout().layouts.lg.find((item) => item.i === "alpha")).toMatchObject({
        x: 0,
        w: 3,
        h: 10,
      });
    });
  });
});
