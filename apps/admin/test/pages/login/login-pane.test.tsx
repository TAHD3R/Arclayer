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
    leadingActions = [],
  }: {
    leadingActions?: Array<{ key: string; label: string; onClick: () => void }>;
  }) =>
    leadingActions.length > 0 ? (
      <div data-testid="oauth-actions">
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
  it("hides the oauth wrapper when no oauth providers render", () => {
    const { container } = render(
      <LoginPane
        onEmailSubmit={async () => true}
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
    expect(oauthWrapper).toBeEmptyDOMElement();
  });

  it("shows email code action in the oauth section on password step", async () => {
    const onSwitchToEmailCode = vi.fn();

    render(
      <LoginPane
        onEmailSubmit={async () => true}
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
    await user.click(screen.getByRole("button", { name: "auth:LOGIN_EMAIL_CODE_ACTION" }));

    expect(onSwitchToEmailCode).toHaveBeenCalledWith("demo@example.com", true);
  });
});
