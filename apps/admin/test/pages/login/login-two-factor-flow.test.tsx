import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AnchorHTMLAttributes, ElementType } from "react";
import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { STORAGE_KEYS } from "@/constants/storage";
import { ApiError } from "@/lib/http";
import { LoginPage } from "@/pages/login/page";
import {
  rehydrateAuthChallengeStore,
  useAuthChallengeStore,
} from "@/stores/use-auth-challenge-store";

type RuntimeState = {
  runtime: Record<string, unknown> | null;
  publicRegisterEnabled: boolean | null;
};

const {
  navigateMock,
  emailCheckMock,
  usernameCheckMock,
  loginMock,
  requestLoginEmailCodeMock,
  verifyLoginEmailCodeMock,
  resendRegistrationEmailVerificationMock,
  exchangeSSOMock,
  applyLoginMock,
  queryClientClearMock,
  queryClientCancelQueriesMock,
  notifyErrorMock,
  notifyErrorTextMock,
  notifyInfoTextMock,
  notifySuccessTextMock,
  listSSOProvidersMock,
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
  resendRegistrationEmailVerificationMock: vi.fn(),
  exchangeSSOMock: vi.fn(),
  applyLoginMock: vi.fn(),
  queryClientClearMock: vi.fn(),
  queryClientCancelQueriesMock: vi.fn(),
  notifyErrorMock: vi.fn(),
  notifyErrorTextMock: vi.fn(),
  notifyInfoTextMock: vi.fn(),
  notifySuccessTextMock: vi.fn(),
  listSSOProvidersMock: vi.fn(),
  runtimeState: {
    runtime: {} as RuntimeState["runtime"],
    publicRegisterEnabled: true as RuntimeState["publicRegisterEnabled"],
  },
  authState: {
    applyLogin: vi.fn(),
    keepSession: true,
    sessionVersion: 0,
    refreshToken: null,
    setTokens: vi.fn(),
  },
  workspaceState: {
    lastWorkspaceId: null,
    setCurrentWorkspaceId: vi.fn(),
  },
}));
let currentSearch: Record<string, unknown> = { mode: "login" };
let popupClosed = false;
let intervalCallbacks: Array<() => void> = [];
let popupAssignMock = vi.fn();
let popupSessionStorageState = new Map<string, string>();
let popupCloseMock = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigateMock,
  getRouteApi: () => ({ useSearch: () => currentSearch }),
  Link: ({ children, to, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("motion/react", () => {
  type MotionElementProps = React.HTMLAttributes<HTMLElement> & {
    variants?: unknown;
    initial?: unknown;
    animate?: unknown;
    exit?: unknown;
    whileTap?: unknown;
    whileHover?: unknown;
    transition?: unknown;
  };
  const motionElements = new Map<string, (props: MotionElementProps) => React.ReactElement>();

  return {
    AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    LayoutGroup: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    MotionConfig: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    motion: new Proxy(
      {
        create:
          (Component: ElementType) =>
          ({ children, ...props }: React.HTMLAttributes<HTMLElement>) => (
            <Component {...props}>{children}</Component>
          ),
      },
      {
        get: (target, tag: string) => {
          if (tag in target) return target[tag as keyof typeof target];
          const existing = motionElements.get(tag);
          if (existing) return existing;

          const MotionElement = ({
            children,
            variants: _variants,
            initial: _initial,
            animate: _animate,
            exit: _exit,
            whileTap: _whileTap,
            whileHover: _whileHover,
            transition: _transition,
            ...props
          }: MotionElementProps) => {
            const Component = tag as ElementType;
            return <Component {...props}>{children}</Component>;
          };
          motionElements.set(tag, MotionElement);
          return MotionElement;
        },
      },
    ),
  };
});

vi.mock("@/api/auth", () => ({
  emailCheck: (...args: unknown[]) => emailCheckMock(...args),
  usernameCheck: (...args: unknown[]) => usernameCheckMock(...args),
  login: (...args: unknown[]) => loginMock(...args),
  requestLoginEmailCode: (...args: unknown[]) => requestLoginEmailCodeMock(...args),
  verifyLoginEmailCode: (...args: unknown[]) => verifyLoginEmailCodeMock(...args),
  resendRegistrationEmailVerification: (...args: unknown[]) =>
    resendRegistrationEmailVerificationMock(...args),
  register: vi.fn(),
  forgotPassword: vi.fn(),
  refresh: vi.fn(),
  refreshCookie: vi.fn(),
  loginTwoFactor: vi.fn(),
}));

vi.mock("@/api/auth-sso", () => ({
  exchangeSSOCode: (...args: unknown[]) => exchangeSSOMock(...args),
  listSSOProviders: (...args: unknown[]) => listSSOProvidersMock(...args),
}));

vi.mock("@/components/ui/oauth-buttons", () => ({
  AuthOauthButtons: ({
    leadingActions = [],
    loadingProvider = null,
    onProviderStart,
    disabled = false,
  }: {
    leadingActions?: Array<{ key: string; label: string; onClick: () => void }>;
    loadingProvider?: string | null;
    disabled?: boolean;
    onProviderStart?: (input: { provider: string; startUrl: string }) => void;
  }) =>
    leadingActions.length > 0 || onProviderStart ? (
      <div>
        {leadingActions.map((action) => (
          <button key={action.key} type="button" disabled={disabled} onClick={action.onClick}>
            {action.label}
          </button>
        ))}
        {onProviderStart ? (
          <button
            type="button"
            disabled={disabled || loadingProvider === "google"}
            aria-busy={loadingProvider === "google" ? true : undefined}
            onClick={() =>
              onProviderStart({
                provider: "google",
                startUrl: "/oauth/google/start",
              })
            }
          >
            {loadingProvider === "google" ? "auth:OAUTH_GOOGLE_LOADING" : "auth:OAUTH_GOOGLE"}
          </button>
        ) : null}
      </div>
    ) : null,
}));

vi.mock("@arclayer/ui/input-otp", async () => {
  const React = await vi.importActual<typeof import("react")>("react");

  return {
    InputOTP: ({
      children,
      maxLength,
      onChange,
      containerClassName: _containerClassName,
      pushPasswordManagerStrategy: _pushPasswordManagerStrategy,
      value,
      ...props
    }: React.InputHTMLAttributes<HTMLInputElement> & {
      children?: React.ReactNode;
      containerClassName?: string;
      maxLength?: number;
      onChange?: (value: string) => void;
      pushPasswordManagerStrategy?: string;
      value?: string;
    }) => {
      const [inputValue, setInputValue] = React.useState(value ?? "");

      return (
        <div data-input-otp-container>
          <input
            {...props}
            data-input-otp
            maxLength={maxLength}
            value={inputValue}
            onChange={(event) => {
              const nextValue = event.currentTarget.value;
              setInputValue(nextValue);
              onChange?.(nextValue);
            }}
          />
          {children}
        </div>
      );
    },
    InputOTPGroup: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    InputOTPSlot: ({ index }: { index: number }) => <span data-otp-slot={index} />,
  };
});

vi.mock("@/hooks/use-product-runtime", () => ({
  useProductRuntime: () => runtimeState,
}));

vi.mock("@/hooks/use-prefers-reduced-motion", () => ({
  usePrefersReducedMotion: () => true,
}));

vi.mock("@/layouts/auth-layout", () => ({
  useAuthLegalKey: () => ({ setLegalKey: vi.fn() }),
}));

vi.mock("@/lib/routing/post-auth-routing", () => ({
  resolvePostAuthRoute: vi.fn(async () => ({ path: "/" })),
}));

vi.mock("@/lib/notifications", () => ({
  notifyError: (...args: unknown[]) => notifyErrorMock(...args),
  notifyErrorText: (...args: unknown[]) => notifyErrorTextMock(...args),
  notifyInfoText: (...args: unknown[]) => notifyInfoTextMock(...args),
  notifySuccessText: (...args: unknown[]) => notifySuccessTextMock(...args),
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
      setState: (
        updater: typeof authState | ((state: typeof authState) => Partial<typeof authState>),
      ) => {
        const patch = typeof updater === "function" ? updater(authState) : updater;
        Object.assign(authState, patch);
      },
      persist: {
        rehydrate: vi.fn(async () => undefined),
      },
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
  window.history.replaceState({}, "", "http://localhost:3000/login?mode=login");
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
    value: vi.fn(() =>
      document.activeElement instanceof Element ? document.activeElement : document.body,
    ),
  });
  popupClosed = false;
  intervalCallbacks = [];
  popupAssignMock = vi.fn();
  popupSessionStorageState = new Map<string, string>();
  popupCloseMock = vi.fn(() => {
    popupClosed = true;
  });
  Object.defineProperty(window, "open", {
    writable: true,
    value: vi.fn(() => ({
      get closed() {
        return popupClosed;
      },
      close: popupCloseMock,
      sessionStorage: {
        setItem: vi.fn((key: string, value: string) => {
          popupSessionStorageState.set(key, value);
        }),
        getItem: vi.fn((key: string) => popupSessionStorageState.get(key) ?? null),
        removeItem: vi.fn((key: string) => {
          popupSessionStorageState.delete(key);
        }),
      },
      location: {
        assign: popupAssignMock,
      },
    })),
  });
  Object.defineProperty(window, "setInterval", {
    writable: true,
    value: vi.fn((callback: TimerHandler) => {
      if (typeof callback === "function") {
        intervalCallbacks.push(callback as () => void);
      }
      return intervalCallbacks.length;
    }),
  });
  Object.defineProperty(window, "clearInterval", {
    writable: true,
    value: vi.fn(),
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
    resendRegistrationEmailVerificationMock.mockReset();
    exchangeSSOMock.mockReset();
    listSSOProvidersMock.mockReset();
    applyLoginMock.mockReset();
    queryClientClearMock.mockReset();
    queryClientCancelQueriesMock.mockReset();
    notifyErrorMock.mockReset();
    notifyErrorTextMock.mockReset();
    notifyInfoTextMock.mockReset();
    notifySuccessTextMock.mockReset();
    navigateMock.mockReset();
    authState.applyLogin.mockReset();
    workspaceState.setCurrentWorkspaceId.mockReset();
    useAuthChallengeStore.getState().clear();
    sessionStorage.clear();
    localStorage.clear();
    runtimeState.runtime = {};
    runtimeState.publicRegisterEnabled = true;
    authState.sessionVersion = 0;
    navigateMock.mockImplementation(({ search }: { search?: Record<string, unknown> }) => {
      if (search) {
        currentSearch = search;
      }
      return Promise.resolve();
    });
  });

  it("switches to otp pane when login returns TWO_FACTOR_REQUIRED", async () => {
    emailCheckMock.mockResolvedValueOnce({
      exists: true,
      passwordLoginAvailable: true,
    });
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
    await user.type(screen.getByLabelText("auth:FIELD_PASSWORD_LABEL"), "secret123");
    await user.click(screen.getByRole("button", { name: "auth:LOGIN_BUTTON" }));

    expect(emailCheckMock).toHaveBeenCalledWith({ email: "demo@example.com" });
    expect(loginMock).toHaveBeenCalledWith({
      email: "demo@example.com",
      password: "secret123",
    });
    await waitFor(() => {
      expect(useAuthChallengeStore.getState().twoFactorToken).toBe("challenge-1");
      expect(useAuthChallengeStore.getState().source).toBe("password");
    });
    expect(
      await screen.findByRole("heading", {
        name: "auth:LOGIN_TWO_FACTOR_TITLE",
      }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("auth:TWO_FACTOR_CODE_LABEL")).toBeInTheDocument();
    expect(notifyErrorMock).not.toHaveBeenCalled();
    expect(authState.applyLogin).not.toHaveBeenCalled();
    expect(queryClientClearMock).not.toHaveBeenCalled();
  });

  it("shows login email verification state when password login returns EMAIL_NOT_VERIFIED", async () => {
    emailCheckMock.mockResolvedValueOnce({
      exists: true,
      passwordLoginAvailable: true,
    });
    loginMock.mockRejectedValueOnce(
      new ApiError({
        status: 403,
        message: "请先验证邮箱后再登录",
        error: "EMAIL_NOT_VERIFIED",
        meta: {
          email: "demo@example.com",
          requires_email_verification: true,
          expires_in: 3600,
          retry_after: 60,
        },
      }),
    );

    renderPage();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("auth:FIELD_EMAIL_LABEL"), "demo@example.com");
    await user.type(screen.getByLabelText("auth:FIELD_PASSWORD_LABEL"), "secret123");
    await user.click(screen.getByRole("button", { name: "auth:LOGIN_BUTTON" }));

    expect(await screen.findByText("auth:REGISTER_VERIFY_EMAIL_SENT_HINT")).toBeInTheDocument();
    expect(screen.getByLabelText("auth:FIELD_EMAIL_LABEL")).toBeDisabled();
    expect(screen.getByLabelText("auth:FIELD_EMAIL_LABEL")).toHaveValue("demo@example.com");
    expect(
      screen.queryByRole("button", { name: "auth:LOGIN_EMAIL_CODE_ACTION" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("auth:FIELD_PASSWORD_LABEL")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "auth:FORGOT_PASSWORD" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "auth:CREATE_ACCOUNT" })).not.toBeDisabled();
    expect(
      screen.getByRole("button", { name: "auth:REGISTER_VERIFY_EMAIL_RESEND_WAIT" }),
    ).toBeDisabled();
    expect(navigateMock).toHaveBeenCalledWith({
      to: "/login",
      search: { mode: "login" },
      replace: true,
    });
  });

  it("resends login email verification after countdown is available", async () => {
    emailCheckMock.mockResolvedValueOnce({
      exists: true,
      passwordLoginAvailable: true,
    });
    loginMock.mockRejectedValueOnce(
      new ApiError({
        status: 403,
        message: "请先验证邮箱后再登录",
        error: "EMAIL_NOT_VERIFIED",
        meta: {
          email: "demo@example.com",
          requires_email_verification: true,
          expires_in: 3600,
          retry_after: 0,
        },
      }),
    );
    resendRegistrationEmailVerificationMock.mockResolvedValueOnce({
      requiresEmailVerification: true,
      retryAfter: 60,
    });

    renderPage();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("auth:FIELD_EMAIL_LABEL"), "demo@example.com");
    await user.type(screen.getByLabelText("auth:FIELD_PASSWORD_LABEL"), "secret123");
    await user.click(screen.getByRole("button", { name: "auth:LOGIN_BUTTON" }));

    const resendButton = await screen.findByRole("button", {
      name: "auth:REGISTER_VERIFY_EMAIL_RESEND_ACTION",
    });
    expect(resendButton).not.toBeDisabled();
    await user.click(resendButton);

    expect(resendRegistrationEmailVerificationMock).toHaveBeenCalledWith({
      email: "demo@example.com",
    });
    expect(notifyInfoTextMock).toHaveBeenCalledWith("auth:REGISTER_VERIFY_EMAIL_SENT");
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
    await act(async () => {
      await rehydrateAuthChallengeStore();
    });

    renderPage();

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "auth:LOGIN_TWO_FACTOR_TITLE" }),
      ).toBeInTheDocument();
    });
    expect(screen.getByLabelText("auth:TWO_FACTOR_CODE_LABEL")).toBeInTheDocument();
  });

  it("keeps public register entry visible while runtime is unresolved", async () => {
    runtimeState.runtime = null;
    runtimeState.publicRegisterEnabled = null;

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("auth:CREATE_ACCOUNT")).toBeInTheDocument();
    });
  });

  it("preserves register mode while runtime is unresolved", async () => {
    currentSearch = { mode: "register" };
    runtimeState.runtime = null;
    runtimeState.publicRegisterEnabled = null;

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

  it("auto-requests an email login code once after switching methods under StrictMode", async () => {
    emailCheckMock.mockResolvedValueOnce({
      exists: true,
      passwordLoginAvailable: true,
    });
    requestLoginEmailCodeMock.mockResolvedValueOnce({
      expiresIn: 600,
      retryAfter: 0,
    });

    renderPage({ strictMode: true });
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("auth:FIELD_EMAIL_LABEL"), "demo@example.com");
    await user.click(screen.getByRole("button", { name: "auth:LOGIN_EMAIL_CODE_ACTION" }));

    expect(
      await screen.findByRole("heading", {
        name: "auth:LOGIN_EMAIL_CODE_VERIFY_TITLE",
      }),
    ).toBeInTheDocument();
    expect(requestLoginEmailCodeMock).toHaveBeenCalledTimes(1);
    expect(requestLoginEmailCodeMock).toHaveBeenCalledWith({
      email: "demo@example.com",
    });
    expect(notifySuccessTextMock).toHaveBeenCalledTimes(1);
    expect(notifySuccessTextMock).toHaveBeenCalledWith("auth:LOGIN_CODE_SENT");
  });

  it("starts a two-factor challenge after verifying an email login code", async () => {
    emailCheckMock.mockResolvedValueOnce({
      exists: true,
      passwordLoginAvailable: true,
    });
    requestLoginEmailCodeMock.mockResolvedValueOnce({
      expiresIn: 600,
      retryAfter: 60,
    });
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
    await user.click(screen.getByRole("button", { name: "auth:LOGIN_EMAIL_CODE_ACTION" }));
    expect(
      await screen.findByRole("heading", {
        name: "auth:LOGIN_EMAIL_CODE_VERIFY_TITLE",
      }),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(requestLoginEmailCodeMock).toHaveBeenCalledWith({
        email: "demo@example.com",
      });
    });
    await waitFor(() => {
      expect(notifySuccessTextMock).toHaveBeenCalledWith("auth:LOGIN_CODE_SENT");
    });
    await waitFor(() => {
      expect(screen.queryByLabelText("auth:FIELD_PASSWORD_LABEL")).not.toBeInTheDocument();
      expect(screen.getAllByRole("button", { name: "auth:LOGIN_BUTTON" })).toHaveLength(1);
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const codeInput = screen.getByLabelText("auth:LOGIN_EMAIL_CODE_FIELD_LABEL");
    await user.type(codeInput, "123456");
    const verifyForm = codeInput.closest("form");
    expect(verifyForm).not.toBeNull();
    const verifyButton = within(verifyForm as HTMLFormElement).getByRole("button", {
      name: "auth:LOGIN_BUTTON",
    });
    await waitFor(() => {
      expect(verifyButton).toBeEnabled();
    });
    await user.click(verifyButton);

    await waitFor(() => {
      expect(verifyLoginEmailCodeMock).toHaveBeenCalledWith({
        email: "demo@example.com",
        code: "123456",
      });
    });
    expect(
      await screen.findByRole("heading", {
        name: "auth:LOGIN_TWO_FACTOR_TITLE",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "auth:TWO_FACTOR_BACK_TO_EMAIL_CODE",
      }),
    ).toBeInTheDocument();
    expect(useAuthChallengeStore.getState().source).toBe("email-code");
    expect(notifyErrorMock).not.toHaveBeenCalled();
    expect(authState.applyLogin).not.toHaveBeenCalled();
    expect(queryClientClearMock).not.toHaveBeenCalled();
  });

  it("opens oauth in a popup and keeps the provider button busy", async () => {
    listSSOProvidersMock.mockResolvedValueOnce({
      providers: [
        {
          provider: "google",
          label: "Google",
          start_url: "/oauth/google/start",
        },
      ],
    });

    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "auth:OAUTH_GOOGLE" }));

    expect(window.open).toHaveBeenCalledWith(
      "about:blank",
      expect.stringMatching(/^arclayer-auth-oauth:/),
      expect.stringContaining("popup=yes"),
    );
    expect(popupAssignMock).toHaveBeenCalledWith("/oauth/google/start");
    expect(popupSessionStorageState.get(STORAGE_KEYS.authPendingOauth)).toContain(
      '"provider":"google"',
    );
    const oauthButton = screen.getByRole("button", {
      name: "auth:OAUTH_GOOGLE_LOADING",
    });
    expect(oauthButton).toBeDisabled();
    expect(oauthButton).toHaveAttribute("aria-busy", "true");
    expect(localStorage.getItem(STORAGE_KEYS.authPendingOauth)).toContain('"provider":"google"');
  });

  it("rehydrates auth state and navigates after popup oauth success", async () => {
    listSSOProvidersMock.mockResolvedValueOnce({
      providers: [
        {
          provider: "google",
          label: "Google",
          start_url: "/oauth/google/start",
        },
      ],
    });
    authState.sessionVersion = 3;

    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "auth:OAUTH_GOOGLE" }));

    localStorage.setItem(
      STORAGE_KEYS.authOauthResult,
      JSON.stringify({
        provider: "google",
        status: "success",
        redirect: "/workspace/demo",
        completedAt: Date.now(),
      }),
    );
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: STORAGE_KEYS.authOauthResult,
        newValue: "updated",
      }),
    );

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith({
        to: "/workspace/demo",
        replace: true,
      });
    });
    expect(localStorage.getItem(STORAGE_KEYS.authPendingOauth)).toBeNull();
    expect(authState.sessionVersion).toBe(4);
  });

  it("treats an oauth error page as popup flow when the popup marker exists even without opener", async () => {
    currentSearch = { mode: "login", oauth_error: "state_expired" };
    localStorage.setItem(
      STORAGE_KEYS.authPendingOauth,
      JSON.stringify({
        provider: "google",
        redirect: "/workspace/demo",
        keepSession: true,
        startedAt: Date.now(),
        popupId: "popup-1",
      }),
    );
    sessionStorage.setItem(
      STORAGE_KEYS.authPendingOauth,
      JSON.stringify({
        provider: "google",
        redirect: "/workspace/demo",
        keepSession: true,
        startedAt: Date.now(),
        popupId: "popup-1",
      }),
    );

    const closeSpy = vi.fn();
    Object.defineProperty(window, "close", {
      writable: true,
      value: closeSpy,
    });
    Object.defineProperty(window, "opener", {
      writable: true,
      value: null,
    });
    window.history.replaceState(
      {},
      "",
      "http://localhost:3000/login?mode=login&oauth_error=state_expired&oauth_popup=popup-1",
    );

    renderPage();

    await waitFor(() => {
      const result = localStorage.getItem(STORAGE_KEYS.authOauthResult);
      expect(result).toContain('"status":"error"');
      expect(result).toContain('"provider":"google"');
    });
    expect(closeSpy).toHaveBeenCalledTimes(1);
    expect(notifyErrorTextMock).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("clears the loading state when the user closes the popup without completing oauth", async () => {
    listSSOProvidersMock.mockResolvedValueOnce({
      providers: [
        {
          provider: "google",
          label: "Google",
          start_url: "/oauth/google/start",
        },
      ],
    });

    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "auth:OAUTH_GOOGLE" }));
    expect(screen.getByRole("button", { name: "auth:OAUTH_GOOGLE_LOADING" })).toBeDisabled();

    popupClosed = true;
    await act(async () => {
      intervalCallbacks.forEach((callback) => callback());
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "auth:OAUTH_GOOGLE" })).not.toBeDisabled();
    });
    expect(localStorage.getItem(STORAGE_KEYS.authPendingOauth)).toBeNull();
  });

  it("does not restore oauth loading from persisted pending state after refresh", async () => {
    localStorage.setItem(
      STORAGE_KEYS.authPendingOauth,
      JSON.stringify({
        provider: "google",
        redirect: "/workspace/demo",
        keepSession: true,
        startedAt: Date.now(),
        popupId: "popup-refresh",
      }),
    );
    listSSOProvidersMock.mockResolvedValueOnce({
      providers: [
        {
          provider: "google",
          label: "Google",
          start_url: "/oauth/google/start",
        },
      ],
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "auth:OAUTH_GOOGLE" })).not.toBeDisabled();
    });
    expect(localStorage.getItem(STORAGE_KEYS.authPendingOauth)).toBeNull();
  });
});
