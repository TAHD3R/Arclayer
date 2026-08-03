import { useMutation, useQuery } from "@tanstack/react-query";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import * as authApi from "@/api/auth";
import { verifyProductPasskey } from "@/lib/auth/webauthn";
import * as authSsoApi from "@/api/auth-sso";
import * as invitationApi from "@/api/invitations";
import { useProductRuntime } from "@/hooks/use-product-runtime";
import { resolveLoginMode } from "@/lib/auth/auth-mode";
import type { LoginMode } from "@/lib/auth/auth-mode";
import { ApiError } from "@/lib/http";
import { readStorageJson, removeStorageItem, writeStorageJson } from "@/lib/storage";
import { STORAGE_KEYS } from "@/constants/storage";
import {
  notifyError,
  notifyErrorText,
  notifyInfoText,
  notifySuccessText,
} from "@/lib/notifications";
import { queryClient } from "@/lib/query/query-client-instance";
import { resolvePostAuthRoute } from "@/lib/routing/post-auth-routing";
import {
  getActiveAuthChallenge,
  isAuthChallengeExpired,
  useAuthChallengeStore,
  type AuthChallengeSnapshot,
  type AuthChallengeSource,
} from "@/stores/use-auth-challenge-store";
import { useAuthStore } from "@/stores/use-auth-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import type { OAuthPopupResult, PendingOAuthState } from "@/types/auth/oauth-popup";

import { LOGIN_EMAIL_VERIFICATION_STATE_STARTED } from "../constants";
import type {
  LoginEmailLookupResult,
  LoginEmailCodeFormValues,
  LoginEmailCodePaneSeed,
  LoginEmailVerificationState,
  LoginFormValues,
  LoginModeChangeOptions,
  LoginPaneSeed,
  LoginTwoFactorFormValues,
  LoginViewProps,
  RegisterEmailVerificationState,
  EmailVerificationNoticeState,
  RegisterFormValues,
  RegisterPaneSeed,
} from "../types";

const loginRouteApi = getRouteApi("/login/");
const TWO_FACTOR_REQUIRED_ERROR = "TWO_FACTOR_REQUIRED";
const EMAIL_NOT_VERIFIED_ERROR = "EMAIL_NOT_VERIFIED";
const CHALLENGE_INVALID_ERRORS = new Set([
  "TWO_FACTOR_CHALLENGE_INVALID",
  "TWO_FACTOR_CHALLENGE_EXPIRED",
]);

type TwoFactorChallengeMeta = {
  twoFactorToken: string;
  expiresIn: number;
  methods: string[];
};

type EmailVerificationMeta = {
  email: string;
  retryAfter: number;
};

const OAUTH_SEARCH_CONSUME_DEDUPE_WINDOW_MS = 2_000;
const OAUTH_POPUP_WIDTH = 560;
const OAUTH_POPUP_HEIGHT = 720;
const OAUTH_PENDING_TIMEOUT_MS = 5 * 60_000;
const oauthSearchFlagHandledAt = new Map<string, number>();

function shouldHandleOAuthSearchFlag(flag: "oauth_code" | "oauth_error", value: string): boolean {
  const key = `${flag}:${value}`;
  const now = Date.now();
  const lastHandledAt = oauthSearchFlagHandledAt.get(key);
  oauthSearchFlagHandledAt.set(key, now);
  if (lastHandledAt === undefined) return true;
  return now - lastHandledAt > OAUTH_SEARCH_CONSUME_DEDUPE_WINDOW_MS;
}

