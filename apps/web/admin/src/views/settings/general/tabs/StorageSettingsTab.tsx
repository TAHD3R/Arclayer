import { Button, Form, Input, InputNumber, Select, Switch } from "antd";
import type { FormInstance } from "antd";
import * as React from "react";
import { useTranslation } from "react-i18next";

import { SettingActionItem } from "@/components/app/settingActionItem";
import { SettingOverlayFooter } from "@/components/app/settingOverlayFooter";
import { SettingPanel } from "@/components/app/settingPanel";
import { type SettingOverlayConfig, useSettingOverlays } from "@/hooks/useSettingOverlays";

import type { GeneralSettingsTabBaseProps } from "../context";
import type { GeneralSettingsFormValues, StorageProvider } from "../types";
import {
  buildS3Summary,
  formatSummaryText,
  isValidHttpUrlOrAbsolutePath,
  normalizeOptionalString,
} from "../utils";

type StorageOverlayKey = "provider" | "publicBaseUrl" | "uploadPolicy" | "localInfo" | "s3Config";

type StorageSettingsTabProps = GeneralSettingsTabBaseProps & {
  coreSecrets?: Record<string, boolean>;
};

function useStorageField(
  form: FormInstance<GeneralSettingsFormValues>,
  name: keyof GeneralSettingsFormValues,
) {
  return Form.useWatch(name as string, form) as unknown;
}

