import { render, screen } from "@testing-library/react";
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
      scopeLabel="Workspace"
      roleLabel="Administrator"
      statusLabel="Active"
      onOpenDetails={onOpenDetails}
    />,
  );
}

describe("MemberIdentityCell", () => {
  it("保留可点击成员行，并移除 preview card 详情", async () => {
    const user = userEvent.setup();
    const onOpenDetails = vi.fn();

    renderCell(onOpenDetails);

    const trigger = screen.getByRole("button", { name: "Ada Lovelace" });
    expect(screen.queryByText("ada@example.com")).toBeNull();
    expect(screen.queryByText("Administrator")).toBeNull();
    expect(screen.queryByText("Active")).toBeNull();
    expect(screen.queryByText("Workspace")).toBeNull();
    expect(screen.queryByText("Can manage members and content")).toBeNull();

    await user.click(trigger);
    expect(onOpenDetails).toHaveBeenCalledTimes(1);
  });

  it("稳定渲染为静态身份行", () => {
    renderCell();

    const trigger = screen.getByRole("button", { name: "Ada Lovelace" });
    expect(trigger).toBeVisible();
    expect(screen.queryByText("ada@example.com")).toBeNull();
  });
});
