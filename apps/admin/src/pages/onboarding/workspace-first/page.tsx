import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  Code2,
  Globe2,
  HandCoins,
  Languages,
  LoaderCircle,
  Megaphone,
  Paintbrush2,
  Rocket,
  SlidersHorizontal,
  UserRound,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { me } from "@/api/auth";
import { createMyOrganization, listMyOrganizations } from "@/api/me";
import { createOrganizationWorkspace } from "@/api/organization-workspaces";
import { patchCoreSettings } from "@/api/settings";
import { checkMyOnboardingWorkspaceSlugAvailability, listMyWorkspaces } from "@/api/workspaces";
import { FeatureCarousel, Onboarding, StepIndicator } from "@/components/ui/onboarding";
import {
  buildDateFormatOptions,
  buildLocaleOptions,
  buildTimezoneOptions,
} from "@/lib/settings/general/localization-options";
import { Button } from "@arclayer/ui/button";
import { Input } from "@arclayer/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";
import { normalizeLocale, DEFAULT_LOCALE } from "@/lib/i18n";
import { notifyError } from "@/lib/notifications";
import { resolvePostAuthRoute } from "@/lib/routing/post-auth-routing";
import { DEFAULT_DATE_FORMAT, DEFAULT_TIMEZONE } from "@/lib/time/datetime-config";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

function normalizeWorkspaceSlugInput(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/g, "")
    .replace(/-+$/g, "")
    .slice(0, 64);
}

function useDebouncedValue(value: string, delayMs: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebouncedValue(value), delayMs);
    return () => window.clearTimeout(timeoutId);
  }, [delayMs, value]);

  return debouncedValue;
}

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

function resolveWorkspaceOwnerName(profile: Awaited<ReturnType<typeof me>> | undefined) {
  const displayName = String(profile?.displayName ?? profile?.display_name ?? "").trim();
  if (displayName) return displayName;
  return String(profile?.username ?? "").trim();
}

function buildDefaultWorkspaceName(ownerName: string, language: string) {
  const normalized = normalizeLocale(language || DEFAULT_LOCALE);
  if (normalized.startsWith("zh")) {
    return `${ownerName} 的工作区`;
  }
  return `${ownerName}'s Workspace`;
}

function FieldHint(props: { children: ReactNode; tone?: "default" | "success" | "danger" }) {
  const toneClassName =
    props.tone === "success"
      ? "text-success"
      : props.tone === "danger"
        ? "text-destructive"
        : "text-label-secondary";
  return <div className={`text-footnote ${toneClassName}`}>{props.children}</div>;
}

const RELATIVE_DATETIME_OPTION_VALUE = "__relative_datetime__";

