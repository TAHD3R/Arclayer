import * as React from "react";
import { useTranslation } from "react-i18next";
import { CircleHelp, Sparkles } from "lucide-react";

import {
  executeAIWorkspaceAction,
  type AIWorkspaceActionContentModel,
  type AIWorkspaceActionResponse,
} from "@/api/ai";

import { Button } from "@arclayer/ui/button";
import { ChromeTabs, ChromeTabsList, ChromeTabsTrigger } from "@arclayer/ui/chrome-tabs";
import { FieldLabel } from "@arclayer/ui/field";
import { Input } from "@arclayer/ui/input";
import { RadioGroup, RadioGroupItem } from "@arclayer/ui/radio-group";
import { SettingDialog } from "@arclayer/ui/setting-dialog";
import { SettingDialogField, SettingDialogFields } from "@arclayer/ui/setting-dialog-field";
import { Textarea } from "@arclayer/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@arclayer/ui/tooltip";

import type { CreateContentTypeFormValues, CreateContentTypeSubmitValues } from "../types";
import {
  buildCreateContentTypePayload,
  CONTENT_MODEL_DESCRIPTION_MAX_LENGTH,
  CONTENT_MODEL_IDENTIFIER_MAX_LENGTH,
  CONTENT_MODEL_NAME_MAX_LENGTH,
  type ContentModelStarterTemplateKey,
  createGeneratedIdentifier,
  createManualIdentifier,
  syncGeneratedIdentifiersWithName,
  validateContentTypeIdentifier,
} from "../utils";

const DEFAULT_VALUES: CreateContentTypeFormValues = {
  name: "",
  singularKey: createGeneratedIdentifier(""),
  pluralKey: createGeneratedIdentifier(""),
  description: "",
  modelKind: "collection_type",
};

type CreateContentTypeDialogProps = {
  open: boolean;
  pending?: boolean;
  projectId: string;
  onOpenChange: (open: boolean) => void;
  onAiCreated: (model: AIWorkspaceActionContentModel) => Promise<void> | void;
  onSubmit: (values: CreateContentTypeSubmitValues) => Promise<void> | void;
};

type FormErrors = Partial<Record<"name" | "singularKey" | "pluralKey", string>>;
type CreateDialogView = "start" | "details";
type CreateDialogMode = "manual" | "ai";

type StarterTemplateDefinition = {
  key: ContentModelStarterTemplateKey;
  labelKey: string;
  descriptionKey: string;
  modelKind: CreateContentTypeFormValues["modelKind"];
  values: Pick<CreateContentTypeFormValues, "name" | "description"> & {
    singularKey: string;
    pluralKey: string;
  };
};

type AiPromptSuggestion = {
  key: string;
  labelKey: string;
  promptKey: string;
};

