import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { copyToClipboard } from "@/lib/clipboard";
import { notifySuccessText } from "@/lib/notifications";
import { UserProfileUserIdSection } from "@/pages/usercenter/profile/components/profile-user-id-section";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@/lib/clipboard", () => ({
  copyToClipboard: vi.fn(),
}));

vi.mock("@/lib/notifications", () => ({
  notifyError: vi.fn(),
  notifySuccessText: vi.fn(),
}));

describe("UserProfileUserIdSection", () => {
  it("copies the user id", async () => {
    const user = userEvent.setup();
    const copyToClipboardMock = vi.mocked(copyToClipboard);
    const notifySuccessTextMock = vi.mocked(notifySuccessText);

    render(<UserProfileUserIdSection userId="user-123" />);

    const copyButton = screen.getByRole("button", { name: "account:ME_PROFILE_USER_ID_COPY" });

    expect(copyButton).toHaveAttribute("data-variant", "ghost");
    expect(copyButton).toHaveAttribute("data-size", "icon-sm");

    await user.click(copyButton);

    expect(copyToClipboardMock).toHaveBeenCalledWith("user-123");
    expect(notifySuccessTextMock).toHaveBeenCalledWith("account:ME_PROFILE_USER_ID_COPIED");
  });
});
