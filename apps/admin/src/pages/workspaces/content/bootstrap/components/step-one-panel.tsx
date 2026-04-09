import { useTranslation } from "react-i18next";

import { Accordion } from "@arclayer/ui/accordion";
import { Input } from "@arclayer/ui/input";
import { SettingAccordionItem } from "@arclayer/ui/setting-accordion-item";
import { ToggleGroup, ToggleGroupItem } from "@arclayer/ui/toggle-group";
import { cn } from "@arclayer/lib/utils";

import type { AdminContentModel } from "@/types/api";

import {
  getOfficialContentTypePresentation,
  sortContentModelsByPresentation,
} from "../../content-type-presentation";

type StepOnePanelProps = {
  availableModels: AdminContentModel[];
  busy: boolean;
  modelsError: Error | null;
  modelsLoading: boolean;
  selectedModelKey: string | null;
  title: string;
  onModelSelect: (value: string | null) => void;
  onTitleChange: (value: string) => void;
};

function TitleField(props: Pick<StepOnePanelProps, "busy" | "title" | "onTitleChange">) {
  const { t } = useTranslation("content");

  return (
    <Accordion type="single" collapsible defaultValue="content-title" className="px-0">
      <SettingAccordionItem
        value="content-title"
        title={<span className="text-body">{t("CONTENT_BOOTSTRAP_FIELD_TITLE_LABEL")}</span>}
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

function ModelOption(props: { model: AdminContentModel; selectedModelKey: string | null }) {
  const { t } = useTranslation("content");
  const selected = props.selectedModelKey === props.model.key;
  const presentation = getOfficialContentTypePresentation(props.model.key);
  const Icon = presentation?.icon;
  const name = presentation ? t(presentation.nameKey) : props.model.name;
  const description = presentation
    ? t(presentation.descriptionKey)
    : props.model.description?.trim() || null;

  return (
    <ToggleGroupItem
      value={props.model.key}
      aria-label={name}
      aria-pressed={selected}
      className={cn(
        "col-span-1! flex! h-auto! min-h-28! flex-col! rounded-lg! border! bg-card! p-4! text-left! !",
        "transition-colors! duration-200!",
        "hover:border-border/80! hover:bg-accent/50! hover:!",
        selected && "border-border/80! bg-accent/60! !",
      )}
    >
      <div className="flex w-full items-start gap-4">
        {Icon ? (
          <Icon
            className={cn(
              "mt-0.5 size-5 shrink-0 text-label-secondary",
              selected && "text-label-primary",
            )}
          />
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="text-headline font-semibold text-label-primary">{name}</div>
          {!presentation && props.model.key.trim() ? (
            <div className="text-footnote text-label-secondary">{props.model.key}</div>
          ) : null}
          {description ? (
            <div className="break-words whitespace-normal text-footnote text-label-secondary/90">
              {description}
            </div>
          ) : null}
          {!presentation && props.model.category === "custom" ? (
            <div className="text-footnote text-label-secondary">
              {t("CONTENT_BOOTSTRAP_FIELD_MODEL_CUSTOM_HINT")}
            </div>
          ) : null}
        </div>
      </div>
    </ToggleGroupItem>
  );
}

function ModelField(
  props: Pick<
    StepOnePanelProps,
    | "availableModels"
    | "busy"
    | "modelsError"
    | "modelsLoading"
    | "selectedModelKey"
    | "onModelSelect"
  >,
) {
  const { t } = useTranslation("content");
  const sortedModels = sortContentModelsByPresentation(props.availableModels);

  return (
    <Accordion type="single" collapsible defaultValue="content-model" className="px-0">
      <SettingAccordionItem
        value="content-model"
        title={<span className="text-body">{t("CONTENT_BOOTSTRAP_FIELD_MODEL_LABEL")}</span>}
        description={t("CONTENT_BOOTSTRAP_FIELD_MODEL_DESC")}
        keepRendered
        contentClassName="max-w-none"
      >
        {props.modelsLoading ? (
          <div className="rounded-lg border border-border/60 bg-muted/30 px-4 py-3 text-footnote text-label-secondary">
            {t("CONTENT_BOOTSTRAP_FIELD_MODEL_LOADING")}
          </div>
        ) : props.modelsError ? (
          <div className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-footnote text-danger">
            {t("CONTENT_BOOTSTRAP_FIELD_MODEL_ERROR")}
          </div>
        ) : props.availableModels.length === 0 ? (
          <div className="rounded-lg border border-border/60 bg-muted/30 px-4 py-3 text-footnote text-label-secondary">
            {t("CONTENT_BOOTSTRAP_FIELD_MODEL_EMPTY")}
          </div>
        ) : (
          <ToggleGroup
            type="single"
            value={props.selectedModelKey ?? undefined}
            disabled={props.busy}
            onValueChange={(value) => props.onModelSelect(value || null)}
            className="grid w-full grid-cols-1 gap-3 rounded-none bg-transparent md:grid-cols-2"
          >
            {sortedModels.map((model) => (
              <ModelOption key={model.id} model={model} selectedModelKey={props.selectedModelKey} />
            ))}
          </ToggleGroup>
        )}
      </SettingAccordionItem>
    </Accordion>
  );
}

export function ContentBootstrapStepOnePanel(props: StepOnePanelProps) {
  return (
    <div className="flex w-full flex-1 flex-col gap-4 pb-8">
      <ModelField
        availableModels={props.availableModels}
        busy={props.busy}
        modelsError={props.modelsError}
        modelsLoading={props.modelsLoading}
        selectedModelKey={props.selectedModelKey}
        onModelSelect={props.onModelSelect}
      />
      <TitleField busy={props.busy} title={props.title} onTitleChange={props.onTitleChange} />
    </div>
  );
}
