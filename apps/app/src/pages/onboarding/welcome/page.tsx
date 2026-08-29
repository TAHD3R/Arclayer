import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { LoaderCircle } from "lucide-react";
import { useTranslation } from "react-i18next";

import * as authApi from "@/api/auth";
import { listWorkspaceRoles } from "@/api/rbac";
import { patchCoreSettings } from "@/api/settings";
import { createTeamInvitation } from "@/api/team";
import { createWorkspace } from "@/api/workspace-management";
import {
  createMyOnboardingWorkspace,
  getWorkspaceDetail,
  listMyWorkspaces,
  patchWorkspaceDetail,
  patchWorkspaceRolePolicy,
} from "@/api/workspaces";
import { OnboardingLayout } from "@/layouts/onboarding-layout";
import { uploadSingleAssetFromFile } from "@/lib/assets/scoped-uploads";
import {
  AssetUploadCleanupError,
  completeAssetUpload,
  getAssetUploadCompletionCheckpoint,
  type AssetUploadCompletionCheckpoint,
} from "@/lib/assets/upload-completion";
import { DEFAULT_LOCALE, detectBrowserLocale, normalizeLocale } from "@/lib/i18n";
import { DEFAULT_DATE_FORMAT, DEFAULT_TIMEZONE } from "@/lib/time/datetime-config";
import { notifyError, notifyErrorText, notifySuccessText } from "@/lib/notifications";
import { projectsHomePath } from "@/lib/routing/workspace-routing";
import { usePreferencesStore } from "@/stores/use-preference-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import { uploadAvatarFile } from "@/pages/usercenter/profile/lib/avatar-upload";
import { Button } from "@arclayer/ui/button";
import { getWelcomeStepDescriptionKey, getWelcomeStepTitleKey } from "./lib/onboarding-copy";
import {
  isValidWelcomeDisplayName,
  isWorkspaceNameValid,
  normalizeWelcomeDisplayName,
  validateInviteRow,
} from "./lib/onboarding-validation";
import { OnboardingStepHeader } from "./components/onboarding-step-header";
import {
  OnboardingMotionItem,
  OnboardingStepTransition,
} from "./components/onboarding-step-transition";
import { UserProfilePreferencesStep } from "./components/steps/user-profile-preferences-step";
import { WorkspaceCreateStep } from "./components/steps/workspace-create-step";
import { TeamCollaborationStep } from "./components/steps/team-collaboration-step";
import { WorkspaceCustomizationStep } from "./components/steps/workspace-customization-step";
import { WelcomeFieldError } from "./components/welcome-field-error";
import type {
  InviteDraftRow,
  OnboardingFlowMode,
  RoleOption,
  UserProfileDraft,
  WelcomeHeardAboutUs,
  WelcomeMode,
  WelcomeOnboardingStepId,
  WorkspaceDraft,
} from "./types";

const CREATE_WORKSPACE_SESSION_KEY = "arclayer:onboarding:create-workspace:workspace-id";
const FIRST_RUN_STEPS: readonly WelcomeOnboardingStepId[] = [
  "profile",
  "workspace",
  "team",
  "teamType",
  "heardAboutUs",
];
const CREATE_WORKSPACE_STEPS: readonly WelcomeOnboardingStepId[] = [
  "workspace",
  "team",
  "teamType",
  "heardAboutUs",
];
const INVITATION_STEPS: readonly WelcomeOnboardingStepId[] = [
  "profile",
  "teamType",
  "heardAboutUs",
];

class WelcomeStepError extends Error {}

function getBrowserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIMEZONE;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

function resolveDefaultDateFormat(locale: string) {
  const normalized = normalizeLocale(locale || DEFAULT_LOCALE);
  if (normalized === "en-US") return "MM/DD/YYYY";
  return DEFAULT_DATE_FORMAT;
}

function buildInviteRows(defaultRoleCode: string): InviteDraftRow[] {
  return [1, 2, 3].map((value) => ({
    id: `invite-${value}`,
    email: "",
    roleCode: defaultRoleCode,
    status: "idle" as const,
    error: null,
  }));
}

function getWorkspaceIdFromOnboarding(data: Awaited<ReturnType<typeof listMyWorkspaces>>) {
  return data.onboarding?.workspaceId ?? null;
}

function buildRoleOptions(
  roles: Awaited<ReturnType<typeof listWorkspaceRoles>> | undefined,
  fallback: RoleOption[],
) {
  const items = roles?.items ?? [];
  if (items.length === 0) return fallback;
  return items.map((role) => ({ label: role.name, value: role.code }));
}

function hasDryRunSearch(search: { dryRun?: unknown }): boolean {
  if (search.dryRun === "1") return true;
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("dryRun") === "1";
}

