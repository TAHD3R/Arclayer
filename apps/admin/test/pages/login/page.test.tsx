import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { cloneElement, type AnchorHTMLAttributes, type ReactElement, type ReactNode } from "react";
import { beforeAll, describe, expect, test, vi } from "vitest";

import { ApiError } from "@/lib/http";
import { LoginView } from "@/pages/login/components/login-view";

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
    disabled = false,
  }: {
    dividerLabelKey?: string;
    disabled?: boolean;
    leadingActions?: Array<{
      key: string;
      label: string;
      icon?: ReactNode;
      onClick: () => void;
    }>;
  }) => (
    <div data-testid="oauth-section">
      <span>{dividerLabelKey}</span>
      {leadingActions.map((action) => (
        <button key={action.key} type="button" disabled={disabled} onClick={action.onClick}>
          {action.icon}
          {action.label}
        </button>
      ))}
    </div>
  ),
}));

vi.mock("@/api/auth", () => ({
  usernameCheck: vi.fn(async () => ({ available: true })),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
  Trans: ({
    i18nKey,
    components,
  }: {
    i18nKey: string;
    components?: { terms?: ReactElement; privacy?: ReactElement };
  }) => (
    <span>
      {i18nKey}
      {components?.terms ? cloneElement(components.terms, {}, "Terms of Service") : null}
      {components?.privacy ? cloneElement(components.privacy, {}, "Privacy Policy") : null}
    </span>
  ),
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

function renderLoginView(overrides: Partial<React.ComponentProps<typeof LoginView>> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <LoginView
        mode="login"
        onModeChange={() => undefined}
        onLoginEmailSubmit={async () => ({
          exists: true,
          passwordLoginAvailable: true,
        })}
        onLoginSubmit={async () => undefined}
        onLoginVerificationResend={async () => ({ retryAfter: 60 })}
        onLoginEmailCodeRequest={async () => ({
          expiresIn: 600,
          retryAfter: 0,
        })}
        onLoginEmailCodeVerify={async () => undefined}
        onForgotPasswordSubmit={async () => undefined}
        onRegisterEmailSubmit={async () => false}
        onRegisterSubmit={async () => undefined}
        onRegisterVerificationResend={async () => ({ retryAfter: 60 })}
        publicRegisterEnabled
        challenge={null}
        onLoginTwoFactorSubmit={async () => undefined}
        onCancelTwoFactorChallenge={() => undefined}
        {...overrides}
      />
    </QueryClientProvider>,
  );
}

describe("LoginView register entry visibility", () => {
  test("shows a full-screen transition overlay while post-auth navigation is pending", () => {
    renderLoginView({ authTransitionLoading: true });

    const status = screen.getByRole("status", { name: "Loading" });
    const overlay = status.closest(".fixed");

    expect(status).toBeInTheDocument();
    expect(overlay).toHaveClass("fixed", "inset-0", "z-[2147483646]");
    expect(overlay?.parentElement).toBe(document.body);
  });

  test("hides register entry when public register is disabled", () => {
    renderLoginView({ publicRegisterEnabled: false });

    expect(screen.queryByText("auth:CREATE_ACCOUNT")).not.toBeInTheDocument();
    expect(screen.getByText("auth:LOGIN_PAGE_TITLE")).toBeInTheDocument();
  });

  test("shows register entry when public register is enabled", () => {
    renderLoginView();

    expect(screen.getByText("auth:CREATE_ACCOUNT")).toBeInTheDocument();
  });

  test("shows pending email verification state in login pane", () => {
    renderLoginView({
      loginVerification: { email: "founder@example.com", retryAfter: 60 },
    });

    expect(screen.getByLabelText("auth:FIELD_EMAIL_LABEL")).toBeDisabled();
    expect(screen.getByLabelText("auth:FIELD_EMAIL_LABEL")).toHaveValue("founder@example.com");
    expect(screen.getByText("auth:REGISTER_VERIFY_EMAIL_SENT_HINT")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "auth:FORGOT_PASSWORD" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "auth:LOGIN_EMAIL_CODE_ACTION" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("auth:FIELD_PASSWORD_LABEL")).not.toBeInTheDocument();
    expect(screen.getByTestId("oauth-section")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "auth:CREATE_ACCOUNT" })).not.toBeDisabled();
    expect(
      screen.getByRole("button", { name: "auth:REGISTER_VERIFY_EMAIL_RESEND_WAIT" }),
    ).toBeDisabled();
  });

  test("shows email verification notice dialog after confirmation", () => {
    renderLoginView({
      emailVerificationNotice: { open: true, email: "founder@example.com" },
      onEmailVerificationNoticeOpenChange: vi.fn(),
    });

    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByText("auth:REGISTER_VERIFY_EMAIL_NOTICE_TITLE")).toBeInTheDocument();
    expect(screen.getByText("auth:REGISTER_VERIFY_EMAIL_NOTICE_DESC")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "auth:REGISTER_VERIFY_EMAIL_NOTICE_ACTION" }),
    ).toBeInTheDocument();
  });
});

