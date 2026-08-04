import { Plus, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type {
  SystemAiProviderCreateRequest,
  SystemAiProviderModelMapping,
  SystemAiProviderOut,
  SystemAiProviderUpdateRequest,
} from "@arclayer/platform-openapi";

import type { ProviderIconDraft } from "@/ai/ai-provider-icon";
import { AiProviderIconPicker } from "@/ai/ai-provider-icon-picker";
import {
  createAiProvider,
  PlatformAiServicesApiError,
  updateAiProvider,
} from "@/ai/ai-services-api";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";

const COMPATIBILITY = [
  "openai",
  "anthropic",
  "deepseek",
  "openai_compatible",
  "anthropic_compatible",
] as const;

type Props = Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompleted: (messageKey: string) => void;
  provider?: SystemAiProviderOut;
  copy?: boolean;
}>;

function LabeledField(
  props: Readonly<{
    id: string;
    label: string;
    help?: string;
    children: React.ReactNode;
  }>,
) {
  return (
    <Field>
      <div className="space-y-1">
        <FieldLabel htmlFor={props.id}>{props.label}</FieldLabel>
        {props.help ? <FieldDescription>{props.help}</FieldDescription> : null}
      </div>
      {props.children}
    </Field>
  );
}

function Section(
  props: Readonly<{ title: string; description: string; children: React.ReactNode }>,
) {
  return (
    <section className="space-y-4 border-t pt-5 first:border-0 first:pt-0">
      <div>
        <h3 className="font-medium">{props.title}</h3>
        <p className="text-sm text-muted-foreground">{props.description}</p>
      </div>
      {props.children}
    </section>
  );
}

function mutationError(error: unknown) {
  if (!(error instanceof PlatformAiServicesApiError))
    return { key: "PROVIDER_CHANGE_ERROR", code: "PLATFORM_AI_PROVIDER_CHANGE_FAILED" };
  if (error.status === 401 || error.status === 403)
    return { key: "PROVIDER_CHANGE_PERMISSION_ERROR", code: error.message };
  if (error.status === 409) return { key: "PROVIDER_CHANGE_CONFLICT_ERROR", code: error.message };
  if (error.status === 422) return { key: "PROVIDER_CHANGE_VALIDATION_ERROR", code: error.message };
  return { key: "PROVIDER_CHANGE_ERROR", code: error.message };
}

function normalizedConfigurationValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizedConfigurationValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, normalizedConfigurationValue(item)]),
  );
}

function sameConfigurationValue(left: unknown, right: unknown): boolean {
  return (
    JSON.stringify(normalizedConfigurationValue(left)) ===
    JSON.stringify(normalizedConfigurationValue(right))
  );
}

type ModelMappingTextField = "publicModel" | "providerModel" | "label" | "description";
type ModelMappingI18nField = "labelI18n" | "descriptionI18n";
type SupportedModelLocale = "zh-CN" | "en-US";

function emptyModelMapping(): SystemAiProviderModelMapping {
  return {
    publicModel: "",
    providerModel: "",
    label: null,
    description: null,
    labelI18n: {},
    descriptionI18n: {},
  };
}

function providerModelMappings(provider?: SystemAiProviderOut): SystemAiProviderModelMapping[] {
  const mappings = provider?.modelMappings?.length ? provider.modelMappings : [emptyModelMapping()];
  const useProviderCopy = Boolean(provider && mappings.length === 1);
  return mappings.map((mapping) => ({
    ...mapping,
    label: mapping.label ?? (useProviderCopy ? provider?.label : null),
    description: mapping.description ?? (useProviderCopy ? provider?.note : null),
    labelI18n: mapping.labelI18n ?? {},
    descriptionI18n: mapping.descriptionI18n ?? {},
  }));
}

function localizedModelCopy(
  mapping: SystemAiProviderModelMapping,
  field: ModelMappingI18nField,
): Partial<Record<SupportedModelLocale, string>> {
  return Object.fromEntries(
    Object.entries(mapping[field] ?? {})
      .map(([locale, value]) => [locale, value.trim()])
      .filter(([, value]) => value),
  );
}

