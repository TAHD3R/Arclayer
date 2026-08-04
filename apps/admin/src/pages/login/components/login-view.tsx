import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, MotionConfig, motion, type Variants } from "motion/react";
import { useTranslation } from "react-i18next";

import { listSSOProviders } from "@/api/auth-sso";
import { SceneLoadingOverlay } from "@/components/layout/scene-loading-overlay";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import type { LoginMode } from "@/lib/auth/auth-mode";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@arclayer/ui/alert-dialog";

import type { LoginViewProps } from "../types";
import { ForgotPasswordPane } from "./forgot-password-pane";
import { LoginEmailCodePane } from "./login-email-code-pane";
import { LoginMethodPane } from "./login-method-pane";
import { LoginPane } from "./login-pane";
import { LoginTwoFactorPane } from "./login-two-factor-pane";
import { RegisterPane } from "./register-pane";

type LoginViewPane = LoginMode | "methods" | "two-factor";

export function LoginView({
  mode,
  onModeChange,
  onLoginEmailSubmit,
  onLoginSubmit,
  onLoginVerificationResend,
  loginVerification,
  loginSeed,
  onLoginEmailCodeRequest,
  onLoginEmailCodeVerify,
  loginEmailCodeSeed,
  loginEmailLoading = false,
  loginLoading = false,
  loginResendLoading = false,
  loginEmailCodeRequestLoading = false,
  loginEmailCodeVerifyLoading = false,
  redirect,
  pendingOAuthProvider = null,
  onStartOAuth,
  onForgotPasswordSubmit,
  forgotPasswordInitialEmail,
  forgotPasswordLoading = false,
  authTransitionLoading = false,
  onRegisterEmailSubmit,
  onRegisterSubmit,
  onRegisterVerificationResend,
  registerVerification,
  emailVerificationNotice,
  onEmailVerificationNoticeOpenChange,
  registerSeed,
  registerEmailLoading = false,
  registerLoading = false,
  registerResendLoading = false,
  publicRegisterEnabled = true,
  invitationRegistration = false,
  invitationEmail = null,
  challenge,
  onLoginTwoFactorSubmit,
  onLoginTwoFactorPasskey,
  onCancelTwoFactorChallenge,
  twoFactorLoading = false,
}: LoginViewProps) {
  const { t } = useTranslation();
  const reducedMotion = usePrefersReducedMotion();
  const resolvedMode: LoginMode = publicRegisterEnabled
    ? mode
    : mode === "register"
      ? "login"
      : mode;
  const baseMethodSelectionAvailable = !loginSeed && !loginVerification && !invitationEmail;
  const oauthDiscoveryEnabled =
    resolvedMode === "login" && baseMethodSelectionAvailable && !challenge;
  const oauthProvidersQuery = useQuery({
    queryKey: ["auth", "sso", "providers", redirect],
    queryFn: async () => listSSOProviders({ redirect }),
    enabled: oauthDiscoveryEnabled,
    staleTime: 15 * 1000,
    retry: false,
  });
  const methodSelectionAvailable =
    baseMethodSelectionAvailable && (oauthProvidersQuery.data?.providers.length ?? 0) > 0;
  const oauthDiscoveryPending = oauthDiscoveryEnabled && oauthProvidersQuery.isPending;
  const oauthDiscoveryFailed = oauthDiscoveryEnabled && oauthProvidersQuery.isError;
  const [loginEntryPane, setLoginEntryPane] = useState<"methods" | "password">(() =>
    mode === "login" && baseMethodSelectionAvailable ? "methods" : "password",
  );
  const previousResolvedModeRef = useRef<LoginMode>(resolvedMode);

  useEffect(() => {
    const previousResolvedMode = previousResolvedModeRef.current;

    if (challenge || !baseMethodSelectionAvailable) {
      setLoginEntryPane("password");
    } else if (resolvedMode === "login" && previousResolvedMode !== "login") {
      setLoginEntryPane("methods");
    }

    previousResolvedModeRef.current = resolvedMode;
  }, [baseMethodSelectionAvailable, challenge, resolvedMode]);

  const currentPane: LoginViewPane = challenge
    ? "two-factor"
    : resolvedMode === "login" && methodSelectionAvailable && loginEntryPane === "methods"
      ? "methods"
      : resolvedMode;
  const prevPaneRef = useRef<LoginViewPane>(currentPane);

  const direction =
    currentPane === prevPaneRef.current
      ? 0
      : currentPane === "login" && prevPaneRef.current === "methods"
        ? 1
        : currentPane === "methods" && prevPaneRef.current === "login"
          ? -1
          : currentPane === "register" && prevPaneRef.current === "login"
            ? 1
            : -1;

  const enterOffsetX = direction > 0 ? 8 : direction < 0 ? -8 : 0;
  const exitOffsetX = direction > 0 ? -8 : direction < 0 ? 8 : 0;

  useEffect(() => {
    prevPaneRef.current = currentPane;
  }, [currentPane]);

  const transition = reducedMotion
    ? ({ duration: 0 } as const)
    : ({ duration: 0.18, ease: [0.2, 0, 0, 1] as const } as const);

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 8 },
    show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" } },
    exit: { opacity: 0, y: -4, transition: { duration: 0.12 } },
  };

  return (
    <div className="w-full">
      <SceneLoadingOverlay visible={authTransitionLoading || oauthDiscoveryPending} />
      <AlertDialog
        open={Boolean(emailVerificationNotice?.open)}
        onOpenChange={onEmailVerificationNoticeOpenChange}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("auth:REGISTER_VERIFY_EMAIL_NOTICE_TITLE")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("auth:REGISTER_VERIFY_EMAIL_NOTICE_DESC")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction>{t("auth:REGISTER_VERIFY_EMAIL_NOTICE_ACTION")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <div className="grid gap-10 lg:gap-12">
        <MotionConfig transition={transition}>
          <div className="relative">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentPane}
                initial="hidden"
                animate="show"
                exit="exit"
                variants={{
                  hidden: reducedMotion ? { opacity: 1 } : { opacity: 0, x: enterOffsetX },
                  show: reducedMotion
                    ? { opacity: 1 }
                    : {
                        opacity: 1,
                        x: 0,
                        transition: {
                          staggerChildren: 0.05,
                          delayChildren: 0.02,
                        },
                      },
                  exit: reducedMotion ? { opacity: 1 } : { opacity: 0, x: exitOffsetX },
                }}
              >
                {currentPane === "two-factor" && challenge ? (
                  <LoginTwoFactorPane
                    challenge={challenge}
                    loading={twoFactorLoading}
                    onSubmit={onLoginTwoFactorSubmit}
                    onPasskeySubmit={() => void onLoginTwoFactorPasskey?.()}
                    onBackToLogin={onCancelTwoFactorChallenge}
                    reducedMotion={reducedMotion}
                    itemVariants={itemVariants}
                  />
                ) : currentPane === "methods" ? (
                  <LoginMethodPane
                    disabled={Boolean(pendingOAuthProvider)}
                    redirect={redirect}
                    pendingOAuthProvider={pendingOAuthProvider}
                    onStartOAuth={onStartOAuth}
                    onContinueWithEmail={() => setLoginEntryPane("password")}
                    reducedMotion={reducedMotion}
                    itemVariants={itemVariants}
                  />
                ) : currentPane === "login" ? (
                  <LoginPane
                    onEmailSubmit={onLoginEmailSubmit}
                    onSubmit={onLoginSubmit}
                    onVerificationResend={onLoginVerificationResend}
                    verification={loginVerification}
                    emailCheckLoading={loginEmailLoading}
                    loading={loginLoading}
                    resendLoading={loginResendLoading}
                    loginSeed={loginSeed}
                    emailLocked={Boolean(invitationEmail)}
                    onForgotPassword={(email) => onModeChange("forgot-password", { email })}
                    onSwitchToEmailCode={(email, _keepSession, passwordLoginAvailable) =>
                      onModeChange("email-code", {
                        email,
                        step: "verify",
                        keepSession: true,
                        passwordLoginAvailable,
                      })
                    }
                    onSwitchToRegister={(email, step) => onModeChange("register", { email, step })}
                    onBackToMethods={
                      methodSelectionAvailable ? () => setLoginEntryPane("methods") : undefined
                    }
                    oauthUnavailable={oauthDiscoveryFailed}
                    publicRegisterEnabled={publicRegisterEnabled}
                    reducedMotion={reducedMotion}
                    itemVariants={itemVariants}
                  />
                ) : currentPane === "email-code" ? (
                  <LoginEmailCodePane
                    seed={loginEmailCodeSeed}
                    requestLoading={loginEmailCodeRequestLoading ?? false}
                    verifyLoading={loginEmailCodeVerifyLoading ?? false}
                    onRequestCode={onLoginEmailCodeRequest}
                    onSubmit={onLoginEmailCodeVerify}
                    onBackToPassword={(email) =>
                      onModeChange("login", {
                        email,
                        step: "password",
                        keepSession: true,
                        passwordLoginAvailable: loginEmailCodeSeed?.passwordLoginAvailable,
                      })
                    }
                    reducedMotion={reducedMotion}
                    itemVariants={itemVariants}
                  />
                ) : currentPane === "register" ? (
                  <RegisterPane
                    onEmailSubmit={onRegisterEmailSubmit}
                    onSubmit={onRegisterSubmit}
                    onVerificationResend={onRegisterVerificationResend}
                    verification={registerVerification}
                    emailCheckLoading={registerEmailLoading}
                    loading={registerLoading}
                    resendLoading={registerResendLoading}
                    registerSeed={registerSeed}
                    invitationRegistration={invitationRegistration}
                    emailLocked={Boolean(invitationEmail)}
                    redirect={redirect}
                    pendingOAuthProvider={pendingOAuthProvider}
                    onStartOAuth={onStartOAuth}
                    onSwitchToLogin={(email, step) => onModeChange("login", { email, step })}
                    reducedMotion={reducedMotion}
                    itemVariants={itemVariants}
                  />
                ) : (
                  <ForgotPasswordPane
                    onSubmit={onForgotPasswordSubmit}
                    initialEmail={forgotPasswordInitialEmail}
                    loading={forgotPasswordLoading}
                    onBackToLogin={() => onModeChange("login")}
                    reducedMotion={reducedMotion}
                    itemVariants={itemVariants}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </MotionConfig>
      </div>
    </div>
  );
}
