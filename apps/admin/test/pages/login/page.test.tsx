import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes } from "react";
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
    dividerLabelKey,
    leadingActions = [],
  }: {
    dividerLabelKey?: string;
    leadingActions?: Array<{ key: string; label: string; onClick: () => void }>;
  }) =>
    dividerLabelKey || leadingActions.length > 0 ? (
      <div data-testid="oauth-section">
        {dividerLabelKey ? <span>{dividerLabelKey}</span> : null}
        {leadingActions.map((action) => (
          <button key={action.key} type="button" onClick={action.onClick}>
            {action.label}
          </button>
        ))}
      </div>
    ) : null,
}));

vi.mock("@/api/auth", () => ({
  usernameCheck: vi.fn(async () => ({ available: true })),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
  Trans: ({ i18nKey }: { i18nKey: string }) => <span>{i18nKey}</span>,
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
        onLoginEmailSubmit={async () => ({ exists: true, passwordLoginAvailable: true })}
        onLoginSubmit={async () => undefined}
        onLoginEmailCodeRequest={async () => ({ expiresIn: 600, retryAfter: 0 })}
        onLoginEmailCodeVerify={async () => undefined}
        onForgotPasswordSubmit={async () => undefined}
        onRegisterEmailSubmit={async () => false}
        onRegisterSubmit={async () => undefined}
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
  test("hides register entry when public register is disabled", () => {
    renderLoginView({ publicRegisterEnabled: false });

    expect(screen.queryByText("auth:CREATE_ACCOUNT")).not.toBeInTheDocument();
    expect(screen.getByText("auth:LOGIN_PAGE_TITLE")).toBeInTheDocument();
  });

  test("shows register entry when public register is enabled", () => {
    renderLoginView();

    expect(screen.getByText("auth:CREATE_ACCOUNT")).toBeInTheDocument();
  });
});

describe("LoginView auth pane hierarchy", () => {
  test("renders login pane with email step before oauth and register entry below", () => {
    renderLoginView();

    expect(screen.getByRole("link", { name: "Arclayer" })).toBeInTheDocument();
    expect(screen.getByText("auth:FIELD_EMAIL_LABEL")).toBeInTheDocument();
    expect(screen.queryByText("auth:FIELD_PASSWORD_LABEL")).not.toBeInTheDocument();
    expect(screen.queryByText("auth:KEEP_SESSION")).not.toBeInTheDocument();

    const oauthSection = screen.getByTestId("oauth-section");
    const submitButton = screen.getByRole("button", { name: "auth:LOGIN_NEXT_BUTTON" });
    const emailField = screen.getByLabelText("auth:FIELD_EMAIL_LABEL");
    const registerEntry = screen.getByText("auth:NO_ACCOUNT").parentElement;
    const registerAction = screen.getByText("auth:CREATE_ACCOUNT");
    expect(screen.getByText("auth:LOGIN_EMAIL_STEP_DIVIDER")).toBeInTheDocument();
    expect(
      emailField.compareDocumentPosition(oauthSection) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(registerEntry).not.toBeNull();
    expect(registerAction).toBeInTheDocument();
    expect(submitButton.querySelector("svg")).toBeNull();
    expect(
      oauthSection.compareDocumentPosition(registerEntry as HTMLDivElement) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.queryByText("auth:LEGAL_LOGIN")).not.toBeInTheDocument();
  });

  test("renders register pane with email step before oauth and legal copy below submit", () => {
    renderLoginView({ mode: "register" });

    expect(screen.getByRole("link", { name: "Arclayer" })).toBeInTheDocument();
    expect(screen.getByText("auth:FIELD_EMAIL_LABEL")).toBeInTheDocument();
    expect(screen.queryByText("auth:FIELD_DISPLAY_NAME_LABEL")).not.toBeInTheDocument();
    expect(screen.queryByText("auth:FIELD_USERNAME_LABEL")).not.toBeInTheDocument();
    expect(screen.queryByText("auth:FIELD_PASSWORD_LABEL")).not.toBeInTheDocument();

    const oauthSection = screen.getByTestId("oauth-section");
    const submitButton = screen.getByRole("button", { name: "auth:REGISTER_NEXT_BUTTON" });
    const emailField = screen.getByLabelText("auth:FIELD_EMAIL_LABEL");
    const signInEntry = screen.getByText("auth:HAVE_ACCOUNT").parentElement;
    const signInAction = screen.getByText("auth:SIGN_IN");
    const legalCopy = screen.getByText("auth:LEGAL_REGISTER");
    const legalText = legalCopy.closest("p");
    expect(screen.getByText("auth:REGISTER_EMAIL_STEP_DIVIDER")).toBeInTheDocument();
    expect(legalCopy).toBeInTheDocument();
    expect(signInAction).toBeInTheDocument();
    expect(submitButton.querySelector("svg")).toBeNull();
    expect(legalText).toHaveClass("text-footnote");
    expect(
      emailField.compareDocumentPosition(oauthSection) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(signInEntry).not.toBeNull();
    expect(
      oauthSection.compareDocumentPosition(signInEntry as HTMLDivElement) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      signInEntry!.compareDocumentPosition(legalCopy) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  test("hides oauth once register enters the details step", () => {
    renderLoginView({
      mode: "register",
      registerSeed: { email: "founder@example.com", step: "details" },
    });

    expect(screen.getByLabelText("auth:FIELD_DISPLAY_NAME_LABEL")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "auth:AUTH_CHANGE_EMAIL" })).toBeInTheDocument();
    expect(screen.queryByTestId("oauth-section")).not.toBeInTheDocument();
    expect(screen.getByText("auth:LEGAL_REGISTER")).toBeInTheDocument();
  });

  test("renders forgot password as an inline pane instead of a dialog", () => {
    renderLoginView({ mode: "forgot-password" });

    expect(screen.getByRole("link", { name: "Arclayer" })).toBeInTheDocument();
    expect(screen.getByText("auth:FORGOT_PASSWORD_MODAL_TITLE")).toBeInTheDocument();
    expect(screen.getByText("auth:FIELD_EMAIL_LABEL")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "auth:FORGOT_PASSWORD_SUBMIT_BUTTON" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "auth:BACK_TO_LOGIN" })).toBeInTheDocument();

    expect(screen.queryByText("auth:LEGAL_CONTINUE")).not.toBeInTheDocument();
  });

  test("renders email-code pane as an inline auth pane without legal copy", () => {
    renderLoginView({
      mode: "email-code",
      loginEmailCodeSeed: { email: "demo@example.com" },
    });

    expect(screen.getByRole("link", { name: "Arclayer" })).toBeInTheDocument();
    expect(screen.getByText("auth:LOGIN_EMAIL_CODE_TITLE")).toBeInTheDocument();
    expect(screen.getByLabelText("auth:FIELD_EMAIL_LABEL")).toBeInTheDocument();

    const submitButton = screen.getByRole("button", { name: "auth:LOGIN_EMAIL_CODE_SEND_BUTTON" });

    expect(submitButton).toBeInTheDocument();
    expect(screen.queryByTestId("oauth-section")).not.toBeInTheDocument();
    expect(screen.queryByText("auth:LEGAL_LOGIN")).not.toBeInTheDocument();
  });

  test("renders password step with inline alternative links and no oauth section", () => {
    renderLoginView({
      mode: "login",
      loginSeed: { email: "demo@example.com", step: "password" },
    });

    expect(screen.getByLabelText("auth:FIELD_PASSWORD_LABEL")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "auth:LOGIN_PASSWORD_ALTERNATIVE_ACTION" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "auth:FORGOT_PASSWORD" })).toBeInTheDocument();
    expect(screen.queryByTestId("oauth-section")).not.toBeInTheDocument();
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

    expect(screen.getByRole("link", { name: "Arclayer" })).toBeInTheDocument();
    expect(screen.getAllByText("auth:TWO_FACTOR_CODE_LABEL").length).toBeGreaterThan(0);

    const submitButton = screen.getByRole("button", {
      name: "auth:LOGIN_TWO_FACTOR_VERIFY_BUTTON",
    });
    expect(submitButton).toBeInTheDocument();
    expect(screen.queryByText("auth:LEGAL_LOGIN")).not.toBeInTheDocument();
  });
});
