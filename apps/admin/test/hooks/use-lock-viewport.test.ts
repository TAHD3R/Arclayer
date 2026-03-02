import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useLockViewport } from "@/hooks/use-lock-viewport";

describe("useLockViewport", () => {
  it("sets overflow hidden on mount and restores on unmount", () => {
    document.documentElement.style.overflow = "auto";
    document.body.style.overflow = "scroll";

    const { unmount } = renderHook(() => useLockViewport());

    expect(document.documentElement.style.overflow).toBe("hidden");
    expect(document.body.style.overflow).toBe("hidden");

    unmount();

    expect(document.documentElement.style.overflow).toBe("auto");
    expect(document.body.style.overflow).toBe("scroll");
  });

  it("restores empty string when previous overflow was unset", () => {
    document.documentElement.style.overflow = "";
    document.body.style.overflow = "";

    const { unmount } = renderHook(() => useLockViewport());

    expect(document.documentElement.style.overflow).toBe("hidden");

    unmount();

    expect(document.documentElement.style.overflow).toBe("");
    expect(document.body.style.overflow).toBe("");
  });
});
