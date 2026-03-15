import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { useForm, type FieldValues, type Path, type UseFormReturn } from "react-hook-form";
import type { Transition } from "motion/react";

import { getSetupJobStatus, getSetupStatus, setupSystem } from "@/api/system";
import type { AppLocale } from "@/lib/i18n";
import { notifyError, notifyInfoText, notifySuccessText } from "@/lib/notifications";
import { applyWorkspaceTemplatePreset } from "@/lib/setup-template";
import { SetupAdminStep } from "@/components/setup/setup-admin-step";
import { SetupDefaultsStep } from "@/components/setup/setup-defaults-step";
import { SetupWorkspaceTemplateStep } from "@/components/setup/setup-workspace-template-step";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { useAuthStore } from "@/stores/use-auth-store";
import { usePreferencesStore } from "@/stores/use-preference-store";
import { useSetupWizardStore } from "@/stores/use-setup-wizard-store";
import type {
  SetupAdminDraft,
  SetupAdminDraftPartial,
  SetupDefaultsDraft,
  SetupDefaultsDraftPartial,
  SetupSiteDraft,
  SetupSiteDraftPartial,
  SetupWizardStep,
  SetupWorkspaceTemplate,
} from "@/types/stores";
import {
  FALLBACK_PRIMARY_BEND_COLOR,
  MAX_STEP,
  SETUP_JOB_MAX_POLLS,
  SETUP_JOB_POLL_INTERVAL_MS,
  SETUP_PROGRESS_STAGE_ORDER,
  WORKSPACE_FIELDS,
} from "./constants";
import { SetupPageShell } from "./setup-page-shell";
import {
  createSetupAdminSchema,
  createSetupDefaultsSchema,
  createSetupSiteSchema,
} from "./setup-schemas";
import { resolvePrimaryBendColor, resolveSetupDryRunFlag, resolveSiteOrigin, sleep } from "./utils";
import type { SystemSetupJobStage, SystemSetupJobStatusPayload } from "@/types/api";

const EMPTY_ADMIN_DRAFT: SetupAdminDraft = {
  username: "",
  password: "",
  confirmPassword: "",
  email: "",
  displayName: "",
};

const EMPTY_SITE_DRAFT: SetupSiteDraft = {
  templateKey: "blank",
  workspaceName: "",
  siteName: "",
  siteUrl: "",
  siteDescription: "",
};

function detectTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function buildDefaultsDraft(
  draft: SetupDefaultsDraftPartial,
  preferredLocale: AppLocale,
): SetupDefaultsDraft {
  const locale = draft.locale ?? preferredLocale;
  return {
    timezone: draft.timezone ?? detectTimeZone(),
    locale,
    dateFormat: draft.dateFormat ?? (locale === "en-US" ? "MM/DD/YYYY" : "YYYY-MM-DD"),
    useBrowserTimeZone: draft.useBrowserTimeZone ?? true,
    useRelativeDateTime: draft.useRelativeDateTime ?? true,
  };
}

function useDraftSync<T extends FieldValues>(
  form: UseFormReturn<T>,
  patch: (draft: Partial<T>) => void,
) {
  useEffect(() => {
    const subscription = form.watch((value) => {
      patch(value as Partial<T>);
    });
    return () => subscription.unsubscribe();
  }, [form, patch]);
}

function maybeAutofillField<T extends FieldValues>(
  form: UseFormReturn<T>,
  name: Path<T>,
  value: T[Path<T>],
) {
  const dirtyFields = form.formState.dirtyFields as Partial<Record<string, boolean>>;
  if (dirtyFields[String(name)]) return;

  const currentValue = form.getValues(name);
  const hasValue =
    typeof currentValue === "string" ? currentValue.trim().length > 0 : Boolean(currentValue);
  if (hasValue) return;

  form.setValue(name, value, { shouldDirty: false, shouldTouch: false, shouldValidate: false });
}

