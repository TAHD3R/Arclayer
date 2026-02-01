import { Button, Form, Input } from "antd";
import type { FormInstance } from "antd";
import { Image } from "antd";
import { useTranslation } from "react-i18next";
import { useMemo, useState } from "react";

import { Accordion } from "@/components/animate-ui/components/radix/accordion";
import { SettingAccordionItem } from "@/components/app/settingAccordionItem";
import { AssetPickerDialog } from "@/components/app/assetPickerDialog";
import { resolvePublicAssetUrlPath } from "@/views/assets/utils/assetUrls";
import { deleteAdminAssetUsageByRef, upsertAdminAssetUsage } from "@/api/asset-usages";
import { useWorkspaceStore } from "@/stores/useWorkspaceStore";

import type { GeneralSettingsTabBaseProps } from "../context";
import type { GeneralSettingsFormValues } from "../types";
import { formatSummaryText, isValidHttpUrlOrAbsolutePath, normalizeOptionalString } from "../utils";

type SiteSettingsTabProps = GeneralSettingsTabBaseProps;

function useSiteField(
  form: FormInstance<GeneralSettingsFormValues>,
  name: keyof GeneralSettingsFormValues,
) {
  return Form.useWatch(name as string, form) as unknown;
}

export function SiteSettingsTab({
  form,
  initialValues,
  disabled,
  savingKey,
  withSavingKey,
  patch,
}: SiteSettingsTabProps) {
  const { t } = useTranslation();
  const workspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const [logoPickerOpen, setLogoPickerOpen] = useState(false);
  const [faviconPickerOpen, setFaviconPickerOpen] = useState(false);

  // useWatch 在字段未挂载（例如折叠未展开）时可能不触发，这里对齐旧实现：fallback 到初始值。
  const siteName = (useSiteField(form, "siteName") as string | undefined) ?? initialValues.siteName;
  const siteSubtitle =
    (useSiteField(form, "siteSubtitle") as string | undefined) ?? initialValues.siteSubtitle;
  const siteDescription =
    (useSiteField(form, "siteDescription") as string | undefined) ?? initialValues.siteDescription;
  const siteUrl = (useSiteField(form, "siteUrl") as string | undefined) ?? initialValues.siteUrl;
  const siteLogoUrl =
    (useSiteField(form, "siteLogoUrl") as string | undefined) ?? initialValues.siteLogoUrl;
  const siteLogoAssetId =
    (useSiteField(form, "siteLogoAssetId") as string | undefined) ?? initialValues.siteLogoAssetId;
  const siteFaviconUrl =
    (useSiteField(form, "siteFaviconUrl") as string | undefined) ?? initialValues.siteFaviconUrl;
  const siteFaviconAssetId =
    (useSiteField(form, "siteFaviconAssetId") as string | undefined) ??
    initialValues.siteFaviconAssetId;
  const siteContactEmail =
    (useSiteField(form, "siteContactEmail") as string | undefined) ??
    initialValues.siteContactEmail;

  const isSiteNameDirty = (siteName || "") !== (initialValues.siteName || "");
  const isSiteSubtitleDirty = (siteSubtitle || "") !== (initialValues.siteSubtitle || "");
  const isSiteDescriptionDirty = (siteDescription || "") !== (initialValues.siteDescription || "");
  const isSiteUrlDirty = (siteUrl || "") !== (initialValues.siteUrl || "");
  const isSiteLogoUrlDirty =
    (siteLogoUrl || "") !== (initialValues.siteLogoUrl || "") ||
    (siteLogoAssetId || "") !== (initialValues.siteLogoAssetId || "");
  const isSiteFaviconUrlDirty =
    (siteFaviconUrl || "") !== (initialValues.siteFaviconUrl || "") ||
    (siteFaviconAssetId || "") !== (initialValues.siteFaviconAssetId || "");
  const isSiteContactEmailDirty =
    (siteContactEmail || "") !== (initialValues.siteContactEmail || "");

  const isResettingSiteName = savingKey === "reset:siteName";
  const isResettingSiteSubtitle = savingKey === "reset:siteSubtitle";
  const isResettingSiteDescription = savingKey === "reset:siteDescription";
  const isResettingSiteUrl = savingKey === "reset:siteUrl";
  const isResettingSiteLogoUrl = savingKey === "reset:siteLogoUrl";
  const isResettingSiteFaviconUrl = savingKey === "reset:siteFaviconUrl";
  const isResettingSiteContactEmail = savingKey === "reset:siteContactEmail";

  const resetSiteName = () =>
    withSavingKey("reset:siteName", async () => {
      form.setFieldValue("siteName", initialValues.siteName);
      await patch({ site: { name: initialValues.siteName } });
    });

  const resetSiteSubtitle = () =>
    withSavingKey("reset:siteSubtitle", async () => {
      form.setFieldValue("siteSubtitle", initialValues.siteSubtitle);
      await patch({
        site: { subtitle: normalizeOptionalString(initialValues.siteSubtitle) },
      });
    });

  const resetSiteDescription = () =>
    withSavingKey("reset:siteDescription", async () => {
      form.setFieldValue("siteDescription", initialValues.siteDescription);
      await patch({
        seo: { default_description: normalizeOptionalString(initialValues.siteDescription) },
      });
    });

  const resetSiteUrl = () =>
    withSavingKey("reset:siteUrl", async () => {
      form.setFieldValue("siteUrl", initialValues.siteUrl);
      await patch({ site: { url: initialValues.siteUrl } });
    });

  const resetSiteLogoUrl = () =>
    withSavingKey("reset:siteLogoUrl", async () => {
      form.setFieldValue("siteLogoUrl", initialValues.siteLogoUrl);
      form.setFieldValue("siteLogoAssetId", initialValues.siteLogoAssetId);
      await patch({
        site: {
          logo_url: normalizeOptionalString(initialValues.siteLogoUrl),
          logo_asset_id: normalizeOptionalString(initialValues.siteLogoAssetId),
        },
      });

      if (initialValues.siteLogoAssetId) {
        if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
        await upsertAdminAssetUsage(String(workspaceId), {
          assetId: initialValues.siteLogoAssetId,
          purpose: "site_logo",
          entityType: "core.settings",
          entityId: "site",
          fieldKey: "site.logo",
        });
      } else {
        if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
        await deleteAdminAssetUsageByRef({
          workspaceId: String(workspaceId),
          entityType: "core.settings",
          entityId: "site",
          fieldKey: "site.logo",
        });
      }
    });

  const resetSiteFaviconUrl = () =>
    withSavingKey("reset:siteFaviconUrl", async () => {
      form.setFieldValue("siteFaviconUrl", initialValues.siteFaviconUrl);
      form.setFieldValue("siteFaviconAssetId", initialValues.siteFaviconAssetId);
      await patch({
        site: {
          favicon_url: normalizeOptionalString(initialValues.siteFaviconUrl),
          favicon_asset_id: normalizeOptionalString(initialValues.siteFaviconAssetId),
        },
      });

      if (initialValues.siteFaviconAssetId) {
        if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
        await upsertAdminAssetUsage(String(workspaceId), {
          assetId: initialValues.siteFaviconAssetId,
          purpose: "favicon",
          entityType: "core.settings",
          entityId: "site",
          fieldKey: "site.favicon",
        });
      } else {
        if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
        await deleteAdminAssetUsageByRef({
          workspaceId: String(workspaceId),
          entityType: "core.settings",
          entityId: "site",
          fieldKey: "site.favicon",
        });
      }
    });

  const resetSiteContactEmail = () =>
    withSavingKey("reset:siteContactEmail", async () => {
      form.setFieldValue("siteContactEmail", initialValues.siteContactEmail);
      await patch({
        site: { contact_email: normalizeOptionalString(initialValues.siteContactEmail) },
      });
    });

  const saveSiteName = () =>
    withSavingKey("siteName", async () => {
      const values = await form.validateFields(["siteName"]);
      await patch({ site: { name: String(values.siteName).trim() } });
    });

  const saveSiteSubtitle = () =>
    withSavingKey("siteSubtitle", async () => {
      const values = await form.validateFields(["siteSubtitle"]);
      await patch({
        site: { subtitle: normalizeOptionalString(values.siteSubtitle) },
      });
    });

  const saveSiteDescription = () =>
    withSavingKey("siteDescription", async () => {
      const values = await form.validateFields(["siteDescription"]);
      await patch({
        seo: { default_description: normalizeOptionalString(values.siteDescription) },
      });
    });

  const saveSiteUrl = () =>
    withSavingKey("siteUrl", async () => {
      const values = await form.validateFields(["siteUrl"]);
      await patch({ site: { url: String(values.siteUrl).trim() } });
    });

  const saveSiteLogoUrl = () =>
    withSavingKey("siteLogoUrl", async () => {
      const values = await form.validateFields(["siteLogoAssetId", "siteLogoUrl"]);
      const assetId = normalizeOptionalString(values.siteLogoAssetId);
      // 兼容旧字段：当选择了资源库资产时，同时写入 logo_url=/assets/<id>，避免历史消费方只读 url。
      const url = assetId ? `/assets/${assetId}` : normalizeOptionalString(values.siteLogoUrl);

      await patch({
        site: { logo_asset_id: assetId, logo_url: url },
      });

      if (assetId) {
        if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
        await upsertAdminAssetUsage(String(workspaceId), {
          assetId,
          purpose: "site_logo",
          entityType: "core.settings",
          entityId: "site",
          fieldKey: "site.logo",
        });
      } else {
        if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
        await deleteAdminAssetUsageByRef({
          workspaceId: String(workspaceId),
          entityType: "core.settings",
          entityId: "site",
          fieldKey: "site.logo",
        });
      }
    });

  const saveSiteFaviconUrl = () =>
    withSavingKey("siteFaviconUrl", async () => {
      const values = await form.validateFields(["siteFaviconAssetId", "siteFaviconUrl"]);
      const assetId = normalizeOptionalString(values.siteFaviconAssetId);
      const url = assetId ? `/assets/${assetId}` : normalizeOptionalString(values.siteFaviconUrl);

      await patch({
        site: { favicon_asset_id: assetId, favicon_url: url },
      });

      if (assetId) {
        if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
        await upsertAdminAssetUsage(String(workspaceId), {
          assetId,
          purpose: "favicon",
          entityType: "core.settings",
          entityId: "site",
          fieldKey: "site.favicon",
        });
      } else {
        if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
        await deleteAdminAssetUsageByRef({
          workspaceId: String(workspaceId),
          entityType: "core.settings",
          entityId: "site",
          fieldKey: "site.favicon",
        });
      }
    });

  const siteLogoPreviewUrl = useMemo(() => {
    if (siteLogoAssetId) return resolvePublicAssetUrlPath(`/assets/${siteLogoAssetId}`);
    if (siteLogoUrl) return resolvePublicAssetUrlPath(siteLogoUrl) || siteLogoUrl;
    return undefined;
  }, [siteLogoAssetId, siteLogoUrl]);

  const siteFaviconPreviewUrl = useMemo(() => {
    if (siteFaviconAssetId) return resolvePublicAssetUrlPath(`/assets/${siteFaviconAssetId}`);
    if (siteFaviconUrl) return resolvePublicAssetUrlPath(siteFaviconUrl) || siteFaviconUrl;
    return undefined;
  }, [siteFaviconAssetId, siteFaviconUrl]);

  const saveSiteContactEmail = () =>
    withSavingKey("siteContactEmail", async () => {
      const values = await form.validateFields(["siteContactEmail"]);
      await patch({
        site: { contact_email: normalizeOptionalString(values.siteContactEmail) },
      });
    });

  return (
    <Accordion type="single" collapsible className="px-0">
      <SettingAccordionItem
        value="siteName"
        title={t("setup:SETUP_FIELD_SITE_NAME_LABEL")}
        description={t("settings:SETTINGS_SITE_NAME_DESC")}
        showSummary
        summary={formatSummaryText(siteName)}
        confirmText={t("settings:SETTINGS_SAVE")}
        onConfirm={saveSiteName}
        confirmLoading={savingKey === "siteName"}
        onReset={isSiteNameDirty || isResettingSiteName ? resetSiteName : undefined}
        resetLoading={isResettingSiteName}
        disabled={disabled}
      >
        <Form.Item<GeneralSettingsFormValues>
          name="siteName"
          rules={[{ required: true, message: t("setup:SETUP_VALIDATION_SITE_NAME_REQUIRED") }]}
          style={{ marginBottom: 0 }}
        >
          <Input size="large" placeholder={t("setup:SETUP_FIELD_SITE_NAME_PLACEHOLDER")} />
        </Form.Item>
      </SettingAccordionItem>

      <SettingAccordionItem
        value="siteSubtitle"
        title={t("settings:SETTINGS_SITE_SUBTITLE_LABEL")}
        description={t("settings:SETTINGS_SITE_SUBTITLE_DESC")}
        showSummary
        summary={formatSummaryText(siteSubtitle)}
        confirmText={t("settings:SETTINGS_SAVE")}
        onConfirm={saveSiteSubtitle}
        confirmLoading={savingKey === "siteSubtitle"}
        onReset={isSiteSubtitleDirty || isResettingSiteSubtitle ? resetSiteSubtitle : undefined}
        resetLoading={isResettingSiteSubtitle}
        disabled={disabled}
      >
        <Form.Item<GeneralSettingsFormValues>
          name="siteSubtitle"
          rules={[{ max: 200, message: t("setup:SETUP_VALIDATION_SITE_DESC_MAX") }]}
          style={{ marginBottom: 0 }}
        >
          <Input
            size="large"
            placeholder={t("settings:SETTINGS_SITE_SUBTITLE_PLACEHOLDER")}
            allowClear
          />
        </Form.Item>
      </SettingAccordionItem>

      <SettingAccordionItem
        value="siteDescription"
        title={t("settings:SETTINGS_SITE_DESCRIPTION_LABEL")}
        description={t("settings:SETTINGS_SITE_DESCRIPTION_DESC")}
        showSummary
        summary={formatSummaryText(siteDescription)}
        confirmText={t("settings:SETTINGS_SAVE")}
        onConfirm={saveSiteDescription}
        confirmLoading={savingKey === "siteDescription"}
        onReset={
          isSiteDescriptionDirty || isResettingSiteDescription ? resetSiteDescription : undefined
        }
        resetLoading={isResettingSiteDescription}
        disabled={disabled}
      >
        <Form.Item<GeneralSettingsFormValues>
          name="siteDescription"
          rules={[{ max: 200, message: t("setup:SETUP_VALIDATION_SITE_DESC_MAX") }]}
          style={{ marginBottom: 0 }}
        >
          <Input.TextArea
            autoSize={{ minRows: 3, maxRows: 6 }}
            placeholder={t("settings:SETTINGS_SITE_DESCRIPTION_PLACEHOLDER")}
            allowClear
            maxLength={160}
            showCount={{ formatter: ({ count }) => `${count}/200` }}
          />
        </Form.Item>
      </SettingAccordionItem>

      <SettingAccordionItem
        value="siteUrl"
        title={t("setup:SETUP_FIELD_SITE_URL_LABEL")}
        description={t("settings:SETTINGS_SITE_URL_DESC")}
        showSummary
        summary={formatSummaryText(siteUrl)}
        confirmText={t("settings:SETTINGS_SAVE")}
        onConfirm={saveSiteUrl}
        confirmLoading={savingKey === "siteUrl"}
        onReset={isSiteUrlDirty || isResettingSiteUrl ? resetSiteUrl : undefined}
        resetLoading={isResettingSiteUrl}
        disabled={disabled}
      >
        <Form.Item<GeneralSettingsFormValues>
          name="siteUrl"
          rules={[
            { required: true, message: t("setup:SETUP_VALIDATION_SITE_URL_REQUIRED") },
            {
              validator: async (_rule, value: string | undefined) => {
                const raw = (value || "").trim();
                if (!raw) return;
                try {
                  const url = new URL(raw);
                  if (url.protocol !== "http:" && url.protocol !== "https:") {
                    throw new Error("invalid protocol");
                  }
                } catch {
                  throw new Error(t("setup:SETUP_VALIDATION_SITE_URL_INVALID"));
                }
              },
            },
          ]}
          style={{ marginBottom: 0 }}
        >
          <Input size="large" placeholder={t("setup:SETUP_FIELD_SITE_URL_PLACEHOLDER")} />
        </Form.Item>
      </SettingAccordionItem>

      <SettingAccordionItem
        value="siteLogoUrl"
        title={t("settings:SETTINGS_SITE_LOGO_LABEL")}
        description={t("settings:SETTINGS_SITE_LOGO_DESC")}
        confirmText={t("settings:SETTINGS_SAVE")}
        onConfirm={saveSiteLogoUrl}
        confirmLoading={savingKey === "siteLogoUrl"}
        onReset={isSiteLogoUrlDirty || isResettingSiteLogoUrl ? resetSiteLogoUrl : undefined}
        resetLoading={isResettingSiteLogoUrl}
        disabled={disabled}
        keepRendered
      >
        <Form.Item<GeneralSettingsFormValues> name="siteLogoAssetId" hidden>
          <Input />
        </Form.Item>

        <div className="flex items-center gap-3">
          <div className="shrink-0">
            {siteLogoPreviewUrl ? (
              <Image
                width={56}
                height={56}
                src={siteLogoPreviewUrl}
                preview={false}
                className="rounded-md border border-border/60 bg-muted/20"
              />
            ) : (
              <div className="h-14 w-14 rounded-md border border-border/60 bg-muted/20 grid place-items-center text-xs text-muted-foreground">
                {t("settings:SETTINGS_NOT_SET")}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">{t("settings:SETTINGS_ASSET_PICKER_CURRENT")}</div>
            <div className="mt-1 text-xs text-muted-foreground truncate">
              {siteLogoAssetId ? `/assets/${siteLogoAssetId}` : formatSummaryText(siteLogoUrl)}
            </div>
          </div>
          <div className="shrink-0 flex items-center gap-2">
            <Button onClick={() => setLogoPickerOpen(true)}>
              {t("settings:SETTINGS_ASSET_PICKER_SELECT")}
            </Button>
            <Button
              danger
              disabled={!siteLogoAssetId && !siteLogoUrl}
              onClick={() => {
                form.setFieldValue("siteLogoAssetId", "");
                form.setFieldValue("siteLogoUrl", "");
              }}
            >
              {t("settings:SETTINGS_ASSET_PICKER_CLEAR")}
            </Button>
          </div>
        </div>

        <Form.Item<GeneralSettingsFormValues>
          name="siteLogoUrl"
          rules={[
            {
              validator: async (_rule, value: string | undefined) => {
                const raw = (value || "").trim();
                if (siteLogoAssetId) return;
                if (!raw) return;
                if (isValidHttpUrlOrAbsolutePath(raw)) return;
                throw new Error(t("settings:SETTINGS_VALIDATION_URL_OR_PATH_INVALID"));
              },
            },
          ]}
          style={{ marginBottom: 0, marginTop: 12 }}
        >
          <Input
            size="large"
            placeholder={t("settings:SETTINGS_SITE_LOGO_PLACEHOLDER")}
            allowClear
          />
        </Form.Item>

        <AssetPickerDialog
          open={logoPickerOpen}
          onOpenChange={setLogoPickerOpen}
          value={{ assetId: siteLogoAssetId || null }}
          uploadPurpose="site_logo"
          title={t("settings:SETTINGS_SITE_LOGO_PICKER_TITLE")}
          description={t("settings:SETTINGS_SITE_LOGO_PICKER_DESC")}
          onConfirm={({ assetId }) => {
            if (!assetId) return;
            form.setFieldValue("siteLogoAssetId", assetId);
            form.setFieldValue("siteLogoUrl", `/assets/${assetId}`);
          }}
        />
      </SettingAccordionItem>

      <SettingAccordionItem
        value="siteFaviconUrl"
        title={t("settings:SETTINGS_SITE_FAVICON_LABEL")}
        description={t("settings:SETTINGS_SITE_FAVICON_DESC")}
        confirmText={t("settings:SETTINGS_SAVE")}
        onConfirm={saveSiteFaviconUrl}
        confirmLoading={savingKey === "siteFaviconUrl"}
        onReset={
          isSiteFaviconUrlDirty || isResettingSiteFaviconUrl ? resetSiteFaviconUrl : undefined
        }
        resetLoading={isResettingSiteFaviconUrl}
        disabled={disabled}
        keepRendered
      >
        <Form.Item<GeneralSettingsFormValues> name="siteFaviconAssetId" hidden>
          <Input />
        </Form.Item>

        <div className="flex items-center gap-3">
          <div className="shrink-0">
            {siteFaviconPreviewUrl ? (
              <Image
                width={40}
                height={40}
                src={siteFaviconPreviewUrl}
                preview={false}
                className="rounded-md border border-border/60 bg-muted/20"
              />
            ) : (
              <div className="h-10 w-10 rounded-md border border-border/60 bg-muted/20 grid place-items-center text-xs text-muted-foreground">
                {t("settings:SETTINGS_NOT_SET")}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">{t("settings:SETTINGS_ASSET_PICKER_CURRENT")}</div>
            <div className="mt-1 text-xs text-muted-foreground truncate">
              {siteFaviconAssetId
                ? `/assets/${siteFaviconAssetId}`
                : formatSummaryText(siteFaviconUrl)}
            </div>
          </div>
          <div className="shrink-0 flex items-center gap-2">
            <Button onClick={() => setFaviconPickerOpen(true)}>
              {t("settings:SETTINGS_ASSET_PICKER_SELECT")}
            </Button>
            <Button
              danger
              disabled={!siteFaviconAssetId && !siteFaviconUrl}
              onClick={() => {
                form.setFieldValue("siteFaviconAssetId", "");
                form.setFieldValue("siteFaviconUrl", "");
              }}
            >
              {t("settings:SETTINGS_ASSET_PICKER_CLEAR")}
            </Button>
          </div>
        </div>

        <Form.Item<GeneralSettingsFormValues>
          name="siteFaviconUrl"
          rules={[
            {
              validator: async (_rule, value: string | undefined) => {
                const raw = (value || "").trim();
                if (siteFaviconAssetId) return;
                if (!raw) return;
                if (isValidHttpUrlOrAbsolutePath(raw)) return;
                throw new Error(t("settings:SETTINGS_VALIDATION_URL_OR_PATH_INVALID"));
              },
            },
          ]}
          style={{ marginBottom: 0 }}
        >
          <Input
            size="large"
            placeholder={t("settings:SETTINGS_SITE_FAVICON_PLACEHOLDER")}
            allowClear
          />
        </Form.Item>

        <AssetPickerDialog
          open={faviconPickerOpen}
          onOpenChange={setFaviconPickerOpen}
          value={{ assetId: siteFaviconAssetId || null }}
          uploadPurpose="favicon"
          title={t("settings:SETTINGS_SITE_FAVICON_PICKER_TITLE")}
          description={t("settings:SETTINGS_SITE_FAVICON_PICKER_DESC")}
          onConfirm={({ assetId }) => {
            if (!assetId) return;
            form.setFieldValue("siteFaviconAssetId", assetId);
            form.setFieldValue("siteFaviconUrl", `/assets/${assetId}`);
          }}
        />
      </SettingAccordionItem>

      <SettingAccordionItem
        value="siteContactEmail"
        title={t("settings:SETTINGS_SITE_CONTACT_EMAIL_LABEL")}
        description={t("settings:SETTINGS_SITE_CONTACT_EMAIL_DESC")}
        showSummary
        summary={formatSummaryText(siteContactEmail)}
        confirmText={t("settings:SETTINGS_SAVE")}
        onConfirm={saveSiteContactEmail}
        confirmLoading={savingKey === "siteContactEmail"}
        onReset={
          isSiteContactEmailDirty || isResettingSiteContactEmail ? resetSiteContactEmail : undefined
        }
        resetLoading={isResettingSiteContactEmail}
        disabled={disabled}
      >
        <Form.Item<GeneralSettingsFormValues>
          name="siteContactEmail"
          rules={[
            {
              validator: async (_rule, value: string | undefined) => {
                const raw = (value || "").trim();
                if (!raw) return;
                // Optional 字段做最小 email 校验即可。
                const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw);
                if (ok) return;
                throw new Error(t("settings:SETTINGS_VALIDATION_EMAIL_INVALID"));
              },
            },
          ]}
          style={{ marginBottom: 0 }}
        >
          <Input
            size="large"
            placeholder={t("settings:SETTINGS_SITE_CONTACT_EMAIL_PLACEHOLDER")}
            allowClear
          />
        </Form.Item>
      </SettingAccordionItem>
    </Accordion>
  );
}
