import { lazy, Suspense } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AnimatePresence, MotionConfig, motion, type Transition } from "motion/react";
import { AlertTriangle, Sparkles } from "lucide-react";

import {
  ExpandableScreen,
  ExpandableScreenContent,
  ExpandableScreenTrigger,
} from "@arclayer/ui/expandable-screen";
import { Alert, AlertDescription, AlertTitle } from "@arclayer/ui/alert";
import { Button } from "@arclayer/ui/button";
import { Button as ButtonPrimitive } from "@arclayer/ui/button-primitive";
import { SetupFieldShell, SetupPasswordControl } from "@/components/setup/setup-form-controls";
import type { SetupAccessMode, SetupWizardStep } from "@/types/stores";
import { MAX_STEP, SETUP_PROGRESS_STAGE_ORDER } from "./constants";

const ColorBendsLazy = lazy(() => import("@arclayer/ui/color-bends"));

type SetupStageMeta = {
  title: string;
  description: string;
};

type SetupPageShellProps = {
  access: SetupAccessMode | null;
  currentStepContent: ReactNode;
  enterOffsetX: number;
  exitOffsetX: number;
  isLauncherExpanded: boolean;
  onExpandChange: (expanded: boolean) => void;
  onFinish: () => void | Promise<void>;
  onNext: () => void | Promise<void>;
  onPrev: () => void;
  onSetupTokenChange: (value: string) => void;
  primaryBendColor: string;
  reducedMotion: boolean;
  setupEnabled: boolean | null;
  setupProgress: number | null;
  setupProgressStageLabel: string | null;
  setupProgressStep: number;
  setupToken: string;
  setupTokenError?: string;
  stageMeta: SetupStageMeta[];
  step: SetupWizardStep;
  submitting: boolean;
  transition: Transition;
};

function SetupProgressStatus(props: { percent: number; stageLabel: string | null; step: number }) {
  const { t } = useTranslation();

  return (
    <div className="mx-auto w-full max-w-xl px-2" aria-live="polite">
      <div className="grid grid-cols-5 gap-2">
        {SETUP_PROGRESS_STAGE_ORDER.map((stage, index) => {
          const active = index < props.step;
          return (
            <div
              key={stage}
              className={active ? "h-3 rounded-full bg-primary" : "h-3 rounded-full bg-muted"}
            />
          );
        })}
      </div>
      <div className="mt-2 flex items-center justify-between text-caption text-label-secondary">
        <span>{t("setup:SETUP_INITIALIZING_LABEL")}</span>
        <span>
          {`${Math.round(props.percent)}% · ${t("setup:SETUP_PROGRESS_STEP_INDICATOR", {
            current: props.step,
            total: SETUP_PROGRESS_STAGE_ORDER.length,
          })}`}
        </span>
      </div>
      {props.stageLabel ? (
        <div className="mt-1 text-footnote text-label-primary">{props.stageLabel}</div>
      ) : null}
    </div>
  );
}

function SetupLaunchButton(props: {
  disabled: boolean;
  setupEnabled: boolean | null;
  submitting: boolean;
}) {
  const { t } = useTranslation();

  if (props.setupEnabled === false) {
    return (
      <ButtonPrimitive
        type="button"
        tapScale={1}
        disabled
        className="inline-flex h-16 w-16 items-center justify-center rounded-full border border-border/70 bg-muted text-label-secondary"
        aria-label={t("setup:SETUP_START_BUTTON")}
      >
        <Sparkles size={20} />
      </ButtonPrimitive>
    );
  }

  return (
    <ExpandableScreenTrigger className={props.submitting ? "pointer-events-none opacity-60" : ""}>
      <ButtonPrimitive
        type="button"
        tapScale={1}
        className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors duration-200 hover:bg-primary/90"
        aria-label={t("setup:SETUP_START_BUTTON")}
        disabled={props.disabled}
      >
        <Sparkles size={20} />
      </ButtonPrimitive>
    </ExpandableScreenTrigger>
  );
}

function SetupTokenField(props: {
  disabled: boolean;
  error?: string;
  onChange: (value: string) => void;
  value: string;
}) {
  const { t } = useTranslation();

  return (
    <div className="mb-3">
      <SetupFieldShell
        label={t("setup:SETUP_FIELD_SETUP_TOKEN_LABEL")}
        description={t("setup:SETUP_FIELD_SETUP_TOKEN_HELP")}
        error={props.error}
      >
        <SetupPasswordControl
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
          placeholder={t("setup:SETUP_FIELD_SETUP_TOKEN_PLACEHOLDER")}
          autoComplete="off"
          disabled={props.disabled}
          aria-label={t("setup:SETUP_FIELD_SETUP_TOKEN_LABEL")}
        />
      </SetupFieldShell>
    </div>
  );
}

