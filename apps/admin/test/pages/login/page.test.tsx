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
  AuthOauthButtons: () => <div data-testid="oauth-section">oauth-section</div>,
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
  test("renders login pane email-first with pane-local branding and legal copy under submit", () => {
    renderLoginView();

    expect(screen.getByRole("link", { name: "Arclayer" })).toBeInTheDocument();
    expect(screen.getByText("auth:FIELD_EMAIL_LABEL")).toBeInTheDocument();
    expect(screen.queryByText("auth:FIELD_PASSWORD_LABEL")).not.toBeInTheDocument();
    expect(screen.queryByText("auth:KEEP_SESSION")).not.toBeInTheDocument();

    const submitButton = screen.getByRole("button", { name: "auth:LOGIN_NEXT_BUTTON" });
    const oauthSection = screen.getByTestId("oauth-section");
    const registerEntry = screen.getByText("auth:NO_ACCOUNT").parentElement;
    const registerAction = screen.getByText("auth:CREATE_ACCOUNT");
    const legalCopy = screen.getByText("auth:LEGAL_LOGIN");
    const legalText = legalCopy.closest("p");
    expect(legalCopy).toBeInTheDocument();
    expect(legalText).toHaveClass("text-footnote");
    expect(
      submitButton.compareDocumentPosition(oauthSection) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(registerEntry).not.toBeNull();
    expect(registerAction).toBeInTheDocument();
    expect(submitButton.querySelector("svg")).toBeNull();
    expect(
      oauthSection.compareDocumentPosition(registerEntry as HTMLDivElement) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      registerEntry!.compareDocumentPosition(legalCopy) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  test("renders register pane email-first with legal copy under submit", () => {
    renderLoginView({ mode: "register" });

    expect(screen.getByRole("link", { name: "Arclayer" })).toBeInTheDocument();
    expect(screen.getByText("auth:FIELD_EMAIL_LABEL")).toBeInTheDocument();
    expect(screen.queryByText("auth:FIELD_DISPLAY_NAME_LABEL")).not.toBeInTheDocument();
    expect(screen.queryByText("auth:FIELD_USERNAME_LABEL")).not.toBeInTheDocument();
    expect(screen.queryByText("auth:FIELD_PASSWORD_LABEL")).not.toBeInTheDocument();

    const submitButton = screen.getByRole("button", { name: "auth:REGISTER_NEXT_BUTTON" });
    const oauthSection = screen.getByTestId("oauth-section");
    const signInEntry = screen.getByText("auth:HAVE_ACCOUNT").parentElement;
    const signInAction = screen.getByText("auth:SIGN_IN");
    const legalCopy = screen.getByText("auth:LEGAL_REGISTER");
    const legalText = legalCopy.closest("p");
    expect(legalCopy).toBeInTheDocument();
    expect(signInAction).toBeInTheDocument();
    expect(submitButton.querySelector("svg")).toBeNull();
    expect(legalText).toHaveClass("text-footnote");
    expect(
      submitButton.compareDocumentPosition(oauthSection) & Node.DOCUMENT_POSITION_FOLLOWING,
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

  test("renders email-code pane as an inline auth pane with legal copy under the action", () => {
    renderLoginView({
      mode: "email-code",
      loginEmailCodeSeed: { email: "demo@example.com" },
    });

    expect(screen.getByRole("link", { name: "Arclayer" })).toBeInTheDocument();
    expect(screen.getByText("auth:LOGIN_EMAIL_CODE_TITLE")).toBeInTheDocument();
    expect(screen.getByLabelText("auth:FIELD_EMAIL_LABEL")).toBeInTheDocument();

    const submitButton = screen.getByRole("button", { name: "auth:LOGIN_EMAIL_CODE_SEND_BUTTON" });
    const oauthSection = screen.getByTestId("oauth-section");
    const legalCopy = screen.getByText("auth:LEGAL_LOGIN");

    expect(
      submitButton.compareDocumentPosition(oauthSection) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      oauthSection.compareDocumentPosition(legalCopy) & Node.DOCUMENT_POSITION_FOLLOWING,
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

    expect(screen.getByRole("link", { name: "Arclayer" })).toBeInTheDocument();
    expect(screen.getAllByText("auth:TWO_FACTOR_CODE_LABEL").length).toBeGreaterThan(0);

    const submitButton = screen.getByRole("button", {
      name: "auth:LOGIN_TWO_FACTOR_VERIFY_BUTTON",
    });
    expect(submitButton).toBeInTheDocument();
    expect(screen.queryByText("auth:LEGAL_LOGIN")).not.toBeInTheDocument();
  });
});
