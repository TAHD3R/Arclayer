import { Alert, Button, Form, Input, Progress, Typography } from "antd";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { Sparkles } from "lucide-react";

import { getSetupJobStatus, getSetupStatus, setupSystem } from "@/api/system";
import type { SystemSetupJobStage, SystemSetupJobStatusPayload } from "@/types/api";
import { SetupAdminStep } from "@/components/setup/setup-admin-step";
import { SetupDefaultsStep } from "@/components/setup/setup-defaults-step";
import { SetupWorkspaceTemplateStep } from "@/components/setup/setup-workspace-template-step";
import {
  ExpandableScreen,
  ExpandableScreenContent,
  ExpandableScreenTrigger,
} from "@celestial/ui/expandable-screen";
import { Button as ButtonPrimitive } from "@celestial/ui/button-primitive";
const ColorBendsLazy = lazy(() => import("@celestial/ui/color-bends"));
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import {
  notifyError,
  notifyErrorText,
  notifyInfoText,
  notifySuccessText,
} from "@/lib/notifications";
import { applyWorkspaceTemplatePreset } from "@/lib/setup-template";
import { useAuthStore } from "@/stores/use-auth-store";
import { usePreferencesStore } from "@/stores/use-preference-store";
import type {
  SetupAdminDraft,
  SetupDefaultsDraft,
  SetupSiteDraft,
  SetupWizardStep,
  SetupWorkspaceTemplate,
} from "@/types/stores";
import { useSetupWizardStore } from "@/stores/use-setup-wizard-store";
import {
  FALLBACK_PRIMARY_BEND_COLOR,
  MAX_STEP,
  SETUP_JOB_MAX_POLLS,
  SETUP_JOB_POLL_INTERVAL_MS,
  SETUP_PROGRESS_STAGE_ORDER,
  WORKSPACE_FIELDS,
} from "./constants";
import {
  resolvePrimaryBendColor,
  resolvePortalOrigin,
  resolveSetupDryRunFlag,
  sleep,
} from "./utils";

