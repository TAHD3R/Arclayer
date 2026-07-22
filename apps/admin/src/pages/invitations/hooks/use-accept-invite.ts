import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import * as authApi from "@/api/auth";
import * as invitationApi from "@/api/invitations";
import { listMyWorkspaces } from "@/api/workspaces";
import { useAuthStore } from "@/stores/use-auth-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import {
  getErrorMessage,
  notifyError,
  notifyErrorText,
  notifySuccessText,
} from "@/lib/notifications";
import { ApiError } from "@/lib/http";

import { formatInvitationExpiresRelative, resolveRoleText } from "../utils";
import type { WizardStep } from "../types";

export function useAcceptInvite(rawToken: string | null) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const accessToken = useAuthStore((s) => s.accessToken);
  const clearAuth = useAuthStore((s) => s.clear);
  const setCurrentWorkspaceId = useWorkspaceStore((s) => s.setCurrentWorkspaceId);
  const setCurrentProjectId = useWorkspaceStore((s) => s.setCurrentProjectId);
  const clearWorkspace = useWorkspaceStore((s) => s.clearWorkspace);

  const [step, setStep] = useState<WizardStep>(0);
  const [tokenDialogOpen, setTokenDialogOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const token = (rawToken || "").trim();

  // --- Queries ---

  useEffect(() => {
    setStep(0);
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

  // --- Computed values ---

  const targetName = useMemo(() => {
    if (!previewQuery.data) return "";
    const workspace = previewQuery.data.workspace;
    return workspace?.name || t("invite:INVITE_WORKSPACE_FALLBACK");
  }, [previewQuery.data, t]);

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
    const mode = previewQuery.data?.userExists === false ? "register" : "login";
    await navigate({
      to: "/login",
      search: {
        ...(redirect ? { redirect } : {}),
        ...(token ? { invite: token } : {}),
        mode,
      },
      replace: true,
    });
  };

  const applyToken = async (nextToken: string) => {
    const trimmed = (nextToken || "").trim();
    if (!trimmed) return;
    await navigate({ to: "/invitations", search: { token: trimmed }, replace: true });
  };

  const onContinue = async () => {
    if (previewQuery.isError || !previewQuery.data) return;
    if (!isLoggedIn) {
      await onBackToLogin();
      return;
    }
    setStep(1);
  };

  const onLogoutAndSwitch = async () => {
    clearAuth();
    clearWorkspace();
    await onBackToLogin();
  };

  const applyJoinedWorkspace = async (payload: {
    workspaceId: string | null | undefined;
    projectId?: string | null | undefined;
  }) => {
    if (!payload.workspaceId) {
      notifySuccessText(t("invite:INVITE_JOIN_SUCCESS"));
      await navigate({ to: "/projects", search: { create: undefined }, replace: true });
      return;
    }
    setCurrentWorkspaceId(payload.workspaceId);
    const projectId =
      payload.projectId ??
      (await listMyWorkspaces().then(
        (result) =>
          (result.items ?? []).find((workspace) => workspace.workspaceId === payload.workspaceId)
            ?.projectId ?? null,
      ));
    if (projectId) {
      setCurrentProjectId(projectId);
    }
    notifySuccessText(t("invite:INVITE_JOIN_SUCCESS"));
    await navigate({ to: projectId ? `/projects/${projectId}` : "/projects", replace: true });
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
        workspaceId: accepted.workspaceId,
        projectId: accepted.projectId,
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

  return {
    t,
    token,
    step,
    setStep,
    tokenDialogOpen,
    setTokenDialogOpen,
    confirmOpen,
    setConfirmOpen,
    previewQuery,
    meQuery,
    acceptExistingMutation,
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
    onBackToLogin,
    applyToken,
    onContinue,
    onLogoutAndSwitch,
    joinAsExistingLoggedIn,
    handleConfirmJoin,
  };
}
