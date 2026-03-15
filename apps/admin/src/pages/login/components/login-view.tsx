import { useEffect, useRef } from "react";
import { AnimatePresence, MotionConfig, motion, type Variants } from "motion/react";

import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import type { LoginMode } from "@/lib/auth/auth-mode";

import type { LoginViewProps } from "../types";
import { ForgotPasswordPane } from "./forgot-password-pane";
import { LoginPane } from "./login-pane";
import { LoginTwoFactorPane } from "./login-two-factor-pane";
import { RegisterPane } from "./register-pane";

type LoginViewPane = LoginMode | "two-factor";

export function LoginView({
  mode,
  onModeChange,
  onLoginSubmit,
  loginLoading = false,
  initialKeepSession = false,
  redirect,
  onForgotPasswordSubmit,
  forgotPasswordLoading = false,
  onRegisterSubmit,
  registerLoading = false,
  publicRegisterEnabled = true,
  challenge,
  onLoginTwoFactorSubmit,
  onCancelTwoFactorChallenge,
  twoFactorLoading = false,
}: LoginViewProps) {
  const reducedMotion = usePrefersReducedMotion();
  const resolvedMode: LoginMode = publicRegisterEnabled
    ? mode
    : mode === "register"
      ? "login"
      : mode;
  const currentPane: LoginViewPane = challenge ? "two-factor" : resolvedMode;
  const prevPaneRef = useRef<LoginViewPane>(currentPane);

  const direction =
    currentPane === prevPaneRef.current
      ? 0
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
                      transition: { staggerChildren: 0.05, delayChildren: 0.02 },
                    },
                exit: reducedMotion ? { opacity: 1 } : { opacity: 0, x: exitOffsetX },
              }}
            >
              {currentPane === "two-factor" && challenge ? (
                <LoginTwoFactorPane
                  challenge={challenge}
                  loading={twoFactorLoading}
                  onSubmit={onLoginTwoFactorSubmit}
                  onBackToLogin={onCancelTwoFactorChallenge}
                  reducedMotion={reducedMotion}
                  itemVariants={itemVariants}
                />
              ) : currentPane === "login" ? (
                <LoginPane
                  onSubmit={onLoginSubmit}
                  loading={loginLoading}
                  initialKeepSession={initialKeepSession}
                  redirect={redirect}
                  onForgotPassword={() => onModeChange("forgot-password")}
                  onSwitchToRegister={() => onModeChange("register")}
                  publicRegisterEnabled={publicRegisterEnabled}
                  reducedMotion={reducedMotion}
                  itemVariants={itemVariants}
                />
              ) : currentPane === "register" ? (
                <RegisterPane
                  onSubmit={onRegisterSubmit}
                  loading={registerLoading}
                  redirect={redirect}
                  onSwitchToLogin={() => onModeChange("login")}
                  reducedMotion={reducedMotion}
                  itemVariants={itemVariants}
                />
              ) : (
                <ForgotPasswordPane
                  onSubmit={onForgotPasswordSubmit}
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
  );
}