function buildSetupCorePatch(site: SetupSiteDraft, defaults: SetupDefaultsDraft) {
  const workspaceName = site.workspaceName.trim();
  const siteName = site.siteName.trim();
  const siteUrl = site.siteUrl.trim();
  const siteDescription = (site.siteDescription || "").trim();

  const corePatch: Record<string, unknown> = {
    site: {
      name: siteName,
      subtitle: workspaceName || null,
      url: siteUrl,
      kind: site.templateKey,
    },
    workspace: {
      name: workspaceName,
      template: site.templateKey,
    },
    workspace_localization: {
      locale: defaults.locale,
      timezone: defaults.timezone,
      date_format: defaults.dateFormat,
      use_browser_timezone: defaults.useBrowserTimeZone,
      use_relative_datetime: defaults.useRelativeDateTime,
    },
    site_localization: {
      locale: defaults.locale,
      timezone: defaults.timezone,
      date_format: defaults.dateFormat,
      use_browser_timezone: defaults.useBrowserTimeZone,
      use_relative_datetime: defaults.useRelativeDateTime,
    },
  };

  if (siteDescription) {
    corePatch.site = {
      ...(corePatch.site as Record<string, unknown>),
      description: siteDescription,
    };
  }

  return corePatch;
}

async function validateSetupForms(props: {
  adminForm: UseFormReturn<SetupAdminDraft>;
  defaultsForm: UseFormReturn<SetupDefaultsDraft>;
  setStep: (step: SetupWizardStep) => void;
  siteForm: UseFormReturn<SetupSiteDraft>;
}) {
  const adminValid = await props.adminForm.trigger(undefined, { shouldFocus: true });
  if (!adminValid) {
    props.setStep(0);
    return false;
  }

  const siteValid = await props.siteForm.trigger(WORKSPACE_FIELDS, { shouldFocus: true });
  if (!siteValid) {
    props.setStep(1);
    return false;
  }

  const defaultsValid = await props.defaultsForm.trigger(undefined, { shouldFocus: true });
  if (!defaultsValid) {
    props.setStep(2);
    return false;
  }

  return true;
}

