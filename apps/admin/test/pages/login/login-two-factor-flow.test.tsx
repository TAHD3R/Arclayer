import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AnchorHTMLAttributes } from "react";
import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/http";
import { LoginPage } from "@/pages/login/page";
import { useAuthChallengeStore } from "@/stores/use-auth-challenge-store";

type RuntimeState = {
  runtime: Record<string, unknown> | null;
  publicRegisterEnabled: boolean | null;
  instanceSetupStatus: "uninitialized" | "ready" | "repair_required" | null;
  instanceSetupRepairReason: string | null;
};

const {
  navigateMock,
  emailCheckMock,
  usernameCheckMock,
  loginMock,
  requestLoginEmailCodeMock,
  verifyLoginEmailCodeMock,
  exchangeSSOMock,
  applyLoginMock,
  queryClientClearMock,
  queryClientCancelQueriesMock,
  notifyErrorTextMock,
  runtimeState,
  authState,
  workspaceState,
} = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  emailCheckMock: vi.fn(),
  usernameCheckMock: vi.fn(),
  loginMock: vi.fn(),
  requestLoginEmailCodeMock: vi.fn(),
  verifyLoginEmailCodeMock: vi.fn(),
  exchangeSSOMock: vi.fn(),
  applyLoginMock: vi.fn(),
  queryClientClearMock: vi.fn(),
  queryClientCancelQueriesMock: vi.fn(),
  notifyErrorTextMock: vi.fn(),
  runtimeState: {
    runtime: {} as RuntimeState["runtime"],
    publicRegisterEnabled: true as RuntimeState["publicRegisterEnabled"],
    instanceSetupStatus: "ready" as RuntimeState["instanceSetupStatus"],
    instanceSetupRepairReason: null as RuntimeState["instanceSetupRepairReason"],
  },
  authState: {
    applyLogin: vi.fn(),
    keepSession: true,
    refreshToken: null,
    setTokens: vi.fn(),
  },
  workspaceState: {
    lastWorkspaceId: null,
    setCurrentWorkspaceId: vi.fn(),
  },
}));
let currentSearch: Record<string, unknown> = { mode: "login" };

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigateMock,
  getRouteApi: () => ({ useSearch: () => currentSearch }),
  Link: ({ children, to, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/api/auth", () => ({
  emailCheck: (...args: unknown[]) => emailCheckMock(...args),
  usernameCheck: (...args: unknown[]) => usernameCheckMock(...args),
  login: (...args: unknown[]) => loginMock(...args),
  requestLoginEmailCode: (...args: unknown[]) => requestLoginEmailCodeMock(...args),
  verifyLoginEmailCode: (...args: unknown[]) => verifyLoginEmailCodeMock(...args),
  register: vi.fn(),
  forgotPassword: vi.fn(),
  refresh: vi.fn(),
  refreshCookie: vi.fn(),
  loginTwoFactor: vi.fn(),
}));

vi.mock("@/api/auth-sso", () => ({
  exchangeSSOCode: (...args: unknown[]) => exchangeSSOMock(...args),
}));

vi.mock("@/components/ui/oauth-buttons", () => ({
  AuthOauthButtons: ({
    leadingActions = [],
  }: {
    leadingActions?: Array<{ key: string; label: string; onClick: () => void }>;
  }) =>
    leadingActions.length > 0 ? (
      <div>
        {leadingActions.map((action) => (
          <button key={action.key} type="button" onClick={action.onClick}>
            {action.label}
          </button>
        ))}
      </div>
    ) : null,
}));

vi.mock("@/hooks/use-system-runtime", () => ({
  useSystemRuntime: () => runtimeState,
}));

vi.mock("@/layouts/auth-layout", () => ({
  useAuthLegalKey: () => ({ setLegalKey: vi.fn() }),
}));

vi.mock("@/lib/routing/post-auth-routing", () => ({
  resolvePostAuthRoute: vi.fn(async () => ({ path: "/" })),
}));

