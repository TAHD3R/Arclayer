import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { LoginPane } from "@/pages/login/components/login-pane";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  getRouteApi: () => ({ useSearch: () => ({}) }),
  Link: ({ children, to, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/ui/oauth-buttons", () => ({
  AuthOauthButtons: ({
    dividerLabelKey = "auth:OAUTH_ACCOUNT_DIVIDER",
    leadingActions = [],
  }: {
    dividerLabelKey?: string;
    leadingActions?: Array<{
      key: string;
      label: string;
      icon?: ReactNode;
      onClick: () => void;
    }>;
  }) => (
    <div data-testid="oauth-actions">
      <span>{dividerLabelKey}</span>
      {leadingActions.map((action) => (
        <button key={action.key} type="button" onClick={action.onClick}>
          {action.icon}
          {action.label}
        </button>
      ))}
    </div>
  ),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
  Trans: ({ i18nKey }: { i18nKey: string }) => <span>{i18nKey}</span>,
}));

describe("LoginPane oauth section", () => {
  it("renders one-step login with top auth methods", () => {
    const { container } = render(
      <LoginPane
        onEmailSubmit={async () => ({
          exists: true,
          passwordLoginAvailable: true,
        })}
        onSubmit={async () => undefined}
        onVerificationResend={async () => ({ retryAfter: 60 })}
        emailCheckLoading={false}
        loading={false}
        resendLoading={false}
        loginSeed={null}
        onForgotPassword={() => undefined}
        onSwitchToEmailCode={() => undefined}
        onSwitchToRegister={() => undefined}
        publicRegisterEnabled
        reducedMotion
        itemVariants={{}}
      />,
    );

    const oauthWrapper = container.querySelector(".empty\\:hidden");
    const contentGroup = oauthWrapper?.parentElement;
    expect(oauthWrapper).toHaveClass("empty:hidden");
    expect(contentGroup).toHaveClass("grid", "gap-5");
    expect(contentGroup?.parentElement).toHaveClass("grid", "gap-12");
    expect(screen.getByText("auth:OAUTH_ACCOUNT_DIVIDER")).toBeInTheDocument();
    expect(screen.getByLabelText("auth:FIELD_PASSWORD_LABEL")).toBeInTheDocument();
    expect(screen.queryByText("auth:KEEP_SESSION")).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "auth:KEEP_SESSION" })).not.toBeInTheDocument();
    expect(screen.getByTestId("oauth-actions").querySelector("button")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "auth:LOGIN_EMAIL_CODE_ACTION" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "auth:FORGOT_PASSWORD" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "auth:FORGOT_PASSWORD" })).toHaveAttribute(
      "data-variant",
      "ghost",
    );
    expect(screen.getByRole("button", { name: "auth:FORGOT_PASSWORD" })).toHaveClass(
      "text-label-secondary",
      "hover:bg-transparent",
    );
    expect(screen.getByRole("button", { name: "auth:LOGIN_BUTTON" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "auth:LOGIN_NEXT_BUTTON" }),
    ).not.toBeInTheDocument();
    expect(
      screen
        .getByTestId("oauth-actions")
        .compareDocumentPosition(screen.getByLabelText("auth:FIELD_EMAIL_LABEL")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("shows email code action in the email title row", async () => {
    const onSwitchToEmailCode = vi.fn();

    render(
      <LoginPane
        onEmailSubmit={async () => ({
          exists: true,
          passwordLoginAvailable: true,
        })}
        onSubmit={async () => undefined}
        onVerificationResend={async () => ({ retryAfter: 60 })}
        emailCheckLoading={false}
        loading={false}
        resendLoading={false}
        loginSeed={{ email: "demo@example.com", step: "password" }}
        onForgotPassword={() => undefined}
        onSwitchToEmailCode={onSwitchToEmailCode}
        onSwitchToRegister={() => undefined}
        publicRegisterEnabled
        reducedMotion
        itemVariants={{}}
      />,
    );

    const user = userEvent.setup();
    const emailCodeButton = screen.getByRole("button", {
      name: "auth:LOGIN_EMAIL_CODE_ACTION",
    });
    await user.click(emailCodeButton);

    expect(onSwitchToEmailCode).toHaveBeenCalledWith("demo@example.com", true);
    expect(screen.getByTestId("oauth-actions")).toBeInTheDocument();
    expect(emailCodeButton.querySelector("svg")).toBeNull();
    expect(
      screen.getByText("auth:FIELD_EMAIL_LABEL").compareDocumentPosition(emailCodeButton) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("routes passwordless accounts into email-code flow from the email step", async () => {
    const onSwitchToEmailCode = vi.fn();

    render(
      <LoginPane
        onEmailSubmit={async () => ({
          exists: true,
          passwordLoginAvailable: false,
        })}
        onSubmit={async () => undefined}
        onVerificationResend={async () => ({ retryAfter: 60 })}
        emailCheckLoading={false}
        loading={false}
        resendLoading={false}
        loginSeed={null}
        onForgotPassword={() => undefined}
        onSwitchToEmailCode={onSwitchToEmailCode}
        onSwitchToRegister={() => undefined}
        publicRegisterEnabled
        reducedMotion
        itemVariants={{}}
      />,
    );

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("auth:FIELD_EMAIL_LABEL"), "demo@example.com");
    await user.type(screen.getByLabelText("auth:FIELD_PASSWORD_LABEL"), "secret123");
    await user.click(screen.getByRole("button", { name: "auth:LOGIN_BUTTON" }));

    expect(onSwitchToEmailCode).toHaveBeenCalledWith("demo@example.com", true, false);
  });

  it("shows unknown email as a callout field validation error without switching to register", async () => {
    const onSwitchToRegister = vi.fn();

    render(
      <LoginPane
        onEmailSubmit={async () => ({
          exists: false,
          passwordLoginAvailable: false,
        })}
        onSubmit={async () => undefined}
        onVerificationResend={async () => ({ retryAfter: 60 })}
        emailCheckLoading={false}
        loading={false}
        resendLoading={false}
        loginSeed={null}
        onForgotPassword={() => undefined}
        onSwitchToEmailCode={() => undefined}
        onSwitchToRegister={onSwitchToRegister}
        publicRegisterEnabled
        reducedMotion
        itemVariants={{}}
      />,
    );

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("auth:FIELD_EMAIL_LABEL"), "missing@example.com");
    await user.type(screen.getByLabelText("auth:FIELD_PASSWORD_LABEL"), "secret123");
    await user.click(screen.getByRole("button", { name: "auth:LOGIN_BUTTON" }));

    const alert = await screen.findByText("auth:LOGIN_EMAIL_NOT_REACHABLE");
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveClass("!text-callout", "font-normal", "text-destructive");
    expect(screen.queryByText("auth:LOGIN_EMAIL_NOT_FOUND_MESSAGE")).not.toBeInTheDocument();
    expect(onSwitchToRegister).not.toHaveBeenCalled();
  });

  it("submits login with keep-session enabled by default", async () => {
    const onSubmit = vi.fn(async () => undefined);

    render(
      <LoginPane
        onEmailSubmit={async () => ({
          exists: true,
          passwordLoginAvailable: true,
        })}
        onSubmit={onSubmit}
        onVerificationResend={async () => ({ retryAfter: 60 })}
        emailCheckLoading={false}
        loading={false}
        resendLoading={false}
        loginSeed={null}
        onForgotPassword={() => undefined}
        onSwitchToEmailCode={() => undefined}
        onSwitchToRegister={() => undefined}
        publicRegisterEnabled
        reducedMotion
        itemVariants={{}}
      />,
    );

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("auth:FIELD_EMAIL_LABEL"), "demo@example.com");
    await user.type(screen.getByLabelText("auth:FIELD_PASSWORD_LABEL"), "secret123");
    await user.click(screen.getByRole("button", { name: "auth:LOGIN_BUTTON" }));

    expect(onSubmit).toHaveBeenCalledWith({
      email: "demo@example.com",
      password: "secret123",
      keepSession: true,
    });
  });

  it("keeps email-code switch enabled when the email is empty", async () => {
    const onSwitchToEmailCode = vi.fn();

    render(
      <LoginPane
        onEmailSubmit={async () => ({
          exists: true,
          passwordLoginAvailable: true,
        })}
        onSubmit={async () => undefined}
        onVerificationResend={async () => ({ retryAfter: 60 })}
        emailCheckLoading={false}
        loading={false}
        resendLoading={false}
        loginSeed={null}
        onForgotPassword={() => undefined}
        onSwitchToEmailCode={onSwitchToEmailCode}
        onSwitchToRegister={() => undefined}
        publicRegisterEnabled
        reducedMotion
        itemVariants={{}}
      />,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "auth:LOGIN_EMAIL_CODE_ACTION" }));

    expect(onSwitchToEmailCode).toHaveBeenCalledWith("", true);
  });

  it("renders the primary action without a trailing icon", () => {
    render(
      <LoginPane
        onEmailSubmit={async () => ({
          exists: true,
          passwordLoginAvailable: true,
        })}
        onSubmit={async () => undefined}
        onVerificationResend={async () => ({ retryAfter: 60 })}
        emailCheckLoading={false}
        loading={false}
        resendLoading={false}
        loginSeed={null}
        onForgotPassword={() => undefined}
        onSwitchToEmailCode={() => undefined}
        onSwitchToRegister={() => undefined}
        publicRegisterEnabled
        reducedMotion
        itemVariants={{}}
      />,
    );

    expect(
      screen.getByRole("button", { name: "auth:LOGIN_BUTTON" }).querySelector("svg"),
    ).toBeNull();
  });

  it("shows pending verification state and resends from the primary action", async () => {
    const onVerificationResend = vi.fn(async () => ({ retryAfter: 60 }));

    render(
      <LoginPane
        onEmailSubmit={async () => ({
          exists: true,
          passwordLoginAvailable: true,
        })}
        onSubmit={async () => undefined}
        onVerificationResend={onVerificationResend}
        verification={{ email: "demo@example.com", retryAfter: 0 }}
        emailCheckLoading={false}
        loading={false}
        resendLoading={false}
        loginSeed={null}
        onForgotPassword={() => undefined}
        onSwitchToEmailCode={() => undefined}
        onSwitchToRegister={() => undefined}
        publicRegisterEnabled
        reducedMotion
        itemVariants={{}}
      />,
    );

    expect(screen.getByLabelText("auth:FIELD_EMAIL_LABEL")).toBeDisabled();
    expect(screen.getByLabelText("auth:FIELD_EMAIL_LABEL")).toHaveValue("demo@example.com");
    expect(screen.getByTestId("oauth-actions")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "auth:LOGIN_EMAIL_CODE_ACTION" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("auth:FIELD_PASSWORD_LABEL")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "auth:FORGOT_PASSWORD" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "auth:CREATE_ACCOUNT" })).not.toBeDisabled();

    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: "auth:REGISTER_VERIFY_EMAIL_RESEND_ACTION" }),
    );

    expect(onVerificationResend).toHaveBeenCalledWith("demo@example.com");
  });
});
