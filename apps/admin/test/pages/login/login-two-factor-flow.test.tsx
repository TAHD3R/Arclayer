import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/http";
import { LoginPage } from "@/pages/login/page";
import { useAuthChallengeStore } from "@/stores/use-auth-challenge-store";

const {
  navigateMock,
  loginMock,
  exchangeSSOMock,
  applyLoginMock,
  queryClientClearMock,
  queryClientCancelQueriesMock,
  authState,
  workspaceState,
} = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  loginMock: vi.fn(),
  exchangeSSOMock: vi.fn(),
  applyLoginMock: vi.fn(),
  queryClientClearMock: vi.fn(),
  queryClientCancelQueriesMock: vi.fn(),
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
}));

vi.mock("@/api/auth", () => ({
  login: (...args: unknown[]) => loginMock(...args),
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
  AuthOauthButtons: () => null,
}));

vi.mock("@/hooks/use-system-runtime", () => ({
  useSystemRuntime: () => ({ runtime: {}, publicRegisterEnabled: true }),
}));

vi.mock("@/layouts/auth-layout", () => ({
  useAuthLegalKey: () => ({ setLegalKey: vi.fn() }),
}));

vi.mock("@/lib/routing/bootstrap-routing", () => ({
  resolvePostAuthRoute: vi.fn(async () => ({ path: "/" })),
}));

vi.mock("@/lib/routing/studio-return", () => ({
  consumeStudioReturnTo: vi.fn(() => null),
  resolveStudioOrigin: vi.fn(() => "https://studio.example.com"),
}));

vi.mock("@/lib/notifications", () => ({
  notifyError: vi.fn(),
  notifyErrorText: vi.fn(),
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
}));

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <LoginPage />
    </QueryClientProvider>,
  );
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
});

describe("LoginPage two-factor challenge flow", () => {
  beforeEach(() => {
    currentSearch = { mode: "login" };
    loginMock.mockReset();
    exchangeSSOMock.mockReset();
    applyLoginMock.mockReset();
    queryClientClearMock.mockReset();
    queryClientCancelQueriesMock.mockReset();
    navigateMock.mockReset();
    workspaceState.setCurrentWorkspaceId.mockReset();
    useAuthChallengeStore.getState().clear();
    sessionStorage.clear();
  });

  it("switches to otp pane when login returns TWO_FACTOR_REQUIRED", async () => {
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

    await user.type(screen.getByLabelText("auth:FIELD_ACCOUNT_LABEL"), "demo");
    await user.type(screen.getByLabelText("auth:FIELD_PASSWORD_LABEL"), "secret");
    await user.click(screen.getByRole("button", { name: "auth:LOGIN_BUTTON" }));

    expect(await screen.findByText("auth:LOGIN_TWO_FACTOR_TITLE")).toBeInTheDocument();
    expect(screen.getByLabelText("auth:TWO_FACTOR_CODE_LABEL")).toBeInTheDocument();
    expect(applyLoginMock).not.toHaveBeenCalled();
    expect(queryClientClearMock).not.toHaveBeenCalled();
  });

  it("restores otp pane from sessionStorage when challenge is still active", async () => {
    sessionStorage.setItem(
      "celestial:auth:challenge",
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
});
