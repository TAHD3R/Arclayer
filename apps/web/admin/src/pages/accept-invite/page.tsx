import { Avatar, Button, Modal, Typography } from "antd";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { AnimatePresence, MotionConfig, motion, type Variants } from "motion/react";

import * as authApi from "@/api/auth";
import * as invitationApi from "@/api/invitations";
import { useAuthStore } from "@/stores/use-auth-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import {
  getErrorMessage,
  notifyError,
  notifyErrorText,
  notifySuccessText,
} from "@/lib/notifications";
import { ApiError } from "@/lib/http";
import { buildOrganizationPath } from "@/lib/organization-routing";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { PageState } from "@/components/common/page-state";
import { InviteTokenInputDialog } from "@/components/common/invite/invite-token-input-dialog";
import { InviteRegisterForm } from "@/components/common/invite/invite-register-form";
import { InviteLoginJoinForm } from "./login-join-form";
import { formatInvitationExpiresRelative, resolveRoleText } from "./utils";

type WizardStep = 0 | 1;
type JoinMode = "login" | "register";

export function AcceptInviteView(props: { token: string | null }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const reducedMotion = usePrefersReducedMotion();
  const accessToken = useAuthStore((s) => s.accessToken);
  const keepSession = useAuthStore((s) => s.keepSession);
  const applyLogin = useAuthStore((s) => s.applyLogin);
  const clearAuth = useAuthStore((s) => s.clear);
  const setCurrentWorkspaceId = useWorkspaceStore((s) => s.setCurrentWorkspaceId);
  const clearWorkspace = useWorkspaceStore((s) => s.clearWorkspace);
  const [step, setStep] = useState<WizardStep>(0);
  const [mode, setMode] = useState<JoinMode>("login");
  const modeInitializedRef = useRef(false);
  const [tokenDialogOpen, setTokenDialogOpen] = useState(false);
  const prevStepRef = useRef(step);
  const prevJoinModeRef = useRef<JoinMode>(mode);
  const modeDirection = mode === prevJoinModeRef.current ? 0 : mode === "register" ? 1 : -1;
  const modeEnterX = modeDirection > 0 ? 8 : modeDirection < 0 ? -8 : 0;
  const modeExitX = modeDirection > 0 ? -8 : modeDirection < 0 ? 8 : 0;
  const stepDirection = step === prevStepRef.current ? 0 : step > prevStepRef.current ? 1 : -1;
  const enterOffsetX = stepDirection > 0 ? 14 : stepDirection < 0 ? -14 : 0;
  const exitOffsetX = stepDirection > 0 ? -14 : stepDirection < 0 ? 14 : 0;
  const transition = reducedMotion
    ? ({ duration: 0.01 } as const)
    : ({ duration: 0.18, ease: [0.2, 0, 0, 1] as const } as const);
  const token = (props.token || "").trim();
  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 8 },
    show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" } },
    exit: { opacity: 0, y: -4, transition: { duration: 0.12 } },
  };
  const v = reducedMotion ? {} : itemVariants;
  const staggerContainer = {
    show: reducedMotion ? {} : { transition: { staggerChildren: 0.05 } },
  };

  useEffect(() => {
    // When token changes (e.g. user manually inputs token), restart the wizard.
    setStep(0);
    modeInitializedRef.current = false;
  }, [token]);
  const previewQuery = useQuery({
    queryKey: ["invitePreview", token],
    enabled: !!token,
    queryFn: async () => invitationApi.previewInvitation(token),
    retry: false,
  });
  const isOrgOnlyInvite = previewQuery.data?.workspace === null;
  const targetName = useMemo(() => {
    if (!previewQuery.data) return "";
    return isOrgOnlyInvite
      ? previewQuery.data.organization.name
      : previewQuery.data.workspace?.name ||
          previewQuery.data.organization.name ||
          t("invite:INVITE_WORKSPACE_FALLBACK");
  }, [previewQuery.data, isOrgOnlyInvite, t]);
  const meQuery = useQuery({
    queryKey: ["me"],
    enabled: !!accessToken,
    queryFn: async () => authApi.me(),
    retry: false,
  });
  const acceptExistingMutation = useMutation({
    mutationFn: async () => invitationApi.acceptExistingInvitation(token),
  });
  const registerAcceptMutation = useMutation({
    mutationFn: async (payload: {
      email?: string;
      username: string;
      displayName?: string;
      password: string;
      confirmPassword: string;
    }) =>
      invitationApi.acceptInvitation({
        token,
        email: payload.email,
        username: payload.username,
        password: payload.password,
        confirmPassword: payload.confirmPassword,
        displayName: payload.displayName,
      }),
  });
  const loginMutation = useMutation({
    mutationFn: async (payload: { password: string }) => {
      const email = previewQuery.data?.invitation.email || "";
      return authApi.login({ identifier: email, password: payload.password });
    },
  });
  const forgotPasswordMutation = useMutation({
    mutationFn: async () => {
      const email = previewQuery.data?.invitation.email || "";
      return authApi.forgotPassword({ identifier: email });
    },
  });

  // Initialize the default mode exactly once after we have preview data.
  useEffect(() => {
    if (modeInitializedRef.current) return;
    if (!previewQuery.data) return;
    modeInitializedRef.current = true;
    setMode(previewQuery.data.userExists ? "login" : "register");
  }, [previewQuery.data]);
  useEffect(() => {
    prevJoinModeRef.current = mode;
  }, [mode]);
  const onBackToLogin = async () => {
    const redirect = token ? `/accept-invite?token=${encodeURIComponent(token)}` : undefined;
    await navigate({ to: "/login", search: redirect ? { redirect } : undefined, replace: true });
  };
  const applyToken = async (nextToken: string) => {
    const trimmed = (nextToken || "").trim();
    if (!trimmed) return;
    await navigate({ to: "/accept-invite", search: { token: trimmed }, replace: true });
  };
  const inviteBusinessFailure = useMemo(() => {
    if (!previewQuery.isError) return null;
    const err = previewQuery.error;
    if (!(err instanceof ApiError)) return null;

    const code = (err.error || "").trim();
    // Token-related failures are not "system errors" for the user; present them as a friendly empty state.
    const isInviteError =
      code.startsWith("INVITE_") ||
      code === "ORG_INACTIVE" ||
      err.status === 404 ||
      err.status === 409;
    if (!isInviteError) return null;

    return {
      title: getErrorMessage(err),
      description: t("invite:INVITE_INVALID_HELP"),
    };
  }, [previewQuery.error, previewQuery.isError, t]);
  const tokenActions = (
    <div className="flex flex-col gap-3 w-full">
      <Button type="primary" block onClick={() => setTokenDialogOpen(true)}>
        {t("invite:INVITE_ACTION_ENTER_TOKEN")}
      </Button>
      <Button block onClick={() => void onBackToLogin()}>
        {t("invite:INVITE_ACTION_BACK_TO_LOGIN")}
      </Button>
    </div>
  );
  const tokenActionsWithRetry = (
    <div className="flex flex-col gap-3 w-full">
      <Button type="primary" block onClick={() => void previewQuery.refetch()}>
        {t("common:RETRY")}
      </Button>
      <Button block onClick={() => setTokenDialogOpen(true)}>
        {t("invite:INVITE_ACTION_ENTER_TOKEN")}
      </Button>
      <Button block onClick={() => void onBackToLogin()}>
        {t("invite:INVITE_ACTION_BACK_TO_LOGIN")}
      </Button>
    </div>
  );
  const inviterLabel = useMemo(() => {
    const inviter = previewQuery.data?.inviter;
    if (!inviter) return null;
    return inviter.displayName?.trim() || inviter.username;
  }, [previewQuery.data?.inviter]);
  const roleResolved = useMemo(() => {
    const role = previewQuery.data?.role;
    const roleCode = previewQuery.data?.invitation.roleCode || role?.code || null;
    return resolveRoleText(t, roleCode, { name: role?.name, description: role?.description });
  }, [previewQuery.data?.invitation.roleCode, previewQuery.data?.role, t]);
  const expiresRelativeText = useMemo(() => {
    const expiresAt = previewQuery.data?.invitation.expiresAt;
    return formatInvitationExpiresRelative({
      t,
      locale: i18n.language || "en",
      expiresAt,
    });
  }, [i18n.language, previewQuery.data?.invitation.expiresAt, t]);
  const isLoggedIn = !!accessToken;
  const inviteEmail = (previewQuery.data?.invitation.email || "").trim().toLowerCase();
  const hasBoundEmail = Boolean(inviteEmail);
  const myEmail = (meQuery.data?.email || "").trim().toLowerCase();
  // Invite links are reusable; email match is informational only.
  const emailMatches = Boolean(inviteEmail && myEmail && inviteEmail === myEmail);
  const onContinue = () => {
    if (previewQuery.isError || !previewQuery.data) return;
    setStep(1);
  };
  const onLogoutAndSwitch = async () => {
    clearAuth();
    clearWorkspace();
    await onBackToLogin();
  };
  const applyJoinedWorkspace = async (payload: {
    workspaceId: string | null | undefined;
    organizationId: string | null | undefined;
  }) => {
    const organizationId = String(payload.organizationId || "").trim();

    if (!payload.workspaceId) {
      notifySuccessText(t("invite:INVITE_JOIN_SUCCESS"));

      if (organizationId) {
        await navigate({
          to: buildOrganizationPath(organizationId, "/team/members"),
          replace: true,
        });
        return;
      }

      await navigate({ to: "/", replace: true });
      return;
    }

    setCurrentWorkspaceId(payload.workspaceId);
    notifySuccessText(t("invite:INVITE_JOIN_SUCCESS"));
    await navigate({ to: `/w/${payload.workspaceId}`, replace: true });
  };
  const joinAsExistingLoggedIn = async () => {
    if (!previewQuery.data) return;
    const workspaceName =
      previewQuery.data.workspace?.name ||
      previewQuery.data.organization.name ||
      t("invite:INVITE_WORKSPACE_FALLBACK");
    const email = myEmail || inviteEmail;
    const roleName = roleResolved.name;

    Modal.confirm({
      title: t("invite:INVITE_CONFIRM_JOIN_TITLE"),
      content: (
        <div>
          <div style={{ marginBottom: 6 }}>
            {t("invite:INVITE_CONFIRM_JOIN_LINE1", { email, workspaceName })}
          </div>
          <div style={{ marginBottom: 10 }}>
            {t("invite:INVITE_CONFIRM_JOIN_LINE2", { roleName })}
          </div>
          <div className="text-callout text-label-secondary">
            {t("invite:INVITE_CONFIRM_JOIN_RISK_NOTICE")}
          </div>
        </div>
      ),
      okText: t("invite:INVITE_CONFIRM_JOIN_OK"),
      cancelText: t("invite:INVITE_CONFIRM_JOIN_CANCEL"),
      onOk: async () => {
        try {
          const accepted = await acceptExistingMutation.mutateAsync();
          await applyJoinedWorkspace({
            organizationId: accepted.organizationId || previewQuery.data?.organization.id,
            workspaceId: accepted.workspaceId,
          });
        } catch (err) {
          if (err instanceof ApiError && err.error === "INVITE_EMAIL_DOMAIN_FORBIDDEN") {
            notifyErrorText(t("invite:INVITE_EMAIL_DOMAIN_FORBIDDEN"));
          } else {
            notifyError(err);
          }
          throw err;
        }
      },
    });
  };
  const onLoginAndJoin = async (values: { password: string; keepSession: boolean }) => {
    if (!previewQuery.data) return;
    if (!previewQuery.data.invitation.email) {
      // Invite link mode: the invite is not email-bound, so we can't do a "password only" login here.
      await onBackToLogin();
      return;
    }
    try {
      const tokens = await loginMutation.mutateAsync({ password: values.password });
      applyLogin(tokens, { keepSession: values.keepSession });

      const accepted = await acceptExistingMutation.mutateAsync();
      await applyJoinedWorkspace({
        organizationId: accepted.organizationId || previewQuery.data?.organization.id,
        workspaceId: accepted.workspaceId,
      });
    } catch (err) {
      if (err instanceof ApiError && err.error === "INVITE_EMAIL_DOMAIN_FORBIDDEN") {
        notifyErrorText(t("invite:INVITE_EMAIL_DOMAIN_FORBIDDEN"));
      } else {
        notifyError(err);
      }
    }
  };
  const onRegisterAndJoin = async (values: {
    email?: string;
    username: string;
    displayName?: string;
    password: string;
    confirmPassword: string;
  }) => {
    if (!previewQuery.data) return;
    try {
      const tokens = await registerAcceptMutation.mutateAsync(values);
      applyLogin(tokens, { keepSession: true });
      await applyJoinedWorkspace({
        organizationId: previewQuery.data.organization.id,
        workspaceId: previewQuery.data.workspace?.id,
      });
    } catch (err) {
      // If email already exists, guide user to login flow.
      if (err instanceof ApiError && err.error === "EMAIL_EXISTS") {
        notifyErrorText(t("invite:INVITE_EMAIL_EXISTS_SWITCH_TO_LOGIN"));
        setMode("login");
        setStep(1);
        return;
      }
      if (err instanceof ApiError && err.error === "INVITE_EMAIL_DOMAIN_FORBIDDEN") {
        notifyErrorText(t("invite:INVITE_EMAIL_DOMAIN_FORBIDDEN"));
        return;
      }
      notifyError(err);
    }
  };
  const onForgotPassword = async () => {
    try {
      const payload = await forgotPasswordMutation.mutateAsync();
      notifySuccessText(t("auth:RESET_SENT"));
      if (payload?.reset_token) {
        void navigate({ to: "/reset-password", search: { token: payload.reset_token } });
      }
    } catch (err) {
      notifyError(err);
    }
  };
  const previewPane = (
    <div className="w-full">
      {!token ? (
        <>
          <PageState
            loading={false}
            empty
            variant="compact"
            emptyTitle={t("invite:INVITE_TOKEN_MISSING")}
            emptyDescription={t("invite:INVITE_TOKEN_MISSING_DESC")}
            emptyExtra={tokenActions}
          />
        </>
      ) : inviteBusinessFailure ? (
        <PageState
          loading={false}
          empty
          variant="compact"
          emptyTitle={inviteBusinessFailure.title}
          emptyDescription={inviteBusinessFailure.description}
          emptyExtra={tokenActions}
        />
      ) : (
        <PageState
          loading={previewQuery.isLoading}
          error={previewQuery.isError ? previewQuery.error : null}
          onRetry={() => void previewQuery.refetch()}
          hideRetry
          variant="compact"
          loadingVariant="form"
          errorTitle={t("invite:INVITE_PREVIEW_FAILED")}
          errorDescription={previewQuery.isError ? getErrorMessage(previewQuery.error) : undefined}
          errorExtra={tokenActionsWithRetry}
        >
          {previewQuery.data ? (
            <div className="rounded-xl border bg-card p-8">
              <motion.div
                className="flex flex-col items-center text-center"
                initial="hidden"
                animate="show"
                variants={staggerContainer}
              >
                <motion.div variants={v}>
                  <Avatar size={72} src={previewQuery.data.organization.logoUrl || undefined}>
                    {(targetName || "W").slice(0, 1)}
                  </Avatar>
                </motion.div>

                <motion.div
                  variants={v}
                  className="mt-4 text-title3 font-semibold text-label-primary"
                >
                  {targetName}
                </motion.div>

                {!isOrgOnlyInvite && (
                  <motion.div variants={v} className="mt-1 text-footnote text-label-secondary">
                    {previewQuery.data.organization.name}
                  </motion.div>
                )}

                <motion.div variants={v} className="mt-2 text-center">
                  <div className="text-footnote font-medium text-label-secondary">
                    {roleResolved.name}
                  </div>
                  {roleResolved.description && (
                    <div className="mt-0.5 text-caption text-label-tertiary">
                      {roleResolved.description}
                    </div>
                  )}
                </motion.div>

                <motion.div variants={v} className="mt-3 text-footnote text-label-secondary">
                  {inviterLabel
                    ? t("invite:INVITE_PREVIEW_INVITED_BY", { inviter: inviterLabel })
                    : t("invite:INVITE_PREVIEW_INVITED_GENERIC")}
                </motion.div>

                <motion.div variants={v} className="mt-1 text-caption text-label-tertiary">
                  {expiresRelativeText}
                </motion.div>

                <motion.div variants={v} className="mt-6">
                  <Button
                    size="large"
                    type="primary"
                    className="!rounded-full !px-8"
                    onClick={onContinue}
                  >
                    {t(
                      isOrgOnlyInvite
                        ? "invite:INVITE_ACTION_ACCEPT_JOIN_ORG"
                        : "invite:INVITE_ACTION_ACCEPT_JOIN",
                    )}
                  </Button>
                </motion.div>

                <motion.div variants={v} className="mt-4 text-caption text-label-tertiary">
                  {t(
                    isOrgOnlyInvite
                      ? "invite:INVITE_SCOPE_ORGANIZATION"
                      : "invite:INVITE_SCOPE_WORKSPACE",
                  )}
                </motion.div>
              </motion.div>
            </div>
          ) : null}
        </PageState>
      )}
    </div>
  );
  const joinPane = (
    <div className="w-full">
      {!token ? (
        <>
          <PageState
            loading={false}
            empty
            variant="compact"
            emptyTitle={t("invite:INVITE_TOKEN_MISSING")}
            emptyDescription={t("invite:INVITE_TOKEN_MISSING_DESC")}
            emptyExtra={tokenActions}
          />
        </>
      ) : inviteBusinessFailure ? (
        <PageState
          loading={false}
          empty
          variant="compact"
          emptyTitle={inviteBusinessFailure.title}
          emptyDescription={inviteBusinessFailure.description}
          emptyExtra={tokenActions}
        />
      ) : (
        <PageState
          loading={previewQuery.isLoading || (isLoggedIn && meQuery.isLoading)}
          error={previewQuery.isError ? previewQuery.error : null}
          onRetry={() => void previewQuery.refetch()}
          hideRetry
          variant="compact"
          loadingVariant="form"
          errorTitle={t("invite:INVITE_PREVIEW_FAILED")}
          errorDescription={previewQuery.isError ? getErrorMessage(previewQuery.error) : undefined}
          errorExtra={tokenActionsWithRetry}
        >
          {!previewQuery.data ? null : isLoggedIn ? (
            <div className="rounded-xl border bg-card p-8">
              <motion.div
                className="flex flex-col items-center text-center"
                initial="hidden"
                animate="show"
                variants={staggerContainer}
              >
                <motion.div variants={v}>
                  <Avatar size={56} src={previewQuery.data.organization.logoUrl || undefined}>
                    {(targetName || "W").slice(0, 1)}
                  </Avatar>
                </motion.div>

                <motion.div variants={v}>
                  <Typography.Title
                    level={1}
                    className="!mt-3 !mb-1 text-largetitle text-label-primary"
                  >
                    {t(
                      isOrgOnlyInvite
                        ? "invite:INVITE_STEP2_TITLE_ORG"
                        : "invite:INVITE_STEP2_TITLE",
                    )}
                  </Typography.Title>
                </motion.div>

                <motion.div variants={v} className="mt-2 text-callout text-label-secondary">
                  {hasBoundEmail
                    ? emailMatches
                      ? t("invite:INVITE_LOGGED_IN_MATCH")
                      : t("invite:INVITE_LOGGED_IN_MISMATCH")
                    : t("invite:INVITE_LOGGED_IN_GENERIC")}
                </motion.div>

                <motion.div
                  variants={v}
                  className="mt-4 w-full rounded-lg border border-(--color-border) bg-muted/30 p-4 text-left text-footnote"
                >
                  <div>
                    {t("invite:INVITE_CURRENT_ACCOUNT")}{" "}
                    <strong>{meQuery.data?.email || t("invite:INVITE_EMAIL_UNKNOWN")}</strong>
                  </div>
                  {hasBoundEmail && previewQuery.data.invitation.maskedEmail ? (
                    <div className="mt-1">
                      {t("invite:INVITE_INVITED_EMAIL")}{" "}
                      <strong>{previewQuery.data.invitation.maskedEmail}</strong>
                    </div>
                  ) : null}
                </motion.div>

                <motion.div variants={v} className="mt-3 text-center">
                  <div className="text-footnote font-medium text-label-secondary">
                    {roleResolved.name}
                  </div>
                  {roleResolved.description && (
                    <div className="mt-0.5 text-caption text-label-tertiary">
                      {roleResolved.description}
                    </div>
                  )}
                </motion.div>

                <motion.div variants={v} className="mt-5">
                  <Button
                    size="large"
                    type="primary"
                    className="!rounded-full !px-8"
                    loading={acceptExistingMutation.isPending}
                    onClick={() => void joinAsExistingLoggedIn()}
                  >
                    {hasBoundEmail && !emailMatches
                      ? t("invite:INVITE_ACTION_JOIN_ANYWAY")
                      : t("invite:INVITE_ACTION_JOIN")}
                  </Button>
                </motion.div>

                {hasBoundEmail && !emailMatches ? (
                  <motion.div variants={v} className="mt-3">
                    <Button type="link" size="small" onClick={() => void onLogoutAndSwitch()}>
                      {t("invite:INVITE_ACTION_LOGOUT_SWITCH")}
                    </Button>
                  </motion.div>
                ) : null}

                <motion.div variants={v} className="mt-3">
                  <Button type="link" size="small" onClick={() => setStep(0)}>
                    {t("invite:INVITE_ACTION_BACK")}
                  </Button>
                </motion.div>
              </motion.div>
            </div>
          ) : (
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
                  <>
                    <motion.div variants={v} className="text-center">
                      <Typography.Title
                        level={1}
                        className="!mt-0 !mb-1 text-largetitle text-label-primary"
                      >
                        {t(
                          isOrgOnlyInvite
                            ? "invite:INVITE_STEP2_TITLE_ORG"
                            : "invite:INVITE_STEP2_TITLE",
                        )}
                      </Typography.Title>
                      <Typography.Paragraph className="!mt-0 !mb-5 text-callout text-label-secondary">
                        {t("invite:INVITE_MODE_LOGIN_DESC")}
                      </Typography.Paragraph>
                    </motion.div>

                    <motion.div variants={v} className="text-footnote text-label-secondary mb-4">
                      {hasBoundEmail
                        ? t("invite:INVITE_LOGIN_HINT")
                        : t("invite:INVITE_LOGIN_LINK_HINT")}
                    </motion.div>

                    <motion.div variants={v}>
                      {hasBoundEmail ? (
                        <InviteLoginJoinForm
                          t={t}
                          email={previewQuery.data.invitation.email || ""}
                          keepSession={keepSession}
                          loading={loginMutation.isPending || acceptExistingMutation.isPending}
                          forgotLoading={forgotPasswordMutation.isPending}
                          onSubmit={onLoginAndJoin}
                          onForgotPassword={onForgotPassword}
                          onBack={() => setStep(0)}
                          onBackToLogin={onBackToLogin}
                        />
                      ) : (
                        <Button
                          block
                          size="large"
                          type="primary"
                          className="!rounded-full"
                          onClick={() => void onBackToLogin()}
                        >
                          {t("invite:INVITE_ACTION_BACK_TO_LOGIN")}
                        </Button>
                      )}
                    </motion.div>

                    <motion.div variants={v} className="mt-4 text-center">
                      <Button type="link" size="small" onClick={() => setMode("register")}>
                        {t("invite:INVITE_ACTION_SWITCH_TO_REGISTER")}
                      </Button>
                    </motion.div>
                  </>
                ) : (
                  <>
                    <motion.div variants={v} className="text-center">
                      <Typography.Title
                        level={1}
                        className="!mt-0 !mb-1 text-largetitle text-label-primary"
                      >
                        {t(
                          isOrgOnlyInvite
                            ? "invite:INVITE_STEP2_TITLE_ORG"
                            : "invite:INVITE_STEP2_TITLE",
                        )}
                      </Typography.Title>
                      <Typography.Paragraph className="!mt-0 !mb-5 text-callout text-label-secondary">
                        {t("invite:INVITE_MODE_REGISTER_DESC")}
                      </Typography.Paragraph>
                    </motion.div>

                    <motion.div variants={v}>
                      <InviteRegisterForm
                        emailLocked={hasBoundEmail ? previewQuery.data.invitation.email : null}
                        loading={registerAcceptMutation.isPending}
                        onSubmit={onRegisterAndJoin}
                        onSwitchToLogin={() => setMode("login")}
                      />
                    </motion.div>
                  </>
                )}
              </motion.div>
            </AnimatePresence>
          )}
        </PageState>
      )}
    </div>
  );

  return (
    <div className="w-full">
      <InviteTokenInputDialog
        open={tokenDialogOpen}
        onOpenChange={setTokenDialogOpen}
        onSubmit={async (nextToken) => {
          await applyToken(nextToken);
        }}
      />

      <MotionConfig transition={transition}>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={step}
            initial={{ opacity: 0, x: enterOffsetX }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: exitOffsetX }}
          >
            {step === 0 ? previewPane : joinPane}
          </motion.div>
        </AnimatePresence>
      </MotionConfig>
    </div>
  );
}
