import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { Accordion } from "@arclayer/ui/accordion";
import { Input } from "@arclayer/ui/input";
import { SettingAccordionItem } from "@arclayer/ui/setting-accordion-item";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";
import { Textarea } from "@arclayer/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@arclayer/ui/toggle-group";
import { cn } from "@arclayer/lib/utils";

import type { AdminContentItemVisibility, AdminContentModel } from "@/types/api";

import {
  getOfficialContentTypePresentation,
  resolveContentBootstrapVariant,
  sortContentModelsByPresentation,
} from "../../content-type-presentation";

type StepOnePanelProps = {
  availableModels: AdminContentModel[];
  busy: boolean;
  modelsError: Error | null;
  modelsLoading: boolean;
  selectedModel: AdminContentModel | null;
  selectedModelKey: string | null;
  summary: string;
  slug: string;
  title: string;
  visibility: AdminContentItemVisibility;
  seo: {
    metaTitle: string;
    metaDescription: string;
  };
  onModelSelect: (value: string | null) => void;
  onSummaryChange: (value: string) => void;
  onSlugChange: (value: string) => void;
  onTitleChange: (value: string) => void;
  onVisibilityChange: (value: AdminContentItemVisibility) => void;
  onSeoMetaTitleChange: (value: string) => void;
  onSeoMetaDescriptionChange: (value: string) => void;
};

function FieldBlock(props: { label: string; help: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <label className="font-semibold text-label-primary">{props.label}</label>
      <div className="text-label-secondary">{props.help}</div>
      {props.children}
    </div>
  );
}

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

