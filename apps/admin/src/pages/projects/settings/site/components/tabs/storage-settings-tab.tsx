import * as React from "react";
import { Controller, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";

import { Accordion } from "@arclayer/ui/accordion";
import { Input } from "@arclayer/ui/input";
import { PasswordInput } from "@arclayer/ui/password-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";
import { Switch } from "@arclayer/ui/switch";
import { SettingAccordionItem } from "@arclayer/ui/setting-accordion-item";
import { SettingActionGroup } from "@arclayer/ui/setting-action-group";
import { SettingActionItem } from "@arclayer/ui/setting-action-item";
import { SettingOverlayFooter } from "@arclayer/ui/setting-overlay-footer";
import { SettingPanel } from "@arclayer/ui/setting-panel";

import { type SettingOverlayConfig, useSettingOverlays } from "@/hooks/use-setting-overlays";
import { NumberInput } from "@arclayer/ui/number-input";

import type { GeneralSettingsTabBaseProps } from "@/types/settings-general";
import type { StorageProvider } from "@/types/settings-general";
import type { JsonValueInput } from "@arclayer/openapi/admin-types";
import {
  buildS3Summary,
  formatSummaryText,
  isValidHttpUrlOrAbsolutePath,
  normalizeOptionalString,
} from "@/lib/settings/general/utils";
import { getFieldErrorMessage, validateFormFields } from "../form-helpers";

type StorageOverlayKey = "provider" | "publicBaseUrl" | "uploadPolicy" | "s3Config";

type StorageSettingsTabProps = GeneralSettingsTabBaseProps & {
  coreSecrets?: Record<string, boolean>;
};

function FieldMessage({ message }: { message: string | null }) {
  if (!message) return null;
  return <div className="text-footnote text-destructive">{message}</div>;
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
    (useWatch({ control: form.control, name: "storageProvider" }) as StorageProvider | undefined) ??
    initialValues.storageProvider;
  const storagePublicBaseUrl =
    useWatch({ control: form.control, name: "storagePublicBaseUrl" }) ??
    initialValues.storagePublicBaseUrl;
  const uploadChunkSizeMb =
    useWatch({ control: form.control, name: "uploadChunkSizeMb" }) ??
    initialValues.uploadChunkSizeMb;
  const uploadMaxFileSizeMb =
    useWatch({ control: form.control, name: "uploadMaxFileSizeMb" }) ??
    initialValues.uploadMaxFileSizeMb;
  const s3EndpointUrl =
    useWatch({ control: form.control, name: "s3EndpointUrl" }) ?? initialValues.s3EndpointUrl;
  const s3Region = useWatch({ control: form.control, name: "s3Region" }) ?? initialValues.s3Region;
  const s3Bucket = useWatch({ control: form.control, name: "s3Bucket" }) ?? initialValues.s3Bucket;
  const s3AccessKeyId =
    useWatch({ control: form.control, name: "s3AccessKeyId" }) ?? initialValues.s3AccessKeyId;
  const s3SecretAccessKey =
    useWatch({ control: form.control, name: "s3SecretAccessKey" }) ??
    initialValues.s3SecretAccessKey;
  const s3ForcePathStyle =
    useWatch({ control: form.control, name: "s3ForcePathStyle" }) ?? initialValues.s3ForcePathStyle;
  const s3PresignExpiresSeconds =
    useWatch({ control: form.control, name: "s3PresignExpiresSeconds" }) ??
    initialValues.s3PresignExpiresSeconds;

  const isStorageProviderDirty = (storageProvider || "") !== (initialValues.storageProvider || "");
  const isStoragePublicBaseUrlDirty =
    (storagePublicBaseUrl || "") !== (initialValues.storagePublicBaseUrl || "");
  const isUploadPolicyDirty =
    uploadChunkSizeMb !== initialValues.uploadChunkSizeMb ||
    uploadMaxFileSizeMb !== initialValues.uploadMaxFileSizeMb;
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
      form.setValue("storageProvider", initialValues.storageProvider, { shouldDirty: false });
      await patch({ storage: { provider: initialValues.storageProvider } });
    });

  const resetStoragePublicBaseUrl = () =>
    withSavingKey("reset:storagePublicBaseUrl", async () => {
      form.setValue("storagePublicBaseUrl", initialValues.storagePublicBaseUrl, {
        shouldDirty: false,
      });
      form.clearErrors("storagePublicBaseUrl");
      await patch({
        storage: { public_base_url: normalizeOptionalString(initialValues.storagePublicBaseUrl) },
      });
    });

  const resetUploadPolicy = () =>
    withSavingKey("reset:uploadPolicy", async () => {
      form.setValue("uploadChunkSizeMb", initialValues.uploadChunkSizeMb, { shouldDirty: false });
      form.setValue("uploadMaxFileSizeMb", initialValues.uploadMaxFileSizeMb, {
        shouldDirty: false,
      });
      form.clearErrors(["uploadChunkSizeMb", "uploadMaxFileSizeMb"]);
      await patch({
        storage: {
          upload_chunk_size_mb: initialValues.uploadChunkSizeMb,
          upload_max_file_size_mb: initialValues.uploadMaxFileSizeMb,
        },
      });
    });

  const resetS3Config = () =>
    withSavingKey("reset:s3Config", async () => {
      form.setValue("s3EndpointUrl", initialValues.s3EndpointUrl, { shouldDirty: false });
      form.setValue("s3Region", initialValues.s3Region, { shouldDirty: false });
      form.setValue("s3Bucket", initialValues.s3Bucket, { shouldDirty: false });
      form.setValue("s3AccessKeyId", initialValues.s3AccessKeyId, { shouldDirty: false });
      form.setValue("s3SecretAccessKey", "", { shouldDirty: false });
      form.setValue("s3ForcePathStyle", initialValues.s3ForcePathStyle, { shouldDirty: false });
      form.setValue("s3PresignExpiresSeconds", initialValues.s3PresignExpiresSeconds, {
        shouldDirty: false,
      });
      form.clearErrors(["s3EndpointUrl", "s3Bucket", "s3AccessKeyId", "s3PresignExpiresSeconds"]);
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
      const values = await validateFormFields(form, ["storageProvider"]);
      await patch({ storage: { provider: values.storageProvider } });
    });

  const saveStoragePublicBaseUrl = () =>
    withSavingKey("storagePublicBaseUrl", async () => {
      const values = await validateFormFields(form, ["storagePublicBaseUrl"]);
      await patch({
        storage: { public_base_url: normalizeOptionalString(values.storagePublicBaseUrl) },
      });
    });

  const saveUploadPolicy = () =>
    withSavingKey("uploadPolicy", async () => {
      const values = await validateFormFields(form, ["uploadChunkSizeMb", "uploadMaxFileSizeMb"]);
      await patch({
        storage: {
          upload_chunk_size_mb: Number(values.uploadChunkSizeMb),
          upload_max_file_size_mb: Number(values.uploadMaxFileSizeMb),
        },
      });
    });

  const saveS3Config = () =>
    withSavingKey("s3Config", async () => {
      const values = await validateFormFields(form, [
        "s3EndpointUrl",
        "s3Region",
        "s3Bucket",
        "s3AccessKeyId",
        "s3SecretAccessKey",
        "s3ForcePathStyle",
        "s3PresignExpiresSeconds",
      ]);

      const patchValue: Record<string, JsonValueInput> = {
        s3_endpoint_url: normalizeOptionalString(values.s3EndpointUrl),
        s3_region: normalizeOptionalString(values.s3Region),
        s3_bucket: normalizeOptionalString(values.s3Bucket),
        s3_access_key_id: normalizeOptionalString(values.s3AccessKeyId),
        s3_force_path_style: Boolean(values.s3ForcePathStyle),
        s3_presign_expires_seconds: Number(values.s3PresignExpiresSeconds),
      };

      const secret = String(values.s3SecretAccessKey || "").trim();
      if (secret) {
        patchValue.s3_secret_access_key = secret;
        form.setValue("s3SecretAccessKey", "", { shouldDirty: false });
      }

      await patch({ storage: patchValue });
    });

  const overlayConfigs = React.useMemo<readonly SettingOverlayConfig<StorageOverlayKey>[]>(() => {
    const makeResetVisible = (dirty: boolean, resetting: boolean) => dirty || resetting;
    const storageProviderError = getFieldErrorMessage(form, "storageProvider");
    const storagePublicBaseUrlError = getFieldErrorMessage(form, "storagePublicBaseUrl");
    const uploadMaxFileSizeError = getFieldErrorMessage(form, "uploadMaxFileSizeMb");
    const uploadChunkSizeError = getFieldErrorMessage(form, "uploadChunkSizeMb");
    const s3EndpointError = getFieldErrorMessage(form, "s3EndpointUrl");
    const s3BucketError = getFieldErrorMessage(form, "s3Bucket");
    const s3AccessKeyIdError = getFieldErrorMessage(form, "s3AccessKeyId");
    const s3PresignExpiresError = getFieldErrorMessage(form, "s3PresignExpiresSeconds");

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
          <div className="space-y-4">
            <div className="text-label-secondary ">
              {t("settings:SETTINGS_STORAGE_PROVIDER_DIALOG_HELP")}
            </div>
            <Controller
              control={form.control}
              name="storageProvider"
              rules={{ required: t("settings:SETTINGS_VALIDATION_REQUIRED") }}
              render={({ field }) => (
                <div className="space-y-2">
                  <div className="text-footnote font-medium">
                    {t("settings:SETTINGS_STORAGE_PROVIDER_LABEL")}
                  </div>
                  <Select value={field.value || undefined} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={t("common:SELECT")} />
                    </SelectTrigger>
                    <SelectContent position="popper" align="start">
                      <SelectItem value="local">
                        {t("settings:SETTINGS_STORAGE_PROVIDER_LOCAL")}
                      </SelectItem>
                      <SelectItem value="s3">
                        {t("settings:SETTINGS_STORAGE_PROVIDER_S3")}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FieldMessage message={storageProviderError} />
                </div>
              )}
            />
          </div>
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
          <div className="space-y-4">
            <div className="text-label-secondary ">
              {t("settings:SETTINGS_STORAGE_PUBLIC_BASE_URL_DIALOG_HELP")}
            </div>
            <Controller
              control={form.control}
              name="storagePublicBaseUrl"
              rules={{
                validate: (value) => {
                  const raw = String(value || "").trim();
                  if (!raw || isValidHttpUrlOrAbsolutePath(raw)) return true;
                  return t("settings:SETTINGS_VALIDATION_URL_OR_PATH_INVALID");
                },
              }}
              render={({ field }) => (
                <div className="space-y-2">
                  <div className="text-footnote font-medium">
                    {t("settings:SETTINGS_STORAGE_PUBLIC_BASE_URL_LABEL")}
                  </div>
                  <Input
                    {...field}
                    placeholder={t("settings:SETTINGS_STORAGE_PUBLIC_BASE_URL_PLACEHOLDER")}
                  />
                  <FieldMessage message={storagePublicBaseUrlError} />
                </div>
              )}
            />
          </div>
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
          <div className="space-y-4">
            <div className="text-label-secondary ">
              {t("settings:SETTINGS_STORAGE_UPLOAD_POLICY_SHEET_HELP")}
            </div>
            <Controller
              control={form.control}
              name="uploadMaxFileSizeMb"
              rules={{
                validate: (value) => {
                  if (typeof value !== "number" || !Number.isFinite(value) || value < 1) {
                    return t("settings:SETTINGS_VALIDATION_REQUIRED");
                  }
                  return true;
                },
              }}
              render={({ field }) => (
                <div className="space-y-2">
                  <div className="text-footnote font-medium">
                    {t("settings:SETTINGS_STORAGE_UPLOAD_MAX_FILE_SIZE_MB_LABEL")}
                  </div>
                  <NumberInput value={field.value} min={1} onValueChange={field.onChange} />
                  <FieldMessage message={uploadMaxFileSizeError} />
                </div>
              )}
            />

            <Accordion type="single" collapsible className="px-0">
              <SettingAccordionItem
                value="uploadPolicyAdvanced"
                title={t("settings:SETTINGS_STORAGE_UPLOAD_POLICY_ADVANCED_TITLE")}
                description={t("settings:SETTINGS_STORAGE_UPLOAD_POLICY_ADVANCED_DESC")}
                disabled={disabled}
                keepRendered
              >
                <Controller
                  control={form.control}
                  name="uploadChunkSizeMb"
                  rules={{
                    validate: (value) => {
                      if (
                        typeof value !== "number" ||
                        !Number.isFinite(value) ||
                        value < 1 ||
                        value > 128
                      ) {
                        return t("settings:SETTINGS_VALIDATION_REQUIRED");
                      }
                      return true;
                    },
                  }}
                  render={({ field }) => (
                    <div className="space-y-2">
                      <div className="text-footnote font-medium">
                        {t("settings:SETTINGS_STORAGE_UPLOAD_CHUNK_SIZE_MB_LABEL")}
                      </div>
                      <NumberInput
                        value={field.value}
                        min={1}
                        max={128}
                        onValueChange={field.onChange}
                      />
                      <FieldMessage message={uploadChunkSizeError} />
                    </div>
                  )}
                />
              </SettingAccordionItem>
            </Accordion>
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
          <div className="space-y-4">
            <div className="text-label-secondary ">
              {t("settings:SETTINGS_STORAGE_S3_CONFIG_SHEET_HELP")}
            </div>

            <Controller
              control={form.control}
              name="s3EndpointUrl"
              rules={{
                validate: (value) => {
                  const raw = String(value || "").trim();
                  if (!raw) return t("settings:SETTINGS_VALIDATION_REQUIRED");
                  try {
                    const url = new URL(raw);
                    if (url.protocol !== "http:" && url.protocol !== "https:") {
                      throw new Error("invalid protocol");
                    }
                    return true;
                  } catch {
                    return t("settings:SETTINGS_STORAGE_VALIDATION_URL_INVALID");
                  }
                },
              }}
              render={({ field }) => (
                <div className="space-y-2">
                  <div className="text-footnote font-medium">
                    {t("settings:SETTINGS_STORAGE_S3_ENDPOINT_URL_LABEL")}
                  </div>
                  <Input
                    {...field}
                    placeholder={t("settings:SETTINGS_STORAGE_S3_ENDPOINT_URL_PLACEHOLDER")}
                  />
                  <FieldMessage message={s3EndpointError} />
                </div>
              )}
            />

            <Controller
              control={form.control}
              name="s3Region"
              render={({ field }) => (
                <div className="space-y-2">
                  <div className="text-footnote font-medium">
                    {t("settings:SETTINGS_STORAGE_S3_REGION_LABEL")}
                  </div>
                  <Input {...field} />
                </div>
              )}
            />

            <Controller
              control={form.control}
              name="s3Bucket"
              rules={{ required: t("settings:SETTINGS_VALIDATION_REQUIRED") }}
              render={({ field }) => (
                <div className="space-y-2">
                  <div className="text-footnote font-medium">
                    {t("settings:SETTINGS_STORAGE_S3_BUCKET_LABEL")}
                  </div>
                  <Input {...field} />
                  <FieldMessage message={s3BucketError} />
                </div>
              )}
            />

            <Controller
              control={form.control}
              name="s3AccessKeyId"
              rules={{ required: t("settings:SETTINGS_VALIDATION_REQUIRED") }}
              render={({ field }) => (
                <div className="space-y-2">
                  <div className="text-footnote font-medium">
                    {t("settings:SETTINGS_STORAGE_S3_ACCESS_KEY_ID_LABEL")}
                  </div>
                  <Input {...field} />
                  <FieldMessage message={s3AccessKeyIdError} />
                </div>
              )}
            />

            <Controller
              control={form.control}
              name="s3SecretAccessKey"
              render={({ field }) => (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-footnote font-medium">
                      {t("settings:SETTINGS_STORAGE_S3_SECRET_ACCESS_KEY_LABEL")}
                    </div>
                    <div className="text-caption text-label-secondary">
                      {hasS3Secret
                        ? t("settings:SETTINGS_STORAGE_S3_SECRET_SET")
                        : t("settings:SETTINGS_STORAGE_S3_SECRET_NOT_SET")}
                    </div>
                  </div>
                  <PasswordInput
                    value={field.value || ""}
                    onChange={field.onChange}
                    placeholder="••••••••"
                  />
                </div>
              )}
            />

            <Controller
              control={form.control}
              name="s3ForcePathStyle"
              render={({ field }) => (
                <div className="space-y-2">
                  <div className="text-footnote font-medium">
                    {t("settings:SETTINGS_STORAGE_S3_FORCE_PATH_STYLE_LABEL")}
                  </div>
                  <Switch checked={Boolean(field.value)} onCheckedChange={field.onChange} />
                </div>
              )}
            />

            <Controller
              control={form.control}
              name="s3PresignExpiresSeconds"
              rules={{
                validate: (value) => {
                  if (
                    typeof value !== "number" ||
                    !Number.isFinite(value) ||
                    value < 60 ||
                    value > 86400
                  ) {
                    return t("settings:SETTINGS_VALIDATION_REQUIRED");
                  }
                  return true;
                },
              }}
              render={({ field }) => (
                <div className="space-y-2">
                  <div className="text-footnote font-medium">
                    {t("settings:SETTINGS_STORAGE_S3_PRESIGN_EXPIRES_SECONDS_LABEL")}
                  </div>
                  <NumberInput
                    value={field.value}
                    min={60}
                    max={86400}
                    onValueChange={field.onChange}
                  />
                  <FieldMessage message={s3PresignExpiresError} />
                </div>
              )}
            />
          </div>
        ),
      },
    ] as const;
  }, [
    coreSecrets,
    disabled,
    form,
    hasS3Secret,
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
        bordered={false}
      >
        <SettingActionGroup>
          <SettingActionItem
            title={t("settings:SETTINGS_STORAGE_PROVIDER_LABEL")}
            summary={storageProviderLabel}
            description={t("settings:SETTINGS_STORAGE_PROVIDER_DESC")}
            disabled={disabled}
            onTrigger={() => overlays.open("provider")}
          />
          <SettingActionItem
            title={t("settings:SETTINGS_STORAGE_PUBLIC_BASE_URL_LABEL")}
            summary={storagePublicBaseUrl ? formatSummaryText(storagePublicBaseUrl) : null}
            placeholder={t("settings:SETTINGS_NOT_SET")}
            description={t("settings:SETTINGS_STORAGE_PUBLIC_BASE_URL_DESC")}
            disabled={disabled}
            onTrigger={() => overlays.open("publicBaseUrl")}
          />
          <SettingActionItem
            title={t("settings:SETTINGS_STORAGE_UPLOAD_POLICY_LABEL")}
            summary={t("settings:SETTINGS_STORAGE_UPLOAD_POLICY_SUMMARY", {
              max: uploadMaxFileSizeMb,
              chunk: uploadChunkSizeMb,
            })}
            description={[t("settings:SETTINGS_STORAGE_UPLOAD_POLICY_DESC")]}
            disabled={disabled}
            onTrigger={() => overlays.open("uploadPolicy")}
          />
        </SettingActionGroup>
      </SettingPanel>

      {storageProvider === "s3" ? (
        <SettingPanel
          title={t("settings:SETTINGS_STORAGE_PANEL_S3_TITLE")}
          description={t("settings:SETTINGS_STORAGE_PANEL_S3_DESC")}
          bordered={false}
        >
          <SettingActionGroup>
            <SettingActionItem
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
          </SettingActionGroup>
        </SettingPanel>
      ) : null}

      {overlays.renderOverlays()}
    </div>
  );
}
