import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { PageHeader } from "@/components/platform-page";
import { SettingDialog } from "@/components/setting-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  createPlatformLanguageDraft,
  getPlatformSystemSettings,
  previewPlatformLanguageDraft,
  publishPlatformLanguageDraft,
  type PlatformSystemSettings,
  updatePlatformSystemSettingsGenericSection,
  updatePlatformSystemSettingsSection,
} from "@/settings/system-settings-api";
import { applyPlatformLanguageCatalog } from "@/lib/i18n";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Section = "all" | "identity" | "domains" | "languages" | "regional" | "seo";

const SECTIONS: readonly Section[] = ["all", "identity", "domains", "languages", "regional", "seo"];

export function SystemSettingsPage() {
  const { t } = useTranslation("common");
  const [section, setSection] = useState<Section>("identity");
  const [settings, setSettings] = useState<PlatformSystemSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [genericSectionId, setGenericSectionId] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    setHasError(false);
    try {
      const loaded = await getPlatformSystemSettings();
      applyPlatformLanguageCatalog(loaded.languages);
      setSettings(loaded);
    } catch {
      setSettings(null);
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const saveSection = useCallback(
    async (values: Record<string, unknown>) => {
      if (!settings || section === "languages" || section === "all") return;
      setIsSaving(true);
      setSaveError(null);
      try {
        const routeSection = section === "seo" ? "site-metadata" : section;
        const updated = await updatePlatformSystemSettingsSection(routeSection, {
          ...values,
          expected_revision: settings.revision,
          idempotency_key: globalThis.crypto.randomUUID(),
        });
        applyPlatformLanguageCatalog(updated.languages);
        setSettings(updated);
        setIsEditing(false);
      } catch {
        setSaveError(t("SYSTEM_SETTINGS_SAVE_ERROR"));
      } finally {
        setIsSaving(false);
      }
    },
    [section, settings, t],
  );

  const saveGenericSection = useCallback(
    async (sectionId: string, values: Record<string, unknown>) => {
      if (!settings) return;
      setIsSaving(true);
      setSaveError(null);
      try {
        const updated = await updatePlatformSystemSettingsGenericSection(sectionId, {
          expected_revision: settings.revision,
          idempotency_key: globalThis.crypto.randomUUID(),
          values,
        });
        applyPlatformLanguageCatalog(updated.languages);
        setSettings(updated);
        setIsEditing(false);
      } catch {
        setSaveError(t("SYSTEM_SETTINGS_SAVE_ERROR"));
      } finally {
        setIsSaving(false);
      }
    },
    [settings, t],
  );

  const saveLanguageCatalog = useCallback(
    async (enabledLocales: readonly string[], defaultLocale: string) => {
      if (!settings) return;
      setIsSaving(true);
      setSaveError(null);
      try {
        const draft = await createPlatformLanguageDraft({
          expected_revision: settings.revision,
          idempotency_key: globalThis.crypto.randomUUID(),
          enabled_locales: enabledLocales,
          default_locale: defaultLocale,
        });
        const impact = await previewPlatformLanguageDraft(draft.draft_revision);
        if (!impact.ready_to_publish) throw new Error("SYSTEM_SETTINGS_LANGUAGE_IMPACT_NOT_READY");
        const updated = await publishPlatformLanguageDraft({
          expected_revision: settings.revision,
          idempotency_key: globalThis.crypto.randomUUID(),
          draft_revision: draft.draft_revision,
        });
        applyPlatformLanguageCatalog(updated.languages);
        setSettings(updated);
        setIsEditing(false);
      } catch {
        setSaveError(t("SYSTEM_SETTINGS_SAVE_ERROR"));
      } finally {
        setIsSaving(false);
      }
    },
    [settings, t],
  );

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
      <PageHeader
        description={t("SYSTEM_SETTINGS_DESCRIPTION")}
        extra={
          hasError ? (
            <p className="text-sm text-destructive">{t("SYSTEM_SETTINGS_LOAD_ERROR")}</p>
          ) : null
        }
        primaryAction={
          <Button
            disabled={!settings || isLoading}
            onClick={() => {
              if (section === "all") {
                setGenericSectionId(settings?.sections?.find((item) => item.editable)?.id ?? null);
              }
              setIsEditing(true);
            }}
          >
            {t("SYSTEM_SETTINGS_EDIT_SECTION")}
          </Button>
        }
        secondaryActions={
          <Button disabled={isLoading} onClick={() => void loadSettings()} variant="outline">
            {isLoading ? t("LOADING") : t("REFRESH")}
          </Button>
        }
        title={t("SYSTEM_SETTINGS_TITLE")}
      />
      <div className="grid min-h-[520px] gap-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <nav aria-label={t("SYSTEM_SETTINGS_SECTIONS")} className="space-y-1">
          {SECTIONS.map((item) => (
            <Button
              className="w-full justify-start"
              key={item}
              onClick={() => setSection(item)}
              variant={section === item ? "secondary" : "ghost"}
            >
              {t(`SYSTEM_SETTINGS_SECTION_${item.toUpperCase()}`)}
            </Button>
          ))}
        </nav>
        <section
          className="min-w-0 rounded-lg border bg-card p-5"
          aria-labelledby="system-settings-panel-title"
        >
          <h2 className="text-lg font-semibold" id="system-settings-panel-title">
            {t(`SYSTEM_SETTINGS_SECTION_${section.toUpperCase()}`)}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(`SYSTEM_SETTINGS_SECTION_${section.toUpperCase()}_DESCRIPTION`)}
          </p>
          <Separator className="my-5" />
          {isLoading && settings === null ? (
            <p className="text-sm text-muted-foreground">{t("SYSTEM_SETTINGS_LOADING")}</p>
          ) : null}
          {!isLoading && settings === null ? (
            <Button onClick={() => void loadSettings()} variant="outline">
              {t("TRY_AGAIN")}
            </Button>
          ) : null}
          {settings && section === "all" ? (
            <GlobalConfigurationPanel
              onSelect={(sectionId) => {
                setGenericSectionId(sectionId);
                setIsEditing(true);
              }}
              settings={settings}
              t={t}
            />
          ) : null}
          {settings && section === "identity" ? <IdentityPanel settings={settings} t={t} /> : null}
          {settings && section === "domains" ? <DomainsPanel settings={settings} t={t} /> : null}
          {settings && section === "languages" ? (
            <LanguageCatalogPanel settings={settings} t={t} />
          ) : null}
          {settings && section === "regional" ? <RegionalPanel settings={settings} t={t} /> : null}
          {settings && section === "seo" ? <SeoPanel settings={settings} t={t} /> : null}
        </section>
      </div>
      {settings && section === "languages" ? (
        <LanguageCatalogEditDialog
          isSaving={isSaving}
          onOpenChange={(open) => {
            setIsEditing(open);
            if (!open) setSaveError(null);
          }}
          onSave={saveLanguageCatalog}
          open={isEditing}
          saveError={saveError}
          settings={settings}
          t={t}
        />
      ) : null}
      {settings && section !== "languages" ? (
        section === "all" ? (
          <GlobalConfigurationEditDialog
            isSaving={isSaving}
            onOpenChange={(open) => {
              setIsEditing(open);
              if (!open) setSaveError(null);
            }}
            onSave={saveGenericSection}
            open={isEditing}
            saveError={saveError}
            sectionId={genericSectionId}
            settings={settings}
            t={t}
          />
        ) : (
          <SystemSettingsEditDialog
            isSaving={isSaving}
            onOpenChange={(open) => {
              setIsEditing(open);
              if (!open) setSaveError(null);
            }}
            onSave={saveSection}
            open={isEditing}
            saveError={saveError}
            section={section}
            settings={settings}
            t={t}
          />
        )
      ) : null}
    </div>
  );
}

