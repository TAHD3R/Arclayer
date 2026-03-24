import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/config/app-config", () => ({
  getAppConfig: () => ({ title: "TestBrand", apiBaseUrl: "", apiPrefix: "" }),
}));

import { useDocumentTitle } from "@/hooks/use-document-title";

describe("useDocumentTitle", () => {
  it("sets title with pageTitle and brand", () => {
    renderHook(() => useDocumentTitle("My Page"));
    expect(document.title).toBe("My Page | TestBrand");
  });

  it("falls back to brand when pageTitle is null", () => {
    renderHook(() => useDocumentTitle(null));
    expect(document.title).toBe("TestBrand");
  });

  it("falls back to brand when pageTitle is whitespace", () => {
    renderHook(() => useDocumentTitle("  "));
    expect(document.title).toBe("TestBrand");
  });

  it("trims pageTitle", () => {
    renderHook(() => useDocumentTitle("  Dashboard  "));
    expect(document.title).toBe("Dashboard | TestBrand");
  });
});
