import { useTranslation } from "react-i18next";

import { FieldError } from "@arclayer/ui/field";
import { Input } from "@arclayer/ui/input";
import { Button } from "@arclayer/ui/button";

import { SystemSettingField, SystemSettingFooterActions } from "@/components/settings/setting-item";
import type {
  GeneralSettingsFormValues,
  GeneralSettingsTabBaseProps,
} from "@/types/settings-general";
import { LocalizedSiteFieldEditor } from "./localized-site-field-editor";
import { SiteSettingsPreviewRail } from "./site-settings-preview-rail";

const TAGLINE_MAX_LENGTH = 200;

type LocalizedToggleHandler = (
  enabledName: "siteNameI18nEnabled" | "siteDescriptionI18nEnabled",
  dictName: "siteNameI18n" | "siteDescriptionI18n",
  rawName: "siteName" | "siteDescription",
  checked: boolean,
) => void;

type SiteIdentitySettingsSectionProps = {
  dirty: boolean;
  disabled: boolean;
  effectiveDescription: string;
  effectiveSiteName: string;
  errors: {
    contactEmail: string | null;
    description: string | null;
    name: string | null;
    subtitle: string | null;
  };
  form: GeneralSettingsTabBaseProps["form"];
  pending: boolean;
  projectId: string | null;
  publicUrl: string;
  supportedLocales: string[];
  values: GeneralSettingsFormValues;
  onLocalizedToggle: LocalizedToggleHandler;
  onReset: () => void;
  onSave: () => void;
};

function FieldMessage({ message }: { message: string | null }) {
  if (!message) return null;
  return <FieldError>{message}</FieldError>;
}

