import { AnimatePresence, motion, type Variants } from "motion/react";

import { AuthLinkButton } from "@arclayer/ui/auth-controls";
import { Button } from "@arclayer/ui/button";
import { InviteRegisterForm } from "./invite-register-form";
import { InviteLoginJoinForm } from "./invite-login-join-form";
import type { JoinMode } from "../types";

type InviteGuestJoinPaneProps = {
  t: (key: string, params?: Record<string, unknown>) => string;
  mode: JoinMode;
  setMode: (mode: JoinMode) => void;
  onBack: () => void;
  reducedMotion: boolean;
  previewData: { invitation: { email?: string | null } };
  isOrgOnlyInvite: boolean | undefined;
  hasBoundEmail: boolean;
  keepSession: boolean;
  loginLoading: boolean;
  registerLoading: boolean;
  forgotLoading: boolean;
  onLoginAndJoin: (values: { password: string; keepSession: boolean }) => void | Promise<void>;
  onRegisterAndJoin: (values: {
    email?: string;
    username: string;
    displayName?: string;
    password: string;
    confirmPassword: string;
  }) => void | Promise<void>;
  onForgotPassword: () => void | Promise<void>;
  onBackToLogin: () => Promise<void>;
  v: Variants | Record<string, never>;
  modeEnterX: number;
  modeExitX: number;
};

export function InviteGuestJoinPane({
  t,
  mode,
  setMode,
  onBack,
  reducedMotion,
  previewData,
  isOrgOnlyInvite,
  hasBoundEmail,
  keepSession,
  loginLoading,
  registerLoading,
  forgotLoading,
  onLoginAndJoin,
  onRegisterAndJoin,
  onForgotPassword,
  onBackToLogin,
  v,
  modeEnterX,
  modeExitX,
}: InviteGuestJoinPaneProps) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={mode}
        initial="hidden"
        animate="show"
        exit="exit"
        variants={{
          hidden: reducedMotion ? { opacity: 1 } : { opacity: 0, x: modeEnterX },
          show: reducedMotion
            ? { opacity: 1 }
            : {
                opacity: 1,
                x: 0,
                transition: { staggerChildren: 0.05, delayChildren: 0.02 },
              },
          exit: reducedMotion ? { opacity: 1 } : { opacity: 0, x: modeExitX },
        }}
      >
        {mode === "login" ? (
          <LoginModeContent
            t={t}
            previewData={previewData}
            isOrgOnlyInvite={isOrgOnlyInvite}
            hasBoundEmail={hasBoundEmail}
            keepSession={keepSession}
            loginLoading={loginLoading}
            forgotLoading={forgotLoading}
            onLoginAndJoin={onLoginAndJoin}
            onForgotPassword={onForgotPassword}
            onBackToLogin={onBackToLogin}
            onSwitchToRegister={() => setMode("register")}
            onBack={onBack}
            v={v}
          />
        ) : (
          <RegisterModeContent
            t={t}
            isOrgOnlyInvite={isOrgOnlyInvite}
            hasBoundEmail={hasBoundEmail}
            previewData={previewData}
            registerLoading={registerLoading}
            onRegisterAndJoin={onRegisterAndJoin}
            onBackToLogin={onBackToLogin}
            onSwitchToLogin={() => setMode("login")}
            v={v}
          />
        )}
      </motion.div>
    </AnimatePresence>
  );
}

// --- Login mode sub-content ---

