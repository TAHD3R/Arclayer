import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { MemberCreditLimitItemOut } from "@/api/commerce";
import { MemberCreditLimitDialog } from "@/pages/workspaces/team/members/components/member-credit-limit-dialog";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

function memberItem(
  overrideLimit: MemberCreditLimitItemOut["overrideLimit"],
): MemberCreditLimitItemOut {
  return {
    membershipId: "member-1",
    user: { userId: "user-1", username: "member" },
    isOwner: false,
    overrideLimit,
    effectiveLimit: overrideLimit ?? { limitKind: "limited", limitCredits: 100 },
    reservedCredits: 5,
    committedCredits: 20,
    availableCredits: 75,
  };
}

function renderDialog(
  options: {
    item?: MemberCreditLimitItemOut;
    feedback?: "idle" | "saved" | "conflict" | "error";
    pending?: boolean;
  } = {},
) {
  const onSave = vi.fn().mockResolvedValue(undefined);
  render(
    <MemberCreditLimitDialog
      open
      onOpenChange={vi.fn()}
      memberName="Ada"
      item={options.item ?? memberItem(null)}
      configurationRevision={4}
      pending={options.pending ?? false}
      feedback={options.feedback ?? "idle"}
      onEdit={vi.fn()}
      onSave={onSave}
    />,
  );
  return { onSave };
}

async function selectMode(user: ReturnType<typeof userEvent.setup>, option: string) {
  await user.click(screen.getByRole("combobox", { name: "commerce:MEMBER_LIMIT_MODE_LABEL" }));
  await user.click(screen.getByRole("option", { name: option }));
}

describe("MemberCreditLimitDialog", () => {
  it("maps inherited state to an exact clear command", async () => {
    const user = userEvent.setup();
    const { onSave } = renderDialog({
      item: memberItem({ limitKind: "limited", limitCredits: 100 }),
    });

    await selectMode(user, "commerce:MEMBER_LIMIT_INHERIT");
    await user.click(screen.getByRole("button", { name: "common:CONFIRM" }));

    expect(onSave).toHaveBeenCalledWith({ action: "clear" });
  });

  it("submits a positive integer as an explicit limited override", async () => {
    const user = userEvent.setup();
    const { onSave } = renderDialog();

    await selectMode(user, "commerce:MEMBER_LIMIT_LIMITED");
    const input = screen.getByRole("spinbutton", {
      name: "commerce:MEMBER_LIMIT_CREDITS_LABEL",
    });
    await user.type(input, "250");
    await user.click(screen.getByRole("button", { name: "common:CONFIRM" }));

    expect(onSave).toHaveBeenCalledWith({
      action: "set",
      limitKind: "limited",
      limitCredits: 250,
    });
  });

  it.each(["0", "1.5", "9007199254740992"])(
    "rejects invalid limited override %s",
    async (value) => {
      const user = userEvent.setup();
      const { onSave } = renderDialog();

      await selectMode(user, "commerce:MEMBER_LIMIT_LIMITED");
      const input = screen.getByRole("spinbutton", {
        name: "commerce:MEMBER_LIMIT_CREDITS_LABEL",
      });
      await user.type(input, value);
      await user.click(screen.getByRole("button", { name: "common:CONFIRM" }));

      expect(await screen.findByText("commerce:MEMBER_LIMIT_POSITIVE_INTEGER_ERROR")).toBeVisible();
      expect(input).toHaveAttribute("aria-invalid", "true");
      expect(onSave).not.toHaveBeenCalled();
    },
  );

  it("keeps explicit unlimited distinct from inherited default", async () => {
    const user = userEvent.setup();
    const { onSave } = renderDialog({
      item: memberItem({ limitKind: "limited", limitCredits: 100 }),
    });

    await selectMode(user, "commerce:MEMBER_LIMIT_UNLIMITED");
    expect(
      screen.getByRole("spinbutton", { name: "commerce:MEMBER_LIMIT_CREDITS_LABEL" }),
    ).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "common:CONFIRM" }));

    expect(onSave).toHaveBeenCalledWith({
      action: "set",
      limitKind: "unlimited",
      limitCredits: null,
    });
  });

  it.each([
    ["saved", "commerce:MEMBER_LIMIT_SAVED"],
    ["conflict", "commerce:MEMBER_LIMIT_CONFLICT"],
    ["error", "commerce:MEMBER_LIMIT_SAVE_ERROR"],
  ] as const)("keeps %s feedback visible inside the open dialog", (feedback, message) => {
    renderDialog({ feedback });

    expect(screen.getByText(message)).toBeInTheDocument();
  });
});
