import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { ActivityUserPill } from "@/pages/workspaces/shared/activity/components/activity-user-pill";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

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
});

describe("ActivityUserPill", () => {
  it("在活动详情里直接展示上下文 secondary", () => {
    render(
      <ActivityUserPill
        user={{
          id: "user_123",
          username: "alice",
          displayName: "Alice Johnson",
          avatarUrl: null,
        }}
        secondary="user_123"
      />,
    );

    expect(screen.getByText("Alice Johnson")).toBeVisible();
    expect(screen.getByText("user_123")).toBeVisible();
    expect(screen.queryByText("alice")).toBeNull();
  });
});
