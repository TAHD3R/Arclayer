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
  it("shows oauth after the email step and hides it on the password step", () => {
    const { container } = render(
      <LoginPane
        onEmailSubmit={async () => ({
          exists: true,
          passwordLoginAvailable: true,
        })}
        onSubmit={async () => undefined}
        emailCheckLoading={false}
        loading={false}
        initialKeepSession={false}
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
    expect(contentGroup).toHaveClass("grid", "gap-2");
    expect(contentGroup?.parentElement).toHaveClass("grid", "gap-8");
    expect(screen.getByText("auth:OAUTH_ACCOUNT_DIVIDER")).toBeInTheDocument();
    expect(
      screen
        .getByTestId("oauth-actions")
        .compareDocumentPosition(screen.getByLabelText("auth:FIELD_EMAIL_LABEL")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("shows email code action in the auth methods section on password step", async () => {
    const onSwitchToEmailCode = vi.fn();

    render(
      <LoginPane
        onEmailSubmit={async () => ({
          exists: true,
          passwordLoginAvailable: true,
        })}
        onSubmit={async () => undefined}
        emailCheckLoading={false}
        loading={false}
        initialKeepSession
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
    expect(emailCodeButton.querySelector("svg")).toBeInTheDocument();
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
        emailCheckLoading={false}
        loading={false}
        initialKeepSession={false}
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
    await user.click(screen.getByRole("button", { name: "auth:LOGIN_NEXT_BUTTON" }));

    expect(onSwitchToEmailCode).toHaveBeenCalledWith("demo@example.com", false, false);
    expect(screen.queryByText("auth:FIELD_PASSWORD_LABEL")).not.toBeInTheDocument();
  });

  it("shows keep-session only on the password step and reads the stored preference", () => {
    const { rerender } = render(
      <LoginPane
        onEmailSubmit={async () => ({
          exists: true,
          passwordLoginAvailable: true,
        })}
        onSubmit={async () => undefined}
        emailCheckLoading={false}
        loading={false}
        initialKeepSession={false}
        loginSeed={null}
        onForgotPassword={() => undefined}
        onSwitchToEmailCode={() => undefined}
        onSwitchToRegister={() => undefined}
        publicRegisterEnabled
        reducedMotion
        itemVariants={{}}
      />,
    );

    expect(screen.queryByText("auth:KEEP_SESSION")).not.toBeInTheDocument();

    rerender(
      <LoginPane
        onEmailSubmit={async () => ({
          exists: true,
          passwordLoginAvailable: true,
        })}
        onSubmit={async () => undefined}
        emailCheckLoading={false}
        loading={false}
        initialKeepSession={false}
        loginSeed={{ email: "demo@example.com", step: "password" }}
        onForgotPassword={() => undefined}
        onSwitchToEmailCode={() => undefined}
        onSwitchToRegister={() => undefined}
        publicRegisterEnabled
        reducedMotion
        itemVariants={{}}
      />,
    );

    expect(screen.getByText("auth:KEEP_SESSION")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "auth:KEEP_SESSION" })).not.toBeChecked();

    rerender(
      <LoginPane
        onEmailSubmit={async () => ({
          exists: true,
          passwordLoginAvailable: true,
        })}
        onSubmit={async () => undefined}
        emailCheckLoading={false}
        loading={false}
        initialKeepSession
        loginSeed={{ email: "demo@example.com", step: "password" }}
        onForgotPassword={() => undefined}
        onSwitchToEmailCode={() => undefined}
        onSwitchToRegister={() => undefined}
        publicRegisterEnabled
        reducedMotion
        itemVariants={{}}
      />,
    );

    expect(screen.getByRole("checkbox", { name: "auth:KEEP_SESSION" })).toBeChecked();
  });

  it("persists the keep-session preference when the checkbox changes", async () => {
    const onKeepSessionPreferenceChange = vi.fn();

    render(
      <LoginPane
        onEmailSubmit={async () => ({
          exists: true,
          passwordLoginAvailable: true,
        })}
        onSubmit={async () => undefined}
        emailCheckLoading={false}
        loading={false}
        initialKeepSession={false}
        onKeepSessionPreferenceChange={onKeepSessionPreferenceChange}
        loginSeed={{ email: "demo@example.com", step: "password" }}
        onForgotPassword={() => undefined}
        onSwitchToEmailCode={() => undefined}
        onSwitchToRegister={() => undefined}
        publicRegisterEnabled
        reducedMotion
        itemVariants={{}}
      />,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("checkbox", { name: "auth:KEEP_SESSION" }));

    expect(onKeepSessionPreferenceChange).toHaveBeenCalledWith(true);
  });

  it("renders the primary action without a trailing icon", () => {
    render(
      <LoginPane
        onEmailSubmit={async () => ({
          exists: true,
          passwordLoginAvailable: true,
        })}
        onSubmit={async () => undefined}
        emailCheckLoading={false}
        loading={false}
        initialKeepSession={false}
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
      screen.getByRole("button", { name: "auth:LOGIN_NEXT_BUTTON" }).querySelector("svg"),
    ).toBeNull();
  });
});