const STARTER_TEMPLATES: StarterTemplateDefinition[] = [
  {
    key: "blank",
    labelKey: "CONTENT_MODELS_CREATE_TEMPLATE_BLANK_LABEL",
    descriptionKey: "CONTENT_MODELS_CREATE_TEMPLATE_BLANK_DESC",
    modelKind: "collection_type",
    values: { name: "", singularKey: "", pluralKey: "", description: "" },
  },
  {
    key: "page",
    labelKey: "CONTENT_MODELS_CREATE_TEMPLATE_PAGE_LABEL",
    descriptionKey: "CONTENT_MODELS_CREATE_TEMPLATE_PAGE_DESC",
    modelKind: "collection_type",
    values: {
      name: "Page",
      singularKey: "page",
      pluralKey: "pages",
      description: "Route-owned pages for preview, SEO, visual editing, and releases.",
    },
  },
  {
    key: "reusableBlock",
    labelKey: "CONTENT_MODELS_CREATE_TEMPLATE_REUSABLE_BLOCK_LABEL",
    descriptionKey: "CONTENT_MODELS_CREATE_TEMPLATE_REUSABLE_BLOCK_DESC",
    modelKind: "collection_type",
    values: {
      name: "Reusable Block",
      singularKey: "reusableBlock",
      pluralKey: "reusableBlocks",
      description: "Reusable sections that can be referenced by pages and AI composition.",
    },
  },
  {
    key: "landingSection",
    labelKey: "CONTENT_MODELS_CREATE_TEMPLATE_LANDING_SECTION_LABEL",
    descriptionKey: "CONTENT_MODELS_CREATE_TEMPLATE_LANDING_SECTION_DESC",
    modelKind: "component",
    values: {
      name: "Landing Section",
      singularKey: "landingSection",
      pluralKey: "landingSections",
      description: "A visual section contract for hero, proof, feature, CTA, and FAQ blocks.",
    },
  },
  {
    key: "contentCollection",
    labelKey: "CONTENT_MODELS_CREATE_TEMPLATE_CONTENT_COLLECTION_LABEL",
    descriptionKey: "CONTENT_MODELS_CREATE_TEMPLATE_CONTENT_COLLECTION_DESC",
    modelKind: "collection_type",
    values: {
      name: "Site Records",
      singularKey: "siteRecord",
      pluralKey: "siteRecords",
      description: "Repeatable website records for case studies, resources, team, or listings.",
    },
  },
  {
    key: "taxonomy",
    labelKey: "CONTENT_MODELS_CREATE_TEMPLATE_TAXONOMY_ITEM_LABEL",
    descriptionKey: "CONTENT_MODELS_CREATE_TEMPLATE_TAXONOMY_ITEM_DESC",
    modelKind: "collection_type",
    values: {
      name: "Category",
      singularKey: "category",
      pluralKey: "categories",
      description: "Taxonomy for grouping pages, reusable blocks, and structured site records.",
    },
  },
];

const AI_PROMPT_SUGGESTIONS: AiPromptSuggestion[] = [
  {
    key: "page-model",
    labelKey: "CONTENT_MODELS_CREATE_AI_PROMPT_PAGE_MODEL_LABEL",
    promptKey: "CONTENT_MODELS_CREATE_AI_PROMPT_PAGE_MODEL_TEXT",
  },
  {
    key: "reusable-block",
    labelKey: "CONTENT_MODELS_CREATE_AI_PROMPT_REUSABLE_BLOCK_LABEL",
    promptKey: "CONTENT_MODELS_CREATE_AI_PROMPT_REUSABLE_BLOCK_TEXT",
  },
  {
    key: "customer-stories",
    labelKey: "CONTENT_MODELS_CREATE_AI_PROMPT_CUSTOMER_STORIES_LABEL",
    promptKey: "CONTENT_MODELS_CREATE_AI_PROMPT_CUSTOMER_STORIES_TEXT",
  },
  {
    key: "landing-sections",
    labelKey: "CONTENT_MODELS_CREATE_AI_PROMPT_LANDING_SECTIONS_LABEL",
    promptKey: "CONTENT_MODELS_CREATE_AI_PROMPT_LANDING_SECTIONS_TEXT",
  },
] as const;

const MODEL_KIND_OPTIONS = ["collection_type", "single_type", "component"] as const;

function CharacterCount(props: { value: string; max: number }) {
  return (
    <div className="mt-1 text-right text-caption text-label-secondary">
      {props.value.length}/{props.max}
    </div>
  );
}

function FieldTitleWithHelp({ title, help }: { title: React.ReactNode; help: string }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span>{title}</span>
      <Tooltip>
        <TooltipTrigger asChild focusTrigger={false}>
          <button
            type="button"
            className="inline-flex size-5 items-center justify-center rounded-full text-label-secondary transition-colors hover:text-label-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
            aria-label={help}
          >
            <CircleHelp className="size-4" aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-64 text-left">{help}</TooltipContent>
      </Tooltip>
    </span>
  );
}