export function WorkspaceFirstOnboardingPage() {
  const { t, i18n } = useTranslation(["onboarding", "common", "settings", "setup"]);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const setCurrentWorkspaceId = useWorkspaceStore((state) => state.setCurrentWorkspaceId);
  const lastWorkspaceId = useWorkspaceStore((state) => state.lastWorkspaceId);
  const redirectingRef = useRef(false);

  const workspacesQuery = useQuery({
    queryKey: ["me", "workspaces", "onboarding"],
    queryFn: listMyWorkspaces,
    retry: false,
    meta: { silent: true },
  });
  const profileQuery = useQuery({
    queryKey: ["me", "profile", "onboarding"],
    queryFn: me,
    retry: false,
    meta: { silent: true },
  });
  const organizationsQuery = useQuery({
    queryKey: ["me", "organizations", "onboarding"],
    queryFn: listMyOrganizations,
    retry: false,
    meta: { silent: true },
  });

  const [workspaceName, setWorkspaceName] = useState("");
  const [workspaceSlug, setWorkspaceSlug] = useState("");
  const [workspaceNameTouched, setWorkspaceNameTouched] = useState(false);
  const [workspaceSlugTouched, setWorkspaceSlugTouched] = useState(false);
  const [step, setStep] = useState(1);
  const [activeFeatureIndex, setActiveFeatureIndex] = useState(0);
  const [personalizeSubstep, setPersonalizeSubstep] = useState(0);
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [selectedGoal, setSelectedGoal] = useState<string | null>(null);
  const [createdWorkspaceId, setCreatedWorkspaceId] = useState<string | null>(null);
  const [workspaceLocale, setWorkspaceLocale] = useState(() =>
    normalizeLocale(i18n.resolvedLanguage || DEFAULT_LOCALE),
  );
  const [workspaceTimezone, setWorkspaceTimezone] = useState(() => getBrowserTimeZone());
  const [workspaceDateFormat, setWorkspaceDateFormat] = useState(() =>
    resolveDefaultDateFormat(i18n.resolvedLanguage || DEFAULT_LOCALE),
  );
  const [workspaceUseRelativeDateTime, setWorkspaceUseRelativeDateTime] = useState(true);
  const [stepError, setStepError] = useState<string | null>(null);
  const lastAutoWorkspaceNameRef = useRef("");

  const debouncedSlug = useDebouncedValue(workspaceSlug, 250);
  const ownerName = useMemo(
    () => resolveWorkspaceOwnerName(profileQuery.data),
    [profileQuery.data],
  );
  const browserTimeZone = useMemo(() => getBrowserTimeZone(), []);
  const localeOptions = useMemo(() => buildLocaleOptions(t), [t]);
  const timezoneOptions = useMemo(
    () => buildTimezoneOptions(workspaceTimezone || browserTimeZone),
    [browserTimeZone, workspaceTimezone],
  );
  const dateFormatOptions = useMemo(() => buildDateFormatOptions(), []);
  const dateTimePreferenceOptions = useMemo(
    () => [
      {
        value: RELATIVE_DATETIME_OPTION_VALUE,
        label: t("settings:SETTINGS_LOCALIZATION_RELATIVE_DATETIME_SWITCH_TITLE"),
      },
      ...dateFormatOptions,
    ],
    [dateFormatOptions, t],
  );
  const introFeatures = useMemo(
    () => [
      {
        imageSrc: "/onboarding/onboarding-01.jpg",
        icon: Globe2,
        title: t("onboarding:WORKSPACE_FIRST_FEATURE_1_TITLE"),
        description: t("onboarding:WORKSPACE_FIRST_FEATURE_1_DESC"),
      },
      {
        imageSrc: "/onboarding/onboarding-02.jpg",
        icon: SlidersHorizontal,
        title: t("onboarding:WORKSPACE_FIRST_FEATURE_2_TITLE"),
        description: t("onboarding:WORKSPACE_FIRST_FEATURE_2_DESC"),
      },
      {
        imageSrc: "/onboarding/onboarding-03.jpg",
        icon: Languages,
        title: t("onboarding:WORKSPACE_FIRST_FEATURE_3_TITLE"),
        description: t("onboarding:WORKSPACE_FIRST_FEATURE_3_DESC"),
      },
    ],
    [t],
  );
  const roleOptions = useMemo(
    () => [
      { value: "designer", label: t("onboarding:PERSONALIZE_ROLE_DESIGNER"), icon: Paintbrush2 },
      { value: "founder", label: t("onboarding:PERSONALIZE_ROLE_FOUNDER"), icon: Rocket },
      { value: "sales", label: t("onboarding:PERSONALIZE_ROLE_SALES"), icon: HandCoins },
      {
        value: "freelancer",
        label: t("onboarding:PERSONALIZE_ROLE_FREELANCER"),
        icon: BriefcaseBusiness,
      },
      { value: "marketing", label: t("onboarding:PERSONALIZE_ROLE_MARKETING"), icon: Megaphone },
      { value: "developer", label: t("onboarding:PERSONALIZE_ROLE_DEVELOPER"), icon: Code2 },
      { value: "agency", label: t("onboarding:PERSONALIZE_ROLE_AGENCY"), icon: Building2 },
      { value: "other", label: t("onboarding:PERSONALIZE_ROLE_OTHER"), icon: UserRound },
    ],
    [t],
  );
  const goalOptions = useMemo(
    () => [
      { value: "agents", label: t("onboarding:PERSONALIZE_GOAL_AI_AGENTS") },
      { value: "chatbots", label: t("onboarding:PERSONALIZE_GOAL_CHATBOTS") },
      { value: "automation", label: t("onboarding:PERSONALIZE_GOAL_AUTOMATION") },
      { value: "rag", label: t("onboarding:PERSONALIZE_GOAL_RAG") },
      { value: "prototype", label: t("onboarding:PERSONALIZE_GOAL_PROTOTYPE") },
      { value: "other", label: t("onboarding:PERSONALIZE_GOAL_OTHER") },
    ],
    [t],
  );
  const readyTips = useMemo(
    () => [t("onboarding:READY_TIP_1"), t("onboarding:READY_TIP_2"), t("onboarding:READY_TIP_3")],
    [t],
  );
  const autoWorkspaceName = useMemo(
    () =>
      ownerName
        ? buildDefaultWorkspaceName(ownerName, i18n.resolvedLanguage || DEFAULT_LOCALE)
        : "",
    [i18n.resolvedLanguage, ownerName],
  );
  const onboardingStatus = workspacesQuery.data?.onboarding?.status ?? "completed";
  const lockedWorkspace =
    createdWorkspaceId == null
      ? null
      : ((workspacesQuery.data?.items ?? []).find(
          (workspace) => workspace.workspaceId === createdWorkspaceId,
        ) ?? null);
  const workspaceCreated = createdWorkspaceId != null;
  const activeFeature = introFeatures[activeFeatureIndex] ?? introFeatures[0];
  const currentStepTitle =
    step === 1
      ? t("onboarding:WORKSPACE_FIRST_WELCOME_TITLE")
      : step === 2
        ? t("onboarding:WORKSPACE_STEP_TITLE")
        : step === 3
          ? t("onboarding:PREFERENCES_STEP_TITLE")
          : step === 4
            ? t("onboarding:PERSONALIZE_TITLE")
            : t("onboarding:READY_TITLE");
  const currentStepDescription =
    step === 1
      ? t("onboarding:WORKSPACE_FIRST_MARKETING_DESC")
      : step === 2
        ? t("onboarding:WORKSPACE_STEP_DESC")
        : step === 3
          ? t("onboarding:PREFERENCES_STEP_DESC")
          : step === 4
            ? t("onboarding:PERSONALIZE_DESC")
            : t("onboarding:READY_DESC");
  const selectedDateTimePreference = workspaceUseRelativeDateTime
    ? RELATIVE_DATETIME_OPTION_VALUE
    : workspaceDateFormat;

  useEffect(() => {
    if (!autoWorkspaceName) return;
    if (workspaceNameTouched) return;
    if (workspaceName && workspaceName !== lastAutoWorkspaceNameRef.current) return;
    setWorkspaceName(autoWorkspaceName);
    lastAutoWorkspaceNameRef.current = autoWorkspaceName;
  }, [autoWorkspaceName, workspaceName, workspaceNameTouched]);

  useEffect(() => {
    const username = String(profileQuery.data?.username || "").trim();
    if (!username) return;
    if (workspaceSlugTouched) return;
    if (workspaceSlug) return;
    setWorkspaceSlug(normalizeWorkspaceSlugInput(username));
  }, [profileQuery.data?.username, workspaceSlug, workspaceSlugTouched]);

  useEffect(() => {
    if (!lockedWorkspace) return;
    if (!workspaceNameTouched) {
      setWorkspaceName(lockedWorkspace.name);
    }
    if (!workspaceSlugTouched) {
      setWorkspaceSlug(lockedWorkspace.slug);
    }
  }, [lockedWorkspace, workspaceNameTouched, workspaceSlugTouched]);

  useEffect(() => {
    if (!workspacesQuery.data) return;
    const onboarding = workspacesQuery.data.onboarding ?? {
      status: "completed" as const,
      workspaceId: null,
    };
    if (onboarding.status === "pending_workspace_defaults" && onboarding.workspaceId) {
      setCreatedWorkspaceId(onboarding.workspaceId);
      setStep(3);
      return;
    }
    if (onboarding.status === "pending_workspace") {
      setCreatedWorkspaceId(null);
      setStep(1);
      return;
    }

    if (redirectingRef.current) return;
    redirectingRef.current = true;
    void (async () => {
      if (onboarding.workspaceId) {
        setCurrentWorkspaceId(onboarding.workspaceId);
        await navigate({ to: `/w/${onboarding.workspaceId}`, replace: true });
        return;
      }
      const decision = await resolvePostAuthRoute({ lastWorkspaceId });
      if (decision.workspaceId) {
        setCurrentWorkspaceId(decision.workspaceId);
      }
      await navigate({ to: decision.path, replace: true });
    })();
  }, [lastWorkspaceId, navigate, setCurrentWorkspaceId, workspacesQuery.data]);

  const slugAvailabilityQuery = useQuery({
    queryKey: ["me", "workspaces", "onboarding", "slug", debouncedSlug],
    enabled: step === 2 && debouncedSlug.length > 0,
    queryFn: async () => checkMyOnboardingWorkspaceSlugAvailability(debouncedSlug),
    retry: false,
    meta: { silent: true },
  });

  const workspaceNameMissing = !workspaceName.trim();
  const workspaceSlugMissing = !workspaceSlug.trim();
  const slugAvailability = slugAvailabilityQuery.data;
  const slugAvailable = slugAvailability?.available === true;
  const slugUnavailableReason = slugAvailability?.reason ?? null;
  const workspacePreferencesInvalid =
    !workspaceLocale ||
    !workspaceTimezone ||
    (!workspaceUseRelativeDateTime && !workspaceDateFormat);

  const createWorkspaceMutation = useMutation({
    mutationFn: async () => {
      const nextName = workspaceName.trim();
      const nextSlug = workspaceSlug.trim();

      if (!nextName) {
        throw new Error("WORKSPACE_NAME_REQUIRED");
      }
      if (!nextSlug) {
        throw new Error("WORKSPACE_SLUG_REQUIRED");
      }

      const availability = await checkMyOnboardingWorkspaceSlugAvailability(nextSlug);
      if (!availability.available || !availability.normalizedSlug) {
        if (availability.reason === "reserved") {
          throw new Error("WORKSPACE_SLUG_RESERVED");
        }
        if (availability.reason === "exists") {
          throw new Error("WORKSPACE_SLUG_EXISTS");
        }
        throw new Error("WORKSPACE_SLUG_INVALID");
      }

      let organizationId = organizationsQuery.data?.items?.[0]?.organization.id;
      if (!organizationId) {
        const createdOrganization = await createMyOrganization({ name: nextName });
        organizationId = createdOrganization.organization.id;
        await queryClient.invalidateQueries({ queryKey: ["me", "organizations", "onboarding"] });
      }

      const createdWorkspace = await createOrganizationWorkspace(organizationId, {
        name: nextName,
        slug: availability.normalizedSlug,
        template: "blank",
      });

      const refreshed = await workspacesQuery.refetch();
      const onboarding = refreshed.data?.onboarding;
      if (
        !onboarding ||
        onboarding.status !== "pending_workspace_defaults" ||
        onboarding.workspaceId !== createdWorkspace.workspaceId
      ) {
        throw new Error("ONBOARDING_WORKSPACE_STATE_MISMATCH");
      }

      return createdWorkspace.workspaceId;
    },
    onSuccess: (workspaceId) => {
      setStepError(null);
      setCreatedWorkspaceId(workspaceId);
      setStep(3);
    },
    onError: (error) => {
      if (error instanceof Error) {
        setStepError(resolveWorkspaceCreateErrorMessage(error.message, t));
        return;
      }
      setStepError(t("onboarding:WORKSPACE_CREATE_GENERIC_ERROR"));
      notifyError(error);
    },
  });

  const saveDefaultsMutation = useMutation({
    mutationFn: async () => {
      if (!createdWorkspaceId) {
        throw new Error("WORKSPACE_ID_REQUIRED");
      }

      await patchCoreSettings(createdWorkspaceId, {
        workspace_localization: {
          locale: workspaceLocale,
          timezone: workspaceTimezone,
          use_browser_timezone: false,
          date_format: workspaceDateFormat,
          use_relative_datetime: workspaceUseRelativeDateTime,
        },
      });

      const refreshed = await workspacesQuery.refetch();
      const onboarding = refreshed.data?.onboarding;
      if (!onboarding || onboarding.status !== "completed") {
        throw new Error("ONBOARDING_DEFAULTS_STATE_MISMATCH");
      }

      return createdWorkspaceId;
    },
    onSuccess: async (workspaceId) => {
      setStepError(null);
      setCurrentWorkspaceId(workspaceId);
      await navigate({ to: `/w/${workspaceId}`, replace: true });
    },
    onError: (error) => {
      if (error instanceof Error) {
        setStepError(resolveWorkspaceDefaultsErrorMessage(error.message, t));
        return;
      }
      setStepError(t("onboarding:WORKSPACE_DEFAULTS_GENERIC_ERROR"));
      notifyError(error);
    },
  });

  const primaryActionPending = createWorkspaceMutation.isPending || saveDefaultsMutation.isPending;
  const nextButtonLoading =
    step === 2
      ? createWorkspaceMutation.isPending
      : step === 5
        ? saveDefaultsMutation.isPending
        : false;
  const nextButtonDisabled =
    primaryActionPending ||
    (step === 2
      ? workspaceCreated
        ? false
        : workspaceNameMissing ||
          workspaceSlugMissing ||
          slugAvailabilityQuery.isFetching ||
          !slugAvailable
      : step === 3
        ? workspacePreferencesInvalid
        : step === 4
          ? personalizeSubstep === 0
            ? !selectedRole
            : !selectedGoal
          : step === 5
            ? !createdWorkspaceId
            : false);
  const backButtonDisabled = primaryActionPending || step === 1;

  if (workspacesQuery.isLoading || profileQuery.isLoading || organizationsQuery.isLoading) {
    return (
      <div className="flex min-h-90 items-center justify-center rounded-2xl border border-border bg-background px-6 py-10">
        <div className="flex items-center gap-3 text-body text-label-secondary">
          <LoaderCircle className="size-4 animate-spin" />
          <span>{t("onboarding:WORKSPACE_FIRST_LOADING")}</span>
        </div>
      </div>
    );
  }

  if (workspacesQuery.isError) {
    return (
      <div className="rounded-2xl border border-border bg-background p-8">
        <div className="space-y-3">
          <div className="text-title3 text-label-primary">
            {t("onboarding:WORKSPACE_FIRST_LOAD_FAILED_TITLE")}
          </div>
          <FieldHint>{t("onboarding:WORKSPACE_FIRST_LOAD_FAILED_DESC")}</FieldHint>
          <Button variant="outline" onClick={() => void workspacesQuery.refetch()}>
            {t("common:RETRY")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Onboarding
      totalSteps={5}
      value={step}
      className="relative flex h-155 w-full flex-col overflow-hidden rounded-2xl border bg-background p-6"
    >
      <div className="flex flex-col gap-2 text-center">
        <div className="text-title text-label-primary">{currentStepTitle}</div>
        <p className="mx-auto max-w-2xl text-body text-label-secondary">{currentStepDescription}</p>
        <div className="pt-3">
          <StepIndicator currentStep={step} totalSteps={5} className="justify-center" />
        </div>
      </div>

      <div className="my-6 min-h-0 flex-1 overflow-hidden">
        <Onboarding.Step step={1} className="h-full">
          <div className="flex h-full flex-col gap-4 md:flex-row md:items-stretch md:gap-6">
            <FeatureCarousel
              value={activeFeatureIndex}
              onValueChange={setActiveFeatureIndex}
              totalItems={introFeatures.length}
              className="order-2 flex h-full w-full flex-col gap-3 md:order-1 md:w-1/2"
            >
              {introFeatures.map((feature, index) => {
                const isActive = activeFeatureIndex === index;
                const Icon = feature.icon;

                return (
                  <FeatureCarousel.Item
                    key={feature.imageSrc}
                    index={index}
                    className="focus-visible:outline-none"
                    onMouseEnter={() => setActiveFeatureIndex(index)}
                  >
                    <div
                      className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-all duration-300 ease-out ${
                        isActive
                          ? "translate-x-1 border-border bg-muted"
                          : "border-transparent hover:bg-muted/60"
                      }`}
                    >
                      <Icon
                        className={`mt-0.5 size-5 shrink-0 transition-colors duration-300 ${
                          isActive ? "text-label-primary" : "text-label-secondary"
                        }`}
                      />
                      <div className="min-w-0">
                        <p className="text-callout font-semibold text-label-primary">
                          {feature.title}
                        </p>
                        <div
                          className={`grid transition-all duration-300 ease-out ${
                            isActive ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                          }`}
                        >
                          <p className="mt-1 overflow-hidden text-footnote text-label-secondary">
                            {feature.description}
                          </p>
                        </div>
                      </div>
                    </div>
                  </FeatureCarousel.Item>
                );
              })}
            </FeatureCarousel>

            <div className="order-1 h-44 w-full md:order-2 md:h-full md:w-1/2">
              <div className="relative h-full overflow-hidden rounded-xl bg-muted">
                <img
                  src={activeFeature.imageSrc}
                  alt={activeFeature.title}
                  className="h-full w-full object-cover transition-all duration-500 ease-out"
                />
              </div>
            </div>
          </div>
        </Onboarding.Step>

        <Onboarding.Step step={2} className="h-full">
          <div className="mx-auto flex h-full w-full max-w-2xl flex-col justify-start gap-4">
            <div className="grid gap-1.5">
              <label
                className="text-callout font-semibold text-label-primary"
                htmlFor="workspace-name"
              >
                {t("common:ORG_WORKSPACES_FIELD_NAME")}
              </label>
              <FieldHint>{t("common:ORG_WORKSPACES_FIELD_NAME_HELP")}</FieldHint>
              <Input
                id="workspace-name"
                value={workspaceName}
                readOnly={workspaceCreated}
                onChange={(event) => {
                  setWorkspaceNameTouched(true);
                  setWorkspaceName(event.target.value);
                }}
                onBlur={() => setWorkspaceNameTouched(true)}
                placeholder={t("common:ORG_WORKSPACES_FIELD_NAME_PLACEHOLDER")}
                aria-invalid={workspaceNameTouched && workspaceNameMissing}
              />
              {workspaceNameTouched && workspaceNameMissing ? (
                <FieldHint tone="danger">
                  {t("common:ORG_WORKSPACES_FIELD_NAME_REQUIRED")}
                </FieldHint>
              ) : null}
            </div>

            <div className="grid gap-1.5">
              <label
                className="text-callout font-semibold text-label-primary"
                htmlFor="workspace-slug"
              >
                {t("onboarding:WORKSPACE_SLUG_LABEL")}
              </label>
              <FieldHint>{t("onboarding:WORKSPACE_SLUG_HELP")}</FieldHint>
              <Input
                id="workspace-slug"
                value={workspaceSlug}
                readOnly={workspaceCreated}
                onChange={(event) => {
                  setWorkspaceSlugTouched(true);
                  setWorkspaceSlug(normalizeWorkspaceSlugInput(event.target.value));
                }}
                onBlur={() => setWorkspaceSlugTouched(true)}
                placeholder={t("onboarding:WORKSPACE_SLUG_PLACEHOLDER")}
                aria-invalid={
                  (workspaceSlugTouched && workspaceSlugMissing) || slugUnavailableReason
                    ? true
                    : undefined
                }
              />
              {workspaceNameTouched && workspaceNameMissing ? null : workspaceSlugTouched &&
                workspaceSlugMissing ? (
                <FieldHint tone="danger">{t("onboarding:WORKSPACE_SLUG_REQUIRED")}</FieldHint>
              ) : workspaceCreated ? (
                <FieldHint>{t("onboarding:WORKSPACE_STEP_REVIEW_HELP")}</FieldHint>
              ) : slugAvailabilityQuery.isFetching ? (
                <FieldHint>{t("onboarding:WORKSPACE_SLUG_CHECKING")}</FieldHint>
              ) : slugAvailable ? (
                <div className="flex items-center gap-2 text-footnote text-success">
                  <CheckCircle2 className="size-4" />
                  <span>{t("onboarding:WORKSPACE_SLUG_AVAILABLE")}</span>
                </div>
              ) : slugAvailabilityQuery.isError ? (
                <FieldHint tone="danger">{t("onboarding:WORKSPACE_SLUG_CHECK_FAILED")}</FieldHint>
              ) : slugUnavailableReason ? (
                <FieldHint tone="danger">
                  {resolveSlugReasonText(slugUnavailableReason, t)}
                </FieldHint>
              ) : null}
            </div>

            {stepError ? <FieldHint tone="danger">{stepError}</FieldHint> : null}
          </div>
        </Onboarding.Step>

        <Onboarding.Step step={3} className="h-full">
          <div className="mx-auto flex h-full w-full max-w-2xl flex-col justify-start gap-5">
            <div className="grid gap-1.5">
              <label
                className="text-callout font-semibold text-label-primary"
                htmlFor="workspace-locale"
              >
                {t("setup:SETUP_FIELD_LANGUAGE_TITLE")}
              </label>
              <FieldHint>{t("settings:SETTINGS_WORKSPACE_LANGUAGE_DESC")}</FieldHint>
              <Select
                value={workspaceLocale}
                onValueChange={(value) => setWorkspaceLocale(normalizeLocale(value))}
              >
                <SelectTrigger id="workspace-locale" className="w-full">
                  <SelectValue placeholder={t("common:SELECT")} />
                </SelectTrigger>
                <SelectContent position="popper" align="start">
                  {localeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <label
                className="text-callout font-semibold text-label-primary"
                htmlFor="workspace-timezone"
              >
                {t("setup:SETUP_FIELD_TIMEZONE_TITLE")}
              </label>
              <FieldHint>{t("settings:SETTINGS_WORKSPACE_TIMEZONE_DESC")}</FieldHint>
              <Select value={workspaceTimezone} onValueChange={setWorkspaceTimezone}>
                <SelectTrigger id="workspace-timezone" className="w-full">
                  <SelectValue placeholder={t("common:SELECT")} />
                </SelectTrigger>
                <SelectContent position="popper" align="start">
                  {timezoneOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <label className="text-callout font-semibold text-label-primary">
                {t("setup:SETUP_FIELD_DATE_FORMAT_TITLE")}
              </label>
              <FieldHint>{t("settings:SETTINGS_WORKSPACE_DATE_FORMAT_DESC")}</FieldHint>
              <Select
                value={selectedDateTimePreference}
                onValueChange={(value) => {
                  if (value === RELATIVE_DATETIME_OPTION_VALUE) {
                    setWorkspaceUseRelativeDateTime(true);
                    return;
                  }
                  setWorkspaceUseRelativeDateTime(false);
                  setWorkspaceDateFormat(value);
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t("common:SELECT")} />
                </SelectTrigger>
                <SelectContent position="popper" align="start">
                  {dateTimePreferenceOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {stepError ? <FieldHint tone="danger">{stepError}</FieldHint> : null}
          </div>
        </Onboarding.Step>

        <Onboarding.Step step={4} className="h-full">
          {personalizeSubstep === 0 ? (
            <div className="flex h-full flex-col gap-6">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="flex size-9 items-center justify-center rounded-full bg-muted text-caption font-semibold text-label-primary">
                    1
                  </div>
                  <div className="text-title3 text-label-primary">
                    {t("onboarding:PERSONALIZE_QUESTION_1")}
                  </div>
                </div>
                <button
                  type="button"
                  className="shrink-0 text-footnote font-semibold text-label-secondary transition-colors hover:text-label-primary"
                  onClick={() => {
                    setStepError(null);
                    setPersonalizeSubstep(1);
                  }}
                >
                  {t("onboarding:PERSONALIZE_SKIP")}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
                {roleOptions.map((option) => {
                  const Icon = option.icon;
                  const isActive = selectedRole === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      className={`flex items-center gap-3 rounded-xl border px-5 py-4 text-left transition ${
                        isActive
                          ? "border-foreground/20 bg-muted"
                          : "border-border hover:bg-muted/60"
                      }`}
                      onClick={() => setSelectedRole(option.value)}
                    >
                      <Icon
                        className={`size-5 shrink-0 ${isActive ? "text-label-primary" : "text-label-secondary"}`}
                      />
                      <span className="text-callout font-semibold text-label-primary">
                        {option.label}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-auto text-body text-label-secondary">
                {t("onboarding:PERSONALIZE_QUESTION_PROGRESS_1")}
              </div>
            </div>
          ) : (
            <div className="flex h-full flex-col gap-6">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="flex size-9 items-center justify-center rounded-full bg-muted text-caption font-semibold text-label-primary">
                    2
                  </div>
                  <div className="text-title3 text-label-primary">
                    {t("onboarding:PERSONALIZE_QUESTION_2")}
                  </div>
                </div>
                <button
                  type="button"
                  className="shrink-0 text-footnote font-semibold text-label-secondary transition-colors hover:text-label-primary"
                  onClick={() => {
                    setStepError(null);
                    setStep(5);
                  }}
                >
                  {t("onboarding:PERSONALIZE_SKIP")}
                </button>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {goalOptions.map((option) => {
                  const isActive = selectedGoal === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      className={`rounded-xl border px-5 py-4 text-left transition ${
                        isActive
                          ? "border-foreground/20 bg-muted"
                          : "border-border hover:bg-muted/60"
                      }`}
                      onClick={() => setSelectedGoal(option.value)}
                    >
                      <span className="text-callout font-semibold text-label-primary">
                        {option.label}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-auto flex items-center justify-between gap-4 text-body text-label-secondary">
                <button
                  type="button"
                  className="inline-flex items-center gap-2 hover:text-label-primary"
                  onClick={() => setPersonalizeSubstep(0)}
                >
                  <ArrowLeft className="size-4" />
                  <span>{t("onboarding:PERSONALIZE_BACK_TO_QUESTION_1")}</span>
                </button>
                <div>{t("onboarding:PERSONALIZE_QUESTION_PROGRESS_2")}</div>
              </div>
            </div>
          )}
        </Onboarding.Step>

        <Onboarding.Step step={5} className="h-full">
          <div className="flex h-full flex-col gap-6 md:flex-row md:items-stretch md:gap-6">
            <div className="flex w-full flex-col gap-6 md:w-1/2">
              <div className="text-headline text-label-primary">
                {t("onboarding:READY_TIPS_LABEL")}
              </div>
              <div className="space-y-6">
                {readyTips.map((tip, index) => (
                  <div key={tip} className="flex items-start gap-4">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-caption font-semibold text-label-primary">
                      {index + 1}
                    </div>
                    <div className="text-body text-label-secondary">{tip}</div>
                  </div>
                ))}
              </div>
              {stepError ? <FieldHint tone="danger">{stepError}</FieldHint> : null}
            </div>

            <div className="w-full md:w-1/2">
              <div className="relative h-full min-h-56 overflow-hidden rounded-xl bg-muted">
                <img
                  src="/onboarding/onboarding-03.jpg"
                  alt={t("onboarding:READY_IMAGE_ALT")}
                  className="h-full w-full object-cover"
                />
              </div>
            </div>
          </div>
        </Onboarding.Step>
      </div>

      <div className="flex gap-3">
        <Button
          className="flex-1 rounded-xl py-5"
          variant="outline"
          disabled={backButtonDisabled}
          onClick={() => {
            setStepError(null);
            if (step === 2) {
              setStep(1);
              return;
            }
            if (step === 3) {
              setStep(2);
              return;
            }
            if (step === 4) {
              if (personalizeSubstep > 0) {
                setPersonalizeSubstep((currentValue) => Math.max(currentValue - 1, 0));
                return;
              }
              setStep(3);
              return;
            }
            if (step === 5) {
              setStep(4);
            }
          }}
        >
          {t("common:BACK")}
        </Button>
        <Button
          className="flex-1 rounded-xl py-5"
          loading={nextButtonLoading}
          disabled={nextButtonDisabled}
          onClick={() => {
            setStepError(null);
            if (step === 1) {
              setStep(2);
              return;
            }
            if (step === 2) {
              setWorkspaceNameTouched(true);
              setWorkspaceSlugTouched(true);
              if (workspaceCreated || onboardingStatus === "pending_workspace_defaults") {
                setStep(3);
                return;
              }
              void createWorkspaceMutation.mutateAsync();
              return;
            }
            if (step === 3) {
              setStep(4);
              return;
            }
            if (step === 4) {
              if (personalizeSubstep === 0) {
                setPersonalizeSubstep(1);
                return;
              }
              setStep(5);
              return;
            }
            void saveDefaultsMutation.mutateAsync();
          }}
        >
          {step === 5 ? t("onboarding:READY_CTA") : t("common:NEXT")}
        </Button>
      </div>
    </Onboarding>
  );
}

function resolveSlugReasonText(
  reason: "invalid" | "reserved" | "exists",
  t: (key: string) => string,
) {
  if (reason === "reserved") return t("onboarding:WORKSPACE_SLUG_RESERVED");
  if (reason === "exists") return t("onboarding:WORKSPACE_SLUG_EXISTS");
  return t("onboarding:WORKSPACE_SLUG_INVALID");
}

function resolveWorkspaceCreateErrorMessage(message: string, t: (key: string) => string) {
  if (message === "WORKSPACE_NAME_REQUIRED") return t("common:ORG_WORKSPACES_FIELD_NAME_REQUIRED");
  if (message === "WORKSPACE_SLUG_REQUIRED") return t("onboarding:WORKSPACE_SLUG_REQUIRED");
  if (message === "WORKSPACE_SLUG_RESERVED") return t("onboarding:WORKSPACE_SLUG_RESERVED");
  if (message === "WORKSPACE_SLUG_EXISTS") return t("onboarding:WORKSPACE_SLUG_EXISTS");
  if (message === "WORKSPACE_SLUG_INVALID") return t("onboarding:WORKSPACE_SLUG_INVALID");
  if (message === "ONBOARDING_WORKSPACE_STATE_MISMATCH") {
    return t("onboarding:WORKSPACE_CREATE_STATE_ERROR");
  }
  return t("onboarding:WORKSPACE_CREATE_GENERIC_ERROR");
}

function resolveWorkspaceDefaultsErrorMessage(message: string, t: (key: string) => string) {
  if (message === "WORKSPACE_ID_REQUIRED") return t("onboarding:WORKSPACE_DEFAULTS_GENERIC_ERROR");
  if (message === "ONBOARDING_DEFAULTS_STATE_MISMATCH") {
    return t("onboarding:WORKSPACE_DEFAULTS_STATE_ERROR");
  }
  return t("onboarding:WORKSPACE_DEFAULTS_GENERIC_ERROR");
}