type Translator = (key: string, options?: Record<string, unknown>) => string;

type PanelProps = Readonly<{ settings: PlatformSystemSettings; t: Translator }>;

function Field(
  props: Readonly<{
    label: string;
    placeholder: string;
    description?: string;
    value?: string | null;
  }>,
) {
  return (
    <label className="grid gap-2 text-sm">
      <span className="font-medium">{props.label}</span>
      <Input disabled placeholder={props.placeholder} value={props.value ?? ""} />
      <span className="text-sm text-muted-foreground">{props.description}</span>
    </label>
  );
}

function GlobalConfigurationPanel(
  props: PanelProps & Readonly<{ onSelect: (sectionId: string) => void }>,
) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {(props.settings.sections ?? []).map((item) => (
        <Card
          aria-disabled={!item.editable}
          className={item.editable ? "cursor-pointer transition-colors hover:bg-muted/40" : ""}
          key={item.id}
          onClick={() => item.editable && props.onSelect(item.id)}
          onKeyDown={(event) => {
            if (item.editable && (event.key === "Enter" || event.key === " ")) {
              event.preventDefault();
              props.onSelect(item.id);
            }
          }}
          role={item.editable ? "button" : undefined}
          tabIndex={item.editable ? 0 : undefined}
        >
          <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
            <CardTitle className="text-base">{item.title}</CardTitle>
            <Badge variant="outline">
              {item.editable ? props.t("SYSTEM_SETTINGS_GLOBAL_CONFIG") : props.t("READ_ONLY")}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-1 text-sm text-muted-foreground">
            <p>{props.t("SYSTEM_SETTINGS_FIELDS_COUNT", { count: item.fields.length })}</p>
            {item.secret_keys.length > 0 ? (
              <p>
                {props.t("SYSTEM_SETTINGS_SECRET_FIELDS_COUNT", {
                  count: item.secret_keys.length,
                })}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function GlobalConfigurationEditDialog(
  props: Readonly<{
    settings: PlatformSystemSettings;
    sectionId: string | null;
    open: boolean;
    isSaving: boolean;
    saveError: string | null;
    onOpenChange: (open: boolean) => void;
    onSave: (section: string, values: Record<string, unknown>) => Promise<void>;
    t: Translator;
  }>,
) {
  const [selectedId, setSelectedId] = useState<string | null>(props.sectionId);
  const [values, setValues] = useState("{}");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const sections = (props.settings.sections ?? []).filter((item) => item.editable);
  const selected = sections.find((item) => item.id === selectedId) ?? null;
  useEffect(() => {
    setSelectedId(props.sectionId);
    setValues(selected ? JSON.stringify(selected.values, null, 2) : "{}");
    setJsonError(null);
  }, [props.sectionId, selected]);

  const submit = async () => {
    if (!selected) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(values) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
        throw new Error("invalid");
    } catch {
      setJsonError(props.t("SYSTEM_SETTINGS_GLOBAL_CONFIG_JSON_ERROR"));
      return;
    }
    setJsonError(null);
    await props.onSave(selected.id, parsed as Record<string, unknown>);
  };

  return (
    <SettingDialog
      description={props.t("SYSTEM_SETTINGS_GLOBAL_CONFIG_DESCRIPTION")}
      footer={
        <>
          <Button
            disabled={props.isSaving}
            onClick={() => props.onOpenChange(false)}
            variant="outline"
          >
            {props.t("CANCEL")}
          </Button>
          <Button disabled={props.isSaving || !selected} onClick={() => void submit()}>
            {props.isSaving ? props.t("SAVING") : props.t("SAVE")}
          </Button>
        </>
      }
      onOpenChange={(open) => !props.isSaving && props.onOpenChange(open)}
      open={props.open}
      title={props.t("SYSTEM_SETTINGS_EDIT_GLOBAL_CONFIG")}
    >
      {props.saveError ? <p className="text-sm text-destructive">{props.saveError}</p> : null}
      <div className="space-y-3">
        <Label>{props.t("SYSTEM_SETTINGS_GLOBAL_CONFIG_SECTION")}</Label>
        <Select
          onValueChange={(value) => {
            setSelectedId(value);
            const next = sections.find((item) => item.id === value);
            setValues(next ? JSON.stringify(next.values, null, 2) : "{}");
            setJsonError(null);
          }}
          value={selected?.id ?? undefined}
        >
          <SelectTrigger>
            <SelectValue
              placeholder={props.t("SYSTEM_SETTINGS_GLOBAL_CONFIG_SECTION_PLACEHOLDER")}
            />
          </SelectTrigger>
          <SelectContent>
            {sections.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Textarea
          onChange={(event) => setValues(event.target.value)}
          placeholder={props.t("SYSTEM_SETTINGS_GLOBAL_CONFIG_PLACEHOLDER")}
          rows={16}
          value={values}
        />
        {jsonError ? <p className="text-sm text-destructive">{jsonError}</p> : null}
        {selected?.secret_keys.length ? (
          <p className="text-xs text-muted-foreground">
            {props.t("SYSTEM_SETTINGS_SECRET_FIELDS_READONLY", {
              fields: selected.secret_keys.join(", "),
            })}
          </p>
        ) : null}
      </div>
    </SettingDialog>
  );
}

function IdentityPanel({ settings, t }: PanelProps) {
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <Field
        label={t("SYSTEM_SETTINGS_INSTANCE_NAME")}
        placeholder={t("SYSTEM_SETTINGS_INSTANCE_NAME_PLACEHOLDER")}
        value={settings.identity.instance_name}
      />
      <Field
        label={t("SYSTEM_SETTINGS_CONTACT_EMAIL")}
        placeholder={t("SYSTEM_SETTINGS_CONTACT_EMAIL_PLACEHOLDER")}
        value={settings.identity.contact_email}
      />
      <Field
        label={t("SYSTEM_SETTINGS_INSTANCE_DESCRIPTION")}
        placeholder={t("SYSTEM_SETTINGS_INSTANCE_DESCRIPTION_PLACEHOLDER")}
        description={t("SYSTEM_SETTINGS_DESCRIPTION_PLACEHOLDER")}
        value={settings.identity.description}
      />
      <Field
        label={t("SYSTEM_SETTINGS_LOGO")}
        placeholder={t("SYSTEM_SETTINGS_LOGO_PLACEHOLDER")}
        value={settings.identity.logo_url ?? settings.identity.favicon_url}
      />
    </div>
  );
}

function DomainsPanel({ settings, t }: PanelProps) {
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <Field
        label={t("SYSTEM_SETTINGS_PRIMARY_DOMAIN")}
        placeholder={t("SYSTEM_SETTINGS_PRIMARY_DOMAIN_PLACEHOLDER")}
        value={settings.domains.primary_domain}
      />
      <Field
        label={t("SYSTEM_SETTINGS_CONSOLE_DOMAIN")}
        placeholder={t("SYSTEM_SETTINGS_CONSOLE_DOMAIN_PLACEHOLDER")}
        value={settings.domains.console_domain}
      />
      <Field
        label={t("SYSTEM_SETTINGS_RESERVED_LABELS")}
        placeholder={t("SYSTEM_SETTINGS_RESERVED_LABELS_PLACEHOLDER")}
        value={settings.domains.reserved_labels.join(", ")}
      />
    </div>
  );
}

function LanguageCatalogPanel({ settings, t }: PanelProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-medium">{t("SYSTEM_SETTINGS_LANGUAGE_CATALOG_TITLE")}</p>
          <p className="text-sm text-muted-foreground">
            {t("SYSTEM_SETTINGS_LANGUAGE_CATALOG_DESCRIPTION")}
          </p>
        </div>
        <Badge variant="secondary">{t("SYSTEM_SETTINGS_PLATFORM_ONLY")}</Badge>
      </div>
      <div className="overflow-hidden rounded-lg border">
        <div className="grid grid-cols-[auto_1fr_auto] gap-3 border-b px-4 py-3 text-sm font-medium">
          <span>{t("SYSTEM_SETTINGS_FLAG")}</span>
          <span>{t("SYSTEM_SETTINGS_LANGUAGE")}</span>
          <span>{t("SYSTEM_SETTINGS_STATE")}</span>
        </div>
        {settings.languages.map((language) => (
          <div
            className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-t px-4 py-4 first:border-t-0"
            key={language.locale}
          >
            <span
              aria-label={
                language.flag_code === "cn"
                  ? t("SYSTEM_SETTINGS_CHINA_FLAG")
                  : t("SYSTEM_SETTINGS_UNITED_STATES_FLAG")
              }
              className={`fi fi-${language.flag_code} rounded-sm shadow-sm ring-1 ring-border`}
              role="img"
            />
            <span>
              <span className="block font-medium">{language.language_name}</span>
              <span className="text-sm text-muted-foreground">
                {language.locale} · {language.native_name}
              </span>
            </span>
            <Badge variant={language.is_default ? "secondary" : "outline"}>
              {language.is_default
                ? t("SYSTEM_SETTINGS_DEFAULT")
                : language.enabled
                  ? t("SYSTEM_SETTINGS_ENABLED")
                  : t("SYSTEM_SETTINGS_DISABLED")}
            </Badge>
          </div>
        ))}
      </div>
    </div>
  );
}

function RegionalPanel({ settings, t }: PanelProps) {
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <Field
        label={t("SYSTEM_SETTINGS_TIMEZONE")}
        placeholder={t("SYSTEM_SETTINGS_TIMEZONE_PLACEHOLDER")}
        value={settings.regional.timezone}
      />
      <Field
        label={t("SYSTEM_SETTINGS_DATE_FORMAT")}
        placeholder={t("SYSTEM_SETTINGS_DATE_FORMAT_PLACEHOLDER")}
        value={settings.regional.date_format}
      />
      <Field
        label={t("SYSTEM_SETTINGS_NUMBER_FORMAT")}
        placeholder={t("SYSTEM_SETTINGS_NUMBER_FORMAT_PLACEHOLDER")}
        value={settings.regional.number_format}
      />
    </div>
  );
}

function SeoPanel({ settings, t }: PanelProps) {
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <Field
        label={t("SYSTEM_SETTINGS_SITE_TITLE")}
        placeholder={t("SYSTEM_SETTINGS_SITE_TITLE_PLACEHOLDER")}
        value={settings.site_metadata.default_title}
      />
      <Field
        label={t("SYSTEM_SETTINGS_TITLE_POLICY")}
        placeholder={t("SYSTEM_SETTINGS_TITLE_POLICY_PLACEHOLDER")}
        value={settings.site_metadata.title_format}
      />
      <Field
        label={t("SYSTEM_SETTINGS_DEFAULT_DESCRIPTION")}
        placeholder={t("SYSTEM_SETTINGS_DEFAULT_DESCRIPTION_PLACEHOLDER")}
        value={settings.site_metadata.default_description}
      />
    </div>
  );
}

