import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { MemberIdentityCell } from "@/pages/workspaces/team/shared/components/member-identity-cell";

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

function renderCell(onOpenDetails = vi.fn()) {
  return render(
    <MemberIdentityCell
      member={{
        displayName: "Ada Lovelace",
        username: "ada",
        email: "ada@example.com",
        avatarUrl: "/avatars/ada.png",
      }}
      description="Can manage members and content"
      scopeLabel="Organization"
      roleLabel="Administrator"
      statusLabel="Active"
      onOpenDetails={onOpenDetails}
    />,
  );
}

describe("MemberIdentityCell", () => {
  it("悬浮时显示成员摘要卡片，点击时触发详情回调", async () => {
    const user = userEvent.setup();
    const onOpenDetails = vi.fn();

    renderCell(onOpenDetails);

    const trigger = screen.getByRole("button", { name: "Ada Lovelace" });
    await user.hover(trigger);

    await waitFor(() => {
      expect(screen.getByText("Administrator")).toBeVisible();
      expect(screen.getByText("Active")).toBeVisible();
      expect(screen.getByText("Organization")).toBeVisible();
      expect(screen.getByText("Can manage members and content")).toBeVisible();
    });

    await user.click(trigger);
    expect(onOpenDetails).toHaveBeenCalledTimes(1);
  });

  it("移出后关闭，再次移入可以稳定重新打开", async () => {
    const user = userEvent.setup();
    renderCell();

    const trigger = screen.getByRole("button", { name: "Ada Lovelace" });

    await user.hover(trigger);
    await screen.findByText("Organization");

    await user.unhover(trigger);
    await waitFor(() => {
      expect(screen.queryByText("Organization")).toBeNull();
    });

    await user.hover(trigger);
    await waitFor(() => {
      expect(screen.getByText("Organization")).toBeVisible();
    });
  });
});
