import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import {
  ChromeTabs,
  ChromeTabsList,
  ChromeTabsProvider,
  ChromeTabsTrigger,
} from "@arclayer/ui/chrome-tabs";

describe("ChromeTabsList widthMode", () => {
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

    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      value: vi.fn(),
      writable: true,
    });
  });

  it("在 content 模式下向父层暴露 tabs 的固有宽度", () => {
    render(
      <ChromeTabsProvider
        labels={{ scrollLeftAriaLabel: "scroll left", scrollRightAriaLabel: "scroll right" }}
      >
        <ChromeTabs defaultValue="unread">
          <ChromeTabsList widthMode="content" wrapperClassName="px-4">
            <ChromeTabsTrigger value="unread">Unread</ChromeTabsTrigger>
            <ChromeTabsTrigger value="all">All</ChromeTabsTrigger>
            <ChromeTabsTrigger value="read">Read</ChromeTabsTrigger>
            <ChromeTabsTrigger value="archived">Archived</ChromeTabsTrigger>
          </ChromeTabsList>
        </ChromeTabs>
      </ChromeTabsProvider>,
    );

    const tablist = screen.getByRole("tablist");
    expect(tablist).toHaveClass("w-max", "min-w-full");
    expect(tablist.parentElement).toHaveClass("inline-block", "max-w-full", "px-4");
  });
});
