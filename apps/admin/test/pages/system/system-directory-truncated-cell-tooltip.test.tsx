import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DirectoryEntityIdentityCell } from "@/pages/system/directory/entity-identity-cell";
import { TruncatedCellTooltip } from "@/pages/system/directory/truncated-cell-tooltip";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function mockElementSize(options: { clientWidth: number; scrollWidth: number }) {
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(options.clientWidth);
  vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(options.scrollWidth);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(20);
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(20);
}

function mockResizeObserver() {
  let notifyResize: (() => void) | undefined;

  class ResizeObserverMock {
    constructor(callback: ResizeObserverCallback) {
      notifyResize ??= () => callback([], this as unknown as ResizeObserver);
    }

    observe() {}
    unobserve() {}
    disconnect() {}
  }

  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  return () => notifyResize?.();
}

describe("TruncatedCellTooltip", () => {
  it("does not create a tooltip when the cell text is fully visible", async () => {
    mockElementSize({ clientWidth: 160, scrollWidth: 160 });
    const user = userEvent.setup();
    render(<TruncatedCellTooltip text="Visible workspace" />);

    await user.hover(screen.getByText("Visible workspace"));

    expect(document.querySelector('[data-slot="tooltip-content"]')).not.toBeInTheDocument();
  });

  it("shows the full value when the rendered text is clipped", async () => {
    mockElementSize({ clientWidth: 80, scrollWidth: 180 });
    const user = userEvent.setup();
    render(<TruncatedCellTooltip text="A workspace name that is clipped" />);

    await user.hover(screen.getByText("A workspace name that is clipped"));

    await waitFor(() =>
      expect(document.querySelector('[data-slot="tooltip-content"]')).toHaveTextContent(
        "A workspace name that is clipped",
      ),
    );
  });

  it("keeps measuring after the column changes between clipped and fully visible", async () => {
    const size = { clientWidth: 160, scrollWidth: 160 };
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(
      () => size.clientWidth,
    );
    vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockImplementation(
      () => size.scrollWidth,
    );
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(20);
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(20);
    const notifyResize = mockResizeObserver();
    const user = userEvent.setup();
    render(<TruncatedCellTooltip text="Resizable workspace" />);

    expect(document.querySelector('[data-slot="tooltip-trigger"]')).not.toBeInTheDocument();

    act(() => {
      size.scrollWidth = 240;
      notifyResize();
    });
    await waitFor(() =>
      expect(document.querySelector('[data-slot="tooltip-trigger"]')).toBeInTheDocument(),
    );

    await user.hover(screen.getByText("Resizable workspace"));
    await waitFor(() =>
      expect(document.querySelector('[data-slot="tooltip-content"]')).toHaveTextContent(
        "Resizable workspace",
      ),
    );

    act(() => {
      size.scrollWidth = 160;
      notifyResize();
    });
    await waitFor(() =>
      expect(document.querySelector('[data-slot="tooltip-trigger"]')).not.toBeInTheDocument(),
    );
  });
});

describe("DirectoryEntityIdentityCell", () => {
  it("renders an entity avatar and plain single-line name without a tooltip when it fits", () => {
    mockElementSize({ clientWidth: 180, scrollWidth: 180 });

    render(
      <DirectoryEntityIdentityCell
        avatar={<span data-testid="entity-avatar">AC</span>}
        name="Arc workspace"
      />,
    );

    expect(screen.getByTestId("entity-avatar")).toHaveTextContent("AC");
    expect(screen.getByText("Arc workspace")).toHaveClass("font-medium", "text-label-primary");
    expect(document.querySelector('[data-slot="tooltip-trigger"]')).not.toBeInTheDocument();
  });
});