type EditableSection = Exclude<Section, "languages">;

function SystemSettingsEditDialog(
  props: Readonly<{
    open: boolean;
    section: EditableSection;
    settings: PlatformSystemSettings;
    isSaving: boolean;
    saveError: string | null;
    onOpenChange: (open: boolean) => void;
    onSave: (values: Record<string, unknown>) => Promise<void>;
    t: Translator;
  }>,
) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    editorValues(props.section, props.settings),
  );

  useEffect(() => {
    if (props.open) setValues(editorValues(props.section, props.settings));
  }, [props.open, props.section, props.settings]);

  const setValue = (key: string, value: string) =>
    setValues((current) => ({ ...current, [key]: value }));

  return (
    <SettingDialog
      description={props.t(`SYSTEM_SETTINGS_SECTION_${props.section.toUpperCase()}_DESCRIPTION`)}
      footer={
        <>
          <Button
            disabled={props.isSaving}
            onClick={() => props.onOpenChange(false)}
            variant="outline"
          >
            {props.t("CANCEL")}
          </Button>
          <Button
            disabled={props.isSaving}
            onClick={() => void props.onSave(editorPayload(props.section, values))}
          >
            {props.isSaving ? props.t("SAVING") : props.t("SAVE")}
          </Button>
        </>
      }
      onOpenChange={props.onOpenChange}
      open={props.open}
      title={props.t("SYSTEM_SETTINGS_EDIT_SECTION")}
    >
      <div className="grid gap-5 sm:grid-cols-2">
        {editorFields(props.section, props.t).map((field) => (
          <div
            className={field.multiline ? "grid gap-2 sm:col-span-2" : "grid gap-2"}
            key={field.key}
          >
            <Label htmlFor={`system-settings-${field.key}`}>{field.label}</Label>
            {field.multiline ? (
              <Textarea
                id={`system-settings-${field.key}`}
                onChange={(event) => setValue(field.key, event.target.value)}
                placeholder={field.placeholder}
                value={values[field.key] ?? ""}
              />
            ) : (
              <Input
                id={`system-settings-${field.key}`}
                onChange={(event) => setValue(field.key, event.target.value)}
                placeholder={field.placeholder}
                value={values[field.key] ?? ""}
              />
            )}
          </div>
        ))}
      </div>
      {props.saveError ? <p className="mt-4 text-sm text-destructive">{props.saveError}</p> : null}
    </SettingDialog>
  );
}

