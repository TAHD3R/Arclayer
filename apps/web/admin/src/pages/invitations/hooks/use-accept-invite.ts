import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

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
import { buildOrganizationPath } from "@/lib/routing/organization-routing";
import { queryClient } from "@/lib/query/query-client-instance";

import { formatInvitationExpiresRelative, resolveRoleText } from "../utils";
import type { WizardStep, JoinMode } from "../types";

export function useAcceptInvite(rawToken: string | null) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
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
  const [confirmOpen, setConfirmOpen] = useState(false);

  const token = (rawToken || "").trim();

  // --- Queries ---

  useEffect(() => {
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

  // --- Mutations ---

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

  // --- Mode initialization ---

  useEffect(() => {
    if (modeInitializedRef.current) return;
    if (!previewQuery.data) return;
    modeInitializedRef.current = true;
    setMode(previewQuery.data.userExists ? "login" : "register");
  }, [previewQuery.data]);

  // --- Computed values ---

  const isOrgOnlyInvite = previewQuery.data?.workspace === null;

  const targetName = useMemo(() => {
    if (!previewQuery.data) return "";
    return isOrgOnlyInvite
      ? previewQuery.data.organization.name
      : previewQuery.data.workspace?.name ||
          previewQuery.data.organization.name ||
          t("invite:INVITE_WORKSPACE_FALLBACK");
  }, [previewQuery.data, isOrgOnlyInvite, t]);

  const inviteBusinessFailure = useMemo(() => {
    if (!previewQuery.isError) return null;
    const err = previewQuery.error;
    if (!(err instanceof ApiError)) return null;
    const code = (err.error || "").trim();
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
    return formatInvitationExpiresRelative({ t, locale: i18n.language || "en", expiresAt });
  }, [i18n.language, previewQuery.data?.invitation.expiresAt, t]);

  const isLoggedIn = !!accessToken;
  const inviteEmail = (previewQuery.data?.invitation.email || "").trim().toLowerCase();
  const hasBoundEmail = Boolean(inviteEmail);
  const myEmail = (meQuery.data?.email || "").trim().toLowerCase();
  const emailMatches = Boolean(inviteEmail && myEmail && inviteEmail === myEmail);

  // --- Handlers ---

  const onBackToLogin = async () => {
    const redirect = token ? `/invitations?token=${encodeURIComponent(token)}` : undefined;
    await navigate({ to: "/login", search: redirect ? { redirect } : undefined, replace: true });
  };

  const applyToken = async (nextToken: string) => {
    const trimmed = (nextToken || "").trim();
    if (!trimmed) return;
    await navigate({ to: "/invitations", search: { token: trimmed }, replace: true });
  };

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

  const joinAsExistingLoggedIn = () => {
    if (!previewQuery.data) return;
    setConfirmOpen(true);
  };

  const handleConfirmJoin = async () => {
    try {
      const accepted = await acceptExistingMutation.mutateAsync();
      setConfirmOpen(false);
      await applyJoinedWorkspace({
        organizationId: accepted.organizationId || previewQuery.data?.organization.id,
        workspaceId: accepted.workspaceId,
      });
    } catch (err) {
      setConfirmOpen(false);
      if (err instanceof ApiError && err.error === "INVITE_EMAIL_DOMAIN_FORBIDDEN") {
        notifyErrorText(t("invite:INVITE_EMAIL_DOMAIN_FORBIDDEN"));
      } else {
        notifyError(err);
      }
    }
  };

  const onLoginAndJoin = async (values: { password: string; keepSession: boolean }) => {
    if (!previewQuery.data) return;
    if (!previewQuery.data.invitation.email) {
      await onBackToLogin();
      return;
    }
    try {
      const tokens = await loginMutation.mutateAsync({ password: values.password });
      applyLogin(tokens, { keepSession: values.keepSession });
      void queryClient.cancelQueries();
      queryClient.clear();
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
      void queryClient.cancelQueries();
      queryClient.clear();
      await applyJoinedWorkspace({
        organizationId: previewQuery.data.organization.id,
        workspaceId: previewQuery.data.workspace?.id,
      });
    } catch (err) {
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

  return {
    t,
    token,
    step,
    setStep,
    mode,
    setMode,
    tokenDialogOpen,
    setTokenDialogOpen,
    confirmOpen,
    setConfirmOpen,
    previewQuery,
    meQuery,
    acceptExistingMutation,
    registerAcceptMutation,
    loginMutation,
    forgotPasswordMutation,
    isOrgOnlyInvite,
    targetName,
    inviteBusinessFailure,
    inviterLabel,
    roleResolved,
    expiresRelativeText,
    isLoggedIn,
    inviteEmail,
    hasBoundEmail,
    myEmail,
    emailMatches,
    keepSession,
    onBackToLogin,
    applyToken,
    onContinue,
    onLogoutAndSwitch,
    joinAsExistingLoggedIn,
    handleConfirmJoin,
    onLoginAndJoin,
    onRegisterAndJoin,
    onForgotPassword,
  };
}
