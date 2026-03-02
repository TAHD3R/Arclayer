import { useEffect, useRef, useState } from "react";
import { AnimatePresence, MotionConfig, motion, type Variants } from "motion/react";

import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { useAuthLegalKey } from "@/layouts/auth-layout";
import type { LoginMode } from "@/lib/auth/auth-mode";

import type { LoginViewProps } from "../types";
import { ForgotPasswordDialog } from "./forgot-password-dialog";
import { LoginPane } from "./login-pane";
import { RegisterPane } from "./register-pane";

export function LoginView({
  mode,
  onModeChange,
  onLoginSubmit,
  loginLoading = false,
  initialKeepSession = false,
  redirect,
  onForgotPassword,
  onRegisterSubmit,
  registerLoading = false,
  publicRegisterEnabled = true,
}: LoginViewProps) {
  const reducedMotion = usePrefersReducedMotion();
  const prevModeRef = useRef<LoginMode>(mode);
  const [forgotOpen, setForgotOpen] = useState(false);

  const direction =
    mode === prevModeRef.current
      ? 0
      : mode === "register" && prevModeRef.current === "login"
        ? 1
        : -1;

  const enterOffsetX = direction > 0 ? 8 : direction < 0 ? -8 : 0;
  const exitOffsetX = direction > 0 ? -8 : direction < 0 ? 8 : 0;

  useEffect(() => {
    prevModeRef.current = mode;
  }, [mode]);

  const transition = reducedMotion
    ? ({ duration: 0 } as const)
    : ({ duration: 0.18, ease: [0.2, 0, 0, 1] as const } as const);

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 8 },
    show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" } },
    exit: { opacity: 0, y: -4, transition: { duration: 0.12 } },
  };

  const resolvedMode: LoginMode = publicRegisterEnabled ? mode : "login";

  const { setLegalKey } = useAuthLegalKey();
  useEffect(() => {
    setLegalKey(resolvedMode === "register" ? "auth:LEGAL_REGISTER" : "auth:LEGAL_LOGIN");
  }, [resolvedMode, setLegalKey]);

  return (
    <div className="w-full">
      <ForgotPasswordDialog
        open={forgotOpen}
        onOpenChange={setForgotOpen}
        onSubmit={onForgotPassword}
        reducedMotion={reducedMotion}
        itemVariants={itemVariants}
      />

      <MotionConfig transition={transition}>
        <div className="relative">
          <AnimatePresence mode="wait">
            <motion.div
              key={resolvedMode}
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
              {resolvedMode === "login" ? (
                <LoginPane
                  onSubmit={onLoginSubmit}
                  loading={loginLoading}
                  initialKeepSession={initialKeepSession}
                  redirect={redirect}
                  onForgotPassword={() => setForgotOpen(true)}
                  onSwitchToRegister={() => onModeChange("register")}
                  publicRegisterEnabled={publicRegisterEnabled}
                  reducedMotion={reducedMotion}
                  itemVariants={itemVariants}
                />
              ) : (
                <RegisterPane
                  onSubmit={onRegisterSubmit}
                  loading={registerLoading}
                  redirect={redirect}
                  onSwitchToLogin={() => onModeChange("login")}
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