function editorValues(
  section: EditableSection,
  settings: PlatformSystemSettings,
): Record<string, string> {
  if (section === "identity") {
    return {
      instance_name: settings.identity.instance_name,
      description: settings.identity.description ?? "",
      contact_email: settings.identity.contact_email ?? "",
      logo_url: settings.identity.logo_url ?? "",
      favicon_url: settings.identity.favicon_url ?? "",
    };
  }
  if (section === "domains") {
    const suffix = `.${settings.domains.primary_domain}`;
    return {
      primary_domain: settings.domains.primary_domain,
      console_subdomain: settings.domains.console_domain.endsWith(suffix)
        ? settings.domains.console_domain.slice(0, -suffix.length)
        : settings.domains.console_domain,
      reserved_labels: settings.domains.reserved_labels.join(", "),
    };
  }
  if (section === "regional") {
    return {
      timezone: settings.regional.timezone,
      date_format: settings.regional.date_format,
      number_format: settings.regional.number_format,
    };
  }
  return {
    default_title: settings.site_metadata.default_title ?? "",
    title_format: settings.site_metadata.title_format,
    default_description: settings.site_metadata.default_description ?? "",
  };
}

function editorPayload(
  section: EditableSection,
  values: Record<string, string>,
): Record<string, unknown> {
  if (section === "domains") {
    return {
      ...values,
      reserved_labels: values.reserved_labels
        ?.split(",")
        .map((label) => label.trim())
        .filter(Boolean),
    };
  }
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, value.trim() === "" ? null : value.trim()]),
  );
}

