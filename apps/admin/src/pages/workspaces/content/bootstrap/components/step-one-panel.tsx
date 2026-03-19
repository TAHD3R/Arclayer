import type { ComponentType } from "react";
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
  onPresetSelect: (value: ContentBootstrapPresetKey | null) => void;
  onContinue: () => void;
};

function ContinueSummary(props: { selectedPresetKey: ContentBootstrapPresetKey | null }) {
  const { t } = useTranslation("content");
  const summaryKey = props.selectedPresetKey
    ? "CONTENT_BOOTSTRAP_CONTINUE_WITH_TEMPLATE"
    : "CONTENT_BOOTSTRAP_CONTINUE_WITHOUT_TEMPLATE";

  return <div className="text-footnote text-label-secondary">{t(summaryKey)}</div>;
}

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
        "col-span-1! flex! h-auto! min-h-28! flex-col! rounded-lg! border! bg-card! p-4! text-left! shadow-sm!",
        "transition-colors! duration-200!",
        "hover:border-border/80! hover:bg-accent/50! hover:shadow-md!",
        selected && "border-border/80! bg-accent/60! shadow-md!",
      )}
    >
      <div className="flex w-full items-start gap-4">
        <Icon
          className={cn(
            "mt-0.5 size-5 shrink-0 text-label-secondary",
            selected && "text-foreground",
          )}
        />
        <div
          className="flex min-w-0 flex-1 flex-col wrap-break-word"
          style={{ overflowWrap: "anywhere" }}
        >
          <div className="text-headline font-semibold text-foreground">{props.name}</div>
          <div className="mt-1 break-words whitespace-normal text-footnote leading-6 text-label-secondary">
            {props.description}
          </div>
        </div>
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
        title={t("CONTENT_BOOTSTRAP_START_WITH_OPTIONAL_LABEL")}
        description={t("CONTENT_BOOTSTRAP_START_FROM_DESC")}
      />
      <ToggleGroup
        type="single"
        value={props.selectedPresetKey ?? undefined}
        onValueChange={(value) => {
          props.onPresetSelect(value ? (value as ContentBootstrapPresetKey) : null);
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
    "busy" | "canContinue" | "continuePending" | "onContinue" | "selectedPresetKey"
  >,
) {
  const { t } = useTranslation("content");

  return (
    <div className="flex items-center justify-between gap-4">
      <ContinueSummary selectedPresetKey={props.selectedPresetKey} />
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
    <div className="flex w-full flex-1 flex-col gap-4 pb-8">
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
        selectedPresetKey={props.selectedPresetKey}
      />
    </div>
  );
}
