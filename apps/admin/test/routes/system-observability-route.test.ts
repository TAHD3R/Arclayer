import { beforeEach, describe, expect, it, vi } from "vitest";

const redirectMock = vi.fn((payload: Record<string, unknown>) => ({
  __redirect: payload,
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: Record<string, unknown>) => config,
  redirect: (payload: Record<string, unknown>) => redirectMock(payload),
}));

import { Route } from "@/routes/system/observability/index";

describe("system observability route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects the parent route to the first focused observability page", () => {
    const beforeLoad = (Route as unknown as { beforeLoad?: () => void }).beforeLoad;
    expect(beforeLoad).toBeTypeOf("function");

    try {
      beforeLoad?.();
      throw new Error("expected redirect");
    } catch (error) {
      const expected = { to: "/system/observability/requests", replace: true };
      expect(redirectMock).toHaveBeenCalledWith(expected);
      expect(error).toEqual({ __redirect: expected });
    }
  });
});