function consumeLoginSearchFlag(flag: "oauth_code" | "oauth_error", value: string): void {
  const params = new URLSearchParams(window.location.search);
  if (params.get(flag) !== value) return;
  params.delete(flag);
  const nextSearch = params.toString();
  const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`;
  window.history.replaceState(window.history.state, "", nextUrl);
}

function readPendingOAuthState(): PendingOAuthState | null {
  return readStorageJson<PendingOAuthState>(STORAGE_KEYS.authPendingOauth);
}

function readPopupPendingOAuthState(): PendingOAuthState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEYS.authPendingOauth);
    return raw ? (JSON.parse(raw) as PendingOAuthState) : null;
  } catch {
    return null;
  }
}

function writePendingOAuthState(state: PendingOAuthState): void {
  writeStorageJson(STORAGE_KEYS.authPendingOauth, state);
}

function clearPendingOAuthState(): void {
  removeStorageItem(STORAGE_KEYS.authPendingOauth);
}

function writeOAuthPopupResult(result: OAuthPopupResult): void {
  writeStorageJson(STORAGE_KEYS.authOauthResult, result);
}

function clearOAuthPopupResult(): void {
  removeStorageItem(STORAGE_KEYS.authOauthResult);
}

function readOAuthPopupResult(): OAuthPopupResult | null {
  return readStorageJson<OAuthPopupResult>(STORAGE_KEYS.authOauthResult);
}

function isPopupWindow(): boolean {
  return readPopupPendingOAuthState() !== null;
}

function isPendingOAuthStateFresh(state: PendingOAuthState | null, now = Date.now()): boolean {
  if (!state) return false;
  return now - state.startedAt <= OAUTH_PENDING_TIMEOUT_MS;
}

function resolvePopupFeatures(): string {
  const dualScreenLeft =
    window.screenLeft !== undefined ? window.screenLeft : (window.screenX ?? 0);
  const dualScreenTop = window.screenTop !== undefined ? window.screenTop : (window.screenY ?? 0);
  const width = window.innerWidth || document.documentElement.clientWidth || screen.width;
  const height = window.innerHeight || document.documentElement.clientHeight || screen.height;
  const left = Math.max(0, dualScreenLeft + Math.round((width - OAUTH_POPUP_WIDTH) / 2));
  const top = Math.max(0, dualScreenTop + Math.round((height - OAUTH_POPUP_HEIGHT) / 2));

  return [
    "popup=yes",
    `width=${OAUTH_POPUP_WIDTH}`,
    `height=${OAUTH_POPUP_HEIGHT}`,
    `left=${left}`,
    `top=${top}`,
    "resizable=yes",
    "scrollbars=yes",
  ].join(",");
}

function normalizeEditorRedirectPath(redirectTo: string): string {
  if (redirectTo === "/editor") return "/editor/";
  if (redirectTo.startsWith("/editor?")) return `/editor/${redirectTo.slice("/editor".length)}`;
  if (redirectTo.startsWith("/editor#")) return `/editor/${redirectTo.slice("/editor".length)}`;
  return redirectTo;
}

function resolveOAuthErrorMessage(errorCode: string, t: (key: string) => string): string {
  if (errorCode === "email_not_verified") return t("auth:OAUTH_ERROR_EMAIL_NOT_VERIFIED");
  if (errorCode === "provisioning_disabled") return t("auth:OAUTH_ERROR_PROVISIONING_DISABLED");
  return t("auth:OAUTH_ERROR_GENERIC");
}

function resolveTwoFactorChallengeMeta(error: ApiError): TwoFactorChallengeMeta | null {
  if (error.error !== TWO_FACTOR_REQUIRED_ERROR) return null;
  const meta = (error.meta ?? {}) as {
    two_factor_token?: string;
    expires_in?: number;
    methods?: unknown;
  };
  const twoFactorToken = meta.two_factor_token;
  const expiresIn = meta.expires_in;

  if (!twoFactorToken || typeof expiresIn !== "number" || expiresIn <= 0) {
    return null;
  }

  const methods = Array.isArray(meta.methods)
    ? meta.methods.filter((method): method is string => typeof method === "string")
    : ["totp", "backup_code"];
  return { twoFactorToken, expiresIn, methods };
}

function isChallengeInvalidationError(error: unknown): boolean {
  return (
    error instanceof ApiError && Boolean(error.error && CHALLENGE_INVALID_ERRORS.has(error.error))
  );
}

function isHandledTwoFactorError(error: unknown): error is ApiError {
  return error instanceof ApiError && resolveTwoFactorChallengeMeta(error) !== null;
}

function resolveEmailVerificationMeta(error: ApiError): EmailVerificationMeta | null {
  if (error.error !== EMAIL_NOT_VERIFIED_ERROR) return null;
  const meta = (error.meta ?? {}) as {
    email?: string;
    requires_email_verification?: boolean;
    retry_after?: number;
  };
  const requiresEmailVerification = meta.requires_email_verification;
  const email = typeof meta.email === "string" ? meta.email.trim() : "";
  const retryAfter = meta.retry_after;

  if (!requiresEmailVerification || !email || typeof retryAfter !== "number" || retryAfter < 0) {
    return null;
  }

  return {
    email,
    retryAfter,
  };
}

type LoginPageState = { entry: "auth"; props: LoginViewProps };

type NavigateAfterAuthOptions = {
  invitationAlreadyAccepted?: boolean;
  forceInvitationOnboarding?: boolean;
};

export function useLoginPage(): LoginPageState {
  const applyLogin = useAuthStore((s) => s.applyLogin);
  const lastWorkspaceId = useWorkspaceStore((s) => s.lastWorkspaceId);
  const setCurrentWorkspaceId = useWorkspaceStore((s) => s.setCurrentWorkspaceId);
  const setCurrentProjectId = useWorkspaceStore((s) => s.setCurrentProjectId);
  const setChallenge = useAuthChallengeStore((s) => s.setChallenge);
  const clearChallenge = useAuthChallengeStore((s) => s.clear);
  const challengeTwoFactorToken = useAuthChallengeStore((s) => s.twoFactorToken);
  const challengeExpiresAt = useAuthChallengeStore((s) => s.expiresAt);
  const challengeKeepSession = useAuthChallengeStore((s) => s.keepSession);
  const challengeRedirect = useAuthChallengeStore((s) => s.redirect);
  const challengeSource = useAuthChallengeStore((s) => s.source);
  const challengeMethods = useAuthChallengeStore((s) => s.methods);
  const storedActiveChallenge = getActiveAuthChallenge({
    twoFactorToken: challengeTwoFactorToken,
    expiresAt: challengeExpiresAt,
    keepSession: challengeKeepSession,
    redirect: challengeRedirect,
    source: challengeSource,
    methods: challengeMethods,
  });
  const [pendingChallenge, setPendingChallenge] = useState<AuthChallengeSnapshot | null>(null);
  const activeChallenge =
    pendingChallenge && !isAuthChallengeExpired(pendingChallenge.expiresAt)
      ? pendingChallenge
      : storedActiveChallenge;
  const [loginSeed, setLoginSeed] = useState<LoginPaneSeed | null>(null);
  const [loginEmailCodeSeed, setLoginEmailCodeSeed] = useState<LoginEmailCodePaneSeed | null>(null);
  const [loginVerification, setLoginVerification] = useState<LoginEmailVerificationState | null>(
    null,
  );
  const [registerSeed, setRegisterSeed] = useState<RegisterPaneSeed | null>(null);
  const [registerVerification, setRegisterVerification] =
    useState<RegisterEmailVerificationState | null>(null);
  const [emailVerificationNotice, setEmailVerificationNotice] =
    useState<EmailVerificationNoticeState>({ open: false });
  const handledVerifyTokenRef = useRef<string | null>(null);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState<string | undefined>(undefined);
  const [pendingOAuth, setPendingOAuth] = useState<PendingOAuthState | null>(null);
  const [authTransitionLoading, setAuthTransitionLoading] = useState(false);
  const navigate = useNavigate();
  const { t } = useTranslation();
  const runtime = useProductRuntime();
  const runtimeReady = Boolean(runtime.runtime);

  const {
    redirect: redirectTo,
    invite: inviteToken,
    mode = "login",
    oauth_code: oauthCode,
    oauth_error: oauthError,
    verify_token: verifyToken,
  } = loginRouteApi.useSearch();

  const publicRegisterEnabled = runtime.publicRegisterEnabled !== false;
  const registrationEnabled = publicRegisterEnabled || Boolean(inviteToken);
  const routeMode = registrationEnabled ? mode : resolveLoginMode(mode, false);
  const [optimisticMode, setOptimisticMode] = useState<LoginMode | null>(null);
  const effectiveMode = optimisticMode ?? routeMode;

  useEffect(() => {
    setOptimisticMode(null);
  }, [routeMode]);

  const emailCheckMutation = useMutation({
    mutationFn: async (email: string) => authApi.emailCheck({ email }),
    onError: notifyError,
  });
  const loginMutation = useMutation({
    mutationFn: async (values: LoginFormValues) =>
      authApi.login({ email: values.email, password: values.password }),
    onError: (error) => {
      if (isHandledTwoFactorError(error)) return;
      if (error instanceof ApiError && resolveEmailVerificationMeta(error)) return;
      notifyError(error);
    },
  });
  const loginEmailCodeRequestMutation = useMutation({
    mutationFn: async (email: string) => authApi.requestLoginEmailCode({ email }),
    onError: (error) => {
      if (error instanceof ApiError && resolveEmailVerificationMeta(error)) return;
    },
  });
  const loginEmailCodeVerifyMutation = useMutation({
    mutationFn: async (values: LoginEmailCodeFormValues) =>
      authApi.verifyLoginEmailCode({ email: values.email, code: values.code }),
    onError: (error) => {
      if (isHandledTwoFactorError(error)) return;
    },
  });
  const loginTwoFactorMutation = useMutation({
    mutationFn: async (values: { twoFactorToken: string; code?: string; backupCode?: string }) =>
      authApi.loginTwoFactor(values),
  });
  const loginTwoFactorWebAuthnMutation = useMutation({
    mutationFn: async (twoFactorToken: string) => {
      const begin = await authApi.beginLoginTwoFactorWebAuthn({ twoFactorToken });
      const credential = await verifyProductPasskey(begin.options);
      return authApi.completeLoginTwoFactorWebAuthn({
        twoFactorToken,
        challengeId: begin.options.challengeId,
        credential,
      });
    },
  });
  const registerMutation = useMutation({
    mutationFn: async (values: RegisterFormValues) =>
      authApi.register({
        email: values.email,
        password: values.password,
      }),
    onError: notifyError,
  });
  const invitationPreviewQuery = useQuery({
    queryKey: ["invitePreview", inviteToken],
    enabled: Boolean(inviteToken),
    queryFn: async () => invitationApi.previewInvitation(String(inviteToken)),
    retry: false,
  });
  const invitationRegisterMutation = useMutation({
    mutationFn: async (values: RegisterFormValues) => {
      if (!inviteToken || !values.username) {
        throw new Error("Invitation registration requires a token and username");
      }
      return invitationApi.acceptInvitation({
        token: inviteToken,
        email: values.email,
        username: values.username,
        password: values.password,
        confirmPassword: values.password,
      });
    },
    onError: notifyError,
  });
  const invitationAcceptExistingMutation = useMutation({
    mutationFn: async () => {
      if (!inviteToken) throw new Error("Invitation acceptance requires a token");
      return invitationApi.acceptExistingInvitation(inviteToken);
    },
    onError: notifyError,
  });
  const registerVerificationResendMutation = useMutation({
    mutationFn: async (email: string) => authApi.resendRegistrationEmailVerification({ email }),
    onError: notifyError,
  });
  const registerVerificationConfirmMutation = useMutation({
    mutationFn: async (token: string) => authApi.confirmRegistrationEmailVerification({ token }),
    onError: notifyError,
  });
  const ssoExchangeMutation = useMutation({
    mutationFn: async (code: string) => authSsoApi.exchangeSSOCode(code),
    retry: false,
    meta: { silent: true },
  });
  const forgotPasswordMutation = useMutation({
    mutationFn: async (email: string) => authApi.forgotPassword({ email }),
    onError: notifyError,
  });

  const invitationEmail =
    invitationPreviewQuery.data?.invitation.email?.trim().toLowerCase() || null;

  useEffect(() => {
    if (!invitationEmail) return;
    setLoginSeed({ email: invitationEmail, step: "password" });
    setRegisterSeed({ email: invitationEmail, step: "details" });
  }, [invitationEmail]);

  const navigateAfterAuth = useCallback(
    async (redirectOverride?: string | null, options: NavigateAfterAuthOptions = {}) => {
      setAuthTransitionLoading(true);
      try {
        const decisionBeforeInvitation = await resolvePostAuthRoute({ lastWorkspaceId });
        let decision = decisionBeforeInvitation;
        let targetRedirect = redirectOverride ?? redirectTo;

        if (inviteToken && options.invitationAlreadyAccepted) {
          targetRedirect = decision.projectId ? `/projects/${decision.projectId}` : decision.path;
        }

        if (inviteToken && !options.invitationAlreadyAccepted) {
          const accepted = await invitationAcceptExistingMutation.mutateAsync();
          if (accepted.workspaceId) {
            setCurrentWorkspaceId(accepted.workspaceId);
          }
          if (accepted.projectId) {
            setCurrentProjectId(accepted.projectId);
          }
          targetRedirect = accepted.projectId ? `/projects/${accepted.projectId}` : "/projects";
          decision = await resolvePostAuthRoute({ lastWorkspaceId: accepted.workspaceId ?? null });
          notifySuccessText(t("invite:INVITE_JOIN_SUCCESS"));
        }

        if (decision.workspaceId) {
          setCurrentWorkspaceId(decision.workspaceId);
        }
        if (decision.projectId) {
          setCurrentProjectId(decision.projectId);
        }

        const invitationOnboardingRequired = Boolean(
          inviteToken &&
          (options.forceInvitationOnboarding || decisionBeforeInvitation.onboardingRequired),
        );
        if (invitationOnboardingRequired) {
          await navigate({
            to: "/welcome",
            search: {
              mode: "invitation",
              ...(targetRedirect ? { redirect: targetRedirect } : {}),
            },
            replace: true,
          });
          return;
        }

        if (decision.onboardingRequired) {
          await navigate({
            to: "/welcome",
            search: targetRedirect ? { redirect: targetRedirect } : undefined,
            replace: true,
          });
          return;
        }

        if (targetRedirect) {
          if (targetRedirect.startsWith("/editor")) {
            window.location.replace(normalizeEditorRedirectPath(targetRedirect));
            return;
          }
          await navigate({ to: targetRedirect, replace: true });
          return;
        }

        await navigate({ to: decision.path, replace: true });
      } catch (error) {
        setAuthTransitionLoading(false);
        throw error;
      }
    },
    [
      invitationAcceptExistingMutation,
      inviteToken,
      lastWorkspaceId,
      navigate,
      redirectTo,
      setCurrentProjectId,
      setCurrentWorkspaceId,
      t,
    ],
  );

  const clearPendingOAuthFlow = useCallback(() => {
    setPendingOAuth(null);
    clearPendingOAuthState();
    clearOAuthPopupResult();
  }, []);

  const completePopupOAuth = useCallback(
    async (result: OAuthPopupResult) => {
      const pending = readPendingOAuthState();
      if (pending && pending.provider !== result.provider) {
        clearOAuthPopupResult();
        return;
      }
      clearPendingOAuthFlow();
      if (result.challenge) {
        setChallenge({
          twoFactorToken: result.challenge.twoFactorToken,
          expiresAt: result.challenge.expiresAt,
          keepSession: result.challenge.keepSession,
          redirect: result.challenge.redirect,
          source: "sso",
          methods: result.challenge.methods ?? ["totp", "backup_code"],
        });
        return;
      }
      await useAuthStore.persist.rehydrate();
      if (result.status === "success") {
        useAuthStore.setState((state) => ({
          sessionVersion: state.sessionVersion + 1,
        }));
        await navigateAfterAuth(result.redirect);
        return;
      }
      if (result.status === "closed") {
        return;
      }
      if (result.status === "error") {
        notifyErrorText(resolveOAuthErrorMessage(result.error || "oauth_failed", t));
      }
    },
    [clearPendingOAuthFlow, navigateAfterAuth, t],
  );

  const startOAuthPopup = useCallback(
    ({
      provider,
      startUrl,
      keepSession,
    }: {
      provider: string;
      startUrl: string;
      keepSession: boolean;
    }) => {
      const nextPending: PendingOAuthState = {
        provider,
        redirect: redirectTo ?? null,
        keepSession,
        startedAt: Date.now(),
        popupId: crypto.randomUUID(),
      };
      writePendingOAuthState(nextPending);
      setPendingOAuth(nextPending);
      clearOAuthPopupResult();
      const popup = window.open(
        "about:blank",
        `arclayer-auth-oauth:${nextPending.popupId}`,
        resolvePopupFeatures(),
      );
      if (!popup) {
        clearPendingOAuthFlow();
        notifyErrorText(t("auth:OAUTH_ERROR_GENERIC"));
        return;
      }
      try {
        popup.sessionStorage.setItem(STORAGE_KEYS.authPendingOauth, JSON.stringify(nextPending));
        popup.location.assign(startUrl);
      } catch {
        popup.close();
        clearPendingOAuthFlow();
        notifyErrorText(t("auth:OAUTH_ERROR_GENERIC"));
        return;
      }

      const closedCheck = window.setInterval(() => {
        if (!popup.closed) return;
        window.clearInterval(closedCheck);
        const latestPending = readPendingOAuthState();
        if (!latestPending || latestPending.provider !== provider) return;
        clearPendingOAuthFlow();
      }, 400);
    },
    [clearPendingOAuthFlow, redirectTo, t],
  );

  const startTwoFactorChallenge = useCallback(
    (
      error: unknown,
      options: {
        keepSession: boolean;
        redirect?: string | null;
        source: AuthChallengeSource;
      },
    ) => {
      if (!(error instanceof ApiError)) return false;
      const challengeMeta = resolveTwoFactorChallengeMeta(error);
      if (!challengeMeta) return false;
      const challenge = {
        twoFactorToken: challengeMeta.twoFactorToken,
        expiresAt: Date.now() + challengeMeta.expiresIn * 1000,
        keepSession: options.keepSession,
        redirect: options.redirect ?? null,
        source: options.source,
        methods: challengeMeta.methods,
      } satisfies AuthChallengeSnapshot;
      setChallenge(challenge);
      setPendingChallenge(challenge);
      return true;
    },
    [setChallenge],
  );

  const startEmailVerificationState = useCallback(
    (error: unknown) => {
      if (!(error instanceof ApiError)) return false;
      const verificationMeta = resolveEmailVerificationMeta(error);
      if (!verificationMeta) return false;

      setLoginVerification(verificationMeta);
      setLoginSeed({ email: verificationMeta.email, step: "password" });
      setLoginEmailCodeSeed(null);
      setRegisterVerification(null);
      setRegisterSeed(null);
      setForgotPasswordEmail(undefined);
      setOptimisticMode("login");
      void navigate({
        to: "/login",
        search: {
          ...(redirectTo ? { redirect: redirectTo } : {}),
          ...(inviteToken ? { invite: inviteToken } : {}),
          mode: "login",
        },
        replace: true,
      });
      return true;
    },
    [inviteToken, navigate, redirectTo],
  );

  const clearActiveChallenge = useCallback(() => {
    setPendingChallenge(null);
    clearChallenge();
  }, [clearChallenge]);

  useEffect(() => {
    if (!isAuthChallengeExpired(challengeExpiresAt)) return;
    if (!challengeTwoFactorToken) return;
    clearActiveChallenge();
  }, [challengeExpiresAt, challengeTwoFactorToken, clearActiveChallenge]);

  useEffect(() => {
    const currentPending = readPendingOAuthState();
    if (isPopupWindow()) {
      if (currentPending && !isPendingOAuthStateFresh(currentPending)) {
        clearPendingOAuthFlow();
      }
      return;
    }
    if (!currentPending) return;
    clearPendingOAuthState();
  }, [clearPendingOAuthFlow]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEYS.authOauthResult) {
        const result = readOAuthPopupResult();
        if (!result) return;
        void completePopupOAuth(result);
      }
    };

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [completePopupOAuth]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const rawRedirect = params.get("redirect");
    if (!rawRedirect) return;
    if (!redirectTo) {
      void navigate({
        to: "/login",
        search: {
          ...(inviteToken ? { invite: inviteToken } : {}),
          mode: effectiveMode,
        },
        replace: true,
      });
    }
  }, [effectiveMode, inviteToken, navigate, redirectTo]);

  useEffect(() => {
    if (registrationEnabled) return;
    if (mode !== "register") return;
    setRegisterSeed(null);
    void navigate({
      to: "/login",
      search: {
        ...(redirectTo ? { redirect: redirectTo } : {}),
        ...(inviteToken ? { invite: inviteToken } : {}),
        mode: "login",
      },
      replace: true,
    });
  }, [inviteToken, mode, navigate, redirectTo, registrationEnabled]);

  useEffect(() => {
    if (!oauthCode) return;
    if (!shouldHandleOAuthSearchFlag("oauth_code", oauthCode)) return;
    consumeLoginSearchFlag("oauth_code", oauthCode);
    const run = async () => {
      try {
        const activePending = readPopupPendingOAuthState() ?? readPendingOAuthState();
        const keepSessionForSso = true;
        const tokens = await ssoExchangeMutation.mutateAsync(oauthCode);
        clearActiveChallenge();
        applyLogin(tokens, { keepSession: keepSessionForSso });
        void queryClient.cancelQueries();
        queryClient.clear();
        if (isPopupWindow()) {
          window.sessionStorage.removeItem(STORAGE_KEYS.authPendingOauth);
          writeOAuthPopupResult({
            provider: activePending?.provider ?? "unknown",
            status: "success",
            redirect: activePending?.redirect ?? redirectTo ?? null,
            completedAt: Date.now(),
          });
          window.close();
          return;
        }
        clearPendingOAuthFlow();
        await navigateAfterAuth();
      } catch (error) {
        const activePending = readPopupPendingOAuthState() ?? readPendingOAuthState();
        const keepSessionForSso = true;
        if (
          startTwoFactorChallenge(error, {
            keepSession: keepSessionForSso,
            redirect: redirectTo,
            source: "sso",
          })
        ) {
          if (isPopupWindow()) {
            const challenge = getActiveAuthChallenge(useAuthChallengeStore.getState());
            window.sessionStorage.removeItem(STORAGE_KEYS.authPendingOauth);
            writeOAuthPopupResult({
              provider: activePending?.provider ?? "unknown",
              status: "success",
              redirect: activePending?.redirect ?? redirectTo ?? null,
              challenge: challenge
                ? {
                    twoFactorToken: challenge.twoFactorToken,
                    expiresAt: challenge.expiresAt,
                    keepSession: challenge.keepSession,
                    redirect: challenge.redirect,
                  }
                : undefined,
              completedAt: Date.now(),
            });
            window.close();
          }
          return;
        }
        if (isPopupWindow()) {
          window.sessionStorage.removeItem(STORAGE_KEYS.authPendingOauth);
          writeOAuthPopupResult({
            provider: activePending?.provider ?? "unknown",
            status: "error",
            redirect: activePending?.redirect ?? redirectTo ?? null,
            error: error instanceof ApiError ? (error.error ?? "oauth_failed") : "oauth_failed",
            completedAt: Date.now(),
          });
          window.close();
          return;
        }
        clearPendingOAuthFlow();
        notifyError(error);
        void navigate({
          to: "/login",
          search: {
            ...(redirectTo ? { redirect: redirectTo } : {}),
            ...(inviteToken ? { invite: inviteToken } : {}),
            mode: effectiveMode,
          },
          replace: true,
        });
      }
    };
    void run();
  }, [
    applyLogin,
    clearActiveChallenge,
    effectiveMode,
    inviteToken,
    navigate,
    oauthCode,
    redirectTo,
    navigateAfterAuth,
    ssoExchangeMutation,
    startTwoFactorChallenge,
    clearPendingOAuthFlow,
  ]);

  useEffect(() => {
    if (!oauthError) return;
    if (!shouldHandleOAuthSearchFlag("oauth_error", oauthError)) return;
    consumeLoginSearchFlag("oauth_error", oauthError);
    const activePending = readPopupPendingOAuthState() ?? readPendingOAuthState();
    if (isPopupWindow()) {
      window.sessionStorage.removeItem(STORAGE_KEYS.authPendingOauth);
      writeOAuthPopupResult({
        provider: activePending?.provider ?? "unknown",
        status: "error",
        redirect: activePending?.redirect ?? redirectTo ?? null,
        error: oauthError,
        completedAt: Date.now(),
      });
      window.close();
      return;
    }
    clearPendingOAuthFlow();
    notifyErrorText(resolveOAuthErrorMessage(oauthError, t));
    void navigate({
      to: "/login",
      search: {
        ...(redirectTo ? { redirect: redirectTo } : {}),
        ...(inviteToken ? { invite: inviteToken } : {}),
        mode: effectiveMode,
      },
      replace: true,
    });
  }, [clearPendingOAuthFlow, effectiveMode, inviteToken, navigate, oauthError, redirectTo, t]);

  useEffect(() => {
    if (!verifyToken) return;
    if (handledVerifyTokenRef.current === verifyToken) return;
    handledVerifyTokenRef.current = verifyToken;
    const run = async () => {
      try {
        const result = await registerVerificationConfirmMutation.mutateAsync(verifyToken);
        setRegisterVerification(null);
        setRegisterSeed(null);
        void navigate({
          to: "/login",
          search: {
            ...(redirectTo ? { redirect: redirectTo } : {}),
            ...(inviteToken ? { invite: inviteToken } : {}),
            mode: "login",
          },
          replace: true,
        });
        setLoginSeed({ email: result.email, step: "password" });
        setLoginVerification(null);
        setEmailVerificationNotice({ open: true, email: result.email });
      } catch {
        void navigate({
          to: "/login",
          search: {
            ...(redirectTo ? { redirect: redirectTo } : {}),
            ...(inviteToken ? { invite: inviteToken } : {}),
            mode: "register",
          },
          replace: true,
        });
      }
    };
    void run();
  }, [
    inviteToken,
    navigate,
    redirectTo,
    registerVerificationConfirmMutation.mutateAsync,
    t,
    verifyToken,
  ]);

  const onModeChange = (next: LoginMode, options?: LoginModeChangeOptions) => {
    const nextMode = resolveLoginMode(next, registrationEnabled);

    setOptimisticMode(nextMode);
    setLoginSeed(
      nextMode === "login" && options?.email
        ? {
            email: options.email,
            step: options.step === "password" ? "password" : "email",
          }
        : null,
    );
    setLoginEmailCodeSeed(
      nextMode === "email-code" && options?.email
        ? {
            email: options.email,
            autoRequest: options.step === "verify",
            keepSession: true,
            passwordLoginAvailable: options.passwordLoginAvailable,
          }
        : null,
    );
    setRegisterSeed(
      nextMode === "register" && options?.email
        ? {
            email: options.email,
            step: options.step === "details" ? "details" : "email",
          }
        : null,
    );
    setForgotPasswordEmail(
      nextMode === "forgot-password" ? options?.email?.trim() || undefined : undefined,
    );
    if (nextMode !== "register") {
      setRegisterVerification(null);
    }
    setLoginVerification(null);

    void navigate({
      to: "/login",
      search: {
        ...(redirectTo ? { redirect: redirectTo } : {}),
        ...(inviteToken ? { invite: inviteToken } : {}),
        mode: nextMode,
      },
    });
  };

  const onLoginEmailSubmit = async (email: string): Promise<LoginEmailLookupResult> => {
    const result = await emailCheckMutation.mutateAsync(email);
    return {
      exists: result.exists,
      passwordLoginAvailable: result.passwordLoginAvailable,
    };
  };

  const onRegisterEmailSubmit = async (email: string) => {
    if (invitationEmail && email.trim().toLowerCase() === invitationEmail) return false;
    const result = await emailCheckMutation.mutateAsync(email);
    return result.exists;
  };

  const onLoginFinish = async (values: LoginFormValues) => {
    try {
      const tokens = await loginMutation.mutateAsync(values);
      clearActiveChallenge();
      applyLogin(tokens, { keepSession: true });
      void queryClient.cancelQueries();
      queryClient.clear();
      notifySuccessText(t("auth:LOGIN_SUCCESS"));
      await navigateAfterAuth();
    } catch (error) {
      if (
        startTwoFactorChallenge(error, {
          keepSession: true,
          redirect: redirectTo,
          source: "password",
        })
      ) {
        return;
      }
      if (startEmailVerificationState(error)) {
        return;
      }
    }
  };

  const onLoginEmailCodeRequest = async (email: string) => {
    try {
      return await loginEmailCodeRequestMutation.mutateAsync(email);
    } catch (error) {
      if (startEmailVerificationState(error)) {
        throw new Error(LOGIN_EMAIL_VERIFICATION_STATE_STARTED);
      }
      throw error;
    }
  };

  const onLoginEmailCodeFinish = async (values: LoginEmailCodeFormValues) => {
    const keepSessionForEmailCode = true;

    try {
      const tokens = await loginEmailCodeVerifyMutation.mutateAsync(values);
      clearActiveChallenge();
      applyLogin(tokens, { keepSession: keepSessionForEmailCode });
      void queryClient.cancelQueries();
      queryClient.clear();
      notifySuccessText(t("auth:LOGIN_SUCCESS"));
      await navigateAfterAuth();
    } catch (error) {
      if (
        startTwoFactorChallenge(error, {
          keepSession: keepSessionForEmailCode,
          redirect: redirectTo,
          source: "email-code",
        })
      ) {
        return;
      }
      throw error;
    }
  };

  const onLoginTwoFactorFinish = async (values: LoginTwoFactorFormValues) => {
    if (!activeChallenge) {
      clearActiveChallenge();
      notifyErrorText(t("auth:TWO_FACTOR_CHALLENGE_EXPIRED"));
      return;
    }

    try {
      const tokens = await loginTwoFactorMutation.mutateAsync({
        twoFactorToken: activeChallenge.twoFactorToken,
        ...(values.code ? { code: values.code } : {}),
        ...(values.backupCode ? { backupCode: values.backupCode } : {}),
      });
      clearActiveChallenge();
      applyLogin(tokens, { keepSession: activeChallenge.keepSession });
      void queryClient.cancelQueries();
      queryClient.clear();
      notifySuccessText(t("auth:LOGIN_SUCCESS"));
      await navigateAfterAuth(activeChallenge.redirect);
    } catch (error) {
      if (isChallengeInvalidationError(error)) {
        clearActiveChallenge();
        return;
      }
      notifyError(error);
    }
  };

  const onLoginTwoFactorPasskey = async () => {
    if (!activeChallenge) {
      clearActiveChallenge();
      notifyErrorText(t("auth:TWO_FACTOR_CHALLENGE_EXPIRED"));
      return;
    }
    try {
      const tokens = await loginTwoFactorWebAuthnMutation.mutateAsync(
        activeChallenge.twoFactorToken,
      );
      clearActiveChallenge();
      applyLogin(tokens, { keepSession: activeChallenge.keepSession });
      void queryClient.cancelQueries();
      queryClient.clear();
      notifySuccessText(t("auth:LOGIN_SUCCESS"));
      await navigateAfterAuth(activeChallenge.redirect);
    } catch (error) {
      if (isChallengeInvalidationError(error)) {
        clearActiveChallenge();
        return;
      }
      notifyError(error);
    }
  };

  const onCancelTwoFactorChallenge = () => {
    const nextMode = activeChallenge?.source === "email-code" ? "email-code" : "login";
    clearActiveChallenge();
    void navigate({
      to: "/login",
      search: {
        ...(redirectTo ? { redirect: redirectTo } : {}),
        ...(inviteToken ? { invite: inviteToken } : {}),
        mode: nextMode,
      },
      replace: true,
    });
  };

  const onForgotPassword = async (email: string) => {
    await forgotPasswordMutation.mutateAsync(email);
    notifyInfoText(t("auth:RESET_SENT"));
  };

  const onRegisterFinish = async (values: RegisterFormValues) => {
    if (!registrationEnabled) return;
    try {
      if (inviteToken) {
        const tokens = await invitationRegisterMutation.mutateAsync(values);
        clearActiveChallenge();
        applyLogin(tokens, { keepSession: true });
        void queryClient.cancelQueries();
        queryClient.clear();
        notifySuccessText(t("auth:REGISTER_SUCCESS"));
        await navigateAfterAuth(undefined, {
          invitationAlreadyAccepted: true,
          forceInvitationOnboarding: true,
        });
        return;
      }
      const result = await registerMutation.mutateAsync(values);
      if (result.requiresEmailVerification) {
        const retryAfter = result.retryAfter;
        if (typeof retryAfter !== "number" || retryAfter <= 0) {
          throw new Error("Registration verification response is missing retryAfter");
        }
        setRegisterVerification({
          email: values.email,
          retryAfter,
        });
        notifyInfoText(t("auth:REGISTER_VERIFY_EMAIL_SENT"));
        return;
      }
      const tokens = await loginMutation.mutateAsync({
        email: values.email,
        password: values.password,
        keepSession: true,
      });
      clearActiveChallenge();
      applyLogin(tokens, { keepSession: true });
      void queryClient.cancelQueries();
      queryClient.clear();
      notifySuccessText(t("auth:REGISTER_SUCCESS"));
      await navigateAfterAuth();
    } catch (error) {
      if (
        startTwoFactorChallenge(error, {
          keepSession: true,
          redirect: redirectTo,
          source: "password",
        })
      ) {
        return;
      }
    }
  };

  const onRegisterVerificationResend = async (email: string) => {
    const result = await registerVerificationResendMutation.mutateAsync(email);
    const retryAfter = result.retryAfter;
    if (typeof retryAfter !== "number" || retryAfter <= 0) {
      throw new Error("Registration resend response is missing retryAfter");
    }
    setRegisterVerification({
      email,
      retryAfter,
    });
    notifyInfoText(t("auth:REGISTER_VERIFY_EMAIL_SENT"));
    return {
      retryAfter,
    };
  };

  const onLoginVerificationResend = async (email: string) => {
    const result = await registerVerificationResendMutation.mutateAsync(email);
    const retryAfter = result.retryAfter;
    if (typeof retryAfter !== "number" || retryAfter <= 0) {
      throw new Error("Login verification response is missing retryAfter");
    }
    setLoginVerification({
      email,
      retryAfter,
    });
    notifyInfoText(t("auth:REGISTER_VERIFY_EMAIL_SENT"));
    return {
      retryAfter,
    };
  };

  const runtimeLoading = !runtimeReady;

  return {
    entry: "auth",
    props: {
      mode: effectiveMode,
      onModeChange,
      onLoginEmailSubmit,
      onLoginSubmit: onLoginFinish,
      onLoginVerificationResend,
      loginVerification,
      loginSeed,
      onLoginEmailCodeRequest,
      onLoginEmailCodeVerify: onLoginEmailCodeFinish,
      loginEmailCodeSeed,
      loginEmailLoading: emailCheckMutation.isPending,
      loginLoading:
        loginMutation.isPending ||
        ssoExchangeMutation.isPending ||
        invitationAcceptExistingMutation.isPending,
      loginResendLoading: registerVerificationResendMutation.isPending,
      loginEmailCodeRequestLoading: loginEmailCodeRequestMutation.isPending,
      loginEmailCodeVerifyLoading: loginEmailCodeVerifyMutation.isPending,
      redirect: redirectTo,
      pendingOAuthProvider: pendingOAuth?.provider ?? null,
      onStartOAuth: startOAuthPopup,
      onForgotPasswordSubmit: onForgotPassword,
      forgotPasswordInitialEmail: forgotPasswordEmail,
      forgotPasswordLoading: forgotPasswordMutation.isPending,
      authTransitionLoading,
      onRegisterEmailSubmit,
      onRegisterSubmit: onRegisterFinish,
      onRegisterVerificationResend,
      registerVerification,
      emailVerificationNotice,
      onEmailVerificationNoticeOpenChange: (open: boolean) =>
        setEmailVerificationNotice((current) => ({ ...current, open })),
      registerSeed,
      registerEmailLoading: emailCheckMutation.isPending,
      registerLoading:
        registerMutation.isPending ||
        invitationRegisterMutation.isPending ||
        loginMutation.isPending ||
        runtimeLoading,
      registerResendLoading: registerVerificationResendMutation.isPending,
      publicRegisterEnabled: registrationEnabled,
      invitationRegistration: Boolean(inviteToken),
      invitationEmail,
      challenge: activeChallenge,
      onLoginTwoFactorSubmit: onLoginTwoFactorFinish,
      onLoginTwoFactorPasskey,
      onCancelTwoFactorChallenge,
      twoFactorLoading:
        loginTwoFactorMutation.isPending || loginTwoFactorWebAuthnMutation.isPending,
    },
  };
}
