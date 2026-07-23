import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { DEFAULT_LOCALE, i18n, initI18n } from "@/lib/i18n";
import { ConfirmDirectoryActionDialog } from "@/pages/system/directory/governance-dialogs";

beforeAll(async () => {
  await initI18n(DEFAULT_LOCALE);
});

describe("ConfirmDirectoryActionDialog", () => {
  it("requires the entity name, restriction reason, and operator note before confirming", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const onOpenChange = vi.fn();
    const user = userEvent.setup();

    render(
      <ConfirmDirectoryActionDialog
        open
        onOpenChange={onOpenChange}
        title="暂停工作空间"
        description="暂停后将阻止成员继续访问。"
        confirmLabel="确认暂停"
        pending={false}
        variant="destructive"
        confirmName={{
          expected: "Arc Workspace",
          label: "输入工作空间名称",
          placeholder: "Arc Workspace",
          mismatchMessage: "名称不匹配",
        }}
        restriction={{ mode: "enforce", current: null }}
        onConfirm={onConfirm}
      />,
    );

    const confirmButton = screen.getByRole("button", { name: "确认暂停" });
    expect(confirmButton).toBeDisabled();

    await user.type(screen.getByLabelText("输入工作空间名称"), "Arc Workspace");
    expect(confirmButton).toBeEnabled();
    await user.click(confirmButton);

    expect(onConfirm).not.toHaveBeenCalled();
    expect(
      screen.getByText(i18n.t("settings:SETTINGS_ACCESS_RESTRICTION_REASON_REQUIRED")),
    ).toBeInTheDocument();
    expect(
      screen.getByText(i18n.t("settings:SETTINGS_ACCESS_RESTRICTION_OPERATOR_NOTE_REQUIRED")),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("combobox", {
        name: i18n.t("settings:SETTINGS_ACCESS_RESTRICTION_REASON_LABEL"),
      }),
    );
    await user.click(
      screen.getByRole("option", {
        name: i18n.t("settings:SETTINGS_ACCESS_RESTRICTION_REASON_SECURITY_RISK"),
      }),
    );
    await user.type(
      screen.getByLabelText(i18n.t("settings:SETTINGS_ACCESS_RESTRICTION_OPERATOR_NOTE_LABEL")),
      "已确认异常访问并完成影响范围核查。",
    );
    await user.click(confirmButton);

    expect(onConfirm).toHaveBeenCalledWith({
      confirmName: "Arc Workspace",
      transition: {
        operationId: expect.any(String),
        operatorNote: "已确认异常访问并完成影响范围核查。",
        reasonCategory: "security_risk",
        reasonCode: "security_risk",
      },
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
