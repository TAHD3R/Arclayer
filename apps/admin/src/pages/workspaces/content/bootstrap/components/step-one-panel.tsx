import type { ComponentType } from "react";
import { useTranslation } from "react-i18next";

import { Accordion } from "@arclayer/ui/accordion";
import { Input } from "@arclayer/ui/input";
import { SettingAccordionItem } from "@arclayer/ui/setting-accordion-item";
import { ToggleGroup, ToggleGroupItem } from "@arclayer/ui/toggle-group";
import { cn } from "@arclayer/lib/utils";

import { CONTENT_BOOTSTRAP_PRESETS } from "../definitions";
import type { ContentBootstrapPresetKey } from "../types";

type StepOnePanelProps = {
  busy: boolean;
  title: string;
  selectedPresetKey: ContentBootstrapPresetKey | null;
  onTitleChange: (value: string) => void;
  onPresetSelect: (value: ContentBootstrapPresetKey | null) => void;
};

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
    <Accordion type="single" collapsible defaultValue="content-title" className="px-0">
      <SettingAccordionItem
        value="content-title"
        title={<span className="text-base">{t("CONTENT_BOOTSTRAP_FIELD_TITLE_LABEL")}</span>}
        description={t("CONTENT_BOOTSTRAP_FIELD_TITLE_DESC")}
        keepRendered
        contentClassName="max-w-none"
      >
        <Input
          id="content-create-title"
          aria-label={t("CONTENT_BOOTSTRAP_FIELD_TITLE_LABEL")}
          autoFocus
          value={props.title}
          disabled={props.busy}
          onChange={(event) => props.onTitleChange(event.target.value)}
          placeholder={t("CONTENT_BOOTSTRAP_FIELD_TITLE_PLACEHOLDER")}
          className="h-12"
        />
      </SettingAccordionItem>
    </Accordion>
  );
}

function StartFromField(props: Pick<StepOnePanelProps, "selectedPresetKey" | "onPresetSelect">) {
  const { t } = useTranslation("content");
  const selectedPreset = props.selectedPresetKey
    ? CONTENT_BOOTSTRAP_PRESETS.find((preset) => preset.key === props.selectedPresetKey)
    : null;
  const selectedPresetName = selectedPreset ? t(selectedPreset.nameKey) : null;
  const startFromDescription = selectedPresetName ? (
    <>
      {t("CONTENT_BOOTSTRAP_START_FROM_DESC")}
      {t("CONTENT_BOOTSTRAP_START_CURRENT_TEMPLATE_PREFIX")}
      <span className="text-label-primary font-semibold">{selectedPresetName}</span>
    </>
  ) : (
    t("CONTENT_BOOTSTRAP_START_FROM_DESC")
  );

  return (
    <Accordion type="single" collapsible className="px-0">
      <SettingAccordionItem
        value="start-from-template"
        title={<span className="text-base">{t("CONTENT_BOOTSTRAP_START_WITH_LABEL")}</span>}
        description={startFromDescription}
        keepRendered
        contentClassName="max-w-none"
      >
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
      </SettingAccordionItem>
    </Accordion>
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
    </div>
  );
}
