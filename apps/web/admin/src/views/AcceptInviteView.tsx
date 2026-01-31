import {
  Avatar,
  Button,
  Checkbox,
  Descriptions,
  Divider,
  Form,
  Input,
  Modal,
  Typography,
} from "antd";
import { Lock, User as UserIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { AnimatePresence, MotionConfig, motion } from "motion/react";

import * as authApi from "@/api/auth";
import * as invitationApi from "@/api/invitations";
import { useAuthStore } from "@/stores/useAuthStore";
import { useOrgStore } from "@/stores/useOrgStore";
import {
  getErrorMessage,
  notifyError,
  notifyErrorText,
  notifySuccessText,
} from "@/utils/notifications";
import { ApiError } from "@/lib/http";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { PageState } from "@/components/app/pageState";
import { InviteTokenInputDialog } from "@/views/invite/components/InviteTokenInputDialog";

type WizardStep = 0 | 1;
type JoinMode = "login" | "register";

// Keep behavior aligned with backend PASSWORD_REGEX (apps/api/common/constants/auth.py).
const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d)[[A-Za-z\d~!@#$%^&*()_\-+=\]{}|;:'",.<>?/]{8,128}$/;

function formatUtcIso(value: string): string {
  try {
    const d = new Date(value);
    return d.toISOString();
  } catch {
    return value;
  }
}

function formatLocal(value: string): string {
  try {
    const d = new Date(value);
    // Keep it simple and consistent; avoid introducing a new date lib for this page.
    return d.toLocaleString();
  } catch {
    return value;
  }
}

function resolveRoleText(
  t: (k: string, opts?: any) => string,
  roleCode: string | null | undefined,
  backendFallback: { name?: string | null; description?: string | null },
): { name: string; description: string | null } {
  const code = (roleCode || "").trim().toLowerCase();
  const known =
    code === "owner" ||
    code === "admin" ||
    code === "architect" ||
    code === "editor" ||
    code === "viewer";
  if (known) {
    const nameKey = `invite:ROLE_${code.toUpperCase()}_NAME`;
    const descKey = `invite:ROLE_${code.toUpperCase()}_DESC`;
    const name = t(nameKey);
    const desc = t(descKey);
    return {
      name: name && name !== nameKey ? name : backendFallback.name || code,
      description: desc && desc !== descKey ? desc : backendFallback.description || null,
    };
  }
  return {
    name: backendFallback.name || code || t("invite:INVITE_ROLE_UNKNOWN"),
    description: backendFallback.description || null,
  };
}

export function AcceptInviteView(props: { token: string | null }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const reducedMotion = usePrefersReducedMotion();

  const accessToken = useAuthStore((s) => s.accessToken);
  const keepSession = useAuthStore((s) => s.keepSession);
  const applyLogin = useAuthStore((s) => s.applyLogin);
  const clearAuth = useAuthStore((s) => s.clear);

  const currentOrgId = useOrgStore((s) => s.currentOrgId);
  const setCurrentOrgId = useOrgStore((s) => s.setCurrentOrgId);
  const clearCurrentOrg = useOrgStore((s) => s.clearCurrentOrg);

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
      username: string;
      displayName?: string;
      password: string;
      confirmPassword: string;
    }) =>
      invitationApi.acceptInvitation({
        token,
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

  const isLoggedIn = !!accessToken;
  const inviteEmail = (previewQuery.data?.invitation.email || "").trim().toLowerCase();
  const myEmail = (meQuery.data?.email || "").trim().toLowerCase();
  const emailMatches = isLoggedIn && !!inviteEmail && !!myEmail && inviteEmail === myEmail;

  const onContinue = () => {
    if (previewQuery.isError || !previewQuery.data) return;
    setStep(1);
  };

  const onLogoutAndSwitch = async () => {
    clearAuth();
    clearCurrentOrg();
    await onBackToLogin();
  };

  const applyJoinedOrg = async (organizationId: string) => {
    setCurrentOrgId(organizationId);
    notifySuccessText(t("invite:INVITE_JOIN_SUCCESS"));
    await navigate({ to: "/", replace: true });
  };

  const joinAsExistingLoggedIn = async () => {
    if (!previewQuery.data) return;
    const orgName = previewQuery.data.organization.name;
    const email = myEmail || inviteEmail;
    const roleName = roleResolved.name;

    Modal.confirm({
      title: t("invite:INVITE_CONFIRM_JOIN_TITLE"),
      content: (
        <div>
          <div style={{ marginBottom: 6 }}>
            {t("invite:INVITE_CONFIRM_JOIN_LINE1", { email, orgName })}
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
          await applyJoinedOrg(accepted.organizationId);
        } catch (err) {
          notifyError(err);
          throw err;
        }
      },
    });
  };

  const onLoginAndJoin = async (values: { password: string; keepSession: boolean }) => {
    if (!previewQuery.data) return;
    try {
      const tokens = await loginMutation.mutateAsync({ password: values.password });
      applyLogin(tokens, { keepSession: values.keepSession });

      const accepted = await acceptExistingMutation.mutateAsync();
      await applyJoinedOrg(accepted.organizationId);
    } catch (err) {
      notifyError(err);
    }
  };

  const onRegisterAndJoin = async (values: {
    username: string;
    displayName?: string;
    password: string;
    confirmPassword: string;
  }) => {
    if (!previewQuery.data) return;
    try {
      const tokens = await registerAcceptMutation.mutateAsync(values);
      applyLogin(tokens, { keepSession: true });
      await applyJoinedOrg(previewQuery.data.organization.id);
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
              <Descriptions size="middle" column={1} bordered styles={{ label: { width: 120 } }}>
                <Descriptions.Item label={t("invite:INVITE_FIELD_ORG")}>
                  <div className="flex items-center gap-2">
                    <Avatar size={24} src={previewQuery.data.organization.logoUrl || undefined}>
                      {(previewQuery.data.organization.name || "O").slice(0, 1)}
                    </Avatar>
                    <span>{previewQuery.data.organization.name}</span>
                    <span className="text-(--color-muted-foreground) text-xs">
                      {previewQuery.data.organization.slug
                        ? `(${previewQuery.data.organization.slug})`
                        : null}
                    </span>
                  </div>
                </Descriptions.Item>

                <Descriptions.Item label={t("invite:INVITE_FIELD_INVITER")}>
                  {inviterLabel ? (
                    <div className="flex items-center gap-2">
                      <Avatar size={24} src={previewQuery.data.inviter?.avatarUrl || undefined}>
                        {(inviterLabel || "U").slice(0, 1)}
                      </Avatar>
                      <span>{inviterLabel}</span>
                    </div>
                  ) : (
                    <span className="text-(--color-muted-foreground)">
                      {t("invite:INVITE_INVITER_UNKNOWN")}
                    </span>
                  )}
                </Descriptions.Item>

                <Descriptions.Item label={t("invite:INVITE_FIELD_EMAIL")}>
                  <div>
                    <div>{previewQuery.data.invitation.maskedEmail}</div>
                    <div className="text-(--color-muted-foreground) text-xs">
                      {t("invite:INVITE_EMAIL_BOUND_HELP")}
                    </div>
                  </div>
                </Descriptions.Item>

                <Descriptions.Item label={t("invite:INVITE_FIELD_ROLE")}>
                  <div>
                    <div>{roleResolved.name}</div>
                    {roleResolved.description ? (
                      <div className="text-(--color-muted-foreground) text-xs">
                        {roleResolved.description}
                      </div>
                    ) : null}
                  </div>
                </Descriptions.Item>

                <Descriptions.Item label={t("invite:INVITE_FIELD_EXPIRES")}>
                  {previewQuery.data.invitation.expiresAt ? (
                    <div>
                      <div>{formatLocal(previewQuery.data.invitation.expiresAt)}</div>
                      <div className="text-(--color-muted-foreground) text-xs">
                        UTC: {formatUtcIso(previewQuery.data.invitation.expiresAt)}
                      </div>
                    </div>
                  ) : (
                    <span className="text-(--color-muted-foreground)">
                      {t("invite:INVITE_EXPIRES_NEVER")}
                    </span>
                  )}
                </Descriptions.Item>
              </Descriptions>

              <div className="mt-4 text-xs text-(--color-muted-foreground)">
                {t("invite:INVITE_SECURITY_NOTICE")}
              </div>

              <div className="mt-6 flex items-center justify-between gap-3">
                <Button onClick={() => void onBackToLogin()}>
                  {t("invite:INVITE_ACTION_BACK_TO_LOGIN")}
                </Button>
                <Button type="primary" onClick={onContinue}>
                  {t("invite:INVITE_ACTION_CONTINUE")}
                </Button>
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
                  {emailMatches
                    ? t("invite:INVITE_LOGGED_IN_MATCH")
                    : t("invite:INVITE_LOGGED_IN_MISMATCH")}
                </Typography.Text>
                <div className="mt-2 text-sm">
                  <div>
                    {t("invite:INVITE_CURRENT_ACCOUNT")}{" "}
                    <strong>{meQuery.data?.email || t("invite:INVITE_EMAIL_UNKNOWN")}</strong>
                  </div>
                  <div>
                    {t("invite:INVITE_INVITED_EMAIL")}{" "}
                    <strong>{previewQuery.data.invitation.maskedEmail}</strong>
                  </div>
                  {currentOrgId ? (
                    <div
                      className="text-xs text-(--color-muted-foreground)"
                      style={{ marginTop: 6 }}
                    >
                      {t("invite:INVITE_CURRENT_ORG_HINT", { orgId: currentOrgId })}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="mt-6 flex items-center justify-between gap-3">
                <Button onClick={() => setStep(0)}>{t("invite:INVITE_ACTION_BACK")}</Button>
                {emailMatches ? (
                  <Button
                    type="primary"
                    loading={acceptExistingMutation.isPending}
                    onClick={() => void joinAsExistingLoggedIn()}
                  >
                    {t("invite:INVITE_ACTION_JOIN")}
                  </Button>
                ) : (
                  <Button onClick={() => void onLogoutAndSwitch()}>
                    {t("invite:INVITE_ACTION_LOGOUT_SWITCH")}
                  </Button>
                )}
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
                <Button
                  type="link"
                  style={{ paddingInline: 0 }}
                  onClick={() => setMode((m) => (m === "login" ? "register" : "login"))}
                >
                  {mode === "login"
                    ? t("invite:INVITE_ACTION_SWITCH_TO_REGISTER")
                    : t("invite:INVITE_ACTION_SWITCH_TO_LOGIN")}
                </Button>
              </div>

              <Divider style={{ margin: "14px 0" }} />

              {mode === "login" ? (
                <>
                  <Typography.Paragraph style={{ marginTop: 0, marginBottom: 12 }}>
                    {t("invite:INVITE_LOGIN_HINT")}
                  </Typography.Paragraph>

                  <Form<{ password: string; keepSession: boolean }>
                    layout="vertical"
                    requiredMark={false}
                    autoComplete="off"
                    initialValues={{ keepSession }}
                    onFinish={onLoginAndJoin}
                    disabled={loginMutation.isPending || acceptExistingMutation.isPending}
                  >
                    <Form.Item label={t("invite:INVITE_FIELD_EMAIL")} style={{ marginBottom: 12 }}>
                      <Input value={previewQuery.data.invitation.email} disabled size="large" />
                    </Form.Item>

                    <Form.Item
                      name="password"
                      rules={[{ required: true, message: t("auth:VALIDATION_PASSWORD_REQUIRED") }]}
                    >
                      <Input.Password
                        autoComplete="current-password"
                        aria-label={t("auth:FIELD_PASSWORD_LABEL")}
                        placeholder={t("auth:FIELD_PASSWORD_PLACEHOLDER")}
                        prefix={<Lock size={16} />}
                        size="large"
                      />
                    </Form.Item>

                    <div className="flex items-center justify-between mb-3">
                      <Form.Item
                        name="keepSession"
                        valuePropName="checked"
                        style={{ marginBottom: 0 }}
                      >
                        <Checkbox>{t("auth:KEEP_SESSION")}</Checkbox>
                      </Form.Item>
                      <Button
                        type="link"
                        size="small"
                        style={{ paddingInline: 0 }}
                        onClick={() => void onForgotPassword()}
                        disabled={forgotPasswordMutation.isPending}
                      >
                        {t("auth:FORGOT_PASSWORD")}
                      </Button>
                    </div>

                    <Button
                      type="primary"
                      htmlType="submit"
                      block
                      size="large"
                      loading={loginMutation.isPending || acceptExistingMutation.isPending}
                    >
                      {t("invite:INVITE_ACTION_LOGIN_JOIN")}
                    </Button>

                    <div className="mt-4 flex items-center justify-between">
                      <Button onClick={() => setStep(0)}>{t("invite:INVITE_ACTION_BACK")}</Button>
                      <Button onClick={() => void onBackToLogin()}>
                        {t("invite:INVITE_ACTION_BACK_TO_LOGIN")}
                      </Button>
                    </div>
                  </Form>
                </>
              ) : (
                <>
                  <Typography.Paragraph style={{ marginTop: 0, marginBottom: 12 }}>
                    {t("invite:INVITE_REGISTER_HINT")}
                  </Typography.Paragraph>

                  <Form<{
                    username: string;
                    displayName?: string;
                    password: string;
                    confirmPassword: string;
                  }>
                    layout="vertical"
                    requiredMark={false}
                    autoComplete="off"
                    onFinish={onRegisterAndJoin}
                    disabled={registerAcceptMutation.isPending}
                  >
                    <Form.Item label={t("invite:INVITE_FIELD_EMAIL")} style={{ marginBottom: 12 }}>
                      <Input value={previewQuery.data.invitation.email} disabled size="large" />
                    </Form.Item>

                    <Form.Item
                      name="username"
                      rules={[{ required: true, message: t("auth:VALIDATION_USERNAME_REQUIRED") }]}
                    >
                      <Input
                        autoComplete="off"
                        aria-label={t("auth:FIELD_USERNAME_LABEL")}
                        placeholder={t("auth:FIELD_USERNAME_PLACEHOLDER")}
                        prefix={<UserIcon size={16} />}
                        size="large"
                      />
                    </Form.Item>

                    <Form.Item
                      name="displayName"
                      rules={[{ max: 64, message: t("setup:SETUP_VALIDATION_DISPLAY_NAME_MAX") }]}
                    >
                      <Input
                        autoComplete="off"
                        aria-label={t("setup:SETUP_FIELD_DISPLAY_NAME_LABEL")}
                        placeholder={t("setup:SETUP_FIELD_DISPLAY_NAME_PLACEHOLDER")}
                        size="large"
                      />
                    </Form.Item>

                    <Form.Item
                      name="password"
                      rules={[
                        { required: true, message: t("auth:VALIDATION_PASSWORD_REQUIRED") },
                        {
                          validator: async (_, value) => {
                            if (!value) return;
                            if (PASSWORD_REGEX.test(value)) return;
                            throw new Error(t("auth:PASSWORD_INVALID"));
                          },
                        },
                      ]}
                    >
                      <Input.Password
                        autoComplete="new-password"
                        aria-label={t("auth:FIELD_PASSWORD_LABEL")}
                        placeholder={t("auth:FIELD_PASSWORD_PLACEHOLDER")}
                        prefix={<Lock size={16} />}
                        size="large"
                      />
                    </Form.Item>

                    <Form.Item
                      name="confirmPassword"
                      dependencies={["password"]}
                      rules={[
                        { required: true, message: t("auth:VALIDATION_CONFIRM_PASSWORD_REQUIRED") },
                        ({ getFieldValue }) => ({
                          validator: async (_, value) => {
                            const pwd = getFieldValue("password");
                            if (!value || value === pwd) return;
                            throw new Error(t("auth:VALIDATION_PASSWORD_MISMATCH"));
                          },
                        }),
                      ]}
                    >
                      <Input.Password
                        autoComplete="new-password"
                        aria-label={t("auth:FIELD_CONFIRM_PASSWORD_LABEL")}
                        placeholder={t("auth:FIELD_CONFIRM_PASSWORD_PLACEHOLDER")}
                        prefix={<Lock size={16} />}
                        size="large"
                      />
                    </Form.Item>

                    <Button
                      type="primary"
                      htmlType="submit"
                      block
                      size="large"
                      loading={registerAcceptMutation.isPending}
                    >
                      {t("invite:INVITE_ACTION_REGISTER_JOIN")}
                    </Button>

                    <div className="mt-4 flex items-center justify-between">
                      <Button onClick={() => setStep(0)}>{t("invite:INVITE_ACTION_BACK")}</Button>
                      <Button onClick={() => void onBackToLogin()}>
                        {t("invite:INVITE_ACTION_BACK_TO_LOGIN")}
                      </Button>
                    </div>
                  </Form>
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

      <Typography.Title level={1} style={{ marginTop: 0, marginBottom: 8, fontSize: 32 }}>
        {headerMeta.title}
      </Typography.Title>
      <Typography.Paragraph
        style={{
          marginTop: 0,
          marginBottom: 26,
          color: "var(--color-muted-foreground)",
          fontSize: 18,
        }}
      >
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