function providerUpdate(
  provider: SystemAiProviderOut,
  body: SystemAiProviderCreateRequest,
): SystemAiProviderUpdateRequest {
  const update: SystemAiProviderUpdateRequest = {};
  if (body.provider !== provider.provider) update.provider = body.provider;
  if (body.label !== provider.label) update.label = body.label;
  if (!sameConfigurationValue(body.icon, provider.icon)) update.icon = body.icon;
  if (body.note !== provider.note) update.note = body.note;
  if (body.websiteUrl !== provider.websiteUrl) update.websiteUrl = body.websiteUrl;
  if (body.compatibility !== provider.compatibility) update.compatibility = body.compatibility;
  if (body.authHeader !== provider.authHeader) update.authHeader = body.authHeader;
  if (body.baseUrl !== provider.baseUrl) update.baseUrl = body.baseUrl;
  if (!sameConfigurationValue(body.modelMappings, providerModelMappings(provider))) {
    update.modelMappings = body.modelMappings;
  }
  if (body.defaultModel !== provider.defaultModel) update.defaultModel = body.defaultModel;
  if (!sameConfigurationValue(body.testConfig, provider.testConfig)) {
    update.testConfig = body.testConfig;
  }
  if (!sameConfigurationValue(body.billingConfig, provider.billingConfig)) {
    update.billingConfig = body.billingConfig;
  }
  return update;
}