export function SetupPageShell(props: SetupPageShellProps) {
  const { t } = useTranslation();

  return (
    <ExpandableScreen
      layoutId="setup-launcher"
      triggerRadius="999px"
      contentRadius="24px"
      animationDuration={props.reducedMotion ? 0 : 0.22}
      overlayZIndexClassName="z-[2400]"
      expanded={props.isLauncherExpanded}
      onExpandChange={props.onExpandChange}
    >
      <div className="mx-auto w-full max-w-3xl select-none px-2 py-8 text-center sm:px-8 sm:py-10">
        <img
          src="/logo.svg"
          width={96}
          height={96}
          className="mx-auto h-20 w-20 sm:h-24 sm:w-24"
          alt={t("setup:SETUP_BRAND_LOGO_ALT")}
        />

        <h1 className="text-largetitle text-label-primary">{t("setup:SETUP_WELCOME_TITLE")}</h1>
        <p className="text-title2 text-label-secondary">{t("setup:SETUP_WELCOME_DESC")}</p>

        {props.setupEnabled === false ? (
          <Alert className="mb-4 border-amber-500/30 bg-amber-500/8 text-left text-amber-900 dark:text-amber-100">
            <AlertTriangle className="text-amber-600 dark:text-amber-300" />
            <AlertTitle>{t("setup:SETUP_DISABLED_TITLE")}</AlertTitle>
            <AlertDescription>{t("setup:SETUP_DISABLED_DESC")}</AlertDescription>
          </Alert>
        ) : null}

        {props.setupProgress !== null ? (
          <SetupProgressStatus
            percent={props.setupProgress}
            stageLabel={props.setupProgressStageLabel}
            step={props.setupProgressStep}
          />
        ) : (
          <SetupLaunchButton
            disabled={props.submitting}
            setupEnabled={props.setupEnabled}
            submitting={props.submitting}
          />
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
                  <div className="absolute inset-0 animate-pulse bg-background opacity-50" />
                }
              >
                <ColorBendsLazy
                  className="h-full w-full"
                  colors={[props.primaryBendColor]}
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
              <MotionConfig transition={props.transition}>
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={`stage-${props.step}`}
                    initial={props.reducedMotion ? { opacity: 1 } : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={props.reducedMotion ? { opacity: 1 } : { opacity: 0, y: -8 }}
                  >
                    <h2 className="text-title font-bold text-label-primary">
                      {props.stageMeta[props.step].title}
                    </h2>
                    <p className="mt-3 text-body text-label-secondary">
                      {props.stageMeta[props.step].description}
                    </p>
                  </motion.div>
                </AnimatePresence>
              </MotionConfig>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6">
              <MotionConfig transition={props.transition}>
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={props.step}
                    style={{ willChange: "transform, opacity" }}
                    initial={
                      props.reducedMotion ? { opacity: 1 } : { opacity: 0, x: props.enterOffsetX }
                    }
                    animate={{ opacity: 1, x: 0 }}
                    exit={
                      props.reducedMotion ? { opacity: 1 } : { opacity: 0, x: props.exitOffsetX }
                    }
                  >
                    {props.currentStepContent}
                  </motion.div>
                </AnimatePresence>
              </MotionConfig>
            </div>

            <div className="border-t border-border/70 bg-background/95 px-4 py-3 sm:px-6">
              {props.step === MAX_STEP && props.access === "token" ? (
                <SetupTokenField
                  disabled={props.submitting}
                  error={props.setupTokenError}
                  onChange={props.onSetupTokenChange}
                  value={props.setupToken}
                />
              ) : null}

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <Button
                  variant="outline"
                  size="lg"
                  disabled={props.step <= 0 || props.submitting}
                  onClick={props.onPrev}
                >
                  {t("setup:SETUP_PREV")}
                </Button>

                {props.step < MAX_STEP ? (
                  <Button
                    size="lg"
                    disabled={props.setupEnabled === false || props.submitting}
                    onClick={() => void props.onNext()}
                  >
                    {t("setup:SETUP_NEXT")}
                  </Button>
                ) : (
                  <Button
                    size="lg"
                    loading={props.submitting}
                    disabled={props.setupEnabled === false}
                    onClick={() => void props.onFinish()}
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