function ModelKindOption(props: {
  modelKind: CreateContentTypeFormValues["modelKind"];
  value: CreateContentTypeFormValues["modelKind"];
  disabled?: boolean;
  title: string;
  description: string;
}) {
  const inputId = React.useId();
  return (
    <FieldLabel
      htmlFor={inputId}
      className={[
        "flex h-full min-w-0 cursor-pointer rounded-md border border-border/70 bg-surface p-3 transition-colors",
        "hover:border-border hover:bg-accent/35",
        "has-data-[state=checked]:border-primary/45 has-data-[state=checked]:bg-primary/10",
        "has-[button[disabled]]:cursor-not-allowed has-[button[disabled]]:opacity-60",
      ].join(" ")}
    >
      <div className="flex min-w-0 gap-2">
        <RadioGroupItem
          id={inputId}
          value={props.modelKind}
          disabled={props.disabled}
          className="mt-0.5"
        />
        <div className="min-w-0">
          <div className="text-callout font-semibold text-label-primary">{props.title}</div>
          <div className="mt-1 text-caption text-label-secondary">{props.description}</div>
        </div>
      </div>
    </FieldLabel>
  );
}

function StarterTemplateOption(props: {
  description: string;
  label: string;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      disabled={props.disabled}
      aria-pressed={props.selected}
      className={[
        "min-w-0 rounded-md border px-3 py-3 text-left transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25",
        props.selected
          ? "border-primary/45 bg-primary/10"
          : "border-border/70 bg-surface hover:border-border hover:bg-accent/35",
        "disabled:cursor-not-allowed disabled:opacity-60",
      ].join(" ")}
      onClick={props.onSelect}
    >
      <span className="block text-callout font-semibold text-label-primary">{props.label}</span>
      <span className="mt-1 block text-caption text-label-secondary">{props.description}</span>
    </button>
  );
}

function CreateDialogTabs(props: {
  mode: CreateDialogMode;
  onModeChange: (mode: CreateDialogMode) => void;
}) {
  const { t } = useTranslation("content");

  return (
    <ChromeTabs
      value={props.mode}
      onValueChange={(value) => props.onModeChange(value as CreateDialogMode)}
    >
      <ChromeTabsList className="w-auto">
        <ChromeTabsTrigger value="manual">
          {t("CONTENT_MODELS_CREATE_MANUAL_TAB")}
        </ChromeTabsTrigger>
        <ChromeTabsTrigger value="ai">{t("CONTENT_MODELS_CREATE_AI_TAB")}</ChromeTabsTrigger>
      </ChromeTabsList>
    </ChromeTabs>
  );
}

function ManualStartView(props: {
  values: CreateContentTypeFormValues;
  pending: boolean;
  selectedTemplate: ContentModelStarterTemplateKey;
  onModelKindChange: (modelKind: CreateContentTypeFormValues["modelKind"]) => void;
  onTemplateChange: (templateKey: ContentModelStarterTemplateKey) => void;
}) {
  const { t } = useTranslation("content");

  return (
    <SettingDialogFields>
      <SettingDialogField
        title={t("CONTENT_MODELS_CREATE_STARTER_TEMPLATE_TITLE")}
        description={t("CONTENT_MODELS_CREATE_STARTER_TEMPLATE_DESC")}
      >
        <div className="grid gap-2 md:grid-cols-2">
          {STARTER_TEMPLATES.map((template) => (
            <StarterTemplateOption
              key={template.key}
              label={t(template.labelKey)}
              description={t(template.descriptionKey)}
              selected={props.selectedTemplate === template.key}
              disabled={props.pending}
              onSelect={() => props.onTemplateChange(template.key)}
            />
          ))}
        </div>
      </SettingDialogField>

      {props.selectedTemplate === "blank" ? (
        <SettingDialogField
          title={t("CONTENT_MODELS_CREATE_MODEL_TYPE_TITLE")}
          description={t("CONTENT_MODELS_CREATE_MODEL_TYPE_DESC")}
        >
          <RadioGroup
            value={props.values.modelKind}
            disabled={props.pending}
            onValueChange={(value) => {
              if (value) props.onModelKindChange(value as CreateContentTypeFormValues["modelKind"]);
            }}
            className="grid gap-2 md:grid-cols-3"
          >
            {MODEL_KIND_OPTIONS.map((modelKind) => (
              <ModelKindOption
                key={modelKind}
                modelKind={modelKind}
                value={props.values.modelKind}
                disabled={props.pending}
                title={t(`CONTENT_MODELS_KIND_${modelKind.toUpperCase()}`)}
                description={t(`CONTENT_MODELS_KIND_${modelKind.toUpperCase()}_DESC`)}
              />
            ))}
          </RadioGroup>
        </SettingDialogField>
      ) : null}
    </SettingDialogFields>
  );
}

