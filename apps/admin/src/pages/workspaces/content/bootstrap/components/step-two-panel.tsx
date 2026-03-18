import { useTranslation } from "react-i18next";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@arclayer/ui/card";

import { CONTENT_BOOTSTRAP_CAPABILITY_PACKS, CONTENT_BOOTSTRAP_PRESETS } from "../definitions";
import type { ContentBootstrapShapeSelection } from "../types";
import { ContentBootstrapCapabilityPackCard } from "./capability-pack-card";
import { ContentBootstrapPresetCard } from "./preset-card";

export function ContentBootstrapStepTwoPanel(props: {
  selection: ContentBootstrapShapeSelection;
  onPresetSelect: (presetKey: (typeof CONTENT_BOOTSTRAP_PRESETS)[number]["key"]) => void;
  onCapabilityPackToggle: (
    packId: (typeof CONTENT_BOOTSTRAP_CAPABILITY_PACKS)[number]["id"],
  ) => void;
}) {
  const { t } = useTranslation("content");

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(20rem,0.9fr)]">
      <Card className="rounded-[28px] border-border/70 bg-white/88 shadow-[0_26px_80px_-54px_rgba(15,23,42,0.38)] backdrop-blur">
        <CardHeader className="space-y-3 pb-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-label-secondary">
            {t("CONTENT_BOOTSTRAP_STEP_TWO_LABEL")}
          </div>
          <CardTitle className="text-[1.9rem] tracking-[-0.03em] text-foreground">
            {t("CONTENT_BOOTSTRAP_STEP_TWO_TITLE")}
          </CardTitle>
          <CardDescription className="max-w-3xl text-base leading-7 text-label-secondary">
            {t("CONTENT_BOOTSTRAP_STEP_TWO_DESC")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 pt-0">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-title3 text-foreground">
                  {t("CONTENT_BOOTSTRAP_PRESETS_TITLE")}
                </div>
                <div className="text-sm text-label-secondary">
                  {t("CONTENT_BOOTSTRAP_PRESETS_DESC")}
                </div>
              </div>
              {props.selection.presetKey ? (
                <span className="rounded-full border border-border/70 bg-background px-2.5 py-1 text-caption text-label-secondary">
                  {t(`CONTENT_BOOTSTRAP_PRESET_STATE_${props.selection.presetState.toUpperCase()}`)}
                </span>
              ) : null}
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {CONTENT_BOOTSTRAP_PRESETS.map((preset) => (
                <ContentBootstrapPresetCard
                  key={preset.key}
                  preset={preset}
                  selected={props.selection.presetKey === preset.key}
                  customized={
                    props.selection.presetKey === preset.key &&
                    props.selection.presetState === "customized"
                  }
                  onSelect={() => props.onPresetSelect(preset.key)}
                />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-[28px] border-border/70 bg-white/84 shadow-[0_22px_72px_-54px_rgba(15,23,42,0.34)] backdrop-blur">
        <CardHeader>
          <CardTitle className="text-title3 text-foreground">
            {t("CONTENT_BOOTSTRAP_CAPABILITY_PACKS_TITLE")}
          </CardTitle>
          <CardDescription className="text-sm leading-6 text-label-secondary">
            {t("CONTENT_BOOTSTRAP_CAPABILITY_PACKS_DESC")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {CONTENT_BOOTSTRAP_CAPABILITY_PACKS.map((pack) => (
            <ContentBootstrapCapabilityPackCard
              key={pack.id}
              pack={pack}
              checked={props.selection.capabilityPackIds.includes(pack.id)}
              onCheckedChange={() => props.onCapabilityPackToggle(pack.id)}
            />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
