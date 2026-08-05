import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
    providerLayout = "stacked",
  }: {
    dividerLabelKey?: string;
    disabled?: boolean;
    providerLayout?: string;
    leadingActions?: Array<{
      key: string;
      label: string;
      icon?: ReactNode;
      onClick: () => void;
    }>;
  }) => (
    <div data-testid="oauth-section" data-provider-layout={providerLayout}>
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

const DEFAULT_OAUTH_PROVIDERS = [
  { provider: "google", label: "Google", start_url: "/oauth/google" },
];

function renderLoginView(
  overrides: Partial<React.ComponentProps<typeof LoginView>> = {},
  oauthProviders: Array<{
    provider: string;
    label: string;
    start_url: string;
  }> = DEFAULT_OAUTH_PROVIDERS,
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  queryClient.setQueryData(["auth", "sso", "providers", overrides.redirect], {
    providers: oauthProviders,
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

  test("hides the register entry when public registration is disabled", () => {
    renderLoginView({ publicRegisterEnabled: false });

    expect(screen.queryByText("auth:CREATE_ACCOUNT")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "auth:CREATE_ACCOUNT" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("auth-account-switch")).not.toBeInTheDocument();
    expect(screen.getByText("auth:LOGIN_SLOGAN_HEADLINE")).toBeInTheDocument();
    expect(screen.getByText("auth:LOGIN_SLOGAN_PROMISE")).toBeInTheDocument();
  });

  test("shows the register entry only after continuing to the email login pane", async () => {
    renderLoginView();

    expect(screen.queryByRole("button", { name: "auth:CREATE_ACCOUNT" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("auth-account-switch")).not.toBeInTheDocument();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "auth:LOGIN_CONTINUE_EMAIL" }));

    expect(await screen.findByRole("button", { name: "auth:CREATE_ACCOUNT" })).toHaveClass(
      "underline",
    );
    expect(screen.getByTestId("auth-account-switch")).toContainElement(
      screen.getByRole("button", { name: "auth:CREATE_ACCOUNT" }),
    );
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
    expect(screen.getByTestId("login-brand-slogan")).toBeInTheDocument();
    expect(screen.queryByText("auth:LOGIN_PAGE_TITLE")).not.toBeInTheDocument();
    expect(screen.queryByTestId("oauth-section")).not.toBeInTheDocument();
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
  test("renders the method picker first and keeps the email form reversible", async () => {
    renderLoginView();

    expect(screen.queryByRole("link", { name: "Arclayer" })).not.toBeInTheDocument();
    expect(screen.getByTestId("login-brand-slogan")).toBeInTheDocument();
    expect(screen.queryByText("auth:LOGIN_PAGE_TITLE")).not.toBeInTheDocument();
    const oauthSection = screen.getByTestId("oauth-section");
    const emailEntry = screen.getByRole("button", { name: "auth:LOGIN_CONTINUE_EMAIL" });
    expect(oauthSection).toHaveAttribute("data-provider-layout", "primary-plus-grid");
    expect(screen.getByText("auth:OAUTH_METHOD_DIVIDER")).toBeInTheDocument();
    expect(emailEntry).toHaveClass("h-14!", "w-full", "rounded-full!");
    expect(emailEntry).toHaveAttribute("data-variant", "outline");
    expect(emailEntry).toHaveAttribute("data-size", "lg");
    expect(emailEntry.querySelector("svg")).toBeNull();
    expect(screen.getByText("auth:LEGAL_CONTINUE")).toBeInTheDocument();
    expect(screen.queryByLabelText("auth:FIELD_EMAIL_LABEL")).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(emailEntry);

    expect(await screen.findByLabelText("auth:FIELD_EMAIL_LABEL")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByTestId("oauth-section")).not.toBeInTheDocument();
    });
    expect(screen.getByTestId("login-brand-slogan")).toBeInTheDocument();
    expect(screen.queryByText("auth:LOGIN_PAGE_TITLE")).not.toBeInTheDocument();
    expect(screen.getByLabelText("auth:FIELD_EMAIL_LABEL")).toBeInTheDocument();
    expect(screen.getByLabelText("auth:FIELD_PASSWORD_LABEL")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "auth:LOGIN_BACK_TO_METHODS" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "auth:LOGIN_BACK_TO_METHODS" }));

    expect(
      await screen.findByRole("button", { name: "auth:LOGIN_CONTINUE_EMAIL" }),
    ).toBeInTheDocument();
  });

  test("renders the email and password form directly when no oauth provider is configured", () => {
    renderLoginView({}, []);

    expect(screen.getByTestId("login-brand-slogan")).toBeInTheDocument();
    expect(screen.getByLabelText("auth:FIELD_EMAIL_LABEL")).toBeInTheDocument();
    expect(screen.getByLabelText("auth:FIELD_PASSWORD_LABEL")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "auth:LOGIN_CONTINUE_EMAIL" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "auth:LOGIN_BACK_TO_METHODS" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("oauth-section")).not.toBeInTheDocument();
  });

  test("renders register pane as a single-step form with oauth, intro, and legal copy", async () => {
    const user = userEvent.setup();
    renderLoginView({ mode: "register" });

    expect(screen.queryByRole("link", { name: "Arclayer" })).not.toBeInTheDocument();
    expect(screen.getByTestId("login-brand-slogan")).toBeInTheDocument();
    expect(screen.getByText("auth:REGISTER_PAGE_TITLE")).toHaveClass("sr-only");
    expect(screen.queryByText("auth:FIELD_EMAIL_LABEL")).not.toBeInTheDocument();
    expect(screen.queryByText("auth:FIELD_DISPLAY_NAME_LABEL")).not.toBeInTheDocument();
    expect(screen.queryByText("auth:FIELD_PASSWORD_LABEL")).not.toBeInTheDocument();
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
    expect(registerIntro).toHaveClass("select-none");
    expect(registerIntro).toContainElement(signInAction);
    expect(signInAction).toHaveClass("!px-1", "!text-callout", "font-normal");
    expect(signInAction).toHaveClass("underline");
    expect(legalCopy).toBeInTheDocument();
    expect(submitButton.querySelector("svg")).toBeNull();
    expect(
      screen.getByRole("button", { name: "auth:BACK_TO_LOGIN" }).querySelector("svg"),
    ).toBeNull();
    expect(legalText).toHaveClass("text-footnote", "leading-5");
    expect(legalText?.parentElement).toHaveClass("select-none");
    expect(
      oauthSection.compareDocumentPosition(emailField) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      emailField.compareDocumentPosition(passwordField) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      registerIntro!.compareDocumentPosition(oauthSection) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      registerIntro!.compareDocumentPosition(legalCopy) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    const termsButton = screen.getByRole("button", { name: "Terms of Service" });
    const privacyButton = screen.getByRole("button", { name: "Privacy Policy" });
    expect(termsButton).toHaveClass("px-1", "text-label-secondary");
    expect(privacyButton).toHaveClass("px-1", "text-label-secondary");
    expect(termsButton).not.toHaveClass("text-primary");
    expect(privacyButton).not.toHaveClass("text-primary");
    expect(screen.queryByText("auth:FIELD_EMAIL_LABEL")).not.toBeInTheDocument();
    expect(screen.queryByText("auth:FIELD_PASSWORD_LABEL")).not.toBeInTheDocument();

    await user.click(termsButton);
    expect(document.querySelector("[data-slot='dialog-overlay']")).toHaveClass("backdrop-blur-xs");
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
    expect(screen.getByTestId("login-brand-slogan")).toBeInTheDocument();
    expect(screen.queryByTestId("auth-account-switch")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "auth:FORGOT_PASSWORD_MODAL_TITLE" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("auth:FORGOT_PASSWORD_MODAL_DESC")).toBeInTheDocument();
    expect(screen.getByLabelText("auth:FIELD_EMAIL_LABEL")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "auth:FORGOT_PASSWORD_SUBMIT_BUTTON",
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "auth:BACK_TO_LOGIN" })).toBeInTheDocument();

    expect(screen.getByText("auth:LEGAL_CONTINUE")).toBeInTheDocument();
  });

  test("renders email-code pane with password-login action inside the form", () => {
    renderLoginView({
      mode: "email-code",
      loginEmailCodeSeed: { email: "demo@example.com" },
    });

    expect(screen.queryByRole("link", { name: "Arclayer" })).not.toBeInTheDocument();
    expect(screen.getByTestId("login-brand-slogan")).toBeInTheDocument();
    expect(screen.queryByTestId("auth-account-switch")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "auth:LOGIN_EMAIL_CODE_TITLE" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("auth:LOGIN_EMAIL_CODE_SUBTITLE")).toBeInTheDocument();
    expect(screen.getByLabelText("auth:FIELD_EMAIL_LABEL")).toBeInTheDocument();

    const submitButton = screen.getByRole("button", {
      name: "auth:LOGIN_EMAIL_CODE_SEND_BUTTON",
    });
    const passwordLoginButton = screen.getByRole("button", {
      name: "auth:LOGIN_EMAIL_CODE_USE_PASSWORD",
    });

    expect(submitButton).toBeInTheDocument();
    expect(passwordLoginButton).toBeInTheDocument();
    expect(passwordLoginButton).toHaveAttribute("data-variant", "ghost");
    expect(passwordLoginButton).toHaveAttribute("data-size", "inline");
    expect(passwordLoginButton.closest("form")).not.toBeNull();
    expect(
      submitButton.compareDocumentPosition(passwordLoginButton) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.queryByTestId("oauth-section")).not.toBeInTheDocument();
    expect(screen.getByText("auth:LEGAL_CONTINUE")).toBeInTheDocument();
  });

  test("renders login seed in the one-step pane with email-row email-code action", () => {
    renderLoginView({
      mode: "login",
      loginSeed: { email: "demo@example.com", step: "password" },
    });

    expect(screen.getByLabelText("auth:FIELD_EMAIL_LABEL")).toHaveValue("demo@example.com");
    expect(screen.getByLabelText("auth:FIELD_PASSWORD_LABEL")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "auth:FORGOT_PASSWORD" })).toBeInTheDocument();
    const emailCodeButton = screen.getByRole("button", {
      name: "auth:LOGIN_EMAIL_CODE_ACTION",
    });
    expect(emailCodeButton).toBeInTheDocument();
    expect(emailCodeButton.querySelector("svg")).toBeNull();
    expect(
      screen.getByLabelText("auth:FIELD_EMAIL_LABEL").compareDocumentPosition(emailCodeButton) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.queryByTestId("oauth-section")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "auth:LOGIN_BACK_TO_METHODS" }),
    ).not.toBeInTheDocument();
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
    expect(screen.queryByTestId("oauth-section")).not.toBeInTheDocument();
    expect(screen.getByText("auth:LEGAL_CONTINUE")).toBeInTheDocument();
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
    expect(screen.getByText("auth:LEGAL_CONTINUE")).toBeInTheDocument();
  });

  test("offers passkey verification when the challenge supports WebAuthn", async () => {
    const user = userEvent.setup();
    const onLoginTwoFactorPasskey = vi.fn(async () => undefined);
    renderLoginView({
      challenge: {
        twoFactorToken: "challenge-token",
        expiresAt: Date.now() + 60_000,
        keepSession: true,
        redirect: null,
        source: "password",
        methods: ["totp", "backup_code", "webauthn"],
      },
      onLoginTwoFactorPasskey,
    });

    await user.click(
      screen.getByRole("button", { name: "account:ME_SECURITY_ACTION_USE_PASSKEY" }),
    );

    expect(onLoginTwoFactorPasskey).toHaveBeenCalledTimes(1);
  });
});
