import { beforeEach, describe, expect, it, vi } from "vitest";

const redirectMock = vi.fn((payload: Record<string, unknown>) => ({
  __redirect: payload,
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: Record<string, unknown>) => config,
  redirect: (payload: Record<string, unknown>) => redirectMock(payload),
}));

import { Route } from "@/routes/projects/$projectId/content/create/index";

describe("project content create route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects the legacy create route into the library create overlay", () => {
    const beforeLoad = (
      Route as unknown as {
        beforeLoad?: (input: { params: { projectId: string } }) => void;
      }
    ).beforeLoad;

    expect(beforeLoad).toBeTypeOf("function");

    try {
      beforeLoad?.({ params: { projectId: "project-1" } });
      throw new Error("expected redirect");
    } catch (error) {
      expect(redirectMock).toHaveBeenCalledWith({
        to: "/projects/$projectId/content/library",
        params: { projectId: "project-1" },
        search: { create: "1" },
        replace: true,
      });
      expect(error).toEqual({
        __redirect: {
          to: "/projects/$projectId/content/library",
          params: { projectId: "project-1" },
          search: { create: "1" },
          replace: true,
        },
      });
    }
  });
});
