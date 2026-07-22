import { beforeEach, describe, expect, it } from "vitest";

import { applyThemeModeToDom } from "@/lib/theme";

describe("applyThemeModeToDom", () => {
  beforeEach(() => {
    document.head.innerHTML =
      '<link rel="icon" type="image/svg+xml" href="/logo.svg" data-theme-favicon />';
  });

  it.each([
    ["light", "/logo.svg"],
    ["dark", "/logo-dark.svg"],
  ] as const)("applies the %s theme and matching favicon", (mode, expectedHref) => {
    applyThemeModeToDom(mode);

    expect(document.documentElement).toHaveAttribute("data-theme", mode);
    expect(document.querySelector("link[data-theme-favicon]")).toHaveAttribute(
      "href",
      expectedHref,
    );
  });

  it("surfaces a missing favicon contract instead of silently skipping synchronization", () => {
    document.head.innerHTML = "";

    expect(() => applyThemeModeToDom("dark")).toThrowError(
      "Missing theme-aware favicon link in the document head",
    );
  });
});