type EditorField = Readonly<{
  key: string;
  label: string;
  placeholder: string;
  multiline?: boolean;
}>;

function editorFields(section: EditableSection, t: Translator): readonly EditorField[] {
  if (section === "identity") {
    return [
      {
        key: "instance_name",
        label: t("SYSTEM_SETTINGS_INSTANCE_NAME"),
        placeholder: t("SYSTEM_SETTINGS_INSTANCE_NAME_PLACEHOLDER"),
      },
      {
        key: "contact_email",
        label: t("SYSTEM_SETTINGS_CONTACT_EMAIL"),
        placeholder: t("SYSTEM_SETTINGS_CONTACT_EMAIL_PLACEHOLDER"),
      },
      {
        key: "description",
        label: t("SYSTEM_SETTINGS_INSTANCE_DESCRIPTION"),
        placeholder: t("SYSTEM_SETTINGS_INSTANCE_DESCRIPTION_PLACEHOLDER"),
        multiline: true,
      },
      {
        key: "logo_url",
        label: t("SYSTEM_SETTINGS_LOGO_URL"),
        placeholder: t("SYSTEM_SETTINGS_LOGO_URL_PLACEHOLDER"),
      },
      {
        key: "favicon_url",
        label: t("SYSTEM_SETTINGS_FAVICON_URL"),
        placeholder: t("SYSTEM_SETTINGS_FAVICON_URL_PLACEHOLDER"),
      },
    ];
  }
  if (section === "domains") {
    return [
      {
        key: "primary_domain",
        label: t("SYSTEM_SETTINGS_PRIMARY_DOMAIN"),
        placeholder: t("SYSTEM_SETTINGS_PRIMARY_DOMAIN_PLACEHOLDER"),
      },
      {
        key: "console_subdomain",
        label: t("SYSTEM_SETTINGS_CONSOLE_SUBDOMAIN"),
        placeholder: t("SYSTEM_SETTINGS_CONSOLE_SUBDOMAIN_PLACEHOLDER"),
      },
      {
        key: "reserved_labels",
        label: t("SYSTEM_SETTINGS_RESERVED_LABELS"),
        placeholder: t("SYSTEM_SETTINGS_RESERVED_LABELS_PLACEHOLDER"),
        multiline: true,
      },
    ];
  }
  if (section === "regional") {
    return [
      {
        key: "timezone",
        label: t("SYSTEM_SETTINGS_TIMEZONE"),
        placeholder: t("SYSTEM_SETTINGS_TIMEZONE_PLACEHOLDER"),
      },
      {
        key: "date_format",
        label: t("SYSTEM_SETTINGS_DATE_FORMAT"),
        placeholder: t("SYSTEM_SETTINGS_DATE_FORMAT_PLACEHOLDER"),
      },
      {
        key: "number_format",
        label: t("SYSTEM_SETTINGS_NUMBER_FORMAT"),
        placeholder: t("SYSTEM_SETTINGS_NUMBER_FORMAT_PLACEHOLDER"),
      },
    ];
  }
  return [
    {
      key: "default_title",
      label: t("SYSTEM_SETTINGS_SITE_TITLE"),
      placeholder: t("SYSTEM_SETTINGS_SITE_TITLE_PLACEHOLDER"),
    },
    {
      key: "title_format",
      label: t("SYSTEM_SETTINGS_TITLE_POLICY"),
      placeholder: t("SYSTEM_SETTINGS_TITLE_POLICY_PLACEHOLDER"),
    },
    {
      key: "default_description",
      label: t("SYSTEM_SETTINGS_DEFAULT_DESCRIPTION"),
      placeholder: t("SYSTEM_SETTINGS_DEFAULT_DESCRIPTION_PLACEHOLDER"),
      multiline: true,
    },
  ];
}