function resolveAiCreatedContentModel(
  response: AIWorkspaceActionResponse,
): AIWorkspaceActionContentModel | null {
  if (
    response.kind !== "tool_call" ||
    response.status !== "completed" ||
    response.action !== "create_content_model"
  ) {
    return null;
  }
  return response.contentModel ?? response.contentModels[0] ?? null;
}

function AiChatView(props: {
  projectId: string;
  onCreated: (model: AIWorkspaceActionContentModel) => Promise<void> | void;
}) {
  const { t } = useTranslation("content");
  const { onCreated, projectId } = props;
  const [input, setInput] = React.useState("");
  const [messages, setMessages] = React.useState<
    Array<{ role: "assistant" | "user"; content: string }>
  >([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = React.useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;
    setInput("");
    setError(null);
    setMessages((current) => [...current, { role: "user", content: trimmed }]);
    const abortController = new AbortController();
    abortRef.current = abortController;
    setIsLoading(true);

    void executeAIWorkspaceAction(`${t("CONTENT_MODELS_CREATE_AI_ACTION_PREFIX")}\n\n${trimmed}`, {
      mode: "build",
      projectId,
      signal: abortController.signal,
    })
      .then(async (response) => {
        const assistantContent =
          response.content || response.plan || t("CONTENT_MODELS_CREATE_AI_ACTION_EMPTY_RESPONSE");
        setMessages((current) => [...current, { role: "assistant", content: assistantContent }]);

        const createdModel = resolveAiCreatedContentModel(response);
        if (!createdModel) {
          setError(t("CONTENT_MODELS_CREATE_AI_ACTION_NO_MODEL"));
          return;
        }
        await onCreated(createdModel);
      })
      .catch((cause) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(cause instanceof Error ? cause.message : t("CONTENT_MODELS_CREATE_AI_CHAT_ERROR"));
      })
      .finally(() => {
        setIsLoading(false);
        abortRef.current = null;
      });
  }, [input, isLoading, onCreated, projectId, t]);

  const cancel = React.useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsLoading(false);
  }, []);

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  return (
    <div className="flex min-h-72 flex-col gap-3">
      <div className="grid gap-2">
        <div className="text-footnote font-medium text-label-secondary">
          {t("CONTENT_MODELS_CREATE_AI_PROMPT_LABEL")}
        </div>
        <div className="flex flex-wrap gap-2">
          {AI_PROMPT_SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion.key}
              type="button"
              disabled={isLoading}
              className="rounded-md border border-border bg-background px-2.5 py-1.5 text-caption font-medium text-label-secondary transition-colors hover:bg-accent hover:text-label-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => setInput(t(suggestion.promptKey))}
            >
              {t(suggestion.labelKey)}
            </button>
          ))}
        </div>
      </div>

      {/* Messages area */}
      <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border bg-surface p-3">
        {messages.length === 0 && !error ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <Sparkles className="mx-auto mb-2 size-6 text-label-secondary" aria-hidden="true" />
            <p className="text-body text-label-secondary">
              {t("CONTENT_MODELS_CREATE_AI_CHAT_EMPTY")}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={[
                  "whitespace-pre-wrap rounded-lg px-3 py-2 text-body",
                  msg.role === "user"
                    ? "self-end max-w-[80%] bg-primary/10 text-label-primary"
                    : "bg-accent text-label-primary",
                ].join(" ")}
              >
                {msg.content}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
        {error && (
          <div className="mt-2 rounded-md bg-destructive/10 px-3 py-2 text-footnote text-destructive">
            {error}
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="flex items-end gap-2">
        <Textarea
          value={input}
          disabled={isLoading}
          placeholder={t("CONTENT_MODELS_CREATE_AI_CHAT_INPUT_PLACEHOLDER")}
          className="min-h-10 flex-1 resize-none"
          rows={2}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        <div className="flex shrink-0 gap-2">
          {isLoading ? (
            <Button variant="ghost" onClick={cancel} type="button">
              {t("CONTENT_MODELS_CREATE_AI_CHAT_CANCEL")}
            </Button>
          ) : (
            <Button onClick={handleSend} disabled={!input.trim()} type="button">
              {t("CONTENT_MODELS_CREATE_AI_CHAT_SEND")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailsView(props: {
  values: CreateContentTypeFormValues;
  errors: FormErrors;
  pending: boolean;
  singularInputId: string;
  pluralInputId: string;
  onValuesChange: (next: CreateContentTypeFormValues) => void;
}) {
  const { t } = useTranslation("content");

  return (
    <SettingDialogFields>
      <SettingDialogField
        title={t("CONTENT_MODELS_CREATE_CONTENT_TYPE_NAME_LABEL")}
        description={t("CONTENT_MODELS_CREATE_CONTENT_TYPE_NAME_HELP")}
        error={
          props.errors.name ? (
            <div className="text-footnote text-destructive">{props.errors.name}</div>
          ) : undefined
        }
      >
        <div>
          <Input
            value={props.values.name}
            disabled={props.pending}
            maxLength={CONTENT_MODEL_NAME_MAX_LENGTH}
            placeholder={t("CONTENT_MODELS_CREATE_CONTENT_TYPE_NAME_PLACEHOLDER")}
            aria-label={t("CONTENT_MODELS_CREATE_CONTENT_TYPE_NAME_LABEL")}
            aria-invalid={props.errors.name ? true : undefined}
            onChange={(event) =>
              props.onValuesChange(
                syncGeneratedIdentifiersWithName(props.values, event.target.value),
              )
            }
          />
          <CharacterCount value={props.values.name} max={CONTENT_MODEL_NAME_MAX_LENGTH} />
        </div>
      </SettingDialogField>

      <SettingDialogField
        title={t("CONTENT_MODELS_CREATE_CONTENT_TYPE_IDENTIFIER_LABEL")}
        description={t("CONTENT_MODELS_CREATE_CONTENT_TYPE_IDENTIFIER_HELP")}
        error={
          props.errors.pluralKey || props.errors.singularKey ? (
            <div className="text-footnote text-destructive">
              {[props.errors.singularKey, props.errors.pluralKey].filter(Boolean).join(" ")}
            </div>
          ) : undefined
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1 space-y-1.5">
            <label htmlFor={props.singularInputId} className="grid gap-1 space-y-1.5">
              <span className="font-semibold text-label-secondary">
                <FieldTitleWithHelp
                  title={t("CONTENT_MODELS_CREATE_CONTENT_TYPE_SINGULAR_LABEL")}
                  help={t("CONTENT_MODELS_CREATE_CONTENT_TYPE_SINGULAR_HELP")}
                />
              </span>
            </label>
            <div>
              <Input
                id={props.singularInputId}
                value={props.values.singularKey.value}
                disabled={props.pending}
                maxLength={CONTENT_MODEL_IDENTIFIER_MAX_LENGTH}
                placeholder={t("CONTENT_MODELS_CREATE_CONTENT_TYPE_SINGULAR_PLACEHOLDER")}
                aria-invalid={props.errors.singularKey ? true : undefined}
                onChange={(event) =>
                  props.onValuesChange({
                    ...props.values,
                    singularKey: createManualIdentifier(event.target.value),
                  })
                }
              />
              <CharacterCount
                value={props.values.singularKey.value}
                max={CONTENT_MODEL_IDENTIFIER_MAX_LENGTH}
              />
            </div>
          </div>
          <div className="grid gap-1 space-y-1.5">
            <label htmlFor={props.pluralInputId} className="grid gap-1 space-y-1.5">
              <span className="font-semibold text-label-secondary">
                <FieldTitleWithHelp
                  title={t("CONTENT_MODELS_CREATE_CONTENT_TYPE_PLURAL_LABEL")}
                  help={t("CONTENT_MODELS_CREATE_CONTENT_TYPE_PLURAL_HELP")}
                />
              </span>
            </label>
            <div>
              <Input
                id={props.pluralInputId}
                value={props.values.pluralKey.value}
                disabled={props.pending}
                maxLength={CONTENT_MODEL_IDENTIFIER_MAX_LENGTH}
                placeholder={t("CONTENT_MODELS_CREATE_CONTENT_TYPE_PLURAL_PLACEHOLDER")}
                aria-invalid={props.errors.pluralKey ? true : undefined}
                onChange={(event) =>
                  props.onValuesChange({
                    ...props.values,
                    pluralKey: createManualIdentifier(event.target.value),
                  })
                }
              />
              <CharacterCount
                value={props.values.pluralKey.value}
                max={CONTENT_MODEL_IDENTIFIER_MAX_LENGTH}
              />
            </div>
          </div>
        </div>
      </SettingDialogField>

      <SettingDialogField title={t("CONTENT_MODELS_CREATE_CONTENT_TYPE_DESCRIPTION_LABEL")}>
        <div>
          <Textarea
            aria-label={t("CONTENT_MODELS_CREATE_CONTENT_TYPE_DESCRIPTION_LABEL")}
            value={props.values.description}
            disabled={props.pending}
            maxLength={CONTENT_MODEL_DESCRIPTION_MAX_LENGTH}
            placeholder={t("CONTENT_MODELS_CREATE_CONTENT_TYPE_DESCRIPTION_PLACEHOLDER")}
            rows={4}
            onChange={(event) =>
              props.onValuesChange({ ...props.values, description: event.target.value })
            }
          />
          <CharacterCount
            value={props.values.description}
            max={CONTENT_MODEL_DESCRIPTION_MAX_LENGTH}
          />
        </div>
      </SettingDialogField>
    </SettingDialogFields>
  );
}

export function CreateContentTypeDialog({
  open,
  pending = false,
  projectId,
  onOpenChange,
  onAiCreated,
  onSubmit,
}: CreateContentTypeDialogProps) {
  const { t } = useTranslation("content");
  const [values, setValues] = React.useState<CreateContentTypeFormValues>(DEFAULT_VALUES);
  const [errors, setErrors] = React.useState<FormErrors>({});
  const [view, setView] = React.useState<CreateDialogView>("start");
  const [mode, setMode] = React.useState<CreateDialogMode>("manual");
  const [selectedTemplate, setSelectedTemplate] =
    React.useState<ContentModelStarterTemplateKey>("blank");
  const singularInputId = React.useId();
  const pluralInputId = React.useId();

  React.useEffect(() => {
    if (open) return;
    setValues(DEFAULT_VALUES);
    setErrors({});
    setView("start");
    setMode("manual");
    setSelectedTemplate("blank");
  }, [open]);

  const validate = React.useCallback((): FormErrors => {
    const nextErrors: FormErrors = {};
    const name = values.name.trim();
    const singularKey = values.singularKey.value.trim();
    const pluralKey = values.pluralKey.value.trim();

    if (!name) nextErrors.name = t("CONTENT_MODELS_CREATE_CONTENT_TYPE_VALIDATION_NAME");
    if (!singularKey) {
      nextErrors.singularKey = t("CONTENT_MODELS_CREATE_CONTENT_TYPE_VALIDATION_SINGULAR");
    } else if (!validateContentTypeIdentifier(singularKey)) {
      nextErrors.singularKey = t("CONTENT_MODELS_CREATE_CONTENT_TYPE_VALIDATION_IDENTIFIER_FORMAT");
    }
    if (!pluralKey) {
      nextErrors.pluralKey = t("CONTENT_MODELS_CREATE_CONTENT_TYPE_VALIDATION_PLURAL");
    } else if (!validateContentTypeIdentifier(pluralKey)) {
      nextErrors.pluralKey = t("CONTENT_MODELS_CREATE_CONTENT_TYPE_VALIDATION_IDENTIFIER_FORMAT");
    }
    if (singularKey && pluralKey && singularKey === pluralKey) {
      nextErrors.pluralKey = t("CONTENT_MODELS_CREATE_CONTENT_TYPE_VALIDATION_IDENTIFIER_MATCH");
    }
    return nextErrors;
  }, [t, values]);

  const submit = React.useCallback(async () => {
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const name = values.name.trim();
    const singularKey = values.singularKey.value.trim();
    const pluralKey = values.pluralKey.value.trim();
    const description = values.description.trim() || null;
    await onSubmit({
      name,
      singularKey,
      pluralKey,
      description,
      payload: buildCreateContentTypePayload({
        name,
        singularKey,
        pluralKey,
        description,
        modelKind: values.modelKind,
        starterTemplate: selectedTemplate,
      }),
    });
  }, [onSubmit, selectedTemplate, validate, values]);

  const applyStarterTemplate = React.useCallback((templateKey: ContentModelStarterTemplateKey) => {
    const template = STARTER_TEMPLATES.find((item) => item.key === templateKey);
    if (!template) throw new Error(`Unknown content model starter template: ${templateKey}`);
    setSelectedTemplate(template.key);
    setErrors({});
    setValues({
      name: template.values.name,
      singularKey: createGeneratedIdentifier(template.values.singularKey),
      pluralKey: createGeneratedIdentifier(template.values.pluralKey),
      description: template.values.description,
      modelKind: template.modelKind,
    });
  }, []);

  const tabs =
    view === "start" ? <CreateDialogTabs mode={mode} onModeChange={setMode} /> : undefined;

  const footer =
    view === "details" ? (
      <>
        <Button variant="ghost" disabled={pending} onClick={() => onOpenChange(false)}>
          {t("CONTENT_MODELS_CANCEL_ACTION")}
        </Button>
        <Button loading={pending} onClick={() => void submit()}>
          {t("CONTENT_MODELS_CREATE_CONFIRM")}
        </Button>
      </>
    ) : (
      <>
        <Button variant="ghost" disabled={pending} onClick={() => onOpenChange(false)}>
          {t("CONTENT_MODELS_CANCEL_ACTION")}
        </Button>
        {mode === "manual" ? (
          <Button disabled={pending} onClick={() => setView("details")}>
            {t("CONTENT_MODELS_CREATE_CONTINUE_ACTION")}
          </Button>
        ) : null}
      </>
    );

  return (
    <SettingDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("CONTENT_MODELS_CREATE_CONTENT_TYPE_TITLE")}
      titleClassName={view === "start" ? "sr-only" : undefined}
      description={tabs}
      contentClassName="sm:max-w-3xl"
      footer={footer}
    >
      <form
        className="py-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (view === "details") {
            void submit();
            return;
          }
          if (mode === "manual") setView("details");
        }}
      >
        {view === "start" ? (
          mode === "manual" ? (
            <ManualStartView
              values={values}
              pending={pending}
              selectedTemplate={selectedTemplate}
              onModelKindChange={(modelKind) => setValues((current) => ({ ...current, modelKind }))}
              onTemplateChange={applyStarterTemplate}
            />
          ) : (
            <AiChatView projectId={projectId} onCreated={onAiCreated} />
          )
        ) : (
          <DetailsView
            values={values}
            errors={errors}
            pending={pending}
            singularInputId={singularInputId}
            pluralInputId={pluralInputId}
            onValuesChange={setValues}
          />
        )}
      </form>
    </SettingDialog>
  );
}
