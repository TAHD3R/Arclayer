import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ResetPasswordView } from "@/pages/reset-password/components/reset-password-view";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
  Trans: ({ i18nKey }: { i18nKey: string }) => <span>{i18nKey}</span>,
}));

vi.mock("@/components/layout/legal-footer", () => ({
  LegalFooter: ({ i18nKey }: { i18nKey: string }) => <span>{i18nKey}</span>,
}));

describe("ResetPasswordView", () => {
  it("hides the reset-code field when a token is already present in the link", () => {
    render(
      <ResetPasswordView
        initialToken="token-from-link"
        loading={false}
        onSubmit={async () => undefined}
        onBackToLogin={() => undefined}
      />,
    );

    expect(screen.queryByLabelText("auth:FIELD_RESET_TOKEN_LABEL")).not.toBeInTheDocument();
    expect(screen.getByText("auth:FIELD_RESET_TOKEN_HELP")).toBeInTheDocument();
    expect(screen.getByTestId("login-brand-slogan")).toBeInTheDocument();
    expect(screen.getByText("auth:RESET_PASSWORD_PAGE_TITLE")).toHaveClass("sr-only");
    expect(
      screen.getByLabelText("auth:FIELD_NEW_PASSWORD_LABEL").closest("[data-slot='input-group']"),
    ).toHaveClass("h-10", "rounded-md");
    expect(screen.getByRole("button", { name: "auth:RESET_PASSWORD_BUTTON" })).toHaveClass(
      "h-10!",
      "rounded-md!",
    );
    expect(screen.getByRole("button", { name: "auth:BACK_TO_LOGIN" })).toHaveAttribute(
      "data-variant",
      "outline",
    );
    expect(screen.getByText("auth:LEGAL_CONTINUE")).toBeInTheDocument();
  });

  it("keeps the reset-code field when no token is present", () => {
    render(
      <ResetPasswordView
        loading={false}
        onSubmit={async () => undefined}
        onBackToLogin={() => undefined}
      />,
    );

    expect(screen.getByLabelText("auth:FIELD_RESET_TOKEN_LABEL")).toBeInTheDocument();
    expect(screen.queryByText("auth:FIELD_RESET_TOKEN_HELP")).not.toBeInTheDocument();
  });

  it("submits the reset token and matching password through the existing contract", async () => {
    const onSubmit = vi.fn(async () => undefined);
    const user = userEvent.setup();

    render(
      <ResetPasswordView loading={false} onSubmit={onSubmit} onBackToLogin={() => undefined} />,
    );

    await user.type(screen.getByLabelText("auth:FIELD_RESET_TOKEN_LABEL"), "reset-token");
    await user.type(screen.getByLabelText("auth:FIELD_NEW_PASSWORD_LABEL"), "NewPassword1");
    await user.type(screen.getByLabelText("auth:FIELD_CONFIRM_PASSWORD_LABEL"), "NewPassword1");
    await user.click(screen.getByRole("button", { name: "auth:RESET_PASSWORD_BUTTON" }));

    expect(onSubmit).toHaveBeenCalledWith({
      resetToken: "reset-token",
      newPassword: "NewPassword1",
    });
  });

  it("keeps form values and shows a reset failure above the fields", async () => {
    const user = userEvent.setup();

    render(
      <ResetPasswordView
        loading={false}
        onSubmit={async () => {
          throw new Error("Internal reset detail");
        }}
        onBackToLogin={() => undefined}
      />,
    );

    const token = screen.getByLabelText("auth:FIELD_RESET_TOKEN_LABEL");
    const password = screen.getByLabelText("auth:FIELD_NEW_PASSWORD_LABEL");
    const confirmation = screen.getByLabelText("auth:FIELD_CONFIRM_PASSWORD_LABEL");
    await user.type(token, "reset-token");
    await user.type(password, "NewPassword1");
    await user.type(confirmation, "NewPassword1");
    await user.click(screen.getByRole("button", { name: "auth:RESET_PASSWORD_BUTTON" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("errors:REQUEST_FAILED");
    expect(alert).not.toHaveTextContent("Internal reset detail");
    expect(token).toHaveValue("reset-token");
    expect(password).toHaveValue("NewPassword1");
    expect(confirmation).toHaveValue("NewPassword1");

    await user.type(confirmation, "x");
    expect(screen.queryByText("errors:REQUEST_FAILED")).not.toBeInTheDocument();
  });
});