export function SetupPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const reducedMotion = usePrefersReducedMotion();

  const clearAuth = useAuthStore((s) => s.clear);
  const themeMode = usePreferencesStore((s) => s.themeMode);
  const preferredLocale = usePreferencesStore((s) => s.locale);

  const step = useSetupWizardStore((s) => s.step);
  const setStep = useSetupWizardStore((s) => s.setStep);
  const adminDraft = useSetupWizardStore((s) => s.admin);
  const patchAdmin = useSetupWizardStore((s) => s.patchAdmin);
  const siteDraft = useSetupWizardStore((s) => s.site);
  const patchSite = useSetupWizardStore((s) => s.patchSite);
  const defaultsDraft = useSetupWizardStore((s) => s.defaults);
  const patchDefaults = useSetupWizardStore((s) => s.patchDefaults);
  const setupToken = useSetupWizardStore((s) => s.setupToken);
  const setSetupToken = useSetupWizardStore((s) => s.setSetupToken);
  const setSystemStatus = useSetupWizardStore((s) => s.setSystemStatus);
  const resetWizard = useSetupWizardStore((s) => s.resetWizard);
  const setupEnabled = useSetupWizardStore((s) => s.setupEnabled);
  const access = useSetupWizardStore((s) => s.access);
  const deploymentMode = useSetupWizardStore((s) => s.deploymentMode);

  const setupDryRunEnabled = useMemo(() => resolveSetupDryRunFlag(), []);
  const adminSchema = useMemo(() => createSetupAdminSchema(t), [t]);
  const siteSchema = useMemo(() => createSetupSiteSchema(t), [t]);
  const defaultsSchema = useMemo(() => createSetupDefaultsSchema(t), [t]);

  const adminForm = useForm<SetupAdminDraft>({
    resolver: zodResolver(adminSchema),
    defaultValues: { ...EMPTY_ADMIN_DRAFT, ...adminDraft },
    mode: "onTouched",
  });
  const siteForm = useForm<SetupSiteDraft>({
    resolver: zodResolver(siteSchema),
    defaultValues: { ...EMPTY_SITE_DRAFT, ...siteDraft },
    mode: "onTouched",
  });
  const defaultsForm = useForm<SetupDefaultsDraft>({
    resolver: zodResolver(defaultsSchema),
    defaultValues: buildDefaultsDraft(defaultsDraft, preferredLocale),
    mode: "onTouched",
  });

  useDraftSync(adminForm, (draft) => patchAdmin(draft as SetupAdminDraftPartial));
  useDraftSync(siteForm, (draft) => patchSite(draft as SetupSiteDraftPartial));
  useDraftSync(defaultsForm, (draft) => patchDefaults(draft as SetupDefaultsDraftPartial));

  const [submitting, setSubmitting] = useState(false);
  const [isLauncherExpanded, setLauncherExpanded] = useState(false);
  const [setupProgress, setSetupProgress] = useState<number | null>(null);
  const [setupProgressStage, setSetupProgressStage] = useState<SystemSetupJobStage | null>(null);
  const [setupTokenError, setSetupTokenError] = useState<string>();
  const [primaryBendColor, setPrimaryBendColor] = useState(FALLBACK_PRIMARY_BEND_COLOR);

  const pollingCancelledRef = useRef(false);
  const previousStepRef = useRef(step);

  const stepDirection =
    step === previousStepRef.current ? 0 : step > previousStepRef.current ? 1 : -1;
  const enterOffsetX = stepDirection > 0 ? 14 : stepDirection < 0 ? -14 : 0;
  const exitOffsetX = stepDirection > 0 ? -14 : stepDirection < 0 ? 14 : 0;

  const transition: Transition = reducedMotion
    ? { duration: 0 }
    : { duration: 0.18, ease: [0.2, 0, 0, 1] };

  const adminUsername = adminForm.watch("username");
  const adminDisplayName = adminForm.watch("displayName");

  useEffect(() => {
    setPrimaryBendColor(resolvePrimaryBendColor());
  }, [themeMode]);

  useEffect(() => {
    return () => {
      pollingCancelledRef.current = true;
    };
  }, []);

  useEffect(() => {
    previousStepRef.current = step;
  }, [step]);

  useEffect(() => {
    if (deploymentMode !== "saas") return;
    void navigate({ to: "/login", replace: true });
  }, [deploymentMode, navigate]);

  useEffect(() => {
    if (step !== 1) return;

    const currentSite = siteForm.getValues();
    const templateKey: SetupWorkspaceTemplate = currentSite.templateKey || "blank";
    const displayName = (adminDisplayName || adminUsername || "").trim() || "admin";
    const slugSeed = (adminUsername || "").trim() || "admin";
    const siteOrigin = resolveSiteOrigin().trim().replace(/\/+$/, "");
    const siteUrl = (currentSite.siteUrl || "").trim() || `${siteOrigin}/w/${slugSeed}`;
    const preset = applyWorkspaceTemplatePreset({ templateKey, displayName, siteUrl, t });

    maybeAutofillField(siteForm, "templateKey", templateKey);
    maybeAutofillField(siteForm, "workspaceName", preset.workspaceName);
    maybeAutofillField(siteForm, "siteName", preset.siteName);
    maybeAutofillField(siteForm, "siteDescription", preset.siteDescription || "");
    maybeAutofillField(siteForm, "siteUrl", siteUrl);
  }, [adminDisplayName, adminUsername, siteForm, step, t]);

  const stageMeta = useMemo(
    () => [
      {
        title: t("setup:SETUP_STAGE_ADMIN_TITLE"),
        description: t("setup:SETUP_STAGE_ADMIN_DESC"),
      },
      {
        title: t("setup:SETUP_STAGE_WORKSPACE_TITLE"),
        description: t("setup:SETUP_STAGE_WORKSPACE_DESC"),
      },
      {
        title: t("setup:SETUP_STAGE_DEFAULTS_TITLE"),
        description: t("setup:SETUP_STAGE_DEFAULTS_DESC"),
      },
    ],
    [t],
  );

  const progressStageLabels = useMemo<Record<SystemSetupJobStage, string>>(
    () => ({
      precheck: t("setup:SETUP_PROGRESS_STAGE_PRECHECK"),
      admin: t("setup:SETUP_PROGRESS_STAGE_ADMIN"),
      provision: t("setup:SETUP_PROGRESS_STAGE_PROVISION"),
      workspace: t("setup:SETUP_PROGRESS_STAGE_WORKSPACE"),
      finalize: t("setup:SETUP_PROGRESS_STAGE_FINALIZE"),
    }),
    [t],
  );

  const setupProgressStep = setupProgressStage
    ? Math.max(1, SETUP_PROGRESS_STAGE_ORDER.indexOf(setupProgressStage) + 1)
    : 1;

  function onSetupTokenChange(value: string) {
    setSetupToken(value);
    if (setupTokenError) {
      setSetupTokenError(undefined);
    }
  }

  function onTemplateSelect(templateKey: SetupWorkspaceTemplate) {
    const currentSite = siteForm.getValues();
    const displayName =
      (adminForm.getValues("displayName") || adminForm.getValues("username") || "").trim() ||
      "admin";
    const slugSeed = (adminForm.getValues("username") || "").trim() || "admin";
    const siteOrigin = resolveSiteOrigin().trim().replace(/\/+$/, "");
    const siteUrl = (currentSite.siteUrl || "").trim() || `${siteOrigin}/w/${slugSeed}`;
    const preset = applyWorkspaceTemplatePreset({ templateKey, displayName, siteUrl, t });

    siteForm.setValue("templateKey", templateKey, { shouldDirty: true, shouldValidate: true });
    siteForm.setValue("workspaceName", preset.workspaceName ?? "", { shouldDirty: true });
    siteForm.setValue("siteName", preset.siteName ?? "", { shouldDirty: true });
    siteForm.setValue("siteUrl", preset.siteUrl ?? "", { shouldDirty: true });
    siteForm.setValue("siteDescription", preset.siteDescription || "", { shouldDirty: true });
  }

  function onPrev() {
    const next = Math.max(0, step - 1) as SetupWizardStep;
    setStep(next);
  }

  async function onNext() {
    if (step === 0) {
      const valid = await adminForm.trigger(undefined, { shouldFocus: true });
      if (!valid) return;
    }

    if (step === 1) {
      const valid = await siteForm.trigger(WORKSPACE_FIELDS, { shouldFocus: true });
      if (!valid) return;
    }

    const next = Math.min(MAX_STEP, step + 1) as SetupWizardStep;
    setStep(next);
  }

  async function waitForSetupJob(jobId: string): Promise<SystemSetupJobStatusPayload> {
    const status = await getSetupJobStatus(
      jobId,
      access === "token" ? { setupToken: setupToken.trim() } : undefined,
    );

    setSetupProgress(Math.max(1, status.percent));
    setSetupProgressStage(status.stage);

    if (status.status === "succeeded" || status.status === "failed") {
      return status;
    }
    if (pollingCancelledRef.current) {
      throw new Error("SETUP_POLLING_CANCELLED");
    }
    return pollSetupJob(jobId, 1);
  }

  async function pollSetupJob(
    jobId: string,
    attempt: number,
  ): Promise<SystemSetupJobStatusPayload> {
    if (attempt >= SETUP_JOB_MAX_POLLS) {
      throw new Error(t("setup:SETUP_PROGRESS_TIMEOUT"));
    }
    if (pollingCancelledRef.current) {
      throw new Error("SETUP_POLLING_CANCELLED");
    }

    await sleep(SETUP_JOB_POLL_INTERVAL_MS);
    const status = await getSetupJobStatus(
      jobId,
      access === "token" ? { setupToken: setupToken.trim() } : undefined,
    );

    setSetupProgress(Math.max(1, status.percent));
    setSetupProgressStage(status.stage);

    if (status.status === "succeeded" || status.status === "failed") {
      return status;
    }
    return pollSetupJob(jobId, attempt + 1);
  }

  async function completeSetup() {
    const admin = adminForm.getValues();
    const site = siteForm.getValues();
    const defaults = defaultsForm.getValues();
    const setupOptions = {
      ...(access === "token" ? { setupToken: setupToken.trim() } : {}),
      ...(setupDryRunEnabled ? { devSetup: true } : {}),
    };

    const job = await setupSystem(
      {
        admin: {
          username: admin.username.trim(),
          password: admin.password,
          email: admin.email.trim(),
          display_name: admin.displayName.trim(),
        },
        core_patch: buildSetupCorePatch(site, defaults),
      },
      Object.keys(setupOptions).length > 0 ? setupOptions : undefined,
    );

    setSetupProgress(Math.max(1, job.percent));
    setSetupProgressStage(job.stage);

    const finalStatus = await waitForSetupJob(job.jobId);
    if (finalStatus.status === "failed") {
      throw new Error(finalStatus.errorMessage || t("setup:SETUP_PROGRESS_FAILED"));
    }
    if (finalStatus.warnings.length > 0) {
      notifyInfoText(t("setup:SETUP_SUCCESS_WITH_WARNINGS"));
    }
  }

  async function onFinish() {
    if (submitting || setupEnabled === false) return;
    if (access === "token" && !setupToken.trim()) {
      setSetupTokenError(t("setup:SETUP_VALIDATION_SETUP_TOKEN_REQUIRED"));
      return;
    }

    const valid = await validateSetupForms({ adminForm, defaultsForm, setStep, siteForm });
    if (!valid) return;

    let completed = false;

    try {
      setSubmitting(true);
      setLauncherExpanded(false);
      setSetupProgress(10);
      setSetupProgressStage("precheck");
      pollingCancelledRef.current = false;

      await completeSetup();
      setSetupProgress(100);
      setSetupProgressStage("finalize");
      completed = true;

      const status = await getSetupStatus().catch(() => null);
      if (status) {
        setSystemStatus(status);
      }

      clearAuth();
      resetWizard();
      notifySuccessText(t("setup:SETUP_SUCCESS"));

      if (!reducedMotion) {
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, 280);
        });
      }
      await navigate({ to: "/login" });
    } catch (error) {
      if (!(error instanceof Error && error.message === "SETUP_POLLING_CANCELLED")) {
        notifyError(error);
      }
      setSetupProgress(null);
    } finally {
      setSubmitting(false);
      if (!completed) {
        setSetupProgress(null);
        setSetupProgressStage(null);
      }
    }
  }

  const currentStepContent =
    step === 0 ? (
      <SetupAdminStep form={adminForm} disabled={setupEnabled === false} />
    ) : step === 1 ? (
      <SetupWorkspaceTemplateStep
        form={siteForm}
        disabled={setupEnabled === false}
        onTemplateSelect={onTemplateSelect}
      />
    ) : (
      <SetupDefaultsStep form={defaultsForm} disabled={setupEnabled === false} />
    );

  return (
    <SetupPageShell
      access={access}
      currentStepContent={currentStepContent}
      enterOffsetX={enterOffsetX}
      exitOffsetX={exitOffsetX}
      isLauncherExpanded={isLauncherExpanded}
      onExpandChange={setLauncherExpanded}
      onFinish={onFinish}
      onNext={onNext}
      onPrev={onPrev}
      onSetupTokenChange={onSetupTokenChange}
      primaryBendColor={primaryBendColor}
      reducedMotion={reducedMotion}
      setupEnabled={setupEnabled}
      setupProgress={setupProgress}
      setupProgressStageLabel={setupProgressStage ? progressStageLabels[setupProgressStage] : null}
      setupProgressStep={setupProgressStep}
      setupToken={setupToken}
      setupTokenError={setupTokenError}
      stageMeta={stageMeta}
      step={step}
      submitting={submitting}
      transition={transition}
    />
  );
}
