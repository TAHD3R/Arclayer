import { CircleDashed } from "lucide-react";
import { useTranslation } from "react-i18next";

function buildSteps(
  t: (key: string, params?: Record<string, unknown>) => string,
  params: {
    draftCreated: boolean;
    presetState: string;
  },
) {
  return [
    {
      key: "draft",
      title: t("CONTENT_BOOTSTRAP_STEP_ONE_LABEL"),
      active: !params.draftCreated,
      done: params.draftCreated,
      description: t("CONTENT_BOOTSTRAP_STEP_ONE_DESC"),
    },
    {
      key: "shape",
      title: t("CONTENT_BOOTSTRAP_STEP_TWO_LABEL"),
      active: params.draftCreated,
      done: false,
      description: t(`CONTENT_BOOTSTRAP_PRESET_STATE_${params.presetState.toUpperCase()}`),
    },
  ];
}

export function ContentBootstrapProgressRail(props: {
  draftCreated: boolean;
  presetState: string;
}) {
  const { t } = useTranslation("content");
  const steps = buildSteps(t, props);

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {steps.map((step, index) => (
        <div
          key={step.key}
          className="rounded-[24px] border border-border/70 bg-white/82 p-4 shadow-[0_18px_60px_-44px_rgba(15,23,42,0.28)] backdrop-blur"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-label-secondary">
                {t("CONTENT_BOOTSTRAP_PROGRESS_STEP", { step: index + 1 })}
              </div>
              <div className="mt-1 text-title3 text-foreground">{step.title}</div>
            </div>
            <span
              className={
                step.done
                  ? "text-primary"
                  : step.active
                    ? "text-foreground"
                    : "text-label-secondary"
              }
            >
              <CircleDashed className="size-5" aria-hidden="true" />
            </span>
          </div>
          <p className="mt-3 text-sm leading-6 text-label-secondary">{step.description}</p>
        </div>
      ))}
    </div>
  );
}
