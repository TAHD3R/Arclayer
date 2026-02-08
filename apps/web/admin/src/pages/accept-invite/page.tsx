import { Avatar, Button, Divider, Modal, Typography } from "antd";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { AnimatePresence, MotionConfig, motion } from "motion/react";

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
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { PageState } from "@/components/common/page-state";
import { InviteTokenInputDialog } from "@/components/common/invite/invite-token-input-dialog";
import { InviteRegisterForm } from "@/components/common/invite/invite-register-form";
import { InviteLoginJoinForm } from "./login-join-form";
import { briefRoleDescription, formatInvitationExpiresRelative, resolveRoleText } from "./utils";

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
  const stepDirection = step === prevStepRef.current ? 0 : step > prevStepRef.current ? 1 : -1;
  const enterOffsetX = stepDirection > 0 ? 14 : stepDirection < 0 ? -14 : 0;
  const exitOffsetX = stepDirection > 0 ? -14 : stepDirection < 0 ? 14 : 0;
  const transition = reducedMotion
    ? ({ duration: 0.01 } as const)
    : ({ duration: 0.18, ease: [0.2, 0, 0, 1] as const } as const);
  const token = (props.token || "").trim();

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
  const onBackToLogin = async () => {
    const redirect = token ? `/accept-invite?token=${encodeURIComponent(token)}` : undefined;
    await navigate({ to: "/login", search: redirect ? { redirect } : undefined, replace: true });
  };
  const onRejectInvite = async () => {
    // Provide an explicit exit when user clicked a wrong link or doesn't want to join.
    if (accessToken) {
      await navigate({ to: "/", replace: true });
      return;
    }
    await navigate({ to: "/login", replace: true });
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
  const roleBrief = useMemo(
    () => briefRoleDescription(roleResolved.description),
    [roleResolved.description],
  );
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
  const applyJoinedWorkspace = async (workspaceId: string) => {
    setCurrentWorkspaceId(workspaceId);
    notifySuccessText(t("invite:INVITE_JOIN_SUCCESS"));
    await navigate({ to: `/w/${workspaceId}`, replace: true });
  };
  const joinAsExistingLoggedIn = async () => {
    if (!previewQuery.data) return;
    const workspaceName = previewQuery.data.workspace.name;
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
          <div style={{ color: "var(--color-muted-foreground)", fontSize: 12 }}>
            {t("invite:INVITE_CONFIRM_JOIN_RISK_NOTICE")}
          </div>
        </div>
      ),
      okText: t("invite:INVITE_CONFIRM_JOIN_OK"),
      cancelText: t("invite:INVITE_CONFIRM_JOIN_CANCEL"),
      onOk: async () => {
        try {
          const accepted = await acceptExistingMutation.mutateAsync();
          await applyJoinedWorkspace(accepted.workspaceId);
        } catch (err) {
          notifyError(err);
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
      await applyJoinedWorkspace(accepted.workspaceId);
    } catch (err) {
      notifyError(err);
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
      await applyJoinedWorkspace(previewQuery.data.workspace.id);
    } catch (err) {
      // If email already exists, guide user to login flow.
      if (err instanceof ApiError && err.error === "EMAIL_EXISTS") {
        notifyErrorText(t("invite:INVITE_EMAIL_EXISTS_SWITCH_TO_LOGIN"));
        setMode("login");
        setStep(1);
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
  const headerMeta = useMemo(() => {
    if (step === 0) {
      return {
        title: t("invite:INVITE_STEP1_TITLE"),
        description: t("invite:INVITE_STEP1_DESC"),
      };
    }
    return {
      title: t("invite:INVITE_STEP2_TITLE"),
      description: t("invite:INVITE_STEP2_DESC"),
    };
  }, [step, t]);
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
            <>
              <div className="">
                <div className="flex flex-col items-center text-center">
                  <Avatar
                    size={80}
                    src={previewQuery.data.organization.logoUrl || undefined}
                    className="mb-4"
                  >
                    {(
                      previewQuery.data.workspace.name ||
                      previewQuery.data.organization.name ||
                      "W"
                    ).slice(0, 1)}
                  </Avatar>

                  <div className="text-2xl font-semibold">
                    {t("invite:INVITE_PREVIEW_INVITED_TO_ORG", {
                      inviter: inviterLabel || t("invite:INVITE_INVITER_UNKNOWN"),
                      workspaceName: previewQuery.data.workspace.name,
                    })}
                  </div>

                  <div className="mt-4 text-(--color-muted-foreground)">
                    {t("invite:INVITE_PREVIEW_INVITED_AS_ROLE", { roleName: roleResolved.name })}
                  </div>
                  {roleBrief ? (
                    <div className="mt-1 text-(--color-muted-foreground)">{roleBrief}</div>
                  ) : null}

                  <div className="mt-4 text-(--color-muted-foreground)">
                    {t("invite:INVITE_SECURITY_NOTICE")}
                  </div>
                  <div className="text-(--color-muted-foreground)">{expiresRelativeText}</div>
                </div>

                <div className="mt-6 flex items-center justify-center gap-3">
                  <div className="flex flex-col items-center gap-4">
                    <Button
                      block
                      size="large"
                      type="primary"
                      danger
                      onClick={() => void onRejectInvite()}
                    >
                      {t("invite:INVITE_ACTION_REJECT")}
                    </Button>
                    <Button block size="large" type="primary" onClick={onContinue}>
                      {t("invite:INVITE_ACTION_ACCEPT_JOIN")}
                    </Button>
                  </div>
                </div>
              </div>
            </>
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
            <>
              <div className="rounded-lg border p-4">
                <Typography.Text strong>
                  {hasBoundEmail
                    ? emailMatches
                      ? t("invite:INVITE_LOGGED_IN_MATCH")
                      : t("invite:INVITE_LOGGED_IN_MISMATCH")
                    : t("invite:INVITE_LOGGED_IN_GENERIC")}
                </Typography.Text>
                <div className="mt-2 text-sm">
                  <div>
                    {t("invite:INVITE_CURRENT_ACCOUNT")}{" "}
                    <strong>{meQuery.data?.email || t("invite:INVITE_EMAIL_UNKNOWN")}</strong>
                  </div>
                  {hasBoundEmail && previewQuery.data.invitation.maskedEmail ? (
                    <div>
                      {t("invite:INVITE_INVITED_EMAIL")}{" "}
                      <strong>{previewQuery.data.invitation.maskedEmail}</strong>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="mt-6 flex items-center justify-between gap-3">
                <Button onClick={() => setStep(0)}>{t("invite:INVITE_ACTION_BACK")}</Button>
                <div className="flex items-center gap-2">
                  {hasBoundEmail && !emailMatches ? (
                    <Button type="primary" onClick={() => void onLogoutAndSwitch()}>
                      {t("invite:INVITE_ACTION_LOGOUT_SWITCH")}
                    </Button>
                  ) : null}
                  <Button
                    type={hasBoundEmail && !emailMatches ? "default" : "primary"}
                    loading={acceptExistingMutation.isPending}
                    onClick={() => void joinAsExistingLoggedIn()}
                  >
                    {hasBoundEmail && !emailMatches
                      ? t("invite:INVITE_ACTION_JOIN_ANYWAY")
                      : t("invite:INVITE_ACTION_JOIN")}
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm text-(--color-muted-foreground)">
                  {mode === "login"
                    ? t("invite:INVITE_MODE_LOGIN_DESC")
                    : t("invite:INVITE_MODE_REGISTER_DESC")}
                </div>
                {mode === "login" ? (
                  <Button
                    type="link"
                    style={{ paddingInline: 0 }}
                    onClick={() => setMode("register")}
                  >
                    {t("invite:INVITE_ACTION_SWITCH_TO_REGISTER")}
                  </Button>
                ) : null}
              </div>

              <Divider style={{ margin: "14px 0" }} />

              {mode === "login" ? (
                <>
                  <Typography.Paragraph style={{ marginTop: 0, marginBottom: 12 }}>
                    {hasBoundEmail
                      ? t("invite:INVITE_LOGIN_HINT")
                      : t("invite:INVITE_LOGIN_LINK_HINT")}
                  </Typography.Paragraph>

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
                    <div className="flex flex-col gap-3">
                      <Button
                        type="primary"
                        block
                        size="large"
                        onClick={() => void onBackToLogin()}
                      >
                        {t("invite:INVITE_ACTION_BACK_TO_LOGIN")}
                      </Button>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <InviteRegisterForm
                    emailLocked={hasBoundEmail ? previewQuery.data.invitation.email : null}
                    loading={registerAcceptMutation.isPending}
                    onSubmit={onRegisterAndJoin}
                    onSwitchToLogin={() => setMode("login")}
                  />
                </>
              )}
            </>
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

      <Typography.Title level={1} className="!mt-0 !mb-2 text-center !text-[32px]">
        {headerMeta.title}
      </Typography.Title>
      <Typography.Paragraph className="!mt-0 !mb-7 text-center text-(--color-muted-foreground) !text-[18px]">
        {headerMeta.description}
      </Typography.Paragraph>

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
