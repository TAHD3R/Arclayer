import type { ComponentType } from "react";
import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@arclayer/ui/button";
import { Input } from "@arclayer/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@arclayer/ui/toggle-group";
import { cn } from "@arclayer/lib/utils";

import { CONTENT_BOOTSTRAP_PRESETS } from "../definitions";
import type { ContentBootstrapPresetKey } from "../types";

type StepOnePanelProps = {
  busy: boolean;
  title: string;
  selectedPresetKey: ContentBootstrapPresetKey | null;
  canContinue: boolean;
  continuePending: boolean;
  onTitleChange: (value: string) => void;
  onPresetSelect: (value: ContentBootstrapPresetKey) => void;
  onContinue: () => void;
  onSkip: () => void;
};

function SectionHeader(props: { htmlFor?: string; title: string; description: string }) {
  const title = props.htmlFor ? (
    <label className="font-semibold text-foreground" htmlFor={props.htmlFor}>
      {props.title}
    </label>
  ) : (
    <div className="font-semibold text-foreground">{props.title}</div>
  );

  return (
    <div className="grid gap-1.5">
      {title}
      <div className="text-label-secondary">{props.description}</div>
    </div>
  );
}

function StarterPresetOption(props: {
  presetKey: ContentBootstrapPresetKey | null;
  value: ContentBootstrapPresetKey;
  name: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
}) {
  const selected = props.presetKey === props.value;
  const Icon = props.icon;

  return (
    <ToggleGroupItem
      value={props.value}
      aria-label={props.name}
      aria-pressed={selected}
      className={cn(
        "col-span-1! flex! h-auto! min-h-44! flex-col! rounded-lg! border! bg-card! p-4! text-left! shadow-sm!",
        "transition-colors! duration-200!",
        "hover:border-border/80! hover:bg-accent/50! hover:shadow-md!",
        selected && "border-primary/60! bg-primary/[0.04]! shadow-md!",
      )}
    >
      <div className="mb-4 flex w-full items-start justify-between gap-4">
        <div
          className={cn(
            "inline-flex size-10 items-center justify-center rounded-lg border border-border/70 bg-muted/50 text-label-secondary",
            selected && "border-primary/20 bg-primary/[0.08] text-primary",
          )}
        >
          <Icon className="size-5" />
        </div>
        {selected ? (
          <div className="inline-flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Check className="size-4" aria-hidden="true" />
          </div>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col wrap-break-word" style={{ overflowWrap: "anywhere" }}>
        <div className="text-headline font-semibold text-foreground">{props.name}</div>
        <div className="mt-1 text-footnote leading-6 text-label-secondary">{props.description}</div>
      </div>
    </ToggleGroupItem>
  );
}

function TitleField(props: Pick<StepOnePanelProps, "busy" | "title" | "onTitleChange">) {
  const { t } = useTranslation("content");

  return (
    <div className="grid gap-3">
      <SectionHeader
        htmlFor="content-create-title"
        title={t("CONTENT_BOOTSTRAP_FIELD_TITLE_LABEL")}
        description={t("CONTENT_BOOTSTRAP_FIELD_TITLE_DESC")}
      />
      <Input
        id="content-create-title"
        autoFocus
        value={props.title}
        disabled={props.busy}
        onChange={(event) => props.onTitleChange(event.target.value)}
        placeholder={t("CONTENT_BOOTSTRAP_FIELD_TITLE_PLACEHOLDER")}
        className="h-12"
      />
    </div>
  );
}

function StartFromField(props: Pick<StepOnePanelProps, "selectedPresetKey" | "onPresetSelect">) {
  const { t } = useTranslation("content");

  return (
    <div className="grid gap-4">
      <SectionHeader
        title={t("CONTENT_BOOTSTRAP_START_FROM_LABEL")}
        description={t("CONTENT_BOOTSTRAP_START_FROM_DESC")}
      />
      <ToggleGroup
        type="single"
        value={props.selectedPresetKey ?? undefined}
        onValueChange={(value) => {
          if (!value) return;
          props.onPresetSelect(value as ContentBootstrapPresetKey);
        }}
        className="grid w-full grid-cols-1 gap-3 rounded-none bg-transparent shadow-none md:grid-cols-2"
      >
        {CONTENT_BOOTSTRAP_PRESETS.map((preset) => (
          <StarterPresetOption
            key={preset.key}
            presetKey={props.selectedPresetKey}
            value={preset.key}
            name={t(preset.nameKey)}
            description={t(preset.descriptionKey)}
            icon={preset.icon}
          />
        ))}
      </ToggleGroup>
    </div>
  );
}

function FormActions(
  props: Pick<
    StepOnePanelProps,
    "busy" | "canContinue" | "continuePending" | "onContinue" | "onSkip"
  >,
) {
  const { t } = useTranslation("content");

  return (
    <div className="flex items-center justify-between gap-4 border-t border-border/70 pt-6">
      <Button type="button" variant="ghost" disabled={props.busy} onClick={props.onSkip}>
        {t("CONTENT_BOOTSTRAP_ACTION_SKIP")}
      </Button>
      <Button
        type="button"
        loading={props.continuePending}
        disabled={!props.canContinue || props.busy}
        onClick={props.onContinue}
      >
        {t("CONTENT_BOOTSTRAP_ACTION_CONTINUE")}
      </Button>
    </div>
  );
}

export function ContentBootstrapStepOnePanel(props: StepOnePanelProps) {
  return (
    <div className="flex w-full flex-1 flex-col gap-10 pb-8">
      <TitleField busy={props.busy} title={props.title} onTitleChange={props.onTitleChange} />
      <StartFromField
        selectedPresetKey={props.selectedPresetKey}
        onPresetSelect={props.onPresetSelect}
      />
      <FormActions
        busy={props.busy}
        canContinue={props.canContinue}
        continuePending={props.continuePending}
        onContinue={props.onContinue}
        onSkip={props.onSkip}
      />
    </div>
  );
}