export function StorageSettingsTab({
  form,
  initialValues,
  disabled,
  savingKey,
  withSavingKey,
  patch,
  coreSecrets,
}: StorageSettingsTabProps) {
  const { t } = useTranslation();

  const storageProvider =
    (useStorageField(form, "storageProvider") as StorageProvider | undefined) ??
    initialValues.storageProvider;
  const storagePublicBaseUrl =
    (useStorageField(form, "storagePublicBaseUrl") as string | undefined) ??
    initialValues.storagePublicBaseUrl;

  const uploadChunkSizeMb =
    (useStorageField(form, "uploadChunkSizeMb") as number | undefined) ??
    initialValues.uploadChunkSizeMb;
  const uploadMaxFileSizeMb =
    (useStorageField(form, "uploadMaxFileSizeMb") as number | undefined) ??
    initialValues.uploadMaxFileSizeMb;
  const uploadMaxAvatarSizeMb =
    (useStorageField(form, "uploadMaxAvatarSizeMb") as number | undefined) ??
    initialValues.uploadMaxAvatarSizeMb;
  const uploadMaxSiteLogoSizeMb =
    (useStorageField(form, "uploadMaxSiteLogoSizeMb") as number | undefined) ??
    initialValues.uploadMaxSiteLogoSizeMb;
  const uploadMaxFaviconSizeMb =
    (useStorageField(form, "uploadMaxFaviconSizeMb") as number | undefined) ??
    initialValues.uploadMaxFaviconSizeMb;

  const s3EndpointUrl =
    (useStorageField(form, "s3EndpointUrl") as string | undefined) ?? initialValues.s3EndpointUrl;
  const s3Region =
    (useStorageField(form, "s3Region") as string | undefined) ?? initialValues.s3Region;
  const s3Bucket =
    (useStorageField(form, "s3Bucket") as string | undefined) ?? initialValues.s3Bucket;
  const s3AccessKeyId =
    (useStorageField(form, "s3AccessKeyId") as string | undefined) ?? initialValues.s3AccessKeyId;
  const s3SecretAccessKey =
    (useStorageField(form, "s3SecretAccessKey") as string | undefined) ??
    initialValues.s3SecretAccessKey;
  const s3ForcePathStyle =
    (useStorageField(form, "s3ForcePathStyle") as boolean | undefined) ??
    initialValues.s3ForcePathStyle;
  const s3PresignExpiresSeconds =
    (useStorageField(form, "s3PresignExpiresSeconds") as number | undefined) ??
    initialValues.s3PresignExpiresSeconds;

  const isStorageProviderDirty = (storageProvider || "") !== (initialValues.storageProvider || "");
  const isStoragePublicBaseUrlDirty =
    (storagePublicBaseUrl || "") !== (initialValues.storagePublicBaseUrl || "");
  const isUploadPolicyDirty =
    uploadChunkSizeMb !== initialValues.uploadChunkSizeMb ||
    uploadMaxFileSizeMb !== initialValues.uploadMaxFileSizeMb ||
    uploadMaxAvatarSizeMb !== initialValues.uploadMaxAvatarSizeMb ||
    uploadMaxSiteLogoSizeMb !== initialValues.uploadMaxSiteLogoSizeMb ||
    uploadMaxFaviconSizeMb !== initialValues.uploadMaxFaviconSizeMb;
  const isS3ConfigDirty =
    (s3EndpointUrl || "") !== (initialValues.s3EndpointUrl || "") ||
    (s3Region || "") !== (initialValues.s3Region || "") ||
    (s3Bucket || "") !== (initialValues.s3Bucket || "") ||
    (s3AccessKeyId || "") !== (initialValues.s3AccessKeyId || "") ||
    Boolean((s3SecretAccessKey || "").trim()) ||
    s3ForcePathStyle !== initialValues.s3ForcePathStyle ||
    s3PresignExpiresSeconds !== initialValues.s3PresignExpiresSeconds;

  const isResettingStorageProvider = savingKey === "reset:storageProvider";
  const isResettingStoragePublicBaseUrl = savingKey === "reset:storagePublicBaseUrl";
  const isResettingUploadPolicy = savingKey === "reset:uploadPolicy";
  const isResettingS3Config = savingKey === "reset:s3Config";

  const storageProviderLabel =
    storageProvider === "s3"
      ? t("settings:SETTINGS_STORAGE_PROVIDER_S3")
      : t("settings:SETTINGS_STORAGE_PROVIDER_LOCAL");

  const hasS3Secret = Boolean(coreSecrets?.["storage.s3_secret_access_key"]);
  const s3Summary = buildS3Summary({
    endpointUrl: s3EndpointUrl,
    bucket: s3Bucket,
    region: s3Region,
  });

  const resetStorageProvider = () =>
    withSavingKey("reset:storageProvider", async () => {
      form.setFieldValue("storageProvider", initialValues.storageProvider);
      await patch({ storage: { provider: initialValues.storageProvider } });
    });

  const resetStoragePublicBaseUrl = () =>
    withSavingKey("reset:storagePublicBaseUrl", async () => {
      form.setFieldValue("storagePublicBaseUrl", initialValues.storagePublicBaseUrl);
      await patch({
        storage: { public_base_url: normalizeOptionalString(initialValues.storagePublicBaseUrl) },
      });
    });

  const resetUploadPolicy = () =>
    withSavingKey("reset:uploadPolicy", async () => {
      form.setFieldsValue({
        uploadChunkSizeMb: initialValues.uploadChunkSizeMb,
        uploadMaxFileSizeMb: initialValues.uploadMaxFileSizeMb,
        uploadMaxAvatarSizeMb: initialValues.uploadMaxAvatarSizeMb,
        uploadMaxSiteLogoSizeMb: initialValues.uploadMaxSiteLogoSizeMb,
        uploadMaxFaviconSizeMb: initialValues.uploadMaxFaviconSizeMb,
      });
      await patch({
        storage: {
          upload_chunk_size_mb: initialValues.uploadChunkSizeMb,
          upload_max_file_size_mb: initialValues.uploadMaxFileSizeMb,
          upload_max_avatar_size_mb: initialValues.uploadMaxAvatarSizeMb,
          upload_max_site_logo_size_mb: initialValues.uploadMaxSiteLogoSizeMb,
          upload_max_favicon_size_mb: initialValues.uploadMaxFaviconSizeMb,
        },
      });
    });

  const resetS3Config = () =>
    withSavingKey("reset:s3Config", async () => {
      form.setFieldsValue({
        s3EndpointUrl: initialValues.s3EndpointUrl,
        s3Region: initialValues.s3Region,
        s3Bucket: initialValues.s3Bucket,
        s3AccessKeyId: initialValues.s3AccessKeyId,
        s3SecretAccessKey: "",
        s3ForcePathStyle: initialValues.s3ForcePathStyle,
        s3PresignExpiresSeconds: initialValues.s3PresignExpiresSeconds,
      });
      await patch({
        storage: {
          s3_endpoint_url: normalizeOptionalString(initialValues.s3EndpointUrl),
          s3_region: normalizeOptionalString(initialValues.s3Region),
          s3_bucket: normalizeOptionalString(initialValues.s3Bucket),
          s3_access_key_id: normalizeOptionalString(initialValues.s3AccessKeyId),
          s3_force_path_style: Boolean(initialValues.s3ForcePathStyle),
          s3_presign_expires_seconds: Number(initialValues.s3PresignExpiresSeconds),
        },
      });
    });

  const saveStorageProvider = () =>
    withSavingKey("storageProvider", async () => {
      const values = await form.validateFields(["storageProvider"]);
      await patch({ storage: { provider: values.storageProvider } });
    });

  const saveStoragePublicBaseUrl = () =>
    withSavingKey("storagePublicBaseUrl", async () => {
      const values = await form.validateFields(["storagePublicBaseUrl"]);
      await patch({
        storage: { public_base_url: normalizeOptionalString(values.storagePublicBaseUrl) },
      });
    });

  const saveUploadPolicy = () =>
    withSavingKey("uploadPolicy", async () => {
      const values = await form.validateFields([
        "uploadChunkSizeMb",
        "uploadMaxFileSizeMb",
        "uploadMaxAvatarSizeMb",
        "uploadMaxSiteLogoSizeMb",
        "uploadMaxFaviconSizeMb",
      ]);
      await patch({
        storage: {
          upload_chunk_size_mb: Number(values.uploadChunkSizeMb),
          upload_max_file_size_mb: Number(values.uploadMaxFileSizeMb),
          upload_max_avatar_size_mb: Number(values.uploadMaxAvatarSizeMb),
          upload_max_site_logo_size_mb: Number(values.uploadMaxSiteLogoSizeMb),
          upload_max_favicon_size_mb: Number(values.uploadMaxFaviconSizeMb),
        },
      });
    });

  const saveS3Config = () =>
    withSavingKey("s3Config", async () => {
      const values = await form.validateFields([
        "s3EndpointUrl",
        "s3Region",
        "s3Bucket",
        "s3AccessKeyId",
        "s3SecretAccessKey",
        "s3ForcePathStyle",
        "s3PresignExpiresSeconds",
      ]);

      const patchValue: Record<string, unknown> = {
        s3_endpoint_url: normalizeOptionalString(values.s3EndpointUrl),
        s3_region: normalizeOptionalString(values.s3Region),
        s3_bucket: normalizeOptionalString(values.s3Bucket),
        s3_access_key_id: normalizeOptionalString(values.s3AccessKeyId),
        s3_force_path_style: Boolean(values.s3ForcePathStyle),
        s3_presign_expires_seconds: Number(values.s3PresignExpiresSeconds),
      };

      // Secret 字段由 API 掩码：只有用户提供了新值时才覆盖。
      const secret = String(values.s3SecretAccessKey || "").trim();
      if (secret) {
        patchValue.s3_secret_access_key = secret;
        form.setFieldValue("s3SecretAccessKey", "");
      }

      await patch({ storage: patchValue });
    });

  const overlayConfigs = React.useMemo<readonly SettingOverlayConfig<StorageOverlayKey>[]>(() => {
    const makeResetVisible = (dirty: boolean, resetting: boolean) => dirty || resetting;

    return [
      {
        key: "provider",
        type: "dialog",
        title: t("settings:SETTINGS_STORAGE_DRAWER_PROVIDER_TITLE"),
        description: t("settings:SETTINGS_STORAGE_PROVIDER_DIALOG_DESC"),
        footer: (ctx) => (
          <SettingOverlayFooter
            close={ctx.close}
            backText={t("common:BACK")}
            resetText={t("settings:SETTINGS_RESET")}
            resetVisible={makeResetVisible(isStorageProviderDirty, isResettingStorageProvider)}
            resetLoading={isResettingStorageProvider}
            saveText={t("settings:SETTINGS_SAVE")}
            saveLoading={savingKey === "storageProvider"}
            disabled={disabled}
            onReset={resetStorageProvider}
            onSave={saveStorageProvider}
          />
        ),
        content: () => (
          <>
            <div className="mb-4 text-muted-foreground leading-relaxed">
              {t("settings:SETTINGS_STORAGE_PROVIDER_DIALOG_HELP")}
            </div>

            <Form.Item<GeneralSettingsFormValues>
              name="storageProvider"
              label={t("settings:SETTINGS_STORAGE_PROVIDER_LABEL")}
              rules={[{ required: true, message: t("settings:SETTINGS_VALIDATION_REQUIRED") }]}
              style={{ marginBottom: 0 }}
            >
              <Select
                size="large"
                options={[
                  { value: "local", label: t("settings:SETTINGS_STORAGE_PROVIDER_LOCAL") },
                  { value: "s3", label: t("settings:SETTINGS_STORAGE_PROVIDER_S3") },
                ]}
              />
            </Form.Item>
          </>
        ),
      },
      {
        key: "publicBaseUrl",
        type: "dialog",
        title: t("settings:SETTINGS_STORAGE_DRAWER_PUBLIC_BASE_URL_TITLE"),
        description: t("settings:SETTINGS_STORAGE_PUBLIC_BASE_URL_DIALOG_DESC"),
        footer: (ctx) => (
          <SettingOverlayFooter
            close={ctx.close}
            backText={t("common:BACK")}
            resetText={t("settings:SETTINGS_RESET")}
            resetVisible={makeResetVisible(
              isStoragePublicBaseUrlDirty,
              isResettingStoragePublicBaseUrl,
            )}
            resetLoading={isResettingStoragePublicBaseUrl}
            saveText={t("settings:SETTINGS_SAVE")}
            saveLoading={savingKey === "storagePublicBaseUrl"}
            disabled={disabled}
            onReset={resetStoragePublicBaseUrl}
            onSave={saveStoragePublicBaseUrl}
          />
        ),
        content: () => (
          <>
            <div className="mb-4 text-muted-foreground leading-relaxed">
              {t("settings:SETTINGS_STORAGE_PUBLIC_BASE_URL_DIALOG_HELP")}
            </div>

            <Form.Item<GeneralSettingsFormValues>
              name="storagePublicBaseUrl"
              label={t("settings:SETTINGS_STORAGE_PUBLIC_BASE_URL_LABEL")}
              rules={[
                {
                  validator: async (_rule, value: string | undefined) => {
                    const raw = (value || "").trim();
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
                placeholder={t("settings:SETTINGS_STORAGE_PUBLIC_BASE_URL_PLACEHOLDER")}
                allowClear
              />
            </Form.Item>
          </>
        ),
      },
      {
        key: "uploadPolicy",
        type: "sheet",
        title: t("settings:SETTINGS_STORAGE_DRAWER_UPLOAD_POLICY_TITLE"),
        description: t("settings:SETTINGS_STORAGE_UPLOAD_POLICY_SHEET_DESC"),
        footer: (ctx) => (
          <SettingOverlayFooter
            close={ctx.close}
            backText={t("common:BACK")}
            resetText={t("settings:SETTINGS_RESET")}
            resetVisible={makeResetVisible(isUploadPolicyDirty, isResettingUploadPolicy)}
            resetLoading={isResettingUploadPolicy}
            saveText={t("settings:SETTINGS_SAVE")}
            saveLoading={savingKey === "uploadPolicy"}
            disabled={disabled}
            onReset={resetUploadPolicy}
            onSave={saveUploadPolicy}
          />
        ),
        content: () => (
          <>
            <div className="mb-4 text-muted-foreground leading-relaxed">
              {t("settings:SETTINGS_STORAGE_UPLOAD_POLICY_SHEET_HELP")}
            </div>

            <div className="grid grid-cols-1 gap-3">
              <Form.Item<GeneralSettingsFormValues>
                name="uploadChunkSizeMb"
                label={t("settings:SETTINGS_STORAGE_UPLOAD_CHUNK_SIZE_MB_LABEL")}
                rules={[{ required: true, type: "number", min: 1, max: 128 }]}
                style={{ marginBottom: 0 }}
              >
                <InputNumber size="large" min={1} max={128} style={{ width: "100%" }} />
              </Form.Item>

              <Form.Item<GeneralSettingsFormValues>
                name="uploadMaxFileSizeMb"
                label={t("settings:SETTINGS_STORAGE_UPLOAD_MAX_FILE_SIZE_MB_LABEL")}
                rules={[{ required: true, type: "number", min: 1 }]}
                style={{ marginBottom: 0 }}
              >
                <InputNumber size="large" min={1} style={{ width: "100%" }} />
              </Form.Item>

              <Form.Item<GeneralSettingsFormValues>
                name="uploadMaxAvatarSizeMb"
                label={t("settings:SETTINGS_STORAGE_UPLOAD_MAX_AVATAR_SIZE_MB_LABEL")}
                rules={[{ required: true, type: "number", min: 1 }]}
                style={{ marginBottom: 0 }}
              >
                <InputNumber size="large" min={1} style={{ width: "100%" }} />
              </Form.Item>

              <Form.Item<GeneralSettingsFormValues>
                name="uploadMaxSiteLogoSizeMb"
                label={t("settings:SETTINGS_STORAGE_UPLOAD_MAX_SITE_LOGO_SIZE_MB_LABEL")}
                rules={[{ required: true, type: "number", min: 1 }]}
                style={{ marginBottom: 0 }}
              >
                <InputNumber size="large" min={1} style={{ width: "100%" }} />
              </Form.Item>

              <Form.Item<GeneralSettingsFormValues>
                name="uploadMaxFaviconSizeMb"
                label={t("settings:SETTINGS_STORAGE_UPLOAD_MAX_FAVICON_SIZE_MB_LABEL")}
                rules={[{ required: true, type: "number", min: 1 }]}
                style={{ marginBottom: 0 }}
              >
                <InputNumber size="large" min={1} style={{ width: "100%" }} />
              </Form.Item>
            </div>
          </>
        ),
      },
      {
        key: "localInfo",
        type: "dialog",
        title: t("settings:SETTINGS_STORAGE_DRAWER_LOCAL_INFO_TITLE"),
        description: t("settings:SETTINGS_STORAGE_LOCAL_INFO_DIALOG_DESC"),
        footer: (ctx) => (
          <div className="flex w-full items-center justify-end gap-2">
            <Button type="primary" onClick={ctx.close}>
              {t("common:BACK")}
            </Button>
          </div>
        ),
        content: () => (
          <div className="text-muted-foreground leading-relaxed">
            {t("settings:SETTINGS_STORAGE_LOCAL_INFO_DRAWER_DESC")}
          </div>
        ),
      },
      {
        key: "s3Config",
        type: "sheet",
        title: t("settings:SETTINGS_STORAGE_DRAWER_S3_CONFIG_TITLE"),
        description: t("settings:SETTINGS_STORAGE_S3_CONFIG_SHEET_DESC"),
        footer: (ctx) => (
          <SettingOverlayFooter
            close={ctx.close}
            backText={t("common:BACK")}
            resetText={t("settings:SETTINGS_RESET")}
            resetVisible={makeResetVisible(isS3ConfigDirty, isResettingS3Config)}
            resetLoading={isResettingS3Config}
            saveText={t("settings:SETTINGS_SAVE")}
            saveLoading={savingKey === "s3Config"}
            disabled={disabled}
            onReset={resetS3Config}
            onSave={saveS3Config}
          />
        ),
        content: () => (
          <>
            <div className="mb-4 text-muted-foreground leading-relaxed">
              {t("settings:SETTINGS_STORAGE_S3_CONFIG_SHEET_HELP")}
            </div>

            <div className="grid grid-cols-1 gap-3">
              <Form.Item<GeneralSettingsFormValues>
                name="s3EndpointUrl"
                label={t("settings:SETTINGS_STORAGE_S3_ENDPOINT_URL_LABEL")}
                rules={[
                  {
                    validator: async (_rule, value: string | undefined) => {
                      const raw = (value || "").trim();
                      if (!raw) throw new Error(t("settings:SETTINGS_VALIDATION_REQUIRED"));
                      try {
                        const url = new URL(raw);
                        if (url.protocol !== "http:" && url.protocol !== "https:") {
                          throw new Error("invalid protocol");
                        }
                      } catch {
                        throw new Error(t("settings:SETTINGS_STORAGE_VALIDATION_URL_INVALID"));
                      }
                    },
                  },
                ]}
                style={{ marginBottom: 0 }}
              >
                <Input
                  size="large"
                  placeholder={t("settings:SETTINGS_STORAGE_S3_ENDPOINT_URL_PLACEHOLDER")}
                  allowClear
                />
              </Form.Item>

              <Form.Item<GeneralSettingsFormValues>
                name="s3Region"
                label={t("settings:SETTINGS_STORAGE_S3_REGION_LABEL")}
                style={{ marginBottom: 0 }}
              >
                <Input size="large" allowClear />
              </Form.Item>

              <Form.Item<GeneralSettingsFormValues>
                name="s3Bucket"
                label={t("settings:SETTINGS_STORAGE_S3_BUCKET_LABEL")}
                rules={[{ required: true, message: t("settings:SETTINGS_VALIDATION_REQUIRED") }]}
                style={{ marginBottom: 0 }}
              >
                <Input size="large" allowClear />
              </Form.Item>

              <Form.Item<GeneralSettingsFormValues>
                name="s3AccessKeyId"
                label={t("settings:SETTINGS_STORAGE_S3_ACCESS_KEY_ID_LABEL")}
                rules={[{ required: true, message: t("settings:SETTINGS_VALIDATION_REQUIRED") }]}
                style={{ marginBottom: 0 }}
              >
                <Input size="large" allowClear />
              </Form.Item>

              <Form.Item<GeneralSettingsFormValues>
                name="s3SecretAccessKey"
                label={t("settings:SETTINGS_STORAGE_S3_SECRET_ACCESS_KEY_LABEL")}
                style={{ marginBottom: 0 }}
              >
                <Input.Password size="large" placeholder="••••••••" />
              </Form.Item>

              <Form.Item<GeneralSettingsFormValues>
                name="s3ForcePathStyle"
                label={t("settings:SETTINGS_STORAGE_S3_FORCE_PATH_STYLE_LABEL")}
                valuePropName="checked"
                style={{ marginBottom: 0 }}
              >
                <Switch />
              </Form.Item>

              <Form.Item<GeneralSettingsFormValues>
                name="s3PresignExpiresSeconds"
                label={t("settings:SETTINGS_STORAGE_S3_PRESIGN_EXPIRES_SECONDS_LABEL")}
                rules={[{ required: true, type: "number", min: 60, max: 86400 }]}
                style={{ marginBottom: 0 }}
              >
                <InputNumber size="large" min={60} max={86400} style={{ width: "100%" }} />
              </Form.Item>
            </div>
          </>
        ),
      },
    ] as const;
  }, [
    disabled,
    form,
    isResettingS3Config,
    isResettingStorageProvider,
    isResettingStoragePublicBaseUrl,
    isResettingUploadPolicy,
    isS3ConfigDirty,
    isStorageProviderDirty,
    isStoragePublicBaseUrlDirty,
    isUploadPolicyDirty,
    resetS3Config,
    resetStorageProvider,
    resetStoragePublicBaseUrl,
    resetUploadPolicy,
    saveS3Config,
    saveStorageProvider,
    saveStoragePublicBaseUrl,
    saveUploadPolicy,
    savingKey,
    t,
  ]);

  const overlays = useSettingOverlays<StorageOverlayKey>(overlayConfigs);

  return (
    <div className="flex flex-col gap-6">
      <SettingPanel
        title={t("settings:SETTINGS_STORAGE_PANEL_GLOBAL_TITLE")}
        description={t("settings:SETTINGS_STORAGE_PANEL_GLOBAL_DESC")}
      >
        <div className="divide-y">
          <SettingActionItem
            className="first:rounded-t-xl last:rounded-b-xl"
            title={t("settings:SETTINGS_STORAGE_PROVIDER_LABEL")}
            summary={storageProviderLabel}
            description={t("settings:SETTINGS_STORAGE_PROVIDER_DESC")}
            disabled={disabled}
            onTrigger={() => overlays.open("provider")}
          />
          <SettingActionItem
            className="first:rounded-t-xl last:rounded-b-xl"
            title={t("settings:SETTINGS_STORAGE_PUBLIC_BASE_URL_LABEL")}
            summary={storagePublicBaseUrl ? formatSummaryText(storagePublicBaseUrl) : null}
            placeholder={t("settings:SETTINGS_NOT_SET")}
            description={t("settings:SETTINGS_STORAGE_PUBLIC_BASE_URL_DESC")}
            disabled={disabled}
            onTrigger={() => overlays.open("publicBaseUrl")}
          />
          <SettingActionItem
            className="first:rounded-t-xl last:rounded-b-xl"
            title={t("settings:SETTINGS_STORAGE_UPLOAD_POLICY_LABEL")}
            summary={`${uploadChunkSizeMb} MiB / ${uploadMaxFileSizeMb} MiB`}
            description={[t("settings:SETTINGS_STORAGE_UPLOAD_POLICY_DESC")]}
            disabled={disabled}
            onTrigger={() => overlays.open("uploadPolicy")}
          />
        </div>
      </SettingPanel>

      {storageProvider === "local" ? (
        <SettingPanel
          title={t("settings:SETTINGS_STORAGE_PANEL_LOCAL_TITLE")}
          description={t("settings:SETTINGS_STORAGE_PANEL_LOCAL_DESC")}
        >
          <div className="divide-y">
            <SettingActionItem
              className="first:rounded-t-xl last:rounded-b-xl"
              title={t("settings:SETTINGS_STORAGE_LOCAL_INFO_LABEL")}
              summary={t("settings:SETTINGS_STORAGE_LOCAL_INFO_SUMMARY")}
              description={t("settings:SETTINGS_STORAGE_LOCAL_INFO_DESC")}
              disabled={disabled}
              onTrigger={() => overlays.open("localInfo")}
            />
          </div>
        </SettingPanel>
      ) : null}

      {storageProvider === "s3" ? (
        <SettingPanel
          title={t("settings:SETTINGS_STORAGE_PANEL_S3_TITLE")}
          description={t("settings:SETTINGS_STORAGE_PANEL_S3_DESC")}
        >
          <div className="divide-y">
            <SettingActionItem
              className="first:rounded-t-xl last:rounded-b-xl"
              title={t("settings:SETTINGS_STORAGE_S3_CONFIG_LABEL")}
              summary={s3Summary ? formatSummaryText(s3Summary, 64) : null}
              placeholder={t("settings:SETTINGS_NOT_SET")}
              description={[
                t("settings:SETTINGS_STORAGE_S3_CONFIG_DESC"),
                hasS3Secret
                  ? t("settings:SETTINGS_STORAGE_S3_SECRET_SET")
                  : t("settings:SETTINGS_STORAGE_S3_SECRET_NOT_SET"),
              ]}
              disabled={disabled}
              onTrigger={() => overlays.open("s3Config")}
            />
          </div>
        </SettingPanel>
      ) : null}

      {overlays.renderOverlays()}
    </div>
  );
}