export function SiteIdentitySettingsSection(props: SiteIdentitySettingsSectionProps) {
  const { t } = useTranslation(["settings"]);

  return (
    <section id="website-identity" className="grid gap-6">
      <header>
        <h2 className="text-title2 font-semibold text-label-primary">
          {t("settings:SETTINGS_SITE_BASICS_IDENTITY_PANEL_TITLE")}
        </h2>
        <p className="mt-1 max-w-2xl text-body text-label-secondary">
          {t("settings:SETTINGS_SITE_BASICS_IDENTITY_PANEL_DESC")}
        </p>
      </header>

      <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,26rem)]">
        <div className="min-w-0">
          <div className="grid gap-5">
            <SystemSettingField
              label={t("settings:SETTINGS_SITE_NAME_LABEL")}
              description={t("settings:SETTINGS_SITE_NAME_DESC")}
              labelControls={false}
            >
              <LocalizedSiteFieldEditor
                defaultLocale={props.values.defaultLocale}
                dictName="siteNameI18n"
                disabled={props.disabled}
                enabled={props.values.siteNameI18nEnabled}
                enabledLabel={t("settings:SETTINGS_SITE_NAME_LOCALIZED_TITLE")}
                enabledDescription={t("settings:SETTINGS_SITE_NAME_LOCALIZED_DESC")}
                error={props.errors.name}
                form={props.form}
                inputName="siteName"
                placeholder={t("settings:SETTINGS_SITE_NAME_PLACEHOLDER")}
                rawValue={props.values.siteName}
                supportedLocales={props.supportedLocales}
                onToggle={(checked) =>
                  props.onLocalizedToggle(
                    "siteNameI18nEnabled",
                    "siteNameI18n",
                    "siteName",
                    checked,
                  )
                }
              />
            </SystemSettingField>

            <SystemSettingField
              label={t("settings:SETTINGS_SITE_SUBTITLE_LABEL")}
              description={t("settings:SETTINGS_SITE_SUBTITLE_DESC")}
              message={
                <div className="flex items-center justify-between gap-3 text-caption text-label-secondary">
                  <FieldMessage message={props.errors.subtitle} />
                  <span>
                    {props.values.siteSubtitle.length}/{TAGLINE_MAX_LENGTH}
                  </span>
                </div>
              }
            >
              <Input
                id="site-subtitle-input"
                {...props.form.register("siteSubtitle")}
                maxLength={TAGLINE_MAX_LENGTH}
                placeholder={t("settings:SETTINGS_SITE_SUBTITLE_PLACEHOLDER")}
                aria-invalid={Boolean(props.errors.subtitle)}
                autoComplete="off"
                disabled={props.disabled}
              />
            </SystemSettingField>

            <SystemSettingField
              label={t("settings:SETTINGS_SITE_DESCRIPTION_LABEL")}
              description={t("settings:SETTINGS_SITE_DESCRIPTION_DESC")}
              labelControls={false}
            >
              <LocalizedSiteFieldEditor
                defaultLocale={props.values.defaultLocale}
                dictName="siteDescriptionI18n"
                disabled={props.disabled}
                enabled={props.values.siteDescriptionI18nEnabled}
                enabledLabel={t("settings:SETTINGS_SITE_DESCRIPTION_LOCALIZED_TITLE")}
                enabledDescription={t("settings:SETTINGS_SITE_DESCRIPTION_LOCALIZED_DESC")}
                error={props.errors.description}
                form={props.form}
                inputName="siteDescription"
                multiline
                placeholder={t("settings:SETTINGS_SITE_DESCRIPTION_PLACEHOLDER")}
                rawValue={props.values.siteDescription}
                supportedLocales={props.supportedLocales}
                onToggle={(checked) =>
                  props.onLocalizedToggle(
                    "siteDescriptionI18nEnabled",
                    "siteDescriptionI18n",
                    "siteDescription",
                    checked,
                  )
                }
              />
            </SystemSettingField>

            <SystemSettingField
              label={t("settings:SETTINGS_SITE_PUBLIC_URL_LABEL")}
              description={t("settings:SETTINGS_SITE_PUBLIC_URL_DESC")}
            >
              <div
                className="flex min-h-11 flex-col gap-3 rounded-lg border border-border bg-muted/20 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                data-testid="website-resolved-public-url"
              >
                <span className="min-w-0 truncate font-mono text-footnote text-label-primary">
                  {props.publicUrl || t("settings:SETTINGS_SITE_PREVIEW_ADDRESS_UNAVAILABLE")}
                </span>
                {props.projectId ? (
                  <Button type="button" variant="outline" size="sm" asChild>
                    <a href={`/projects/${encodeURIComponent(props.projectId)}/website/domain`}>
                      {t("settings:SETTINGS_SITE_PUBLIC_URL_MANAGE_DOMAINS")}
                    </a>
                  </Button>
                ) : null}
              </div>
            </SystemSettingField>

            <SystemSettingField
              label={t("settings:SETTINGS_SITE_CONTACT_EMAIL_LABEL")}
              description={t("settings:SETTINGS_SITE_CONTACT_EMAIL_DESC")}
              message={<FieldMessage message={props.errors.contactEmail} />}
            >
              <Input
                id="site-contact-email-input"
                {...props.form.register("siteContactEmail")}
                type="email"
                inputMode="email"
                spellCheck={false}
                placeholder={t("settings:SETTINGS_SITE_CONTACT_EMAIL_PLACEHOLDER")}
                aria-invalid={Boolean(props.errors.contactEmail)}
                autoComplete="off"
                disabled={props.disabled}
              />
            </SystemSettingField>
          </div>

          <div className="mt-6 border-t border-border pt-4">
            <SystemSettingFooterActions
              dirty={props.dirty}
              pending={props.pending}
              onReset={props.onReset}
              onSave={props.onSave}
            />
          </div>
        </div>

        <SiteSettingsPreviewRail
          mode="identity"
          title={props.effectiveSiteName}
          siteName={props.effectiveSiteName}
          siteSubtitle={props.values.siteSubtitle}
          description={props.effectiveDescription}
          publicUrl={props.publicUrl}
          siteContactEmail={props.values.siteContactEmail}
          logoUrl={props.values.siteLogoUrl}
          faviconUrl={props.values.siteFaviconUrl}
          socialImageUrl={props.values.seoOgImageUrl}
          indexingAllowed={props.values.seoIndexingEnabled}
        />
      </div>
    </section>
  );
}