function SummaryField(props: Pick<StepOnePanelProps, "busy" | "summary" | "onSummaryChange">) {
  const { t } = useTranslation("content");

  return (
    <Accordion type="single" collapsible defaultValue="content-summary" className="px-0">
      <SettingAccordionItem
        value="content-summary"
        title={<span className="text-body">{t("CONTENT_BOOTSTRAP_FIELD_SUMMARY_LABEL")}</span>}
        description={t("CONTENT_BOOTSTRAP_FIELD_SUMMARY_DESC")}
        keepRendered
        contentClassName="max-w-none"
      >
        <Textarea
          id="content-create-summary"
          aria-label={t("CONTENT_BOOTSTRAP_FIELD_SUMMARY_LABEL")}
          value={props.summary}
          disabled={props.busy}
          onChange={(event) => props.onSummaryChange(event.target.value)}
          placeholder={t("CONTENT_BOOTSTRAP_FIELD_SUMMARY_PLACEHOLDER")}
          className="min-h-28"
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

function VisibilityField(props: {
  busy: boolean;
  value: AdminContentItemVisibility;
  helpKey: string;
  onChange: (value: AdminContentItemVisibility) => void;
}) {
  const { t } = useTranslation("content");

  return (
    <FieldBlock label={t("CONTENT_BOOTSTRAP_FIELD_VISIBILITY_LABEL")} help={t(props.helpKey)}>
      <Select
        value={props.value}
        disabled={props.busy}
        onValueChange={(value) => props.onChange(value === "private" ? "private" : "public")}
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper" align="start">
          <SelectItem value="public">{t("CONTENT_LIBRARY_VISIBILITY_PUBLIC")}</SelectItem>
          <SelectItem value="private">{t("CONTENT_LIBRARY_VISIBILITY_PRIVATE")}</SelectItem>
        </SelectContent>
      </Select>
    </FieldBlock>
  );
}

function TypeSpecificSettingsField(
  props: Pick<
    StepOnePanelProps,
    | "busy"
    | "selectedModel"
    | "slug"
    | "visibility"
    | "seo"
    | "onSlugChange"
    | "onVisibilityChange"
    | "onSeoMetaTitleChange"
    | "onSeoMetaDescriptionChange"
  >,
) {
  const { t } = useTranslation("content");
  const variant = resolveContentBootstrapVariant(props.selectedModel);

  const titleKey =
    variant === "article"
      ? "CONTENT_BOOTSTRAP_FIELD_ARTICLE_SETTINGS_LABEL"
      : variant === "page"
        ? "CONTENT_BOOTSTRAP_FIELD_PAGE_SETTINGS_LABEL"
        : variant === "structured"
          ? "CONTENT_BOOTSTRAP_FIELD_STRUCTURED_SETTINGS_LABEL"
          : "CONTENT_BOOTSTRAP_FIELD_TYPE_SETTINGS_LABEL";
  const descriptionKey =
    variant === "article"
      ? "CONTENT_BOOTSTRAP_FIELD_ARTICLE_SETTINGS_DESC"
      : variant === "page"
        ? "CONTENT_BOOTSTRAP_FIELD_PAGE_SETTINGS_DESC"
        : variant === "structured"
          ? "CONTENT_BOOTSTRAP_FIELD_STRUCTURED_SETTINGS_DESC"
          : "CONTENT_BOOTSTRAP_FIELD_TYPE_SETTINGS_EMPTY";

  return (
    <Accordion type="single" collapsible defaultValue="content-type-settings" className="px-0">
      <SettingAccordionItem
        value="content-type-settings"
        title={<span className="text-body">{t(titleKey)}</span>}
        description={t(descriptionKey)}
        keepRendered
        contentClassName="max-w-none"
      >
        {!variant ? (
          <div className="rounded-lg border border-border/60 bg-muted/30 px-4 py-3 text-footnote text-label-secondary">
            {t("CONTENT_BOOTSTRAP_FIELD_TYPE_SETTINGS_EMPTY")}
          </div>
        ) : (
          <div className="grid gap-4">
            <FieldBlock
              label={t("CONTENT_LIBRARY_PREVIEW_FIELD_PERMALINK")}
              help={t(
                variant === "structured"
                  ? "CONTENT_BOOTSTRAP_FIELD_STRUCTURED_PERMALINK_HELP"
                  : "CONTENT_BOOTSTRAP_FIELD_PERMALINK_HELP",
              )}
            >
              <Input
                id="content-create-slug"
                aria-label={t("CONTENT_LIBRARY_PREVIEW_FIELD_PERMALINK")}
                value={props.slug}
                disabled={props.busy}
                onChange={(event) => props.onSlugChange(event.target.value)}
                placeholder={t("CONTENT_BOOTSTRAP_FIELD_PERMALINK_PLACEHOLDER")}
                className="h-12"
              />
            </FieldBlock>

            {variant === "page" ? (
              <>
                <FieldBlock
                  label={t("CONTENT_BOOTSTRAP_FIELD_SEO_TITLE_LABEL")}
                  help={t("CONTENT_BOOTSTRAP_FIELD_SEO_TITLE_HELP")}
                >
                  <Input
                    id="content-create-seo-title"
                    aria-label={t("CONTENT_BOOTSTRAP_FIELD_SEO_TITLE_LABEL")}
                    value={props.seo.metaTitle}
                    disabled={props.busy}
                    onChange={(event) => props.onSeoMetaTitleChange(event.target.value)}
                    placeholder={t("CONTENT_BOOTSTRAP_FIELD_SEO_TITLE_PLACEHOLDER")}
                    className="h-12"
                  />
                </FieldBlock>
                <FieldBlock
                  label={t("CONTENT_BOOTSTRAP_FIELD_SEO_DESCRIPTION_LABEL")}
                  help={t("CONTENT_BOOTSTRAP_FIELD_SEO_DESCRIPTION_HELP")}
                >
                  <Textarea
                    id="content-create-seo-description"
                    aria-label={t("CONTENT_BOOTSTRAP_FIELD_SEO_DESCRIPTION_LABEL")}
                    value={props.seo.metaDescription}
                    disabled={props.busy}
                    onChange={(event) => props.onSeoMetaDescriptionChange(event.target.value)}
                    placeholder={t("CONTENT_BOOTSTRAP_FIELD_SEO_DESCRIPTION_PLACEHOLDER")}
                    className="min-h-28"
                  />
                </FieldBlock>
              </>
            ) : null}

            {variant === "article" || variant === "structured" ? (
              <VisibilityField
                busy={props.busy}
                value={props.visibility}
                helpKey={
                  variant === "article"
                    ? "CONTENT_BOOTSTRAP_FIELD_ARTICLE_VISIBILITY_HELP"
                    : "CONTENT_BOOTSTRAP_FIELD_STRUCTURED_VISIBILITY_HELP"
                }
                onChange={props.onVisibilityChange}
              />
            ) : null}
          </div>
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
      <SummaryField
        busy={props.busy}
        summary={props.summary}
        onSummaryChange={props.onSummaryChange}
      />
      <TypeSpecificSettingsField
        busy={props.busy}
        selectedModel={props.selectedModel}
        slug={props.slug}
        visibility={props.visibility}
        seo={props.seo}
        onSlugChange={props.onSlugChange}
        onVisibilityChange={props.onVisibilityChange}
        onSeoMetaTitleChange={props.onSeoMetaTitleChange}
        onSeoMetaDescriptionChange={props.onSeoMetaDescriptionChange}
      />
    </div>
  );
}
