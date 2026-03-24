import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
  it("在活动详情里保留上下文 secondary，同时 hover card 补充默认身份信息", async () => {
    const user = userEvent.setup();

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

    expect(screen.queryByText("alice")).toBeNull();
    expect(screen.queryByText("user_123")).toBeNull();

    await user.hover(screen.getByText("Alice Johnson"));

    await waitFor(() => {
      expect(screen.getByText("alice")).toBeVisible();
      expect(screen.getByText("user_123")).toBeVisible();
    });
  });
});