function LoginModeContent({
  t,
  previewData,
  isOrgOnlyInvite,
  hasBoundEmail,
  keepSession,
  loginLoading,
  forgotLoading,
  onLoginAndJoin,
  onForgotPassword,
  onBackToLogin,
  onSwitchToRegister,
  onBack,
  v,
}: {
  t: (key: string, params?: Record<string, unknown>) => string;
  previewData: { invitation: { email?: string | null } };
  isOrgOnlyInvite: boolean | undefined;
  hasBoundEmail: boolean;
  keepSession: boolean;
  loginLoading: boolean;
  forgotLoading: boolean;
  onLoginAndJoin: (values: { password: string; keepSession: boolean }) => void | Promise<void>;
  onForgotPassword: () => void | Promise<void>;
  onBackToLogin: () => Promise<void>;
  onSwitchToRegister: () => void;
  onBack: () => void;
  v: Variants | Record<string, never>;
}) {
  return (
    <>
      <motion.div variants={v} className="text-center">
        <h1 className="text-largetitle text-label-primary">
          {t(isOrgOnlyInvite ? "invite:INVITE_STEP2_TITLE_ORG" : "invite:INVITE_STEP2_TITLE")}
        </h1>
        <p className="mt-1 mb-5 text-headline text-label-secondary">
          {t("invite:INVITE_MODE_LOGIN_DESC")}
        </p>
      </motion.div>

      <motion.div variants={v} className="text-callout text-label-secondary mb-4">
        {hasBoundEmail ? t("invite:INVITE_LOGIN_HINT") : t("invite:INVITE_LOGIN_LINK_HINT")}
      </motion.div>

      <motion.div variants={v}>
        {hasBoundEmail ? (
          <InviteLoginJoinForm
            t={t}
            email={previewData.invitation.email || ""}
            keepSession={keepSession}
            loading={loginLoading}
            forgotLoading={forgotLoading}
            onSubmit={onLoginAndJoin}
            onForgotPassword={onForgotPassword}
            onBack={onBack}
            onBackToLogin={onBackToLogin}
          />
        ) : (
          <div className="flex flex-col gap-3">
            <Button className="w-full rounded-full" size="lg" onClick={() => void onBackToLogin()}>
              {t("invite:INVITE_ACTION_GO_TO_LOGIN")}
            </Button>
            <Button className="w-full rounded-full" size="lg" variant="outline" onClick={onBack}>
              {t("invite:INVITE_ACTION_BACK")}
            </Button>
          </div>
        )}
      </motion.div>

      <motion.div variants={v} className="mt-4 text-center">
        <AuthLinkButton onClick={onSwitchToRegister} size="sm" type="button">
          {t("invite:INVITE_ACTION_SWITCH_TO_REGISTER")}
        </AuthLinkButton>
      </motion.div>
    </>
  );
}

// --- Register mode sub-content ---

function RegisterModeContent({
  t,
  isOrgOnlyInvite,
  hasBoundEmail,
  previewData,
  registerLoading,
  onRegisterAndJoin,
  onBackToLogin,
  onSwitchToLogin,
  v,
}: {
  t: (key: string, params?: Record<string, unknown>) => string;
  isOrgOnlyInvite: boolean | undefined;
  hasBoundEmail: boolean;
  previewData: { invitation: { email?: string | null } };
  registerLoading: boolean;
  onRegisterAndJoin: (values: {
    email?: string;
    username: string;
    displayName?: string;
    password: string;
    confirmPassword: string;
  }) => void | Promise<void>;
  onBackToLogin: () => Promise<void>;
  onSwitchToLogin: () => void;
  v: Variants | Record<string, never>;
}) {
  return (
    <>
      <motion.div variants={v} className="text-center">
        <h1 className="text-largetitle text-label-primary">
          {t(isOrgOnlyInvite ? "invite:INVITE_STEP2_TITLE_ORG" : "invite:INVITE_STEP2_TITLE")}
        </h1>
        <p className="mt-1 mb-5 text-headline text-label-secondary">
          {t("invite:INVITE_MODE_REGISTER_DESC")}
        </p>
      </motion.div>

      <motion.div variants={v}>
        <InviteRegisterForm
          emailLocked={hasBoundEmail ? previewData.invitation.email : null}
          loading={registerLoading}
          onSubmit={onRegisterAndJoin}
          onSwitchToLogin={() => {
            if (hasBoundEmail) {
              onSwitchToLogin();
            } else {
              void onBackToLogin();
            }
          }}
        />
      </motion.div>
    </>
  );
}