describe("LoginView auth pane hierarchy", () => {
  test("renders login pane with one-step fields, top auth methods, and register entry", () => {
    renderLoginView();

    expect(screen.queryByRole("link", { name: "Arclayer" })).not.toBeInTheDocument();
    expect(screen.getByText("auth:FIELD_EMAIL_LABEL")).toBeInTheDocument();
    expect(screen.getByText("auth:FIELD_PASSWORD_LABEL")).toBeInTheDocument();
    expect(screen.queryByText("auth:KEEP_SESSION")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "auth:FORGOT_PASSWORD" })).toBeInTheDocument();

    const oauthSection = screen.getByTestId("oauth-section");
    const submitButton = screen.getByRole("button", {
      name: "auth:LOGIN_BUTTON",
    });
    const emailField = screen.getByLabelText("auth:FIELD_EMAIL_LABEL");
    const loginIntro = screen.getByText("auth:NO_ACCOUNT").closest("div");
    const registerAction = screen.getByText("auth:CREATE_ACCOUNT");
    const emailCodeButton = screen.getByRole("button", {
      name: "auth:LOGIN_EMAIL_CODE_ACTION",
    });
    expect(screen.getByText("auth:OAUTH_ACCOUNT_DIVIDER")).toBeInTheDocument();
    expect(loginIntro).not.toBeNull();
    expect(loginIntro).toHaveClass("text-callout", "text-label-secondary");
    expect(loginIntro).toContainElement(registerAction);
    expect(registerAction).toHaveClass("!px-1", "!text-callout", "font-normal");
    expect(emailCodeButton.querySelector("svg")).toBeNull();
    expect(
      screen.getByText("auth:FIELD_EMAIL_LABEL").compareDocumentPosition(emailCodeButton) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      oauthSection.compareDocumentPosition(emailField) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(submitButton.querySelector("svg")).toBeNull();
    expect(
      oauthSection.compareDocumentPosition(loginIntro!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.queryByText("auth:LEGAL_CONTINUE")).not.toBeInTheDocument();
  });

  test("renders register pane as a single-step form with oauth, intro, and legal copy", () => {
    renderLoginView({ mode: "register" });

    expect(screen.queryByRole("link", { name: "Arclayer" })).not.toBeInTheDocument();
    expect(screen.getByText("auth:FIELD_EMAIL_LABEL")).toBeInTheDocument();
    expect(screen.queryByText("auth:FIELD_DISPLAY_NAME_LABEL")).not.toBeInTheDocument();
    expect(screen.getByText("auth:FIELD_PASSWORD_LABEL")).toBeInTheDocument();
    expect(screen.queryByText("auth:FIELD_USERNAME_LABEL")).not.toBeInTheDocument();

    const oauthSection = screen.getByTestId("oauth-section");
    const submitButton = screen.getByRole("button", {
      name: "auth:REGISTER_BUTTON",
    });
    const emailField = screen.getByLabelText("auth:FIELD_EMAIL_LABEL");
    const passwordField = screen.getByLabelText("auth:FIELD_PASSWORD_LABEL");
    const registerIntro = screen.getByText("auth:HAVE_ACCOUNT").closest("div");
    const signInAction = screen.getByText("auth:SIGN_IN");
    const legalCopy = screen.getByText("auth:LEGAL_REGISTER");
    const legalText = legalCopy.closest("p");
    expect(screen.getByText("auth:OAUTH_ACCOUNT_DIVIDER")).toBeInTheDocument();
    expect(registerIntro).not.toBeNull();
    expect(registerIntro).toHaveClass("text-callout", "text-label-secondary");
    expect(registerIntro).toContainElement(signInAction);
    expect(signInAction).toHaveClass("!px-1", "!text-callout", "font-normal");
    expect(legalCopy).toBeInTheDocument();
    expect(submitButton.querySelector("svg")).toBeNull();
    expect(legalText).toHaveClass("text-callout");
    expect(
      oauthSection.compareDocumentPosition(emailField) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      emailField.compareDocumentPosition(passwordField) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      oauthSection.compareDocumentPosition(registerIntro!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      registerIntro!.compareDocumentPosition(legalCopy) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Terms of Service" })).toHaveClass("px-1");
    expect(screen.getByRole("button", { name: "Privacy Policy" })).toHaveClass("px-1");
  });

  test("keeps seeded register mode in a single step", () => {
    renderLoginView({
      mode: "register",
      registerSeed: { email: "founder@example.com", step: "details" },
    });

    expect(screen.queryByLabelText("auth:FIELD_DISPLAY_NAME_LABEL")).not.toBeInTheDocument();
    expect(screen.getByLabelText("auth:FIELD_EMAIL_LABEL")).toHaveValue("founder@example.com");
    expect(screen.getByLabelText("auth:FIELD_PASSWORD_LABEL")).toBeInTheDocument();
    expect(screen.queryByLabelText("auth:FIELD_USERNAME_LABEL")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "auth:AUTH_CHANGE_EMAIL" }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("oauth-section")).toBeInTheDocument();
    expect(screen.getByText("auth:LEGAL_REGISTER")).toBeInTheDocument();
  });

  test("renders forgot password as an inline pane instead of a dialog", () => {
    renderLoginView({ mode: "forgot-password" });

    expect(screen.queryByRole("link", { name: "Arclayer" })).not.toBeInTheDocument();
    expect(screen.getByText("auth:FORGOT_PASSWORD_MODAL_TITLE")).toBeInTheDocument();
    expect(screen.getByText("auth:FIELD_EMAIL_LABEL")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "auth:FORGOT_PASSWORD_SUBMIT_BUTTON",
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "auth:BACK_TO_LOGIN" })).toBeInTheDocument();

    expect(screen.queryByText("auth:LEGAL_CONTINUE")).not.toBeInTheDocument();
  });

  test("renders email-code pane with password-login action inside the form", () => {
    renderLoginView({
      mode: "email-code",
      loginEmailCodeSeed: { email: "demo@example.com" },
    });

    expect(screen.queryByRole("link", { name: "Arclayer" })).not.toBeInTheDocument();
    expect(screen.getByText("auth:LOGIN_EMAIL_CODE_TITLE")).toBeInTheDocument();
    expect(screen.getByLabelText("auth:FIELD_EMAIL_LABEL")).toBeInTheDocument();

    const submitButton = screen.getByRole("button", {
      name: "auth:LOGIN_EMAIL_CODE_SEND_BUTTON",
    });
    const oauthSection = screen.getByTestId("oauth-section");

    expect(submitButton).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "auth:LOGIN_EMAIL_CODE_USE_PASSWORD",
      }),
    ).toBeInTheDocument();
    expect(oauthSection.closest("form")).not.toBeNull();
    expect(
      submitButton.compareDocumentPosition(oauthSection) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.queryByText("auth:LEGAL_CONTINUE")).not.toBeInTheDocument();
  });

  test("renders login seed in the one-step pane with email-row email-code action", () => {
    renderLoginView({
      mode: "login",
      loginSeed: { email: "demo@example.com", step: "password" },
    });

    expect(screen.getByLabelText("auth:FIELD_EMAIL_LABEL")).toHaveValue("demo@example.com");
    expect(screen.getByLabelText("auth:FIELD_PASSWORD_LABEL")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "auth:FORGOT_PASSWORD" })).toBeInTheDocument();
    const oauthSection = screen.getByTestId("oauth-section");
    const emailCodeButton = screen.getByRole("button", {
      name: "auth:LOGIN_EMAIL_CODE_ACTION",
    });
    expect(emailCodeButton).toBeInTheDocument();
    expect(emailCodeButton.querySelector("svg")).toBeNull();
    expect(
      screen.getByText("auth:FIELD_EMAIL_LABEL").compareDocumentPosition(emailCodeButton) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      oauthSection.compareDocumentPosition(screen.getByLabelText("auth:FIELD_EMAIL_LABEL")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  test("shows inline request recovery when auto-requesting an email code fails", async () => {
    renderLoginView({
      mode: "email-code",
      loginEmailCodeSeed: { email: "demo@example.com", autoRequest: true },
      onLoginEmailCodeRequest: async () => {
        throw new ApiError({ status: 429, message: "Too many requests" });
      },
    });

    expect(await screen.findByText("Too many requests")).toBeInTheDocument();
    expect(screen.getByLabelText("auth:FIELD_EMAIL_LABEL")).toBeInTheDocument();
    expect(screen.getByTestId("oauth-section")).toBeInTheDocument();
  });

  test("renders two-factor pane with pane-local branding and legal copy under verify", () => {
    renderLoginView({
      challenge: {
        twoFactorToken: "challenge-token",
        expiresAt: Date.now() + 60_000,
        keepSession: true,
        redirect: null,
        source: "password",
      },
    });

    expect(screen.queryByRole("link", { name: "Arclayer" })).not.toBeInTheDocument();
    expect(screen.getAllByText("auth:TWO_FACTOR_CODE_LABEL").length).toBeGreaterThan(0);

    const submitButton = screen.getByRole("button", {
      name: "auth:LOGIN_TWO_FACTOR_VERIFY_BUTTON",
    });
    expect(submitButton).toBeInTheDocument();
    expect(screen.queryByText("auth:LEGAL_CONTINUE")).not.toBeInTheDocument();
  });
});