export function WelcomeOnboardingPage() {
  const { t } = useTranslation(["onboarding", "common", "assets", "account"]);
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as {
    dryRun?: "1";
    mode?: "create-workspace" | "invitation";
    redirect?: string;
  };
  const queryClient = useQueryClient();
  const reduceMotion = usePreferencesStore((state) => state.reduceMotion);
  const setCurrentContext = useWorkspaceStore((state) => state.setCurrentContext);
  const browserTimezone = useMemo(() => getBrowserTimeZone(), []);
  const mode: WelcomeMode = import.meta.env.DEV && hasDryRunSearch(search) ? "dry-run" : "real";
  const isDryRun = mode === "dry-run";
  const flowMode: OnboardingFlowMode = !isDryRun
    ? search.mode === "create-workspace"
      ? "create-workspace"
      : search.mode === "invitation"
        ? "invitation"
        : "first-run"
    : "first-run";
  const visibleSteps =
    flowMode === "create-workspace"
      ? CREATE_WORKSPACE_STEPS
      : flowMode === "invitation"
        ? INVITATION_STEPS
        : FIRST_RUN_STEPS;

  const [step, setStep] = useState<WelcomeOnboardingStepId>(() =>
    flowMode === "create-workspace" ? "workspace" : "profile",
  );
  const [direction, setDirection] = useState<1 | -1>(1);
  const [createdWorkspaceId, setCreatedWorkspaceId] = useState<string | null>(
    isDryRun ? "dry-run-workspace" : null,
  );
  const [stepError, setStepError] = useState<string | null>(null);
  const [profileDraft, setProfileDraft] = useState<UserProfileDraft>(() => ({
    displayName: "",
    avatarUrl: null,
    avatarAssetId: null,
    jobRole: null,
    companySize: null,
    subscribedProductUpdates: false,
  }));
  const [workspaceDraft, setWorkspaceDraft] = useState<WorkspaceDraft>(() => {
    const locale = detectBrowserLocale();
    return {
      name: "",
      description: "",
      iconUrl: null,
      defaultRoleCode: "editor",
      locale,
      timezone: browserTimezone,
      dateFormat: resolveDefaultDateFormat(locale),
      useRelativeDateTime: true,
    };
  });
  const [workspaceErrors, setWorkspaceErrors] = useState<Record<string, string | null>>({});
  const [inviteRows, setInviteRows] = useState<InviteDraftRow[]>(() => buildInviteRows("editor"));
  const [selectedTeamType, setSelectedTeamType] = useState<string | null>(null);
  const [selectedHeardAboutUs, setSelectedHeardAboutUs] = useState<WelcomeHeardAboutUs>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [avatarCompletionCheckpoint, setAvatarCompletionCheckpoint] =
    useState<AssetUploadCompletionCheckpoint | null>(null);
  const [workspaceIconPreviewUrl, setWorkspaceIconPreviewUrl] = useState<string | null>(null);
  const [workspaceIconFile, setWorkspaceIconFile] = useState<File | null>(null);
  const [workspaceNameTouched, setWorkspaceNameTouched] = useState(false);
  const avatarFileInputRef = useRef<HTMLInputElement | null>(null);
  const workspaceIconFileInputRef = useRef<HTMLInputElement | null>(null);
  const initializedRef = useRef(false);

  const workspacesQuery = useQuery({
    queryKey: ["me", "workspaces", "welcome-onboarding"],
    queryFn: listMyWorkspaces,
    enabled: !isDryRun && flowMode !== "create-workspace",
    retry: false,
    meta: { silent: true },
  });
  const profileQuery = useQuery({
    queryKey: ["me", "profile", "welcome-onboarding"],
    queryFn: authApi.me,
    enabled: !isDryRun,
    retry: false,
    meta: { silent: true },
  });
  const onboardingProfileQuery = useQuery({
    queryKey: ["me", "onboarding-profile", "welcome-onboarding"],
    queryFn: authApi.getMyOnboardingProfile,
    enabled: !isDryRun && flowMode !== "create-workspace",
    retry: false,
    meta: { silent: true },
  });
  const workspaceDetailQuery = useQuery({
    queryKey: ["workspace", "detail", "welcome-onboarding", createdWorkspaceId],
    queryFn: async () => getWorkspaceDetail(String(createdWorkspaceId)),
    enabled: !isDryRun && Boolean(createdWorkspaceId),
    retry: false,
    meta: { silent: true },
  });
  const rolesQuery = useQuery({
    queryKey: ["workspace", "rbac", "roles", "welcome-onboarding", createdWorkspaceId],
    queryFn: async () => listWorkspaceRoles(String(createdWorkspaceId), { page: 1, size: 200 }),
    enabled: !isDryRun && Boolean(createdWorkspaceId),
    retry: false,
    meta: { silent: true },
  });

  const fallbackRoleOptions = useMemo<RoleOption[]>(
    () => [
      { label: t("onboarding:WELCOME_ROLE_ADMIN"), value: "admin" },
      { label: t("onboarding:WELCOME_ROLE_EDITOR"), value: "editor" },
      { label: t("onboarding:WELCOME_ROLE_VIEWER"), value: "viewer" },
    ],
    [t],
  );
  const roleOptions = useMemo(
    () => buildRoleOptions(rolesQuery.data, fallbackRoleOptions),
    [fallbackRoleOptions, rolesQuery.data],
  );
  const currentTitle = t(`onboarding:${getWelcomeStepTitleKey(step)}`);
  const descriptionKey = getWelcomeStepDescriptionKey(step);
  const currentDescription = descriptionKey ? t(`onboarding:${descriptionKey}`) : undefined;
  const normalizedDisplayName = normalizeWelcomeDisplayName(profileDraft.displayName);
  const displayNameError =
    normalizedDisplayName && !isValidWelcomeDisplayName(normalizedDisplayName)
      ? t("onboarding:WELCOME_PROFILE_DISPLAY_NAME_INVALID")
      : null;
  const isProfileStepDisabled = !normalizedDisplayName || Boolean(displayNameError);
  const jobRoleOptions = useMemo(
    () => [
      { value: "content_manager", label: t("onboarding:WELCOME_PROFILE_JOB_ROLE_CONTENT_MANAGER") },
      { value: "website_manager", label: t("onboarding:WELCOME_PROFILE_JOB_ROLE_WEBSITE_MANAGER") },
      { value: "marketing_lead", label: t("onboarding:WELCOME_PROFILE_JOB_ROLE_MARKETING_LEAD") },
      { value: "founder_owner", label: t("onboarding:WELCOME_PROFILE_JOB_ROLE_FOUNDER_OWNER") },
      {
        value: "developer_builder",
        label: t("onboarding:WELCOME_PROFILE_JOB_ROLE_DEVELOPER_BUILDER"),
      },
      { value: "product_manager", label: t("onboarding:WELCOME_PROFILE_JOB_ROLE_PRODUCT_MANAGER") },
      { value: "ai_operations", label: t("onboarding:WELCOME_PROFILE_JOB_ROLE_AI_OPERATIONS") },
      { value: "agency_partner", label: t("onboarding:WELCOME_PROFILE_JOB_ROLE_AGENCY_PARTNER") },
      { value: "other", label: t("onboarding:WELCOME_PROFILE_JOB_ROLE_OTHER") },
    ],
    [t],
  );
  const companySizeOptions = useMemo(
    () => [
      { value: "solo", label: t("onboarding:WELCOME_PROFILE_COMPANY_SIZE_SOLO") },
      { value: "2_10", label: t("onboarding:WELCOME_PROFILE_COMPANY_SIZE_2_10") },
      { value: "11_50", label: t("onboarding:WELCOME_PROFILE_COMPANY_SIZE_11_50") },
      { value: "51_200", label: t("onboarding:WELCOME_PROFILE_COMPANY_SIZE_51_200") },
      { value: "201_1000", label: t("onboarding:WELCOME_PROFILE_COMPANY_SIZE_201_1000") },
      { value: "1001_plus", label: t("onboarding:WELCOME_PROFILE_COMPANY_SIZE_1001_PLUS") },
    ],
    [t],
  );
  const teamTypeOptions = useMemo(
    () => [
      { value: "content", label: t("onboarding:WELCOME_CUSTOMIZE_TEAM_TYPE_CONTENT") },
      { value: "marketing", label: t("onboarding:WELCOME_CUSTOMIZE_TEAM_TYPE_MARKETING") },
      { value: "agency", label: t("onboarding:WELCOME_CUSTOMIZE_TEAM_TYPE_AGENCY") },
      { value: "developer", label: t("onboarding:WELCOME_CUSTOMIZE_TEAM_TYPE_DEVELOPER") },
      { value: "founder", label: t("onboarding:WELCOME_CUSTOMIZE_TEAM_TYPE_FOUNDER") },
      { value: "other", label: t("onboarding:WELCOME_CUSTOMIZE_TEAM_TYPE_OTHER") },
    ],
    [t],
  );
  const heardAboutUsOptions = useMemo(
    () => [
      { value: "search", label: t("onboarding:WELCOME_CUSTOMIZE_HEARD_SEARCH") },
      { value: "social", label: t("onboarding:WELCOME_CUSTOMIZE_HEARD_SOCIAL") },
      { value: "referral", label: t("onboarding:WELCOME_CUSTOMIZE_HEARD_REFERRAL") },
      {
        value: "community_event",
        label: t("onboarding:WELCOME_CUSTOMIZE_HEARD_COMMUNITY_EVENT"),
      },
      {
        value: "article_newsletter",
        label: t("onboarding:WELCOME_CUSTOMIZE_HEARD_ARTICLE_NEWSLETTER"),
      },
      { value: "ai_directory", label: t("onboarding:WELCOME_CUSTOMIZE_HEARD_AI_DIRECTORY") },
      {
        value: "agency_consultant",
        label: t("onboarding:WELCOME_CUSTOMIZE_HEARD_AGENCY_CONSULTANT"),
      },
      { value: "other", label: t("onboarding:WELCOME_CUSTOMIZE_HEARD_OTHER") },
    ],
    [t],
  );

  useEffect(() => {
    if (isDryRun || flowMode !== "first-run" || !workspacesQuery.data || initializedRef.current) {
      return;
    }
    const onboarding = workspacesQuery.data.onboarding ?? {
      status: "completed" as const,
      workspaceId: null,
    };
    const onboardingWorkspaceId = getWorkspaceIdFromOnboarding(workspacesQuery.data);
    if (onboarding.status === "pending_workspace_defaults" && onboardingWorkspaceId) {
      setCreatedWorkspaceId(onboardingWorkspaceId);
      setStep("workspace");
    }
    initializedRef.current = true;
  }, [flowMode, isDryRun, workspacesQuery.data]);

  useEffect(() => {
    if (isDryRun || flowMode !== "create-workspace" || initializedRef.current) return;
    try {
      const workspaceId = window.sessionStorage.getItem(CREATE_WORKSPACE_SESSION_KEY);
      if (workspaceId) {
        setCreatedWorkspaceId(workspaceId);
      }
    } catch {
      // sessionStorage is only a duplicate-creation guard; ignore unavailable storage.
    }
    initializedRef.current = true;
  }, [flowMode, isDryRun]);

  useEffect(() => {
    if (isDryRun || !profileQuery.data) return;
    const displayName = profileQuery.data.displayName ?? profileQuery.data.username ?? "";
    setProfileDraft((current) => ({
      ...current,
      displayName,
      avatarUrl: profileQuery.data.avatarUrl ?? current.avatarUrl ?? null,
      avatarAssetId: profileQuery.data.avatarAssetId ?? current.avatarAssetId ?? null,
    }));
  }, [isDryRun, profileQuery.data]);

  useEffect(() => {
    if (isDryRun || !onboardingProfileQuery.data) return;
    setProfileDraft((current) => ({
      ...current,
      jobRole: onboardingProfileQuery.data.jobRole ?? current.jobRole,
      companySize: onboardingProfileQuery.data.companySize ?? current.companySize,
      subscribedProductUpdates:
        onboardingProfileQuery.data.subscribedProductUpdates ?? current.subscribedProductUpdates,
    }));
    setSelectedHeardAboutUs(onboardingProfileQuery.data.heardAboutUs ?? null);
  }, [isDryRun, onboardingProfileQuery.data]);

  useEffect(() => {
    if (!workspaceDetailQuery.data) return;
    setWorkspaceDraft((current) => ({
      ...current,
      name: current.name || workspaceDetailQuery.data.name,
      description: current.description || workspaceDetailQuery.data.description || "",
      iconUrl: workspaceDetailQuery.data.iconUrl ?? current.iconUrl,
    }));
  }, [workspaceDetailQuery.data]);

  useEffect(() => {
    if (flowMode !== "first-run") return;
    if (workspaceNameTouched) return;
    const displayName = normalizeWelcomeDisplayName(profileDraft.displayName);
    if (!displayName) return;
    const defaultName = t("onboarding:WELCOME_WORKSPACE_DEFAULT_NAME", { name: displayName });
    setWorkspaceDraft((current) =>
      current.name === defaultName ? current : { ...current, name: defaultName },
    );
  }, [flowMode, profileDraft.displayName, t, workspaceNameTouched]);

  useEffect(() => {
    setInviteRows((rows) =>
      rows.map((row) =>
        row.roleCode ? row : { ...row, roleCode: workspaceDraft.defaultRoleCode },
      ),
    );
  }, [workspaceDraft.defaultRoleCode]);

  useEffect(() => {
    return () => {
      if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
      if (workspaceIconPreviewUrl) URL.revokeObjectURL(workspaceIconPreviewUrl);
    };
  }, [avatarPreviewUrl, workspaceIconPreviewUrl]);

  const avatarUploadMutation = useMutation({
    mutationFn: async (file: File) => uploadAvatarFile(file),
    onSuccess: persistCompletedAvatar,
    onError: handleAvatarUploadError,
  });
  const avatarCompletionMutation = useMutation({
    mutationFn: completeAssetUpload,
    onSuccess: persistCompletedAvatar,
    onError: handleAvatarUploadError,
  });

  async function persistCompletedAvatar(assetId: string) {
    const updated = await authApi.updateMyProfile({ avatar_asset_id: assetId });
    setProfileDraft((current) => ({
      ...current,
      avatarUrl: updated.avatarUrl ?? current.avatarUrl,
      avatarAssetId: updated.avatarAssetId ?? assetId,
    }));
    setAvatarCompletionCheckpoint(null);
  }

  function handleAvatarUploadError(error: unknown) {
    const checkpoint = getAssetUploadCompletionCheckpoint(error);
    if (checkpoint) {
      setAvatarCompletionCheckpoint(checkpoint);
      return;
    }
    if (error instanceof AssetUploadCleanupError) {
      notifyError(new Error(t("account:ME_PROFILE_AVATAR_CLEANUP_FAILED"), { cause: error }));
      return;
    }
    notifyError(error);
  }

  const submitStepMutation = useMutation({
    mutationFn: async () => {
      if (step === "profile") {
        await submitProfileStep();
        return;
      }
      if (step === "workspace") {
        await submitWorkspaceStep();
        return;
      }
      if (step === "team") {
        await submitInviteStep();
        return;
      }
      await submitCustomizeStep();
    },
    onError: (error) => {
      const message =
        error instanceof WelcomeStepError
          ? error.message
          : t("onboarding:WELCOME_GENERIC_SAVE_ERROR");
      if (!(error instanceof WelcomeStepError)) {
        console.error("Failed to save onboarding step", error);
      }
      setStepError(message);
      notifyErrorText(message);
    },
  });

  async function submitProfileStep() {
    if (!normalizedDisplayName) {
      throw new WelcomeStepError(t("onboarding:WELCOME_PROFILE_DISPLAY_NAME_REQUIRED"));
    }
    if (!isValidWelcomeDisplayName(normalizedDisplayName)) {
      throw new WelcomeStepError(t("onboarding:WELCOME_PROFILE_DISPLAY_NAME_INVALID"));
    }

    if (!isDryRun) {
      await authApi.updateMyProfile({ displayName: normalizedDisplayName });
      await authApi.patchMyOnboardingProfile({
        jobRole: profileDraft.jobRole,
        companySize: profileDraft.companySize,
        subscribedProductUpdates: profileDraft.subscribedProductUpdates,
      });
    }

    notifySuccessText(t("onboarding:WELCOME_PROFILE_SAVED"));
    goNextStep();
  }

  async function submitWorkspaceStep() {
    const errors: Record<string, string | null> = {};
    if (!isWorkspaceNameValid(workspaceDraft.name)) {
      errors.name = t("common:ORG_WORKSPACES_FIELD_NAME_REQUIRED");
    }
    if (!workspaceDraft.defaultRoleCode) {
      errors.defaultRoleCode = t("onboarding:WELCOME_WORKSPACE_DEFAULT_ROLE_REQUIRED");
    }
    setWorkspaceErrors(errors);
    if (Object.values(errors).some(Boolean)) {
      throw new WelcomeStepError(t("onboarding:WELCOME_WORKSPACE_VALIDATION_ERROR"));
    }

    if (isDryRun) {
      notifySuccessText(t("onboarding:WELCOME_WORKSPACE_SAVED"));
      goNextStep();
      return;
    }

    let workspaceId = createdWorkspaceId;
    if (!workspaceId) {
      workspaceId =
        flowMode === "create-workspace"
          ? (
              await createWorkspace({
                name: workspaceDraft.name.trim(),
                description: workspaceDraft.description.trim() || undefined,
                template: "blank",
                locale: workspaceDraft.locale,
                timezone: workspaceDraft.timezone,
                dateFormat: workspaceDraft.dateFormat,
              })
            ).workspaceId
          : (await createMyOnboardingWorkspace({ name: workspaceDraft.name.trim() })).workspaceId;
    }
    setCreatedWorkspaceId(workspaceId);
    if (flowMode === "create-workspace") {
      try {
        window.sessionStorage.setItem(CREATE_WORKSPACE_SESSION_KEY, workspaceId);
      } catch {
        // sessionStorage is only a duplicate-creation guard; ignore unavailable storage.
      }
    }

    let nextIconUrl = workspaceDraft.iconUrl;
    if (workspaceIconFile) {
      const assetId = await uploadSingleAssetFromFile({
        scope: { type: "workspace", id: workspaceId },
        purpose: "workspace_icon",
        file: workspaceIconFile,
        t,
      });
      nextIconUrl = `/assets/${assetId}`;
      setWorkspaceIconFile(null);
      setWorkspaceDraft((current) => ({ ...current, iconUrl: nextIconUrl }));
    }

    await patchWorkspaceDetail(workspaceId, {
      name: workspaceDraft.name.trim(),
      description: workspaceDraft.description.trim() || null,
      iconMode: nextIconUrl ? "image" : "initials",
      iconUrl: nextIconUrl,
      iconGlyph: null,
      iconEmoji: null,
    });
    await patchWorkspaceRolePolicy(workspaceId, {
      defaultRoleCode: workspaceDraft.defaultRoleCode,
    });
    await patchCoreSettings(workspaceId, {
      workspace_localization: {
        locale: workspaceDraft.locale,
        timezone: workspaceDraft.timezone,
        use_browser_timezone: false,
        date_format: workspaceDraft.dateFormat,
        use_relative_datetime: workspaceDraft.useRelativeDateTime,
      },
    });
    if (flowMode === "first-run") {
      await workspacesQuery.refetch();
    } else {
      await invalidateWorkspaceQueries();
    }
    notifySuccessText(t("onboarding:WELCOME_WORKSPACE_SAVED"));
    goNextStep();
  }

  async function submitInviteStep() {
    const nextRows = inviteRows.map((row) => {
      const result = validateInviteRow(row);
      if (result === "invalid-email") {
        return { ...row, error: t("onboarding:WELCOME_INVITE_INVALID_EMAIL") };
      }
      if (result === "missing-role") {
        return { ...row, error: t("onboarding:WELCOME_INVITE_MISSING_ROLE") };
      }
      return { ...row, error: null };
    });
    setInviteRows(nextRows);

    if (nextRows.some((row) => row.error)) {
      throw new WelcomeStepError(t("onboarding:WELCOME_INVITE_VALIDATION_ERROR"));
    }

    const rowsToSend = nextRows.filter((row) => validateInviteRow(row) === "valid");
    if (rowsToSend.length === 0 || isDryRun) {
      setInviteRows((rows) =>
        rows.map((row) =>
          validateInviteRow(row) === "valid" ? { ...row, status: "sent", error: null } : row,
        ),
      );
      notifySuccessText(t("onboarding:WELCOME_INVITE_SAVED"));
      goNextStep();
      return;
    }

    if (!createdWorkspaceId) {
      throw new WelcomeStepError(t("onboarding:WELCOME_WORKSPACE_REQUIRED_FOR_INVITES"));
    }

    const results = await Promise.allSettled(
      rowsToSend.map((row) =>
        createTeamInvitation({
          workspaceId: createdWorkspaceId,
          email: row.email.trim(),
          roleCode: row.roleCode,
        }),
      ),
    );
    const failedIds = new Set<string>();
    results.forEach((result, index) => {
      if (result.status === "rejected") failedIds.add(rowsToSend[index]?.id ?? "");
    });
    setInviteRows((rows) =>
      rows.map((row) => {
        if (failedIds.has(row.id)) {
          return { ...row, error: t("onboarding:WELCOME_INVITE_SEND_ERROR") };
        }
        if (rowsToSend.some((sent) => sent.id === row.id)) {
          return { ...row, status: "sent", error: null };
        }
        return row;
      }),
    );
    if (failedIds.size > 0) {
      throw new WelcomeStepError(t("onboarding:WELCOME_INVITE_PARTIAL_ERROR"));
    }
    notifySuccessText(t("onboarding:WELCOME_INVITE_SAVED"));
    goNextStep();
  }

  async function invalidateWorkspaceQueries() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["me", "workspaces"] }),
      queryClient.invalidateQueries({ queryKey: ["workspace", "switcher"] }),
      queryClient.invalidateQueries({ queryKey: ["global-nav", "workspaces"] }),
      queryClient.invalidateQueries({ queryKey: ["scope-switcher", "projects"] }),
    ]);
  }

  async function completeCreateWorkspaceFlow() {
    if (!createdWorkspaceId) {
      throw new WelcomeStepError(t("onboarding:WELCOME_WORKSPACE_REQUIRED_FOR_INVITES"));
    }
    await authApi.patchMyOnboardingProfile({
      heardAboutUs: selectedHeardAboutUs,
    });
    await invalidateWorkspaceQueries();
    setCurrentContext({ workspaceId: createdWorkspaceId, projectId: null });
    try {
      window.sessionStorage.removeItem(CREATE_WORKSPACE_SESSION_KEY);
    } catch {
      // sessionStorage is only a duplicate-creation guard; ignore unavailable storage.
    }
    await navigate({ to: projectsHomePath() as never, replace: true, viewTransition: true });
  }

  async function completeInvitationFlow() {
    await authApi.patchMyOnboardingProfile({
      heardAboutUs: selectedHeardAboutUs,
    });
    await invalidateWorkspaceQueries();
    await navigate({
      to: (search.redirect || projectsHomePath()) as never,
      replace: true,
      viewTransition: true,
    });
  }

  async function submitCustomizeStep() {
    if (step === "teamType") {
      goNextStep();
      return;
    }
    if (step !== "heardAboutUs") return;

    if (isDryRun) {
      await navigate({ to: "/", replace: true });
      return;
    }

    if (flowMode === "create-workspace") {
      await completeCreateWorkspaceFlow();
      return;
    }

    if (flowMode === "invitation") {
      await completeInvitationFlow();
      return;
    }

    await authApi.patchMyOnboardingProfile({
      heardAboutUs: selectedHeardAboutUs,
    });

    const refreshed = await workspacesQuery.refetch();
    const onboarding = refreshed.data?.onboarding;
    const workspaceData = refreshed.data ?? workspacesQuery.data;
    const workspaceId = workspaceData ? getWorkspaceIdFromOnboarding(workspaceData) : null;
    if (!onboarding || onboarding.status !== "completed" || !workspaceId) {
      throw new WelcomeStepError(t("onboarding:WORKSPACE_DEFAULTS_STATE_ERROR"));
    }
    setCurrentContext({ workspaceId, projectId: null });
    await navigate({ to: "/", replace: true, viewTransition: true });
  }

  function goNextStep() {
    setStepError(null);
    setDirection(1);
    setStep((current) => {
      const currentIndex = visibleSteps.indexOf(current);
      const nextIndex = Math.min(visibleSteps.length - 1, Math.max(0, currentIndex) + 1);
      return visibleSteps[nextIndex];
    });
  }

  function goBack() {
    setStepError(null);
    setDirection(-1);
    if (flowMode === "create-workspace" && step === visibleSteps[0]) {
      window.history.back();
      return;
    }
    setStep((current) => {
      const currentIndex = visibleSteps.indexOf(current);
      const previousIndex = Math.max(0, Math.max(0, currentIndex) - 1);
      return visibleSteps[previousIndex];
    });
  }

  function updateInviteRow(id: string, patch: Partial<InviteDraftRow>) {
    setInviteRows((rows) =>
      rows.map((row) => (row.id === id ? { ...row, ...patch, status: "idle" } : row)),
    );
  }

  const handleAvatarFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.currentTarget.value = "";
    if (
      !file ||
      avatarCompletionCheckpoint ||
      avatarUploadMutation.isPending ||
      avatarCompletionMutation.isPending
    ) {
      return;
    }

    if (isDryRun) {
      if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
      const nextUrl = URL.createObjectURL(file);
      setAvatarPreviewUrl(nextUrl);
      setProfileDraft((current) => ({ ...current, avatarUrl: nextUrl }));
      return;
    }

    avatarUploadMutation.mutate(file);
  };

  const handleContinueAvatarCompletion = () => {
    const checkpoint = avatarCompletionCheckpoint;
    if (!checkpoint || avatarCompletionMutation.isPending) return;
    avatarCompletionMutation.mutate(checkpoint);
  };

  const handleWorkspaceIconFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    if (!file.type?.startsWith("image/")) {
      notifyError(new Error(t("assets:ASSET_UPLOAD_IMAGE_ONLY_REQUIRED")));
      return;
    }

    if (workspaceIconPreviewUrl) URL.revokeObjectURL(workspaceIconPreviewUrl);
    const nextUrl = URL.createObjectURL(file);
    setWorkspaceIconPreviewUrl(nextUrl);
    setWorkspaceIconFile(file);
    setWorkspaceDraft((current) => ({ ...current, iconUrl: nextUrl }));
  };

  const isLoading =
    !isDryRun &&
    (workspacesQuery.isLoading ||
      profileQuery.isLoading ||
      (flowMode !== "create-workspace" && onboardingProfileQuery.isLoading));
  const isError =
    !isDryRun &&
    (workspacesQuery.isError ||
      profileQuery.isError ||
      (flowMode !== "create-workspace" && onboardingProfileQuery.isError));
  const isPending =
    submitStepMutation.isPending ||
    avatarUploadMutation.isPending ||
    avatarCompletionMutation.isPending;
  const finalButtonLabel =
    step === "team"
      ? t("onboarding:WELCOME_INVITE_MEMBERS")
      : step === "heardAboutUs"
        ? t(
            flowMode === "invitation"
              ? "onboarding:WELCOME_INVITATION_FINAL_CTA"
              : "onboarding:WELCOME_FINAL_CTA",
          )
        : t("onboarding:WELCOME_CONTINUE");
  const isQuestionnaireStep = step === "teamType" || step === "heardAboutUs";
  const contentMaxClassName = isQuestionnaireStep ? "max-w-4xl" : "max-w-xl";
  const currentIndex = visibleSteps.indexOf(step);
  const isCreateWorkspaceFirstStep = flowMode === "create-workspace" && currentIndex === 0;

  if (isLoading) {
    return (
      <OnboardingLayout>
        <div className="flex h-full min-h-0 items-center justify-center text-body text-label-secondary">
          <LoaderCircle className="mr-3 size-4 animate-spin" />
          {t("onboarding:WORKSPACE_FIRST_LOADING")}
        </div>
      </OnboardingLayout>
    );
  }

  if (isError) {
    return (
      <OnboardingLayout>
        <div className="flex h-full min-h-0 flex-col justify-center gap-4">
          <div className="text-title3 text-label-primary">
            {t("onboarding:WORKSPACE_FIRST_LOAD_FAILED_TITLE")}
          </div>
          <p className="text-body text-label-secondary">
            {t("onboarding:WORKSPACE_FIRST_LOAD_FAILED_DESC")}
          </p>
          <Button variant="outline" onClick={() => void workspacesQuery.refetch()}>
            {t("common:RETRY")}
          </Button>
        </div>
      </OnboardingLayout>
    );
  }

  return (
    <OnboardingLayout
      currentStep={step}
      contentMaxClassName={contentMaxClassName}
      headerBack={isCreateWorkspaceFirstStep}
      onHeaderBack={goBack}
      steps={visibleSteps}
    >
      <input
        ref={avatarFileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        tabIndex={-1}
        aria-label={t("account:ME_PROFILE_AVATAR_CHANGE")}
        disabled={isPending || Boolean(avatarCompletionCheckpoint)}
        onChange={handleAvatarFileChange}
      />
      <input
        ref={workspaceIconFileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        tabIndex={-1}
        onChange={handleWorkspaceIconFileChange}
      />
      <div className="flex min-h-[min(36rem,100%)] flex-col">
        <OnboardingStepTransition step={step} direction={direction} reduceMotion={reduceMotion}>
          <OnboardingMotionItem>
            <OnboardingStepHeader
              title={currentTitle}
              description={currentDescription}
              canGoBack={currentIndex > 0}
              onBack={goBack}
            />
          </OnboardingMotionItem>

          {step === "profile" ? (
            <OnboardingMotionItem>
              <UserProfilePreferencesStep
                displayName={profileDraft.displayName}
                avatarUrl={profileDraft.avatarUrl}
                jobRole={profileDraft.jobRole}
                companySize={profileDraft.companySize}
                subscribedProductUpdates={profileDraft.subscribedProductUpdates}
                jobRoleOptions={jobRoleOptions}
                companySizeOptions={companySizeOptions}
                displayNameError={displayNameError}
                avatarBusy={avatarUploadMutation.isPending || avatarCompletionMutation.isPending}
                avatarCompletionRequired={Boolean(avatarCompletionCheckpoint)}
                avatarCompletionBusy={avatarCompletionMutation.isPending}
                onDisplayNameChange={(displayName) =>
                  setProfileDraft((current) => ({ ...current, displayName }))
                }
                onJobRoleChange={(jobRole) => {
                  if (!jobRoleOptions.some((option) => option.value === jobRole)) {
                    throw new Error("Invalid onboarding job role");
                  }
                  setProfileDraft((current) => ({
                    ...current,
                    jobRole: jobRole as UserProfileDraft["jobRole"],
                  }));
                }}
                onCompanySizeChange={(companySize) => {
                  if (!companySizeOptions.some((option) => option.value === companySize)) {
                    throw new Error("Invalid onboarding company size");
                  }
                  setProfileDraft((current) => ({
                    ...current,
                    companySize: companySize as UserProfileDraft["companySize"],
                  }));
                }}
                onSubscribedProductUpdatesChange={(subscribedProductUpdates) =>
                  setProfileDraft((current) => ({ ...current, subscribedProductUpdates }))
                }
                onPickAvatar={() => avatarFileInputRef.current?.click()}
                onContinueAvatarCompletion={handleContinueAvatarCompletion}
                onRemoveAvatar={() => {
                  if (isDryRun) {
                    setProfileDraft((current) => ({ ...current, avatarUrl: null }));
                    return;
                  }
                  void authApi.updateMyProfile({ avatar_asset_id: null }).then(() => {
                    setProfileDraft((current) => ({
                      ...current,
                      avatarUrl: null,
                      avatarAssetId: null,
                    }));
                  });
                }}
              />
            </OnboardingMotionItem>
          ) : null}

          {step === "workspace" ? (
            <OnboardingMotionItem>
              <WorkspaceCreateStep
                name={workspaceDraft.name}
                description={workspaceDraft.description}
                iconUrl={workspaceDraft.iconUrl}
                defaultRoleCode={workspaceDraft.defaultRoleCode}
                roleOptions={roleOptions}
                errors={workspaceErrors}
                iconBusy={submitStepMutation.isPending}
                onNameChange={(name) => {
                  setWorkspaceNameTouched(true);
                  setWorkspaceDraft((current) => ({ ...current, name }));
                }}
                onDescriptionChange={(description) =>
                  setWorkspaceDraft((current) => ({ ...current, description }))
                }
                onPickIcon={() => workspaceIconFileInputRef.current?.click()}
                onRemoveIcon={() => {
                  if (workspaceIconPreviewUrl) URL.revokeObjectURL(workspaceIconPreviewUrl);
                  setWorkspaceIconPreviewUrl(null);
                  setWorkspaceIconFile(null);
                  setWorkspaceDraft((current) => ({
                    ...current,
                    iconUrl: null,
                  }));
                }}
                onDefaultRoleCodeChange={(defaultRoleCode) =>
                  setWorkspaceDraft((current) => ({ ...current, defaultRoleCode }))
                }
              />
            </OnboardingMotionItem>
          ) : null}

          {step === "team" ? (
            <OnboardingMotionItem>
              <TeamCollaborationStep
                rows={inviteRows}
                roleOptions={roleOptions}
                disabled={isPending}
                onEmailChange={(id, email) => updateInviteRow(id, { email, error: null })}
                onRoleCodeChange={(id, roleCode) => updateInviteRow(id, { roleCode, error: null })}
              />
            </OnboardingMotionItem>
          ) : null}

          {isQuestionnaireStep ? (
            <OnboardingMotionItem>
              <WorkspaceCustomizationStep
                selected={step === "teamType" ? selectedTeamType : selectedHeardAboutUs}
                options={step === "teamType" ? teamTypeOptions : heardAboutUsOptions}
                variant={step === "teamType" ? "teamType" : "heardAboutUs"}
                onChange={(value) => {
                  if (step === "teamType") {
                    setSelectedTeamType(value);
                    return;
                  }
                  if (!heardAboutUsOptions.some((option) => option.value === value)) {
                    throw new Error("Invalid onboarding discovery source");
                  }
                  setSelectedHeardAboutUs(value as WelcomeHeardAboutUs);
                }}
              />
            </OnboardingMotionItem>
          ) : null}

          <OnboardingMotionItem className="mt-auto space-y-3 pt-4">
            {stepError ? <WelcomeFieldError>{stepError}</WelcomeFieldError> : null}
            <div
              data-testid="onboarding-actions"
              className="flex flex-wrap items-center justify-start gap-2"
            >
              <Button
                variant={isQuestionnaireStep ? "ghost" : "default"}
                className="h-11 px-4"
                loading={isPending}
                disabled={
                  (step === "profile" &&
                    (isProfileStepDisabled || Boolean(avatarCompletionCheckpoint))) ||
                  isPending
                }
                onClick={() => submitStepMutation.mutate()}
              >
                {finalButtonLabel}
              </Button>
              {step === "team" ? (
                <Button
                  variant="ghost"
                  className="h-10 px-4"
                  disabled={isPending}
                  onClick={goNextStep}
                >
                  {t("onboarding:WELCOME_INVITE_SKIP")}
                </Button>
              ) : null}
              {flowMode === "first-run" && step === "workspace" ? (
                <Button variant="ghost" className="h-10 px-4" disabled={isPending} onClick={goBack}>
                  {t("common:BACK")}
                </Button>
              ) : null}
              {isQuestionnaireStep ? (
                <Button
                  variant="ghost"
                  className="h-10 px-4"
                  disabled={isPending}
                  onClick={() => {
                    if (step === "teamType") {
                      goNextStep();
                      return;
                    }
                    submitStepMutation.mutate();
                  }}
                >
                  {t("onboarding:WELCOME_CUSTOMIZE_SKIP")}
                </Button>
              ) : null}
            </div>
          </OnboardingMotionItem>
        </OnboardingStepTransition>
      </div>
    </OnboardingLayout>
  );
}
