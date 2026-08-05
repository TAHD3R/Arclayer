import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { MemberCreditLimitInput } from "@/api/commerce";
import { DefaultMemberCreditLimitEditor } from "@/pages/workspaces/settings/workspace/plan-usage/default-member-credit-limit-editor";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

function renderEditor(
  options: {
    feedback?: "idle" | "saved" | "conflict" | "error";
  } = {},
) {
  const onSave = vi.fn<(input: MemberCreditLimitInput) => Promise<void>>();
  onSave.mockResolvedValue(undefined);
  render(
    <DefaultMemberCreditLimitEditor
      limit={{ limitKind: "limited", limitCredits: 100 }}
      configurationRevision={4}
      pending={false}
      feedback={options.feedback ?? "idle"}
      onEdit={vi.fn()}
      onSave={onSave}
    />,
  );
  return { onSave };
}

describe("DefaultMemberCreditLimitEditor", () => {
  it("submits a positive integer Credit limit", async () => {
    const user = userEvent.setup();
    const { onSave } = renderEditor();
    const input = screen.getByRole("spinbutton", {
      name: "commerce:MEMBER_LIMIT_CREDITS_LABEL",
    });

    await user.clear(input);
    await user.type(input, "250");
    await user.click(screen.getByRole("button", { name: "settings:SETTINGS_SAVE" }));

    expect(onSave).toHaveBeenCalledWith({ limitKind: "limited", limitCredits: 250 });
  });

  it.each(["0", "1.5", "9007199254740992"])(
    "rejects invalid limited Credit input %s",
    async (value) => {
      const user = userEvent.setup();
      const { onSave } = renderEditor();
      const input = screen.getByRole("spinbutton", {
        name: "commerce:MEMBER_LIMIT_CREDITS_LABEL",
      });

      await user.clear(input);
      await user.type(input, value);
      await user.click(screen.getByRole("button", { name: "settings:SETTINGS_SAVE" }));

      expect(await screen.findByText("commerce:MEMBER_LIMIT_POSITIVE_INTEGER_ERROR")).toBeVisible();
      expect(input).toHaveAttribute("aria-invalid", "true");
      expect(input).toHaveAttribute(
        "aria-describedby",
        "default-member-credit-limit-credits-description default-member-credit-limit-error",
      );
      expect(onSave).not.toHaveBeenCalled();
    },
  );

  it("submits explicit unlimited semantics and disables the numeric input", async () => {
    const user = userEvent.setup();
    const { onSave } = renderEditor();

    await user.click(screen.getByRole("combobox", { name: "commerce:MEMBER_LIMIT_MODE_LABEL" }));
    await user.click(screen.getByRole("option", { name: "commerce:MEMBER_LIMIT_UNLIMITED" }));

    expect(
      screen.getByRole("spinbutton", { name: "commerce:MEMBER_LIMIT_CREDITS_LABEL" }),
    ).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "settings:SETTINGS_SAVE" }));

    expect(onSave).toHaveBeenCalledWith({ limitKind: "unlimited", limitCredits: null });
  });

  it.each([
    ["saved", "commerce:MEMBER_LIMIT_SAVED"],
    ["conflict", "commerce:MEMBER_LIMIT_CONFLICT"],
    ["error", "commerce:MEMBER_LIMIT_SAVE_ERROR"],
  ] as const)("renders the persisted %s feedback state", (feedback, message) => {
    renderEditor({ feedback });

    expect(screen.getByText(message)).toBeVisible();
  });
});
