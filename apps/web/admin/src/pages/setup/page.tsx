import { Alert, Button, Divider, Form, Input, Typography } from "antd";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { AnimatePresence, MotionConfig, motion } from "motion/react";

import { usePreferencesStore } from "@/stores/use-preference-store";
import { useAuthStore } from "@/stores/use-auth-store";
import {
  useSetupWizardStore,
  type SetupAdminDraft,
  type SetupDefaultsDraft,
  type SetupSiteDraft,
  type SetupWizardStep,
} from "@/stores/use-setup-wizard-store";
import { SetupAdminStep } from "@/components/common/setup/setup-admin-step";
import { SetupDefaultsStep } from "@/components/common/setup/setup-defaults-step";
import { SetupSiteStep } from "@/components/common/setup/setup-site-step";
import { getSetupStatus, setupSystem } from "@/api/system";
import { notifyError, notifyErrorText, notifySuccessText } from "@/lib/notifications";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";

const MAX_STEP: SetupWizardStep = 3;

export function SetupView() {
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

  const [adminForm] = Form.useForm<SetupAdminDraft>();
  const [siteForm] = Form.useForm<SetupSiteDraft>();
  const [defaultsForm] = Form.useForm<SetupDefaultsDraft>();

  const setupEnabled = useSetupWizardStore((s) => s.setupEnabled);
  const access = useSetupWizardStore((s) => s.access);

  const [submitting, setSubmitting] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
  const prevStepRef = useRef(step);
  const stepDirection = step === prevStepRef.current ? 0 : step > prevStepRef.current ? 1 : -1;
  const enterOffsetX = stepDirection > 0 ? 14 : stepDirection < 0 ? -14 : 0;
  const exitOffsetX = stepDirection > 0 ? -14 : stepDirection < 0 ? 14 : 0;

  useEffect(() => {
    prevStepRef.current = step;
  }, [step]);

  const transition = reducedMotion
    ? ({ duration: 0.01 } as const)
    : ({ duration: 0.18, ease: [0.2, 0, 0, 1] as const } as const);

  // Rehydrate Step 1 form from store so values can be recalled across steps.
  useEffect(() => {
    adminForm.setFieldsValue(adminDraft);
  }, [adminDraft, adminForm]);

  // Rehydrate Step 2 form from store so values can be recalled across steps.
  useEffect(() => {
    siteForm.setFieldsValue(siteDraft);
  }, [siteDraft, siteForm]);

  // Rehydrate Step 3 form from store so values can be recalled across steps.
  useEffect(() => {
    defaultsForm.setFieldsValue(defaultsDraft);
  }, [defaultsDraft, defaultsForm]);

  // When entering Step 2 for the first time, seed sensible defaults.
  useEffect(() => {
    if (step !== 2) return;

    const username = (adminDraft.username || "").trim() || "admin";

    const next: Partial<SetupSiteDraft> = {};
    // Seed only when the field is still untouched (undefined) to avoid fighting user edits.
    if (siteDraft.siteName === undefined) {
      next.siteName = t("setup:SETUP_DEFAULT_SITE_NAME", { username });
    }
    const effectiveSiteName = (next.siteName || siteDraft.siteName || "").trim();
    if (siteDraft.siteDescription === undefined) {
      next.siteDescription = t("setup:SETUP_DEFAULT_SITE_DESC", {
        siteName: effectiveSiteName || t("setup:SETUP_DEFAULT_SITE_NAME", { username }),
      });
    }
    if (siteDraft.siteUrl === undefined) {
      try {
        next.siteUrl = window.location.origin;
      } catch {
        next.siteUrl = "";
      }
    }

    if (Object.keys(next).length > 0) {
      patchSite(next);
    }
  }, [adminDraft.username, patchSite, siteDraft, step, t]);

  // When entering Step 3 for the first time, seed sensible defaults.
  useEffect(() => {
    if (step !== 3) return;

    const preferredLocale = usePreferencesStore.getState().locale;
    // Product default: Asia/Shanghai. Keep it stable and predictable in setup.
    const detectedTz = "Asia/Shanghai";

    const next: Partial<SetupDefaultsDraft> = {};
    if (defaultsDraft.locale === undefined) {
      next.locale = preferredLocale;
    }
    if (defaultsDraft.timezone === undefined) {
      next.timezone = detectedTz;
    }
    if (defaultsDraft.dateFormat === undefined) {
      // Keep default choice simple and predictable.
      next.dateFormat = preferredLocale === "en-US" ? "MM/DD/YYYY" : "YYYY-MM-DD";
    }

    if (Object.keys(next).length > 0) {
      patchDefaults(next);
    }
  }, [defaultsDraft.dateFormat, defaultsDraft.locale, defaultsDraft.timezone, patchDefaults, step]);

  const stageMeta = useMemo(() => {
    if (step === 0) {
      return {
        title: t("setup:SETUP_STAGE_WELCOME_TITLE"),
        description: t("setup:SETUP_STAGE_WELCOME_DESC"),
      };
    }
    if (step === 1) {
      return {
        title: t("setup:SETUP_STAGE_ADMIN_TITLE"),
        description: t("setup:SETUP_STAGE_ADMIN_DESC"),
      };
    }
    if (step === 2) {
      return {
        title: t("setup:SETUP_STAGE_SITE_TITLE"),
        description: t("setup:SETUP_STAGE_SITE_DESC"),
      };
    }
    return {
      title: t("setup:SETUP_STAGE_DEFAULTS_TITLE"),
      description: t("setup:SETUP_STAGE_DEFAULTS_DESC"),
    };
  }, [step, t]);

  const onPrev = () => {
    const next = Math.max(0, step - 1) as SetupWizardStep;
    setStep(next);
  };

  const onNext = async () => {
    // Gate step transitions on current step validation.
    if (step === 1) {
      await adminForm.validateFields();
    }
    if (step === 2) {
      await siteForm.validateFields();
    }
    const next = Math.min(MAX_STEP, step + 1) as SetupWizardStep;
    setStep(next);
  };

  const onFinish = async () => {
    if (submitting) return;
    if (setupEnabled === false) return;

    // Require setup token only when backend enforces it.
    if (access === "token" && !setupToken.trim()) {
      notifyErrorText(t("setup:SETUP_VALIDATION_SETUP_TOKEN_REQUIRED"));
      return;
    }

    try {
      setSubmitting(true);

      // Validate all steps before submission (users may go back and edit fields).
      await adminForm.validateFields();
      await siteForm.validateFields();
      await defaultsForm.validateFields();

      const admin = adminForm.getFieldsValue(true) as SetupAdminDraft;
      const site = siteForm.getFieldsValue(true) as SetupSiteDraft;
      const defaults = defaultsForm.getFieldsValue(true) as SetupDefaultsDraft;

      const siteName = (site.siteName || "").trim();
      const siteUrl = (site.siteUrl || "").trim();
      const siteDescription = (site.siteDescription || "").trim();

      const corePatch: Record<string, unknown> = {
        site: {
          name: siteName,
          url: siteUrl,
        },
        // Split localization scopes:
        // - workspace_localization: admin experience defaults
        // - site_localization: visitor/site defaults (reserved for future portal/site runtime)
        workspace_localization: {
          locale: defaults.locale,
          timezone: defaults.timezone,
          date_format: defaults.dateFormat,
        },
        site_localization: {
          locale: defaults.locale,
          timezone: defaults.timezone,
          date_format: defaults.dateFormat,
        },
      };
      // In setup, we keep it minimal: name/url/description.
      if (siteDescription) {
        corePatch.seo = { default_description: siteDescription };
      }

      await setupSystem(
        {
          admin: {
            username: admin.username.trim(),
            password: admin.password,
            email: admin.email.trim(),
            display_name: admin.displayName.trim(),
          },
          organization: null,
          core_patch: corePatch,
        },
        access === "token" ? { setupToken: setupToken.trim() } : undefined,
      );

      // Refresh status so route guard can redirect away from /setup.
      const status = await getSetupStatus().catch(() => null);
      if (status) setSystemStatus(status);

      // Drop any stale session tokens (common when DB is reset during dev).
      clearAuth();

      // Clear sensitive in-memory drafts.
      resetWizard();

      notifySuccessText(t("setup:SETUP_SUCCESS"));
      await navigate({ to: "/login" });
    } catch (err) {
      notifyError(err);
    } finally {
      setSubmitting(false);
    }
  };

  const welcomeStep = (
    <MotionConfig transition={transition}>
      <div className="min-h-[380px] flex flex-col items-center justify-center text-center">
        <div className="w-full max-w-xl">
          <motion.div
            initial={reducedMotion ? { opacity: 1 } : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="text-3xl font-semibold tracking-tight">
              {t("setup:SETUP_STAGE_WELCOME_TITLE")}
            </div>
          </motion.div>

          <motion.div
            initial={reducedMotion ? { opacity: 1 } : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reducedMotion ? undefined : { delay: 0.08 }}
          >
            <div className="mt-3 text-base leading-relaxed text-muted-foreground">
              {t("setup:SETUP_STAGE_WELCOME_DESC")}
            </div>
          </motion.div>

          <motion.div
            initial={reducedMotion ? { opacity: 1 } : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reducedMotion ? undefined : { delay: 0.16 }}
          >
            <button
              type="button"
              disabled={setupEnabled === false || submitting}
              onClick={() => setStep(1)}
              className={[
                "mt-8 w-full max-w-sm",
                "inline-flex items-center justify-center",
                "h-12 px-6 rounded-xl",
                "bg-primary text-primary-foreground",
                "font-semibold text-base",
                "shadow-sm",
                "transition-colors",
                "hover:bg-primary/90",
                "active:translate-y-px",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0",
                "disabled:pointer-events-none disabled:opacity-60",
              ].join(" ")}
              aria-label={t("setup:SETUP_WELCOME_PRIMARY_ACTION")}
            >
              {t("setup:SETUP_WELCOME_PRIMARY_ACTION")}
            </button>
          </motion.div>
        </div>
      </div>
    </MotionConfig>
  );

  const footer =
    step === 0 ? null : (
      <div className="flex gap-2 justify-end" style={{ marginTop: 16 }}>
        <Button disabled={step <= 0 || submitting} onClick={onPrev}>
          {t("setup:SETUP_PREV")}
        </Button>
        {step < MAX_STEP ? (
          <Button
            type="primary"
            disabled={setupEnabled === false || submitting}
            onClick={() => void onNext()}
          >
            {t("setup:SETUP_NEXT")}
          </Button>
        ) : (
          <Button
            type="primary"
            loading={submitting}
            disabled={setupEnabled === false}
            onClick={() => void onFinish()}
          >
            {t("setup:SETUP_FINISH")}
          </Button>
        )}
      </div>
    );

  return (
    <div className="w-full">
      {step !== 0 ? (
        <>
          <Typography.Title level={1} style={{ marginTop: 0, marginBottom: 8, fontSize: 32 }}>
            {stageMeta.title}
          </Typography.Title>
          <Typography.Paragraph
            style={{
              marginTop: 0,
              marginBottom: 26,
              color: "var(--color-muted-foreground)",
              fontSize: 18,
            }}
          >
            {stageMeta.description}
          </Typography.Paragraph>

          {setupEnabled === false ? (
            <Alert
              type="warning"
              showIcon
              message={t("setup:SETUP_DISABLED_TITLE")}
              description={t("setup:SETUP_DISABLED_DESC")}
              style={{ marginBottom: 12 }}
            />
          ) : null}

          {access === "token" ? (
            <Alert
              type="info"
              showIcon
              message={t("setup:SETUP_TOKEN_HINT_TITLE")}
              description={t("setup:SETUP_TOKEN_HINT_DESC")}
              style={{ marginBottom: 12 }}
            />
          ) : null}

          <Divider style={{ margin: "16px 0" }} />
        </>
      ) : null}

      {/* Step content */}
      <MotionConfig transition={transition}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step}
            style={{ willChange: "transform, opacity" }}
            initial={reducedMotion ? { opacity: 1 } : { opacity: 0, x: enterOffsetX }}
            animate={{ opacity: 1, x: 0 }}
            exit={reducedMotion ? { opacity: 1 } : { opacity: 0, x: exitOffsetX }}
          >
            {step === 0 ? (
              welcomeStep
            ) : step === 1 ? (
              <SetupAdminStep
                form={adminForm}
                disabled={setupEnabled === false}
                onValuesChange={(_changed, values) => {
                  // Keep draft in store so it can be recalled across steps and used for final submission.
                  patchAdmin(values);
                }}
              />
            ) : step === 2 ? (
              <SetupSiteStep
                form={siteForm}
                disabled={setupEnabled === false}
                onValuesChange={(_changed, values) => patchSite(values)}
              />
            ) : (
              <SetupDefaultsStep
                form={defaultsForm}
                disabled={setupEnabled === false}
                onValuesChange={(_changed, values) => patchDefaults(values)}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </MotionConfig>

      {step === MAX_STEP && access === "token" ? (
        <div style={{ marginTop: 16 }}>
          <Form.Item
            label={t("setup:SETUP_FIELD_SETUP_TOKEN_LABEL")}
            help={t("setup:SETUP_FIELD_SETUP_TOKEN_HELP")}
            required
            style={{ marginBottom: 0 }}
          >
            <Input.Password
              value={setupToken}
              onChange={(e) => setSetupToken(e.target.value)}
              placeholder={t("setup:SETUP_FIELD_SETUP_TOKEN_PLACEHOLDER")}
              autoComplete="off"
              disabled={submitting}
              size="large"
            />
          </Form.Item>
        </div>
      ) : null}

      {footer}
    </div>
  );
}
