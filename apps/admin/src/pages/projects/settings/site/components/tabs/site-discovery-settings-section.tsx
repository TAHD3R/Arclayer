import { Controller } from "react-hook-form";
import { useTranslation } from "react-i18next";

import { Field, FieldError, FieldGroup } from "@arclayer/ui/field";

import { SettingSwitchBlock } from "@/components/settings/setting-switch-block";
import {
  SystemSettingField,
  SystemSettingFooterActions,
} from "@/pages/system/components/system-setting-item";
import type {
  GeneralSettingsFormValues,
  GeneralSettingsTabBaseProps,
} from "@/types/settings-general";
import { SiteBrandAssetSettingRow } from "./site-brand-asset-accordion-item";
import { SiteSettingsPreviewRail } from "./site-settings-preview-rail";
import { SiteTitlePatternField } from "./site-title-pattern-field";

type SiteDiscoverySettingsSectionProps = {
  assetProjectId: string | null;
  dirty: boolean;
  disabled: boolean;
  effectiveDescription: string;
  effectiveSiteName: string;
  form: GeneralSettingsTabBaseProps["form"];
  initialValues: GeneralSettingsFormValues;
  pending: boolean;
  publicUrl: string;
  savingKey: string | null;
  searchPreviewTitle: string;
  titlePolicyError: string | null;
  values: GeneralSettingsFormValues;
  withSavingKey: GeneralSettingsTabBaseProps["withSavingKey"];
  patch: GeneralSettingsTabBaseProps["patch"];
  onReset: () => void;
  onSave: () => void;
};

function FieldMessage({ message }: { message: string | null }) {
  if (!message) return null;
  return <FieldError>{message}</FieldError>;
}

export function SiteDiscoverySettingsSection(props: SiteDiscoverySettingsSectionProps) {
  const { t } = useTranslation(["settings"]);

  return (
    <section id="website-browser" className="grid gap-6">
      <header>
        <h2 className="text-title2 font-semibold text-label-primary">
          {t("settings:SETTINGS_SITE_BASICS_BROWSER_PANEL_TITLE")}
        </h2>
        <p className="mt-1 max-w-2xl text-body text-label-secondary">
          {t("settings:SETTINGS_SITE_BASICS_BROWSER_PANEL_DESC")}
        </p>
      </header>

      <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,26rem)]">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-col divide-y divide-border">
            <SiteBrandAssetSettingRow
              assetField="siteLogoAssetId"
              currentAssetId={props.values.siteLogoAssetId}
              currentUrl={props.values.siteLogoUrl}
              description={t("settings:SETTINGS_SITE_LOGO_DESC")}
              disabled={props.disabled}
              fieldKey="site_logo"
              form={props.form}
              initialAssetId={props.initialValues.siteLogoAssetId}
              initialUrl={props.initialValues.siteLogoUrl}
              patch={props.patch}
              patchField="logo"
              removeAriaLabel={t("settings:SETTINGS_ASSET_PICKER_CLEAR")}
              resetKey="reset:siteLogoUrl"
              saveKey="siteLogoUrl"
              savingKey={props.savingKey}
              title={t("settings:SETTINGS_SITE_LOGO_LABEL")}
              uploadAriaLabel={t("settings:SETTINGS_ASSET_PICKER_SELECT")}
              uploadPurpose="site_logo"
              withSavingKey={props.withSavingKey}
              assetProjectId={props.assetProjectId}
              urlField="siteLogoUrl"
            />
            <SiteBrandAssetSettingRow
              assetField="siteFaviconAssetId"
              currentAssetId={props.values.siteFaviconAssetId}
              currentUrl={props.values.siteFaviconUrl}
              description={t("settings:SETTINGS_SITE_FAVICON_DESC")}
              disabled={props.disabled}
              fieldKey="site_favicon"
              form={props.form}
              initialAssetId={props.initialValues.siteFaviconAssetId}
              initialUrl={props.initialValues.siteFaviconUrl}
              patch={props.patch}
              patchField="favicon"
              removeAriaLabel={t("settings:SETTINGS_ASSET_PICKER_CLEAR")}
              resetKey="reset:siteFaviconUrl"
              saveKey="siteFaviconUrl"
              savingKey={props.savingKey}
              title={t("settings:SETTINGS_SITE_FAVICON_LABEL")}
              uploadAriaLabel={t("settings:SETTINGS_ASSET_PICKER_SELECT")}
              uploadPurpose="favicon"
              withSavingKey={props.withSavingKey}
              assetProjectId={props.assetProjectId}
              urlField="siteFaviconUrl"
            />
            <SiteBrandAssetSettingRow
              assetField="seoOgImageAssetId"
              currentAssetId={props.values.seoOgImageAssetId}
              currentUrl={props.values.seoOgImageUrl}
              description={t("settings:SETTINGS_SITE_OG_IMAGE_DESC")}
              disabled={props.disabled}
              fieldKey="seo_og_image"
              form={props.form}
              initialAssetId={props.initialValues.seoOgImageAssetId}
              initialUrl={props.initialValues.seoOgImageUrl}
              patch={props.patch}
              patchField="og_image"
              patchSection="seo"
              removeAriaLabel={t("settings:SETTINGS_ASSET_PICKER_CLEAR")}
              resetKey="reset:seoOgImageUrl"
              saveKey="seoOgImageUrl"
              savingKey={props.savingKey}
              title={t("settings:SETTINGS_SITE_OG_IMAGE_LABEL")}
              uploadAriaLabel={t("settings:SETTINGS_ASSET_PICKER_SELECT")}
              uploadPurpose="site_logo"
              withSavingKey={props.withSavingKey}
              assetProjectId={props.assetProjectId}
              urlField="seoOgImageUrl"
            />

            <div className="grid gap-4 py-5">
              <Controller
                control={props.form.control}
                name="seoTitlePolicy"
                render={({ field }) => (
                  <SystemSettingField
                    label={t("settings:SETTINGS_SEO_TITLE_FORMAT_TITLE")}
                    description={t("settings:SETTINGS_SEO_TITLE_FORMAT_DESC")}
                    message={<FieldMessage message={props.titlePolicyError} />}
                    labelControls={false}
                  >
                    <SiteTitlePatternField
                      value={field.value}
                      onChange={field.onChange}
                      siteName={props.effectiveSiteName}
                      siteSubtitle={props.values.siteSubtitle}
                      disabled={props.disabled}
                    />
                  </SystemSettingField>
                )}
              />
              <FieldGroup>
                <Controller
                  control={props.form.control}
                  name="seoIndexingEnabled"
                  render={({ field }) => (
                    <Field>
                      <SettingSwitchBlock
                        checked={Boolean(field.value)}
                        disabled={props.disabled}
                        label={t("settings:SETTINGS_SITE_SEARCH_INDEXING_LABEL")}
                        description={t("settings:SETTINGS_SITE_SEARCH_INDEXING_DESC")}
                        onCheckedChange={field.onChange}
                      />
                    </Field>
                  )}
                />
                <Controller
                  control={props.form.control}
                  name="seoSitemapEnabled"
                  render={({ field }) => (
                    <Field>
                      <SettingSwitchBlock
                        checked={Boolean(field.value)}
                        disabled={props.disabled}
                        label={t("settings:SETTINGS_SITE_SITEMAP_LABEL")}
                        description={t("settings:SETTINGS_SITE_SITEMAP_DESC")}
                        onCheckedChange={field.onChange}
                      />
                    </Field>
                  )}
                />
              </FieldGroup>
            </div>
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
          mode="discovery"
          title={props.searchPreviewTitle}
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
