import { Check, Wand2 } from "lucide-react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";

import { Button } from "@arclayer/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@arclayer/ui/card";
import { cn } from "@arclayer/lib/utils";

import { CONTENT_BOOTSTRAP_CAPABILITY_PACK_MAP } from "../definitions";
import type { ContentBootstrapPresetDefinition } from "../types";

function PresetStatePill(props: { customized: boolean }) {
  const { t } = useTranslation("content");
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]",
        props.customized
          ? "bg-amber-500/12 text-amber-700 dark:text-amber-300"
          : "bg-primary/12 text-primary",
      )}
    >
      {props.customized
        ? t("CONTENT_BOOTSTRAP_PRESET_STATE_CUSTOMIZED")
        : t("CONTENT_BOOTSTRAP_PRESET_STATE_SELECTED")}
    </span>
  );
}

export function ContentBootstrapPresetCard(props: {
  preset: ContentBootstrapPresetDefinition;
  selected: boolean;
  customized: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation("content");
  const Icon = props.preset.icon;

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={props.onSelect}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        props.onSelect();
      }}
      className={clsx(
        "group h-full cursor-pointer border-border/70 bg-white/88 shadow-[0_18px_60px_-42px_rgba(15,23,42,0.28)] transition-all duration-200 hover:-translate-y-0.5 hover:border-foreground/18 hover:shadow-[0_28px_72px_-40px_rgba(15,23,42,0.34)]",
        props.selected &&
          "border-primary/55 bg-primary/[0.08] shadow-[0_24px_72px_-38px_rgba(40,84,185,0.42)]",
      )}
      aria-pressed={props.selected}
    >
      <CardHeader className="gap-3 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="inline-flex size-11 items-center justify-center rounded-2xl border border-border/60 bg-background/86 text-foreground shadow-sm">
            <Icon className="size-5" aria-hidden="true" />
          </div>
          {props.selected ? <PresetStatePill customized={props.customized} /> : null}
        </div>
        <div className="space-y-2">
          <CardTitle className="text-title3 text-foreground">{t(props.preset.nameKey)}</CardTitle>
          <CardDescription className="text-callout text-label-secondary">
            {t(props.preset.descriptionKey)}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        <div className="space-y-2 rounded-2xl border border-dashed border-border/70 bg-background/70 p-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-label-secondary">
            {t("CONTENT_BOOTSTRAP_PRESET_USE_CASE_LABEL")}
          </div>
          <div className="text-sm text-foreground/90">{t(props.preset.useCaseKey)}</div>
        </div>

        <div className="space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-label-secondary">
            {t("CONTENT_BOOTSTRAP_PRESET_PACKS_LABEL")}
          </div>
          <div className="flex flex-wrap gap-2">
            {props.preset.packIds.map((packId) => {
              const pack = CONTENT_BOOTSTRAP_CAPABILITY_PACK_MAP.get(packId);
              return (
                <span
                  key={packId}
                  className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-background px-2.5 py-1 text-caption text-label-secondary"
                >
                  {pack ? <pack.icon className="size-3.5" aria-hidden="true" /> : null}
                  {pack ? t(pack.nameKey) : packId}
                </span>
              );
            })}
            {props.preset.packIds.length === 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-background px-2.5 py-1 text-caption text-label-secondary">
                <Wand2 className="size-3.5" aria-hidden="true" />
                {t("CONTENT_BOOTSTRAP_PRESET_PACKS_EMPTY")}
              </span>
            ) : null}
          </div>
        </div>

        <Button
          type="button"
          variant={props.selected ? "secondary" : "ghost"}
          className="w-full justify-center"
        >
          {props.selected ? (
            <>
              <Check className="size-4" aria-hidden="true" />
              {props.customized
                ? t("CONTENT_BOOTSTRAP_PRESET_ACTION_REAPPLY")
                : t("CONTENT_BOOTSTRAP_PRESET_ACTION_SELECTED")}
            </>
          ) : (
            t("CONTENT_BOOTSTRAP_PRESET_ACTION_SELECT")
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