function LanguageCatalogEditDialog(
  props: Readonly<{
    open: boolean;
    settings: PlatformSystemSettings;
    isSaving: boolean;
    saveError: string | null;
    onOpenChange: (open: boolean) => void;
    onSave: (enabledLocales: readonly string[], defaultLocale: string) => Promise<void>;
    t: Translator;
  }>,
) {
  const [enabledLocales, setEnabledLocales] = useState<string[]>(() =>
    props.settings.languages
      .filter((language) => language.enabled)
      .map((language) => language.locale),
  );
  const [defaultLocale, setDefaultLocale] = useState(
    () => props.settings.languages.find((language) => language.is_default)?.locale ?? "zh-CN",
  );

  useEffect(() => {
    if (!props.open) return;
    setEnabledLocales(
      props.settings.languages
        .filter((language) => language.enabled)
        .map((language) => language.locale),
    );
    setDefaultLocale(
      props.settings.languages.find((language) => language.is_default)?.locale ?? "zh-CN",
    );
  }, [props.open, props.settings]);

  const toggleLocale = (locale: string, checked: boolean) => {
    if (!checked && locale === defaultLocale) return;
    setEnabledLocales((current) =>
      checked ? [...new Set([...current, locale])] : current.filter((item) => item !== locale),
    );
  };

  return (
    <SettingDialog
      description={props.t("SYSTEM_SETTINGS_LANGUAGE_EDIT_DESCRIPTION")}
      footer={
        <>
          <Button
            disabled={props.isSaving}
            onClick={() => props.onOpenChange(false)}
            variant="outline"
          >
            {props.t("CANCEL")}
          </Button>
          <Button
            disabled={
              props.isSaving ||
              enabledLocales.length === 0 ||
              !enabledLocales.includes(defaultLocale)
            }
            onClick={() => void props.onSave(enabledLocales, defaultLocale)}
          >
            {props.isSaving ? props.t("SAVING") : props.t("SYSTEM_SETTINGS_PUBLISH_LANGUAGE")}
          </Button>
        </>
      }
      onOpenChange={props.onOpenChange}
      open={props.open}
      title={props.t("SYSTEM_SETTINGS_EDIT_LANGUAGES")}
    >
      <div className="grid gap-5">
        <div className="grid gap-3">
          <p className="text-sm font-medium">{props.t("SYSTEM_SETTINGS_ENABLED_LANGUAGES")}</p>
          {props.settings.languages.map((language) => (
            <label className="flex items-center gap-3 rounded-md border p-3" key={language.locale}>
              <Checkbox
                checked={enabledLocales.includes(language.locale)}
                disabled={language.locale === defaultLocale}
                onCheckedChange={(checked) => toggleLocale(language.locale, checked === true)}
              />
              <span className="flex items-center gap-2 text-sm">
                <span
                  aria-label={
                    language.flag_code === "cn"
                      ? props.t("SYSTEM_SETTINGS_CHINA_FLAG")
                      : props.t("SYSTEM_SETTINGS_UNITED_STATES_FLAG")
                  }
                  className={`fi fi-${language.flag_code} rounded-sm ring-1 ring-border`}
                  role="img"
                />
                {language.language_name} · {language.locale}
              </span>
            </label>
          ))}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="system-settings-default-locale">
            {props.t("SYSTEM_SETTINGS_DEFAULT_LANGUAGE")}
          </Label>
          <Select value={defaultLocale} onValueChange={setDefaultLocale}>
            <SelectTrigger id="system-settings-default-locale">
              <SelectValue placeholder={props.t("SYSTEM_SETTINGS_DEFAULT_LANGUAGE_PLACEHOLDER")} />
            </SelectTrigger>
            <SelectContent>
              {props.settings.languages
                .filter((language) => enabledLocales.includes(language.locale))
                .map((language) => (
                  <SelectItem key={language.locale} value={language.locale}>
                    {language.language_name} · {language.locale}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {props.saveError ? <p className="mt-4 text-sm text-destructive">{props.saveError}</p> : null}
    </SettingDialog>
  );
}
