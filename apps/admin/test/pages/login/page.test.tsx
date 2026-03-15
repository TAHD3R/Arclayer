import { render, screen, within } from "@testing-library/react";
import type { AnchorHTMLAttributes } from "react";
import { beforeAll, describe, expect, test, vi } from "vitest";

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
  return render(
    <LoginView
      mode="login"
      onModeChange={() => undefined}
      onLoginSubmit={() => undefined}
      onForgotPasswordSubmit={async () => undefined}
      onRegisterSubmit={() => undefined}
      publicRegisterEnabled
      challenge={null}
      onLoginTwoFactorSubmit={() => undefined}
      onCancelTwoFactorChallenge={() => undefined}
      {...overrides}
    />,
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
  test("renders login pane with pane-local branding, titled fields, and legal copy under submit", () => {
    renderLoginView();

    expect(screen.getByRole("link", { name: "Arclayer" })).toBeInTheDocument();
    expect(screen.getByText("auth:FIELD_ACCOUNT_LABEL")).toBeInTheDocument();

    const passwordRow = screen.getByText("auth:FIELD_PASSWORD_LABEL").parentElement;
    expect(passwordRow).not.toBeNull();
    expect(
      within(passwordRow as HTMLDivElement).getByText("auth:FORGOT_PASSWORD"),
    ).toBeInTheDocument();

    const submitButton = screen.getByRole("button", { name: "auth:LOGIN_BUTTON" });
    const oauthSection = screen.getByTestId("oauth-section");
    const registerEntry = screen.getByText("auth:NO_ACCOUNT").parentElement;
    const legalCopy = screen.getByText("auth:LEGAL_LOGIN");
    expect(legalCopy).toBeInTheDocument();
    expect(
      submitButton.compareDocumentPosition(oauthSection) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(registerEntry).not.toBeNull();
    expect(
      oauthSection.compareDocumentPosition(registerEntry as HTMLDivElement) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      registerEntry!.compareDocumentPosition(legalCopy) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  test("renders register pane with titled fields and legal copy under submit", () => {
    renderLoginView({ mode: "register" });

    expect(screen.getByRole("link", { name: "Arclayer" })).toBeInTheDocument();
    expect(screen.getByText("auth:FIELD_EMAIL_LABEL")).toBeInTheDocument();
    expect(screen.getByText("auth:FIELD_USERNAME_LABEL")).toBeInTheDocument();
    expect(screen.getByText("auth:FIELD_PASSWORD_LABEL")).toBeInTheDocument();
    expect(screen.getByText("auth:FIELD_CONFIRM_PASSWORD_LABEL")).toBeInTheDocument();

    const submitButton = screen.getByRole("button", { name: "auth:REGISTER_BUTTON" });
    const oauthSection = screen.getByTestId("oauth-section");
    const signInEntry = screen.getByText("auth:HAVE_ACCOUNT").parentElement;
    const legalCopy = screen.getByText("auth:LEGAL_REGISTER");
    expect(legalCopy).toBeInTheDocument();
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
    expect(screen.getByText("auth:FIELD_ACCOUNT_LABEL")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "auth:MODAL_SUBMIT" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "auth:BACK_TO_LOGIN" })).toBeInTheDocument();
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
    expect(screen.getByText("auth:TWO_FACTOR_CODE_LABEL")).toBeInTheDocument();

    const submitButton = screen.getByRole("button", {
      name: "auth:LOGIN_TWO_FACTOR_VERIFY_BUTTON",
    });
    const legalCopy = screen.getByText("auth:LEGAL_LOGIN");
    expect(legalCopy).toBeInTheDocument();
    expect(
      submitButton.compareDocumentPosition(legalCopy) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
