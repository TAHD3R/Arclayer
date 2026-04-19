import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AnchorHTMLAttributes } from "react";
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
    dividerLabelKey,
    leadingActions = [],
  }: {
    dividerLabelKey?: string;
    leadingActions?: Array<{ key: string; label: string; onClick: () => void }>;
  }) =>
    dividerLabelKey || leadingActions.length > 0 ? (
      <div data-testid="oauth-actions">
        {dividerLabelKey ? <span>{dividerLabelKey}</span> : null}
        {leadingActions.map((action) => (
          <button key={action.key} type="button" onClick={action.onClick}>
            {action.label}
          </button>
        ))}
      </div>
    ) : null,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
  Trans: ({ i18nKey }: { i18nKey: string }) => <span>{i18nKey}</span>,
}));

describe("LoginPane oauth section", () => {
  it("shows oauth above the email step and hides it on the password step", () => {
    const { container } = render(
      <LoginPane
        onEmailSubmit={async () => ({ exists: true, passwordLoginAvailable: true })}
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

    const oauthWrapper = container.querySelector(".pt-1\\.5");
    expect(oauthWrapper).toHaveClass("empty:hidden");
    expect(screen.getByText("auth:LOGIN_EMAIL_STEP_DIVIDER")).toBeInTheDocument();
  });

  it("shows email code action beside forgot password on password step", async () => {
    const onSwitchToEmailCode = vi.fn();

    render(
      <LoginPane
        onEmailSubmit={async () => ({ exists: true, passwordLoginAvailable: true })}
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
    await user.click(
      screen.getByRole("button", { name: "auth:LOGIN_PASSWORD_ALTERNATIVE_ACTION" }),
    );

    expect(onSwitchToEmailCode).toHaveBeenCalledWith("demo@example.com", true);
    expect(screen.queryByTestId("oauth-actions")).not.toBeInTheDocument();
  });

  it("routes passwordless accounts into email-code flow from the email step", async () => {
    const onSwitchToEmailCode = vi.fn();

    render(
      <LoginPane
        onEmailSubmit={async () => ({ exists: true, passwordLoginAvailable: false })}
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

  it("shows keep-session only on the password step", () => {
    const { rerender } = render(
      <LoginPane
        onEmailSubmit={async () => ({ exists: true, passwordLoginAvailable: true })}
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
        onEmailSubmit={async () => ({ exists: true, passwordLoginAvailable: true })}
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
    expect(screen.getByText("auth:LOGIN_PASSWORD_KEEP_SESSION_HINT")).toBeInTheDocument();
  });

  it("renders the primary action without a trailing icon", () => {
    render(
      <LoginPane
        onEmailSubmit={async () => ({ exists: true, passwordLoginAvailable: true })}
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