export function AiProviderEditorDialog(props: Props) {
  const { t, i18n } = useTranslation(["ai", "errors"]);
  const isCreate = !props.provider || props.copy;
  const [compatibility, setCompatibility] = useState<(typeof COMPATIBILITY)[number]>(
    props.provider?.compatibility ?? "openai_compatible",
  );
  const [icon, setIcon] = useState<ProviderIconDraft>({
    lightUrl: props.provider?.icon?.lightUrl ?? null,
    darkUrl: props.provider?.icon?.darkUrl ?? null,
  });
  const [mappings, setMappings] = useState<SystemAiProviderModelMapping[]>(
    providerModelMappings(props.provider),
  );
  const [defaultModel, setDefaultModel] = useState(props.provider?.defaultModel ?? "");
  const [pending, setPending] = useState(false);
  const [validationError, setValidationError] = useState<{
    key: string;
    code: string;
  } | null>(null);

  const changeMapping = (index: number, field: ModelMappingTextField, value: string) => {
    setMappings((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item)),
    );
  };

  const changeLocalizedMapping = (
    index: number,
    field: ModelMappingI18nField,
    locale: SupportedModelLocale,
    value: string,
  ) => {
    setMappings((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: { ...item[field], [locale]: value } } : item,
      ),
    );
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const cleanMappings = mappings
      .map((item) => ({
        publicModel: item.publicModel.trim(),
        providerModel: item.providerModel.trim(),
        label: item.label?.trim() || null,
        description: item.description?.trim() || null,
        labelI18n: localizedModelCopy(item, "labelI18n"),
        descriptionI18n: localizedModelCopy(item, "descriptionI18n"),
      }))
      .filter((item) => item.publicModel && item.providerModel);
    const apiKey = String(form.get("apiKey") ?? "").trim();
    if (Boolean(icon.lightUrl) !== Boolean(icon.darkUrl)) {
      setValidationError({
        key: "PROVIDER_ICON_VARIANTS_REQUIRED",
        code: "AI_PROVIDER_ICON_VARIANTS_REQUIRED",
      });
      return;
    }
    const body: SystemAiProviderCreateRequest = {
      label: String(form.get("label") ?? "").trim(),
      provider: String(form.get("provider") ?? "").trim(),
      providerApiKey: apiKey,
      icon:
        icon.lightUrl && icon.darkUrl ? { lightUrl: icon.lightUrl, darkUrl: icon.darkUrl } : null,
      note: String(form.get("note") ?? "").trim() || null,
      websiteUrl: String(form.get("websiteUrl") ?? "").trim() || null,
      baseUrl: String(form.get("baseUrl") ?? "").trim() || null,
      authHeader: String(form.get("authHeader") ?? "Authorization").trim(),
      compatibility,
      modelMappings: cleanMappings,
      defaultModel: defaultModel.trim(),
      testConfig: {
        prompt: String(form.get("testPrompt") ?? "").trim(),
        expectedText: String(form.get("expectedText") ?? "").trim() || null,
        maxTokens: Number(form.get("maxTokens") ?? 8),
      },
      billingConfig: {
        currency: "USD",
        inputCostMicrosPerMillionTokens: Number(form.get("inputCost") ?? 0),
        outputCostMicrosPerMillionTokens: Number(form.get("outputCost") ?? 0),
      },
    };
    if (
      !body.label ||
      !body.provider ||
      !cleanMappings.length ||
      !body.defaultModel ||
      (isCreate && !apiKey)
    ) {
      setValidationError({ key: "PROVIDER_REQUIRED_FIELDS", code: "AI_PROVIDER_REQUIRED_FIELDS" });
      return;
    }
    setPending(true);
    setValidationError(null);
    try {
      if (isCreate) await createAiProvider(body);
      else {
        const update = providerUpdate(props.provider!, body);
        if (apiKey) update.providerApiKey = apiKey;
        if (Object.keys(update).length) await updateAiProvider(props.provider!.id, update);
      }
      props.onCompleted(isCreate ? "PROVIDER_CREATED" : "PROVIDER_UPDATED");
      props.onOpenChange(false);
    } catch (caught) {
      const failure = mutationError(caught);
      const description = i18n.exists(`errors:${failure.code}`)
        ? t(`errors:${failure.code}`)
        : t(`ai:${failure.key}`);
      toast.error(t("ai:PROVIDER_CHANGE_FAILED"), {
        description: `${description} · ${failure.code}`,
      });
    } finally {
      setPending(false);
    }
  };

  return (
    <Sheet open={props.open} onOpenChange={(open) => !pending && props.onOpenChange(open)}>
      <SheetContent className="flex min-h-0 w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <SheetHeader className="shrink-0 border-b px-6 py-5 pr-12 text-left">
          <SheetTitle>
            {t(props.copy ? "COPY_PROVIDER" : props.provider ? "EDIT_PROVIDER" : "ADD_PROVIDER")}
          </SheetTitle>
          <SheetDescription>
            {t(
              props.provider && !props.copy
                ? "EDIT_PROVIDER_DESCRIPTION"
                : "ADD_PROVIDER_DESCRIPTION",
            )}
          </SheetDescription>
        </SheetHeader>
        <form
          className="min-h-0 min-w-0 flex-1 space-y-6 overflow-x-hidden overflow-y-auto px-6 py-5"
          id="ai-provider-editor"
          onSubmit={submit}
        >
          {validationError ? (
            <FieldError>
              {i18n.exists(`errors:${validationError.code}`)
                ? t(`errors:${validationError.code}`)
                : t(`ai:${validationError.key}`)}
            </FieldError>
          ) : null}
          <Section
            title={t("PROVIDER_BASIC_SECTION")}
            description={t("PROVIDER_BASIC_SECTION_DESCRIPTION")}
          >
            <FieldSet className="gap-3">
              <FieldLegend variant="label">{t("PROVIDER_ICON")}</FieldLegend>
              <AiProviderIconPicker onChange={setIcon} value={icon} />
            </FieldSet>
            <div className="grid gap-4 sm:grid-cols-2">
              <LabeledField id="provider-label" label={t("LABEL")}>
                <Input
                  defaultValue={
                    props.copy
                      ? `${props.provider?.label} ${t("COPY_SUFFIX")}`
                      : props.provider?.label
                  }
                  id="provider-label"
                  name="label"
                  placeholder={t("PLACEHOLDER_PROVIDER_LABEL")}
                  required
                />
              </LabeledField>
              <LabeledField id="provider-name" label={t("PROVIDER")}>
                <Input
                  defaultValue={props.provider?.provider}
                  id="provider-name"
                  name="provider"
                  placeholder={t("PLACEHOLDER_PROVIDER")}
                  required
                />
              </LabeledField>
            </div>
            <LabeledField id="provider-note" label={t("PROVIDER_NOTE")}>
              <Textarea
                defaultValue={props.provider?.note ?? ""}
                id="provider-note"
                name="note"
                placeholder={t("PLACEHOLDER_PROVIDER_NOTE")}
              />
            </LabeledField>
            <LabeledField id="provider-website" label={t("WEBSITE_URL")}>
              <Input
                defaultValue={props.provider?.websiteUrl ?? ""}
                id="provider-website"
                name="websiteUrl"
                placeholder={t("PLACEHOLDER_WEBSITE_URL")}
                type="url"
              />
            </LabeledField>
          </Section>
          <Section
            title={t("PROVIDER_CONNECTION_SECTION")}
            description={t("PROVIDER_CONNECTION_SECTION_DESCRIPTION")}
          >
            <LabeledField
              help={t("API_KEY_WRITE_ONLY_HELP")}
              id="provider-api-key"
              label={t("API_KEY")}
            >
              <Input
                autoComplete="new-password"
                id="provider-api-key"
                name="apiKey"
                placeholder={t("PLACEHOLDER_API_KEY")}
                required={isCreate}
                type="password"
              />
            </LabeledField>
            <LabeledField id="provider-base-url" label={t("BASE_URL")}>
              <Input
                defaultValue={props.provider?.baseUrl ?? ""}
                id="provider-base-url"
                name="baseUrl"
                placeholder={t("PLACEHOLDER_BASE_URL")}
                type="url"
              />
            </LabeledField>
          </Section>
          <Section
            title={t("PROVIDER_ADVANCED_SECTION")}
            description={t("PROVIDER_ADVANCED_SECTION_DESCRIPTION")}
          >
            <LabeledField id="provider-compatibility" label={t("COMPATIBILITY_MODE")}>
              <Select
                onValueChange={(value) => setCompatibility(value as typeof compatibility)}
                value={compatibility}
              >
                <SelectTrigger id="provider-compatibility">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COMPATIBILITY.map((item) => (
                    <SelectItem key={item} value={item}>
                      {t(`COMPATIBILITY_${item.toUpperCase()}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </LabeledField>
            <LabeledField id="provider-auth-header" label={t("AUTH_HEADER")}>
              <Input
                defaultValue={props.provider?.authHeader ?? "Authorization"}
                id="provider-auth-header"
                name="authHeader"
                placeholder={t("PLACEHOLDER_AUTH_HEADER")}
                required
              />
            </LabeledField>
          </Section>
          <Section
            title={t("MODEL_MAPPING_SECTION")}
            description={t("MODEL_MAPPING_SECTION_DESCRIPTION")}
          >
            <div className="space-y-3">
              {mappings.map((mapping, index) => (
                <div
                  className="space-y-4 rounded-lg border p-4"
                  key={`${index}-${mapping.publicModel}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="text-sm font-medium">
                      {t("MODEL_MAPPING_ITEM", { index: index + 1 })}
                    </h4>
                    <Button
                      aria-label={t("REMOVE_MODEL_MAPPING")}
                      disabled={mappings.length === 1}
                      onClick={() =>
                        setMappings((current) =>
                          current.filter((_, itemIndex) => itemIndex !== index),
                        )
                      }
                      size="icon-sm"
                      type="button"
                      variant="ghost"
                    >
                      <Trash2 />
                    </Button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <LabeledField id={`public-model-${index}`} label={t("PUBLIC_MODEL")}>
                      <Input
                        id={`public-model-${index}`}
                        onChange={(event) =>
                          changeMapping(index, "publicModel", event.target.value)
                        }
                        placeholder={t("PLACEHOLDER_PUBLIC_MODEL")}
                        value={mapping.publicModel}
                      />
                    </LabeledField>
                    <LabeledField id={`provider-model-${index}`} label={t("PROVIDER_MODEL")}>
                      <Input
                        id={`provider-model-${index}`}
                        onChange={(event) =>
                          changeMapping(index, "providerModel", event.target.value)
                        }
                        placeholder={t("PLACEHOLDER_PROVIDER_MODEL")}
                        value={mapping.providerModel}
                      />
                    </LabeledField>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <LabeledField id={`model-label-${index}`} label={t("MODEL_DISPLAY_NAME")}>
                      <Input
                        id={`model-label-${index}`}
                        onChange={(event) => changeMapping(index, "label", event.target.value)}
                        placeholder={t("PLACEHOLDER_MODEL_DISPLAY_NAME")}
                        value={mapping.label ?? ""}
                      />
                    </LabeledField>
                    <LabeledField id={`model-description-${index}`} label={t("MODEL_DESCRIPTION")}>
                      <Input
                        id={`model-description-${index}`}
                        onChange={(event) =>
                          changeMapping(index, "description", event.target.value)
                        }
                        placeholder={t("PLACEHOLDER_MODEL_DESCRIPTION")}
                        value={mapping.description ?? ""}
                      />
                    </LabeledField>
                  </div>
                  <div className="space-y-3 rounded-md bg-muted/40 p-3">
                    <div>
                      <p className="text-sm font-medium">{t("MODEL_LOCALIZATION")}</p>
                      <p className="text-xs text-muted-foreground">
                        {t("MODEL_LOCALIZATION_DESCRIPTION")}
                      </p>
                    </div>
                    {(["zh-CN", "en-US"] as const).map((locale) => (
                      <div className="grid gap-3 sm:grid-cols-2" key={locale}>
                        <LabeledField
                          id={`model-label-${locale}-${index}`}
                          label={t(locale === "zh-CN" ? "MODEL_NAME_ZH_CN" : "MODEL_NAME_EN_US")}
                        >
                          <Input
                            id={`model-label-${locale}-${index}`}
                            onChange={(event) =>
                              changeLocalizedMapping(index, "labelI18n", locale, event.target.value)
                            }
                            placeholder={t("PLACEHOLDER_LOCALIZED_MODEL_NAME")}
                            value={mapping.labelI18n?.[locale] ?? ""}
                          />
                        </LabeledField>
                        <LabeledField
                          id={`model-description-${locale}-${index}`}
                          label={t(
                            locale === "zh-CN"
                              ? "MODEL_DESCRIPTION_ZH_CN"
                              : "MODEL_DESCRIPTION_EN_US",
                          )}
                        >
                          <Input
                            id={`model-description-${locale}-${index}`}
                            onChange={(event) =>
                              changeLocalizedMapping(
                                index,
                                "descriptionI18n",
                                locale,
                                event.target.value,
                              )
                            }
                            placeholder={t("PLACEHOLDER_LOCALIZED_MODEL_DESCRIPTION")}
                            value={mapping.descriptionI18n?.[locale] ?? ""}
                          />
                        </LabeledField>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <Button
              onClick={() => setMappings((current) => [...current, emptyModelMapping()])}
              size="sm"
              type="button"
              variant="outline"
            >
              <Plus />
              {t("ADD_MODEL_MAPPING")}
            </Button>
            <LabeledField id="provider-default-model" label={t("DEFAULT_MODEL")}>
              <Select onValueChange={setDefaultModel} value={defaultModel}>
                <SelectTrigger id="provider-default-model">
                  <SelectValue placeholder={t("SELECT_DEFAULT_MODEL")} />
                </SelectTrigger>
                <SelectContent>
                  {mappings
                    .filter((item) => item.publicModel.trim())
                    .map((item) => (
                      <SelectItem key={item.publicModel} value={item.publicModel}>
                        {item.publicModel}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </LabeledField>
          </Section>
          <Section
            title={t("MODEL_TEST_SECTION")}
            description={t("MODEL_TEST_SECTION_DESCRIPTION")}
          >
            <LabeledField id="provider-test-prompt" label={t("TEST_PROMPT")}>
              <Textarea
                defaultValue={props.provider?.testConfig.prompt ?? "Respond with OK."}
                id="provider-test-prompt"
                name="testPrompt"
                placeholder={t("PLACEHOLDER_TEST_PROMPT")}
                required
              />
            </LabeledField>
            <div className="grid gap-4 sm:grid-cols-2">
              <LabeledField id="provider-expected-text" label={t("EXPECTED_TEXT")}>
                <Input
                  defaultValue={props.provider?.testConfig.expectedText ?? "OK"}
                  id="provider-expected-text"
                  name="expectedText"
                  placeholder={t("PLACEHOLDER_EXPECTED_TEXT")}
                />
              </LabeledField>
              <LabeledField id="provider-max-tokens" label={t("MAX_TOKENS")}>
                <Input
                  defaultValue={props.provider?.testConfig.maxTokens ?? 8}
                  id="provider-max-tokens"
                  max={128}
                  min={1}
                  name="maxTokens"
                  placeholder={t("PLACEHOLDER_MAX_TOKENS")}
                  type="number"
                />
              </LabeledField>
            </div>
          </Section>
          <Section title={t("BILLING_SECTION")} description={t("BILLING_SECTION_DESCRIPTION")}>
            <div className="grid gap-4 sm:grid-cols-2">
              <LabeledField id="provider-input-cost" label={t("INPUT_TOKEN_PRICE")}>
                <Input
                  defaultValue={props.provider?.billingConfig.inputCostMicrosPerMillionTokens ?? 0}
                  id="provider-input-cost"
                  min={0}
                  name="inputCost"
                  placeholder={t("PLACEHOLDER_TOKEN_COST")}
                  type="number"
                />
              </LabeledField>
              <LabeledField id="provider-output-cost" label={t("OUTPUT_TOKEN_PRICE")}>
                <Input
                  defaultValue={props.provider?.billingConfig.outputCostMicrosPerMillionTokens ?? 0}
                  id="provider-output-cost"
                  min={0}
                  name="outputCost"
                  placeholder={t("PLACEHOLDER_TOKEN_COST")}
                  type="number"
                />
              </LabeledField>
            </div>
          </Section>
        </form>
        <SheetFooter className="mt-0 shrink-0 border-t bg-background px-6 py-4">
          <Button
            disabled={pending}
            onClick={() => props.onOpenChange(false)}
            type="button"
            variant="outline"
          >
            {t("CANCEL")}
          </Button>
          <Button disabled={pending} form="ai-provider-editor" type="submit">
            {pending ? t("WORKING") : t("SAVE_PROVIDER")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
