import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { LoaderCircle } from "lucide-react";
import { useTranslation } from "react-i18next";

import * as authApi from "@/api/auth";
import { listWorkspaceRoles } from "@/api/rbac";
import { patchCoreSettings } from "@/api/settings";
import { createTeamInvitation } from "@/api/team";
import {
  createMyOnboardingWorkspace,
  getWorkspaceDetail,
  listMyWorkspaces,
  patchWorkspaceDetail,
  patchWorkspaceRolePolicy,
} from "@/api/workspaces";
import { OnboardingLayout } from "@/layouts/onboarding-layout";
import { uploadSingleAssetFromFile } from "@/lib/assets/scoped-uploads";
import { DEFAULT_LOCALE, detectBrowserLocale, normalizeLocale } from "@/lib/i18n";
import { DEFAULT_DATE_FORMAT, DEFAULT_TIMEZONE } from "@/lib/time/datetime-config";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { usePreferencesStore } from "@/stores/use-preference-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import { uploadAvatarFile } from "@/pages/usercenter/profile/lib/avatar-upload";
import { Button } from "@arclayer/ui/button";
import {
  getWelcomeStepDescriptionKey,
  getWelcomeStepImage,
  getWelcomeStepTitleKey,
} from "./lib/onboarding-copy";
import {
  isValidWelcomeDisplayName,
  isWorkspaceNameValid,
  normalizeWelcomeDisplayName,
  validateInviteRow,
} from "./lib/onboarding-validation";
import { OnboardingStepHeader } from "./components/onboarding-step-header";
import { OnboardingStepTransition } from "./components/onboarding-step-transition";
import { UserProfilePreferencesStep } from "./components/steps/user-profile-preferences-step";
import { WorkspaceCreateStep } from "./components/steps/workspace-create-step";
import { TeamCollaborationStep } from "./components/steps/team-collaboration-step";
import { WorkspaceCustomizationStep } from "./components/steps/workspace-customization-step";
import { WelcomeFieldError } from "./components/welcome-field-error";
import type {
  InviteDraftRow,
  RoleOption,
  UserProfileDraft,
  WelcomeMode,
  WelcomeOnboardingStep,
  WorkspaceDraft,
} from "./types";

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
  const { t } = useTranslation(["onboarding", "common", "assets"]);
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { dryRun?: "1" };
  const reduceMotion = usePreferencesStore((state) => state.reduceMotion);
  const setCurrentWorkspaceId = useWorkspaceStore((state) => state.setCurrentWorkspaceId);
  const browserTimezone = useMemo(() => getBrowserTimeZone(), []);
  const mode: WelcomeMode = import.meta.env.DEV && hasDryRunSearch(search) ? "dry-run" : "real";
  const isDryRun = mode === "dry-run";

  const [step, setStep] = useState<WelcomeOnboardingStep>(1);
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
    subscribedProductUpdates: true,
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
  const [questionnaireSubstep, setQuestionnaireSubstep] = useState<0 | 1 | 2>(0);
  const [selectedTeamType, setSelectedTeamType] = useState<string | null>(null);
  const [selectedGoal, setSelectedGoal] = useState<string | null>(null);
  const [selectedHeardAboutUs, setSelectedHeardAboutUs] = useState<string | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [workspaceIconPreviewUrl, setWorkspaceIconPreviewUrl] = useState<string | null>(null);
  const [workspaceIconFile, setWorkspaceIconFile] = useState<File | null>(null);
  const [workspaceNameTouched, setWorkspaceNameTouched] = useState(false);
  const avatarFileInputRef = useRef<HTMLInputElement | null>(null);
  const workspaceIconFileInputRef = useRef<HTMLInputElement | null>(null);
  const initializedRef = useRef(false);

  const workspacesQuery = useQuery({
    queryKey: ["me", "workspaces", "welcome-onboarding"],
    queryFn: listMyWorkspaces,
    enabled: !isDryRun,
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
    enabled: !isDryRun,
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
  const goalOptions = useMemo(
    () => [
      { value: "content", label: t("onboarding:WELCOME_CUSTOMIZE_GOAL_CONTENT") },
      { value: "websites", label: t("onboarding:WELCOME_CUSTOMIZE_GOAL_WEBSITES") },
      { value: "assets", label: t("onboarding:WELCOME_CUSTOMIZE_GOAL_ASSETS") },
      { value: "localization", label: t("onboarding:WELCOME_CUSTOMIZE_GOAL_LOCALIZATION") },
      { value: "automation", label: t("onboarding:WELCOME_CUSTOMIZE_GOAL_AUTOMATION") },
      { value: "evaluate", label: t("onboarding:WELCOME_CUSTOMIZE_GOAL_EVALUATE") },
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
    if (isDryRun || !workspacesQuery.data || initializedRef.current) return;
    const onboarding = workspacesQuery.data.onboarding ?? {
      status: "completed" as const,
      workspaceId: null,
    };
    const onboardingWorkspaceId = getWorkspaceIdFromOnboarding(workspacesQuery.data);
    if (onboarding.status === "pending_workspace_defaults" && onboardingWorkspaceId) {
      setCreatedWorkspaceId(onboardingWorkspaceId);
      setStep(2);
    }
    initializedRef.current = true;
  }, [isDryRun, workspacesQuery.data]);

  useEffect(() => {
    if (isDryRun || !profileQuery.data) return;
    const displayName =
      profileQuery.data.displayName ??
      profileQuery.data.display_name ??
      profileQuery.data.username ??
      "";
    setProfileDraft((current) => ({
      ...current,
      displayName,
      avatarUrl:
        profileQuery.data.avatarUrl ?? profileQuery.data.avatar_url ?? current.avatarUrl ?? null,
      avatarAssetId:
        profileQuery.data.avatarAssetId ??
        profileQuery.data.avatar_asset_id ??
        current.avatarAssetId ??
        null,
    }));
  }, [isDryRun, profileQuery.data]);

  useEffect(() => {
    if (isDryRun || !onboardingProfileQuery.data) return;
    setProfileDraft((current) => ({
      ...current,
      jobRole:
        onboardingProfileQuery.data.jobRole ??
        onboardingProfileQuery.data.job_role ??
        current.jobRole,
      companySize:
        onboardingProfileQuery.data.companySize ??
        onboardingProfileQuery.data.company_size ??
        current.companySize,
      subscribedProductUpdates:
        onboardingProfileQuery.data.subscribedProductUpdates ??
        onboardingProfileQuery.data.subscribed_product_updates ??
        current.subscribedProductUpdates,
    }));
    setSelectedHeardAboutUs(
      onboardingProfileQuery.data.heardAboutUs ??
        onboardingProfileQuery.data.heard_about_us ??
        null,
    );
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
    if (workspaceNameTouched) return;
    const displayName = normalizeWelcomeDisplayName(profileDraft.displayName);
    if (!displayName) return;
    const defaultName = t("onboarding:WELCOME_WORKSPACE_DEFAULT_NAME", { name: displayName });
    setWorkspaceDraft((current) =>
      current.name === defaultName ? current : { ...current, name: defaultName },
    );
  }, [profileDraft.displayName, t, workspaceNameTouched]);

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
    onSuccess: async (assetId) => {
      const updated = await authApi.updateMyProfile({ avatarAssetId: assetId });
      setProfileDraft((current) => ({
        ...current,
        avatarUrl: updated.avatarUrl ?? updated.avatar_url ?? current.avatarUrl,
        avatarAssetId: updated.avatarAssetId ?? updated.avatar_asset_id ?? assetId,
      }));
    },
    onError: notifyError,
  });

  const submitStepMutation = useMutation({
    mutationFn: async () => {
      if (step === 1) {
        await submitProfileStep();
        return;
      }
      if (step === 2) {
        await submitWorkspaceStep();
        return;
      }
      if (step === 3) {
        await submitInviteStep();
        return;
      }
      await submitCustomizeStep();
    },
    onError: (error) => {
      if (error instanceof Error) {
        setStepError(error.message);
        notifyError(error);
        return;
      }
      setStepError(t("onboarding:WELCOME_GENERIC_SAVE_ERROR"));
      notifyError(error);
    },
  });

  async function submitProfileStep() {
    if (!normalizedDisplayName) {
      throw new Error(t("onboarding:WELCOME_PROFILE_DISPLAY_NAME_REQUIRED"));
    }
    if (!isValidWelcomeDisplayName(normalizedDisplayName)) {
      throw new Error(t("onboarding:WELCOME_PROFILE_DISPLAY_NAME_INVALID"));
    }

    if (!isDryRun) {
      await authApi.updateMyProfile({ display_name: normalizedDisplayName });
      await authApi.patchMyOnboardingProfile({
        job_role: profileDraft.jobRole,
        company_size: profileDraft.companySize,
        subscribed_product_updates: profileDraft.subscribedProductUpdates,
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
      throw new Error(t("onboarding:WELCOME_WORKSPACE_VALIDATION_ERROR"));
    }

    if (isDryRun) {
      notifySuccessText(t("onboarding:WELCOME_WORKSPACE_SAVED"));
      goNextStep();
      return;
    }

    const workspaceId =
      createdWorkspaceId ??
      (await createMyOnboardingWorkspace({ name: workspaceDraft.name.trim() })).workspaceId;
    setCreatedWorkspaceId(workspaceId);

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
    await workspacesQuery.refetch();
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
      throw new Error(t("onboarding:WELCOME_INVITE_VALIDATION_ERROR"));
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
      throw new Error(t("onboarding:WELCOME_WORKSPACE_REQUIRED_FOR_INVITES"));
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
      throw new Error(t("onboarding:WELCOME_INVITE_PARTIAL_ERROR"));
    }
    notifySuccessText(t("onboarding:WELCOME_INVITE_SAVED"));
    goNextStep();
  }

  async function submitCustomizeStep() {
    if (questionnaireSubstep === 0) {
      setQuestionnaireSubstep(1);
      return;
    }
    if (questionnaireSubstep === 1) {
      setQuestionnaireSubstep(2);
      return;
    }

    if (isDryRun) {
      await navigate({ to: "/", replace: true });
      return;
    }

    await authApi.patchMyOnboardingProfile({
      heard_about_us: selectedHeardAboutUs,
    });

    const refreshed = await workspacesQuery.refetch();
    const onboarding = refreshed.data?.onboarding;
    const workspaceData = refreshed.data ?? workspacesQuery.data;
    const workspaceId = workspaceData ? getWorkspaceIdFromOnboarding(workspaceData) : null;
    if (!onboarding || onboarding.status !== "completed" || !workspaceId) {
      throw new Error(t("onboarding:WORKSPACE_DEFAULTS_STATE_ERROR"));
    }
    setCurrentWorkspaceId(workspaceId);
    useWorkspaceStore.getState().setCurrentProjectId(null);
    await navigate({ to: "/", replace: true });
  }

  function goNextStep() {
    setStepError(null);
    setDirection(1);
    setStep((current) => Math.min(4, current + 1) as WelcomeOnboardingStep);
  }

  function goBack() {
    setStepError(null);
    if (step === 4 && questionnaireSubstep > 0) {
      setQuestionnaireSubstep((current) => (current === 2 ? 1 : 0));
      return;
    }
    setDirection(-1);
    setStep((current) => Math.max(1, current - 1) as WelcomeOnboardingStep);
  }

  function updateInviteRow(id: string, patch: Partial<InviteDraftRow>) {
    setInviteRows((rows) =>
      rows.map((row) => (row.id === id ? { ...row, ...patch, status: "idle" } : row)),
    );
  }

  const handleAvatarFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;

    if (isDryRun) {
      if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
      const nextUrl = URL.createObjectURL(file);
      setAvatarPreviewUrl(nextUrl);
      setProfileDraft((current) => ({ ...current, avatarUrl: nextUrl }));
      return;
    }

    avatarUploadMutation.mutate(file);
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
    (workspacesQuery.isLoading || profileQuery.isLoading || onboardingProfileQuery.isLoading);
  const isError =
    !isDryRun &&
    (workspacesQuery.isError || profileQuery.isError || onboardingProfileQuery.isError);
  const isPending = submitStepMutation.isPending || avatarUploadMutation.isPending;
  const finalButtonLabel =
    step === 3
      ? t("onboarding:WELCOME_INVITE_MEMBERS")
      : step === 4 && questionnaireSubstep === 2
        ? t("onboarding:WELCOME_FINAL_CTA")
        : t("onboarding:WELCOME_CONTINUE");

  if (isLoading) {
    return (
      <OnboardingLayout
        aside={
          <img
            src="/onboarding/onboarding-01.jpg"
            alt={t("onboarding:WELCOME_IMAGE_ALT")}
            className="h-full w-full object-cover"
          />
        }
      >
        <div className="flex h-full min-h-0 items-center justify-center text-body text-label-secondary">
          <LoaderCircle className="mr-3 size-4 animate-spin" />
          {t("onboarding:WORKSPACE_FIRST_LOADING")}
        </div>
      </OnboardingLayout>
    );
  }

  if (isError) {
    return (
      <OnboardingLayout
        aside={
          <img
            src="/onboarding/onboarding-01.jpg"
            alt={t("onboarding:WELCOME_IMAGE_ALT")}
            className="h-full w-full object-cover"
          />
        }
      >
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
      aside={
        <img
          src={getWelcomeStepImage(step)}
          alt={t("onboarding:WELCOME_IMAGE_ALT")}
          className="h-full w-full object-cover"
        />
      }
    >
      <input
        ref={avatarFileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        tabIndex={-1}
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
      <div className="flex h-full min-h-0 flex-col">
        <OnboardingStepHeader
          currentStep={step}
          title={currentTitle}
          description={currentDescription}
          canGoBack={step > 1 || (step === 4 && questionnaireSubstep === 1)}
          onBack={goBack}
        />

        <OnboardingStepTransition step={step} direction={direction} reduceMotion={reduceMotion}>
          {step === 1 ? (
            <UserProfilePreferencesStep
              displayName={profileDraft.displayName}
              avatarUrl={profileDraft.avatarUrl}
              jobRole={profileDraft.jobRole}
              companySize={profileDraft.companySize}
              subscribedProductUpdates={profileDraft.subscribedProductUpdates}
              jobRoleOptions={jobRoleOptions}
              companySizeOptions={companySizeOptions}
              displayNameError={displayNameError}
              avatarBusy={avatarUploadMutation.isPending}
              onDisplayNameChange={(displayName) =>
                setProfileDraft((current) => ({ ...current, displayName }))
              }
              onJobRoleChange={(jobRole) => setProfileDraft((current) => ({ ...current, jobRole }))}
              onCompanySizeChange={(companySize) =>
                setProfileDraft((current) => ({ ...current, companySize }))
              }
              onSubscribedProductUpdatesChange={(subscribedProductUpdates) =>
                setProfileDraft((current) => ({ ...current, subscribedProductUpdates }))
              }
              onPickAvatar={() => avatarFileInputRef.current?.click()}
              onRemoveAvatar={() => {
                if (isDryRun) {
                  setProfileDraft((current) => ({ ...current, avatarUrl: null }));
                  return;
                }
                void authApi.updateMyProfile({ avatarAssetId: null }).then(() => {
                  setProfileDraft((current) => ({
                    ...current,
                    avatarUrl: null,
                    avatarAssetId: null,
                  }));
                });
              }}
            />
          ) : null}

          {step === 2 ? (
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
          ) : null}

          {step === 3 ? (
            <TeamCollaborationStep
              rows={inviteRows}
              roleOptions={roleOptions}
              disabled={isPending}
              onEmailChange={(id, email) => updateInviteRow(id, { email, error: null })}
              onRoleCodeChange={(id, roleCode) => updateInviteRow(id, { roleCode, error: null })}
            />
          ) : null}

          {step === 4 ? (
            <WorkspaceCustomizationStep
              substep={questionnaireSubstep}
              selectedTeamType={selectedTeamType}
              selectedGoal={selectedGoal}
              selectedHeardAboutUs={selectedHeardAboutUs}
              teamTypeOptions={teamTypeOptions}
              goalOptions={goalOptions}
              heardAboutUsOptions={heardAboutUsOptions}
              onTeamTypeChange={(value) => {
                setSelectedTeamType(value);
                setQuestionnaireSubstep(1);
              }}
              onGoalChange={setSelectedGoal}
              onHeardAboutUsChange={setSelectedHeardAboutUs}
              onBackToPreviousQuestion={() =>
                setQuestionnaireSubstep((current) => (current === 2 ? 1 : 0))
              }
            />
          ) : null}
        </OnboardingStepTransition>

        <div className="mt-auto space-y-3 pt-4">
          {stepError ? <WelcomeFieldError>{stepError}</WelcomeFieldError> : null}
          <Button
            className="h-11 w-full"
            loading={isPending}
            disabled={(step === 1 && isProfileStepDisabled) || isPending}
            onClick={() => submitStepMutation.mutate()}
          >
            {finalButtonLabel}
          </Button>
          {step === 3 ? (
            <Button
              variant="ghost"
              className="h-10 w-full"
              disabled={isPending}
              onClick={goNextStep}
            >
              {t("onboarding:WELCOME_INVITE_SKIP")}
            </Button>
          ) : null}
          {step === 4 ? (
            <Button
              variant="ghost"
              className="h-10 w-full"
              disabled={isPending}
              onClick={() => {
                if (questionnaireSubstep === 0) {
                  setQuestionnaireSubstep(1);
                  return;
                }
                if (questionnaireSubstep === 1) {
                  setQuestionnaireSubstep(2);
                  return;
                }
                submitStepMutation.mutate();
              }}
            >
              {t("onboarding:WELCOME_CUSTOMIZE_SKIP")}
            </Button>
          ) : null}
        </div>
      </div>
    </OnboardingLayout>
  );
}
