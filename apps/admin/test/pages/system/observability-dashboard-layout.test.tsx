import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ConfigurableDashboard,
  type DashboardWidget,
} from "@/pages/system/observability/components/dashboard-layout";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { title?: string }) =>
      options?.title ? `${key}:${options.title}` : key,
  }),
}));
vi.mock("@arclayer/ui/sortable", () => ({
  Sortable: ({
    value,
    onValueChange,
    children,
    getItemValue: _getItemValue,
    strategy: _strategy,
    ...props
  }: PropsWithChildren<{
    value: unknown[];
    onValueChange: (value: unknown[]) => void;
    getItemValue: (value: unknown) => string;
    strategy?: string;
  }>) => (
    <div {...props}>
      <button type="button" onClick={() => onValueChange([...value].reverse())}>
        test reorder
      </button>
      {children}
    </div>
  ),
  SortableItem: ({ children, ...props }: PropsWithChildren<Record<string, unknown>>) => (
    <div {...props}>{children}</div>
  ),
  SortableItemHandle: ({ children }: PropsWithChildren) => <>{children}</>,
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

function dispatchPointerEvent(
  target: Element,
  type: string,
  values: { pointerId: number; clientX: number; clientY: number },
) {
  const event = new Event(type, { bubbles: true });
  for (const [key, value] of Object.entries(values)) {
    Object.defineProperty(event, key, { value });
  }
  fireEvent(target, event);
}

describe("ConfigurableDashboard", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("renders the default widget order and dimensions", () => {
    const { container } = renderDashboard();

    expect(visibleWidgetIds(container)).toEqual(["alpha", "beta"]);
    expect(container.querySelector('[data-dashboard-widget="alpha"] > div')).toHaveStyle({
      height: "144px",
    });
    expect(container.querySelector('[data-dashboard-widget="beta"]')).toHaveClass("md:col-span-6");
  });

  it("hides and restores a widget from the customization menu", async () => {
    const user = userEvent.setup();
    const { container } = renderDashboard();

    await user.click(screen.getByRole("button", { name: "DASHBOARD_HIDE_WIDGET:Alpha" }));
    expect(visibleWidgetIds(container)).toEqual(["beta"]);

    await user.click(screen.getByRole("button", { name: "Alpha" }));
    expect(visibleWidgetIds(container)).toEqual(["alpha", "beta"]);
  });

  it("persists reordered widgets", async () => {
    const user = userEvent.setup();
    const { container } = renderDashboard();

    await user.click(screen.getByRole("button", { name: "test reorder" }));
    expect(visibleWidgetIds(container)).toEqual(["beta", "alpha"]);
    await waitFor(() => {
      expect(window.localStorage.getItem("arclayer:dashboard-layout:v1:test")).toContain(
        '"id":"beta"',
      );
    });
  });

  it("resizes width and height with the pointer handle", () => {
    HTMLElement.prototype.setPointerCapture = vi.fn();
    HTMLElement.prototype.releasePointerCapture = vi.fn();
    const { container } = renderDashboard();
    const resizeHandles = screen.getAllByRole("button", {
      name: "DASHBOARD_RESIZE_WIDGET:Alpha",
    });
    const handle = resizeHandles.at(-1);
    expect(handle).toBeDefined();

    dispatchPointerEvent(handle!, "pointerdown", { pointerId: 7, clientX: 0, clientY: 0 });
    dispatchPointerEvent(handle!, "pointermove", { pointerId: 7, clientX: 360, clientY: 64 });
    dispatchPointerEvent(handle!, "pointerup", { pointerId: 7, clientX: 360, clientY: 64 });

    const widget = container.querySelector('[data-dashboard-widget="alpha"]');
    expect(widget).toHaveClass("md:col-span-6");
    expect(widget?.querySelector(":scope > div")).toHaveStyle({ height: "208px" });
  });

  it("rejects an unsupported stored layout version and restores defaults", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    window.localStorage.setItem(
      "arclayer:dashboard-layout:v1:test",
      JSON.stringify({ version: 99, items: [] }),
    );

    const { container } = renderDashboard();

    expect(visibleWidgetIds(container)).toEqual(["alpha", "beta"]);
    expect(consoleError).toHaveBeenCalledWith(
      "Failed to read dashboard layout preferences.",
      expect.any(Error),
    );
  });
});