vi.mock("@/lib/notifications", () => ({
  notifyError: vi.fn(),
  notifyErrorText: (...args: unknown[]) => notifyErrorTextMock(...args),
  notifyInfoText: vi.fn(),
  notifySuccessText: vi.fn(),
}));

vi.mock("@/lib/query/query-client-instance", () => ({
  queryClient: {
    clear: queryClientClearMock,
    cancelQueries: queryClientCancelQueriesMock,
  },
}));

vi.mock("@/stores/use-auth-store", () => {
  const useAuthStore = Object.assign(
    (selector: (state: typeof authState) => unknown) => selector(authState),
    {
      getState: () => authState,
    },
  );
  return { useAuthStore };
});

vi.mock("@/stores/use-workspace-store", () => ({
  useWorkspaceStore: (selector: (state: typeof workspaceState) => unknown) =>
    selector(workspaceState),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
  Trans: ({ i18nKey }: { i18nKey: string }) => <span>{i18nKey}</span>,
}));

function renderPage(options?: { strictMode?: boolean }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const content = (
    <QueryClientProvider client={queryClient}>
      <LoginPage />
    </QueryClientProvider>
  );
  return render(options?.strictMode ? <StrictMode>{content}</StrictMode> : content);
}

beforeEach(() => {
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
  Object.defineProperty(document, "elementFromPoint", {
    writable: true,
    value: vi.fn(() => null),
  });
});