export function SetupPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const clearAuth = useAuthStore((s) => s.clear);

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
  const themeMode = usePreferencesStore((s) => s.themeMode);

  const setupDryRunEnabled = useMemo(() => resolveSetupDryRunFlag(), []);

  const [adminForm] = Form.useForm<SetupAdminDraft>();
  const [siteForm] = Form.useForm<SetupSiteDraft>();
  const [defaultsForm] = Form.useForm<SetupDefaultsDraft>();

  const [submitting, setSubmitting] = useState(false);
  const [isLauncherExpanded, setLauncherExpanded] = useState(false);
  const [setupProgress, setSetupProgress] = useState<number | null>(null);
  const [setupProgressStage, setSetupProgressStage] = useState<SystemSetupJobStage | null>(null);

  const pollingCancelledRef = useRef(false);

  const reducedMotion = usePrefersReducedMotion();
  const prevStepRef = useRef(step);
  const stepDirection = step === prevStepRef.current ? 0 : step > prevStepRef.current ? 1 : -1;
  const enterOffsetX = stepDirection > 0 ? 14 : stepDirection < 0 ? -14 : 0;
  const exitOffsetX = stepDirection > 0 ? -14 : stepDirection < 0 ? 14 : 0;

  const [primaryBendColor, setPrimaryBendColor] = useState(FALLBACK_PRIMARY_BEND_COLOR);

  useEffect(() => {
    setPrimaryBendColor(resolvePrimaryBendColor());
  }, [themeMode]);

  useEffect(() => {
    return () => {
      pollingCancelledRef.current = true;
    };
  }, []);

  useEffect(() => {
    prevStepRef.current = step;
  }, [step]);

  useEffect(() => {
    if (deploymentMode !== "saas") return;
    void navigate({ to: "/login", replace: true });
  }, [deploymentMode, navigate]);

  const transition = reducedMotion
    ? ({ duration: 0 } as const)
    : ({ duration: 0.18, ease: [0.2, 0, 0, 1] as const } as const);

  useEffect(() => {
    adminForm.setFieldsValue(adminDraft);
  }, [adminDraft, adminForm]);

  useEffect(() => {
    siteForm.setFieldsValue(siteDraft);
  }, [siteDraft, siteForm]);

  useEffect(() => {
    defaultsForm.setFieldsValue(defaultsDraft);
  }, [defaultsDraft, defaultsForm]);

  useEffect(() => {
    if (step !== 1) return;

    const templateKey: SetupWorkspaceTemplate = siteDraft.templateKey || "blank";
    const displayName = (adminDraft.displayName || adminDraft.username || "").trim() || "admin";
    const slugSeed = (adminDraft.username || "").trim() || "admin";
    const portalOrigin = resolvePortalOrigin().trim().replace(/\/+$/, "");
    const siteUrl = siteDraft.siteUrl ?? `${portalOrigin}/w/${slugSeed}`;

    const preset = applyWorkspaceTemplatePreset({
      templateKey,
      displayName,
      siteUrl,
      t,
    });

    const next: Partial<SetupSiteDraft> = {};
    if (siteDraft.templateKey === undefined) next.templateKey = templateKey;
    if (siteDraft.workspaceName === undefined) next.workspaceName = preset.workspaceName;
    if (siteDraft.siteName === undefined) next.siteName = preset.siteName;
    if (siteDraft.siteDescription === undefined) next.siteDescription = preset.siteDescription;
    if (siteDraft.siteUrl === undefined) next.siteUrl = siteUrl;

    if (Object.keys(next).length > 0) {
      patchSite(next);
    }
  }, [
    adminDraft.displayName,
    adminDraft.username,
    patchSite,
    siteDraft.siteDescription,
    siteDraft.siteName,
    siteDraft.siteUrl,
    siteDraft.templateKey,
    siteDraft.workspaceName,
    step,
    t,
  ]);

  useEffect(() => {
    if (step !== 2) return;

    const preferredLocale = usePreferencesStore.getState().locale;
    const detectedTz = (() => {
      try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      } catch {
        return "UTC";
      }
    })();

    const next: Partial<SetupDefaultsDraft> = {};
    if (defaultsDraft.locale === undefined) {
      next.locale = preferredLocale;
    }
    if (defaultsDraft.timezone === undefined) {
      next.timezone = detectedTz;
    }
    if (defaultsDraft.useBrowserTimeZone === undefined) {
      next.useBrowserTimeZone = true;
    }
    if (defaultsDraft.dateFormat === undefined) {
      next.dateFormat = preferredLocale === "en-US" ? "MM/DD/YYYY" : "YYYY-MM-DD";
    }
    if (defaultsDraft.useRelativeDateTime === undefined) {
      next.useRelativeDateTime = true;
    }

    if (Object.keys(next).length > 0) {
      patchDefaults(next);
    }
  }, [
    defaultsDraft.dateFormat,
    defaultsDraft.locale,
    defaultsDraft.timezone,
    defaultsDraft.useBrowserTimeZone,
    defaultsDraft.useRelativeDateTime,
    patchDefaults,
    step,
  ]);

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

  const setupProgressStageLabels = useMemo<Record<SystemSetupJobStage, string>>(
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

  const onTemplateSelect = (templateKey: SetupWorkspaceTemplate) => {
    const current = siteForm.getFieldsValue(true) as SetupSiteDraft;
    const displayName = (adminDraft.displayName || adminDraft.username || "").trim() || "admin";
    const slugSeed = (adminDraft.username || "").trim() || "admin";
    const portalOrigin = resolvePortalOrigin().trim().replace(/\/+$/, "");
    const siteUrl = (current.siteUrl || "").trim() || `${portalOrigin}/w/${slugSeed}`;

    const preset = applyWorkspaceTemplatePreset({
      templateKey,
      displayName,
      siteUrl,
      t,
    });

    siteForm.setFieldsValue(preset);
    patchSite(preset);
  };

  const onPrev = () => {
    const next = Math.max(0, step - 1) as SetupWizardStep;
    setStep(next);
  };

  const onNext = async () => {
    if (step === 0) {
      await adminForm.validateFields();
    }

    if (step === 1) {
      await siteForm.validateFields(WORKSPACE_FIELDS as string[]);
    }

    const next = Math.min(MAX_STEP, step + 1) as SetupWizardStep;
    setStep(next);
  };

  const waitForSetupJob = async (jobId: string): Promise<SystemSetupJobStatusPayload> => {
    const pollSetupJob = async (attempt: number): Promise<SystemSetupJobStatusPayload> => {
      if (attempt >= SETUP_JOB_MAX_POLLS) {
        throw new Error(t("setup:SETUP_PROGRESS_TIMEOUT"));
      }

      if (pollingCancelledRef.current) {
        throw new Error("SETUP_POLLING_CANCELLED");
      }

      const status = await getSetupJobStatus(
        jobId,
        access === "token" ? { setupToken: setupToken.trim() } : undefined,
      );

      setSetupProgress(Math.max(1, status.percent));
      setSetupProgressStage(status.stage);

      if (status.status === "succeeded" || status.status === "failed") {
        return status;
      }

      await sleep(SETUP_JOB_POLL_INTERVAL_MS);
      return pollSetupJob(attempt + 1);
    };

    return pollSetupJob(0);
  };

  const onFinish = async () => {
    if (submitting) return;
    if (setupEnabled === false) return;

    if (access === "token" && !setupToken.trim()) {
      notifyErrorText(t("setup:SETUP_VALIDATION_SETUP_TOKEN_REQUIRED"));
      return;
    }

    let completed = false;

    try {
      setSubmitting(true);

      await adminForm.validateFields();
      await siteForm.validateFields(WORKSPACE_FIELDS as string[]);
      await defaultsForm.validateFields();

      const admin = adminForm.getFieldsValue(true) as SetupAdminDraft;
      const site = siteForm.getFieldsValue(true) as SetupSiteDraft;
      const defaults = defaultsForm.getFieldsValue(true) as SetupDefaultsDraft;

      const templateKey = site.templateKey || "blank";
      const workspaceName = (site.workspaceName || "").trim();
      const siteName = (site.siteName || "").trim();
      const siteUrl = (site.siteUrl || "").trim();
      const siteDescription = (site.siteDescription || "").trim();

      const corePatch: Record<string, unknown> = {
        site: {
          name: siteName,
          subtitle: workspaceName || null,
          url: siteUrl,
          kind: templateKey,
        },
        workspace: {
          name: workspaceName,
          template: templateKey,
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
        corePatch.site = Object.assign({}, corePatch.site, { description: siteDescription });
      }

      setLauncherExpanded(false);
      setSetupProgress(10);
      setSetupProgressStage("precheck");
      pollingCancelledRef.current = false;

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
          core_patch: corePatch,
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

      setSetupProgress(100);
      setSetupProgressStage("finalize");
      completed = true;

      const status = await getSetupStatus().catch(() => null);
      if (status) setSystemStatus(status);

      clearAuth();
      resetWizard();

      notifySuccessText(t("setup:SETUP_SUCCESS"));
      if (!reducedMotion) {
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, 280);
        });
      }
      await navigate({ to: "/login" });
    } catch (err) {
      if (!(err instanceof Error && err.message === "SETUP_POLLING_CANCELLED")) {
        notifyError(err);
      }
      setSetupProgress(null);
    } finally {
      setSubmitting(false);
      if (!completed) {
        setSetupProgress(null);
        setSetupProgressStage(null);
      }
    }
  };

  const renderStep = () => {
    if (step === 0) {
      return (
        <div className="space-y-6">
          <SetupAdminStep
            form={adminForm}
            disabled={setupEnabled === false}
            onValuesChange={(_changed, values) => patchAdmin(values)}
          />
        </div>
      );
    }

    if (step === 1) {
      return (
        <SetupWorkspaceTemplateStep
          form={siteForm}
          disabled={setupEnabled === false}
          onValuesChange={(_changed, values) => patchSite(values)}
          onTemplateSelect={onTemplateSelect}
        />
      );
    }

    return (
      <SetupDefaultsStep
        form={defaultsForm}
        disabled={setupEnabled === false}
        onValuesChange={(_changed, values) => patchDefaults(values)}
      />
    );
  };

  return (
    <ExpandableScreen
      layoutId="setup-launcher"
      triggerRadius="999px"
      contentRadius="24px"
      animationDuration={reducedMotion ? 0 : 0.22}
      overlayZIndexClassName="z-[2400]"
      expanded={isLauncherExpanded}
      onExpandChange={setLauncherExpanded}
    >
      <div className="mx-auto w-full max-w-3xl px-2 py-8 text-center sm:px-8 sm:py-10 select-none">
        <img
          src="/logo.svg"
          width={96}
          height={96}
          className="mx-auto h-20 w-20 sm:h-24 sm:w-24"
          alt={t("setup:SETUP_BRAND_LOGO_ALT")}
        />

        <Typography.Title level={1} className="text-largetitle text-label-primary">
          {t("setup:SETUP_WELCOME_TITLE")}
        </Typography.Title>
        <Typography.Paragraph className="text-title2 text-label-secondary">
          {t("setup:SETUP_WELCOME_DESC")}
        </Typography.Paragraph>

        {setupEnabled === false ? (
          <Alert
            type="warning"
            showIcon
            message={t("setup:SETUP_DISABLED_TITLE")}
            description={t("setup:SETUP_DISABLED_DESC")}
            className="text-left mb-4"
          />
        ) : null}

        {setupProgress !== null ? (
          <div className="mx-auto w-full max-w-xl px-2" aria-live="polite">
            <Progress
              className="[&_.ant-progress-steps-item]:h-3 [&_.ant-progress-steps-item]:rounded-sm"
              percent={Math.round(setupProgress)}
              steps={SETUP_PROGRESS_STAGE_ORDER.length}
              strokeWidth={16}
              showInfo={false}
              status={setupProgress >= 100 ? "success" : "active"}
            />
            <div className="mt-2 flex items-center justify-between text-caption text-label-secondary">
              <span>{t("setup:SETUP_INITIALIZING_LABEL")}</span>
              <span>
                {t("setup:SETUP_PROGRESS_STEP_INDICATOR", {
                  current: setupProgressStep,
                  total: SETUP_PROGRESS_STAGE_ORDER.length,
                })}
              </span>
            </div>
            {setupProgressStage ? (
              <div className="mt-1 text-footnote text-label-primary">
                {setupProgressStageLabels[setupProgressStage]}
              </div>
            ) : null}
          </div>
        ) : setupEnabled === false ? (
          <Button
            type="primary"
            shape="circle"
            size="large"
            icon={<Sparkles size={18} />}
            disabled
            aria-label={t("setup:SETUP_START_BUTTON")}
            autoInsertSpace={false}
          />
        ) : (
          <ExpandableScreenTrigger className={submitting ? "pointer-events-none opacity-60" : ""}>
            <ButtonPrimitive
              type="button"
              hoverScale={1}
              tapScale={1}
              className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors duration-200 hover:bg-primary/90"
              aria-label={t("setup:SETUP_START_BUTTON")}
              disabled={submitting}
            >
              <Sparkles size={20} />
            </ButtonPrimitive>
          </ExpandableScreenTrigger>
        )}
      </div>

      <ExpandableScreenContent
        className="border border-border/60 bg-background shadow-2xl"
        closeButtonClassName="bg-muted/35/70 text-label-primary hover:bg-muted/35"
      >
        <div className="grid h-full min-h-0 grid-cols-1 lg:grid-cols-3">
          <aside className="relative hidden overflow-hidden border-r border-border/70 lg:block">
            <div className="pointer-events-none absolute inset-0">
              <Suspense
                fallback={
                  <div className="absolute inset-0 bg-background animate-pulse opacity-50" />
                }
              >
                <ColorBendsLazy
                  className="h-full w-full"
                  colors={[primaryBendColor]}
                  rotation={0}
                  speed={0.2}
                  scale={1}
                  frequency={1}
                  warpStrength={1}
                  mouseInfluence={1}
                  parallax={0.5}
                  noise={0.1}
                  transparent
                />
              </Suspense>
              <div className="absolute inset-0 bg-background/72" />
            </div>

            <div className="relative z-10 flex h-full min-h-55 items-end p-6 sm:p-8">
              <div className="max-w-110 select-none">
                <div className="text-largetitle">{t("auth:SLOGAN_TITLE")}</div>
                <p className="text-title2 text-label-secondary">{t("auth:SLOGAN_SUBTITLE")}</p>
              </div>
            </div>
          </aside>

          <section className="flex min-h-0 flex-col lg:col-span-2">
            <div className="border-b border-border/70 px-4 py-4 sm:px-6 sm:py-5">
              <MotionConfig transition={transition}>
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={`stage-${step}`}
                    initial={reducedMotion ? { opacity: 1 } : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reducedMotion ? { opacity: 1 } : { opacity: 0, y: -8 }}
                  >
                    <h2 className="text-title text-label-primary font-bold">
                      {stageMeta[step].title}
                    </h2>
                    <p className="mt-3 text-body text-label-secondary">
                      {stageMeta[step].description}
                    </p>
                  </motion.div>
                </AnimatePresence>
              </MotionConfig>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6">
              <MotionConfig transition={transition}>
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={step}
                    style={{ willChange: "transform, opacity" }}
                    initial={reducedMotion ? { opacity: 1 } : { opacity: 0, x: enterOffsetX }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={reducedMotion ? { opacity: 1 } : { opacity: 0, x: exitOffsetX }}
                  >
                    {renderStep()}
                  </motion.div>
                </AnimatePresence>
              </MotionConfig>
            </div>

            <div className="border-t border-border/70 bg-background/95 px-4 py-3 sm:px-6">
              {step === MAX_STEP && access === "token" ? (
                <div className="mb-3">
                  <Form.Item
                    label={t("setup:SETUP_FIELD_SETUP_TOKEN_LABEL")}
                    help={t("setup:SETUP_FIELD_SETUP_TOKEN_HELP")}
                    required
                    className="mb-0!"
                  >
                    <Input.Password
                      value={setupToken}
                      onChange={(e) => setSetupToken(e.target.value)}
                      placeholder={t("setup:SETUP_FIELD_SETUP_TOKEN_PLACEHOLDER")}
                      autoComplete="off"
                      disabled={submitting}
                      size="large"
                      variant="filled"
                    />
                  </Form.Item>
                </div>
              ) : null}

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <Button
                  size="large"
                  disabled={step <= 0 || submitting}
                  onClick={onPrev}
                  autoInsertSpace={false}
                >
                  {t("setup:SETUP_PREV")}
                </Button>

                {step < MAX_STEP ? (
                  <Button
                    type="primary"
                    size="large"
                    disabled={setupEnabled === false || submitting}
                    onClick={() => void onNext()}
                    autoInsertSpace={false}
                  >
                    {t("setup:SETUP_NEXT")}
                  </Button>
                ) : (
                  <Button
                    type="primary"
                    size="large"
                    loading={submitting}
                    disabled={setupEnabled === false}
                    onClick={() => void onFinish()}
                    autoInsertSpace={false}
                  >
                    {t("setup:SETUP_FINISH")}
                  </Button>
                )}
              </div>
            </div>
          </section>
        </div>
      </ExpandableScreenContent>
    </ExpandableScreen>
  );
}