describe("LoginPage two-factor challenge flow", () => {
  beforeEach(() => {
    currentSearch = { mode: "login" };
    emailCheckMock.mockReset();
    usernameCheckMock.mockReset();
    loginMock.mockReset();
    requestLoginEmailCodeMock.mockReset();
    verifyLoginEmailCodeMock.mockReset();
    exchangeSSOMock.mockReset();
    applyLoginMock.mockReset();
    queryClientClearMock.mockReset();
    queryClientCancelQueriesMock.mockReset();
    notifyErrorTextMock.mockReset();
    navigateMock.mockReset();
    workspaceState.setCurrentWorkspaceId.mockReset();
    useAuthChallengeStore.getState().clear();
    sessionStorage.clear();
    runtimeState.runtime = {};
    runtimeState.publicRegisterEnabled = true;
    runtimeState.instanceSetupStatus = "ready";
    runtimeState.instanceSetupRepairReason = null;
    navigateMock.mockImplementation(({ search }: { search?: Record<string, unknown> }) => {
      if (search) {
        currentSearch = search;
      }
      return Promise.resolve();
    });
  });

  it("switches to otp pane when login returns TWO_FACTOR_REQUIRED", async () => {
    emailCheckMock.mockResolvedValueOnce({ exists: true, passwordLoginAvailable: true });
    loginMock.mockRejectedValueOnce(
      new ApiError({
        status: 401,
        message: "需要进行 2FA 验证",
        error: "TWO_FACTOR_REQUIRED",
        meta: { two_factor_token: "challenge-1", expires_in: 300 },
      }),
    );

    renderPage();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("auth:FIELD_EMAIL_LABEL"), "demo@example.com");
    await user.click(screen.getByRole("button", { name: "auth:LOGIN_NEXT_BUTTON" }));
    expect(await screen.findByLabelText("auth:FIELD_PASSWORD_LABEL")).toBeInTheDocument();
    await user.type(screen.getByLabelText("auth:FIELD_PASSWORD_LABEL"), "secret123");
    await user.click(screen.getByRole("button", { name: "auth:LOGIN_BUTTON" }));

    expect(emailCheckMock).toHaveBeenCalledWith({ email: "demo@example.com" });
    expect(loginMock).toHaveBeenCalledWith({ email: "demo@example.com", password: "secret123" });
    expect(await screen.findByText("auth:LOGIN_TWO_FACTOR_TITLE")).toBeInTheDocument();
    expect(screen.getByLabelText("auth:TWO_FACTOR_CODE_LABEL")).toBeInTheDocument();
    expect(applyLoginMock).not.toHaveBeenCalled();
    expect(queryClientClearMock).not.toHaveBeenCalled();
  });

  it("restores otp pane from sessionStorage when challenge is still active", async () => {
    sessionStorage.setItem(
      "arclayer:auth:challenge",
      JSON.stringify({
        state: {
          twoFactorToken: "challenge-2",
          expiresAt: Date.now() + 60_000,
          keepSession: true,
          redirect: "/workspace/demo",
          source: "password",
        },
        version: 1,
      }),
    );

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("auth:LOGIN_TWO_FACTOR_TITLE")).toBeInTheDocument();
    });
    expect(screen.getByLabelText("auth:TWO_FACTOR_CODE_LABEL")).toBeInTheDocument();
  });

  it("keeps public register entry visible while runtime is unresolved", async () => {
    runtimeState.runtime = null;
    runtimeState.publicRegisterEnabled = null;
    runtimeState.instanceSetupStatus = null;
    runtimeState.instanceSetupRepairReason = null;

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("auth:CREATE_ACCOUNT")).toBeInTheDocument();
    });
  });

  it("preserves register mode while runtime is unresolved", async () => {
    currentSearch = { mode: "register" };
    runtimeState.runtime = null;
    runtimeState.publicRegisterEnabled = null;
    runtimeState.instanceSetupStatus = null;
    runtimeState.instanceSetupRepairReason = null;

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("auth:REGISTER_PAGE_TITLE")).toBeInTheDocument();
    });
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("emits one oauth error toast under StrictMode", async () => {
    currentSearch = { mode: "login", oauth_error: "oauth_failed" };

    renderPage({ strictMode: true });

    await waitFor(() => {
      expect(notifyErrorTextMock).toHaveBeenCalledTimes(1);
    });
  });

  it("starts a two-factor challenge after verifying an email login code", async () => {
    emailCheckMock.mockResolvedValueOnce({ exists: true, passwordLoginAvailable: true });
    requestLoginEmailCodeMock.mockResolvedValueOnce({ expires_in: 600, retry_after: 0 });
    verifyLoginEmailCodeMock.mockRejectedValueOnce(
      new ApiError({
        status: 401,
        message: "需要进行 2FA 验证",
        error: "TWO_FACTOR_REQUIRED",
        meta: { two_factor_token: "challenge-email-code", expires_in: 300 },
      }),
    );

    renderPage();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("auth:FIELD_EMAIL_LABEL"), "demo@example.com");
    await user.click(screen.getByRole("button", { name: "auth:LOGIN_NEXT_BUTTON" }));
    expect(await screen.findByLabelText("auth:FIELD_PASSWORD_LABEL")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "auth:LOGIN_PASSWORD_ALTERNATIVE_ACTION" }),
    );
    expect(await screen.findByText("auth:LOGIN_EMAIL_CODE_VERIFY_TITLE")).toBeInTheDocument();

    await waitFor(() => {
      expect(requestLoginEmailCodeMock).toHaveBeenCalledWith({ email: "demo@example.com" });
    });

    await user.type(screen.getByLabelText("auth:LOGIN_EMAIL_CODE_FIELD_LABEL"), "123456");
    await user.click(screen.getByRole("button", { name: "auth:LOGIN_BUTTON" }));

    expect(verifyLoginEmailCodeMock).toHaveBeenCalledWith({
      email: "demo@example.com",
      code: "123456",
    });
    expect(await screen.findByText("auth:LOGIN_TWO_FACTOR_TITLE")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "auth:TWO_FACTOR_BACK_TO_EMAIL_CODE" }),
    ).toBeInTheDocument();
    expect(useAuthChallengeStore.getState().source).toBe("email-code");
    expect(applyLoginMock).not.toHaveBeenCalled();
    expect(queryClientClearMock).not.toHaveBeenCalled();
  });
});
