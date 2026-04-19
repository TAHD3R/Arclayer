import { useEffect, useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";

import { RadioGroup, RadioGroupItem } from "@arclayer/ui/radio-group";
import { Input } from "@arclayer/ui/input";
import { NumberInput } from "@arclayer/ui/number-input";
import { SettingActionGroup } from "@arclayer/ui/setting-action-group";
import { SettingActionItem } from "@arclayer/ui/setting-action-item";
import { SettingDialogFields } from "@arclayer/ui/setting-dialog-field";
import { SettingOverlayFooter } from "@arclayer/ui/setting-overlay-footer";
import { SettingPanel } from "@arclayer/ui/setting-panel";
import { useSavingKey } from "@arclayer/hooks/use-saving-key";

import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { notifySuccessText } from "@/lib/notifications";
import { getFieldErrorMessage, validateFormFields } from "@/lib/forms/rhf-form-helpers";
import { type SettingOverlayConfig, useSettingOverlays } from "@/hooks/use-setting-overlays";
import {
  getSystemSettingsSection,
  getSystemSettingsSecrets,
  readBooleanValue,
  readNumberValue,
  readStringValue,
  usePatchSystemCoreSettings,
  useSystemCoreSettings,
} from "@/pages/system/hooks/use-system-core-settings";
import {
  OverlayBooleanField,
  OverlayField,
  isValidHttpUrl,
  joinSummaryParts,
  normalizeOptionalString,
} from "@/pages/system/system-settings-form-utils";

type StorageProvider = "local" | "s3";
type PublicDeliveryMode = "auto" | "direct" | "presign";

type StorageFormValues = {
  storageProvider: StorageProvider;
  publicBaseUrl: string;
  publicDeliveryMode: PublicDeliveryMode;
  s3EndpointUrl: string;
  s3Region: string;
  s3Bucket: string;
  s3PublicBucket: string;
  s3AccessKeyId: string;
  s3SecretAccessKey: string;
  s3ForcePathStyle: boolean;
  s3PresignExpiresSeconds: number;
};

type StorageOverlayKey = "provider" | "delivery" | "s3";

function readPublicDeliveryMode(raw: string | null): PublicDeliveryMode {
  if (raw === "direct" || raw === "presign") return raw;
  return "auto";
}

function buildInitialValues(
  input: ReturnType<typeof useSystemCoreSettings>["coreSettings"],
): StorageFormValues {
  const storage = getSystemSettingsSection(input, "storage");
  return {
    storageProvider: readStringValue(storage, "provider") === "s3" ? "s3" : "local",
    publicBaseUrl: readStringValue(storage, "public_base_url") ?? "",
    publicDeliveryMode: readPublicDeliveryMode(readStringValue(storage, "public_delivery_mode")),
    s3EndpointUrl: readStringValue(storage, "s3_endpoint_url") ?? "",
    s3Region: readStringValue(storage, "s3_region") ?? "",
    s3Bucket: readStringValue(storage, "s3_bucket") ?? "",
    s3PublicBucket: readStringValue(storage, "s3_public_bucket") ?? "",
    s3AccessKeyId: readStringValue(storage, "s3_access_key_id") ?? "",
    s3SecretAccessKey: "",
    s3ForcePathStyle: Boolean(readBooleanValue(storage, "s3_force_path_style")),
    s3PresignExpiresSeconds: readNumberValue(storage, "s3_presign_expires_seconds") ?? 900,
  };
}

function formatProviderSummary(value: StorageProvider, t: (key: string) => string) {
  return value === "s3"
    ? t("settings:SETTINGS_STORAGE_PROVIDER_S3")
    : t("settings:SETTINGS_STORAGE_PROVIDER_LOCAL");
}

function formatDeliveryModeSummary(value: PublicDeliveryMode, t: (key: string) => string) {
  if (value === "direct") return t("settings:SETTINGS_STORAGE_PUBLIC_DELIVERY_MODE_DIRECT");
  if (value === "presign") return t("settings:SETTINGS_STORAGE_PUBLIC_DELIVERY_MODE_PRESIGN");
  return t("settings:SETTINGS_STORAGE_PUBLIC_DELIVERY_MODE_AUTO");
}

function validatePresignTtl(value: number, t: (key: string) => string) {
  if (!Number.isFinite(value) || value < 60 || value > 86400) {
    return t("settings:SETTINGS_VALIDATION_REQUIRED");
  }
  return true;
}

export function SystemSettingsStoragePage() {
  const { t } = useTranslation(["settings"]);
  const { savingKey, withSavingKey } = useSavingKey();
  const coreSettingsQuery = useSystemCoreSettings();
  const patchMutation = usePatchSystemCoreSettings();
  const secrets = getSystemSettingsSecrets(coreSettingsQuery.coreSettings);
  const hasS3Secret = Boolean(secrets["storage.s3_secret_access_key"]);

  const initialValues = useMemo(
    () => buildInitialValues(coreSettingsQuery.coreSettings),
    [coreSettingsQuery.coreSettings],
  );

  const form = useForm<StorageFormValues>({
    defaultValues: initialValues,
    mode: "onSubmit",
  });

  useEffect(() => {
    if (!coreSettingsQuery.coreSettings) return;
    if (form.formState.isDirty) return;
    form.reset(initialValues);
  }, [coreSettingsQuery.coreSettings, form, initialValues]);

  const persistPatch = async (patch: Record<string, unknown>, nextValues: StorageFormValues) => {
    await patchMutation.mutateAsync(patch);
    form.reset(nextValues);
    notifySuccessText(t("settings:SETTINGS_SAVED"));
  };

  const saveProvider = () =>
    withSavingKey("storage.provider", async () => {
      const values = await validateFormFields(form, ["storageProvider"]);
      const storageProvider = values.storageProvider === "s3" ? "s3" : "local";
      await persistPatch(
        { storage: { provider: storageProvider } },
        {
          ...form.getValues(),
          storageProvider,
          s3SecretAccessKey: "",
        },
      );
    });

  const saveDelivery = () =>
    withSavingKey("storage.delivery", async () => {
      const values = await validateFormFields(form, ["publicBaseUrl", "publicDeliveryMode"]);
      const publicBaseUrl = String(values.publicBaseUrl || "").trim();
      if (publicBaseUrl && !isValidHttpUrl(publicBaseUrl)) {
        form.setError("publicBaseUrl", {
          type: "validate",
          message: t("settings:SETTINGS_STORAGE_VALIDATION_URL_INVALID"),
        });
        throw new Error("FORM_VALIDATION_FAILED");
      }

      const publicDeliveryMode = readPublicDeliveryMode(values.publicDeliveryMode);
      await persistPatch(
        {
          storage: {
            public_base_url: normalizeOptionalString(publicBaseUrl),
            public_delivery_mode: publicDeliveryMode,
          },
        },
        {
          ...form.getValues(),
          publicBaseUrl,
          publicDeliveryMode,
          s3SecretAccessKey: "",
        },
      );
    });

  const saveS3Connection = () =>
    withSavingKey("storage.s3", async () => {
      const values = await validateFormFields(form, [
        "s3EndpointUrl",
        "s3Region",
        "s3Bucket",
        "s3PublicBucket",
        "s3AccessKeyId",
        "s3SecretAccessKey",
        "s3ForcePathStyle",
        "s3PresignExpiresSeconds",
      ]);
      const s3EndpointUrl = String(values.s3EndpointUrl || "").trim();
      const s3Bucket = String(values.s3Bucket || "").trim();
      const s3PublicBucket = String(values.s3PublicBucket || "").trim();
      const s3AccessKeyId = String(values.s3AccessKeyId || "").trim();
      const s3SecretAccessKey = String(values.s3SecretAccessKey || "").trim();
      const s3PresignExpiresSeconds = Number(values.s3PresignExpiresSeconds);

      if (!s3EndpointUrl) {
        form.setError("s3EndpointUrl", {
          type: "validate",
          message: t("settings:SETTINGS_VALIDATION_REQUIRED"),
        });
        throw new Error("FORM_VALIDATION_FAILED");
      }
      if (!s3Bucket) {
        form.setError("s3Bucket", {
          type: "validate",
          message: t("settings:SETTINGS_VALIDATION_REQUIRED"),
        });
        throw new Error("FORM_VALIDATION_FAILED");
      }
      if (!s3AccessKeyId) {
        form.setError("s3AccessKeyId", {
          type: "validate",
          message: t("settings:SETTINGS_VALIDATION_REQUIRED"),
        });
        throw new Error("FORM_VALIDATION_FAILED");
      }
      if (validatePresignTtl(s3PresignExpiresSeconds, t) !== true) {
        form.setError("s3PresignExpiresSeconds", {
          type: "validate",
          message: t("settings:SETTINGS_VALIDATION_REQUIRED"),
        });
        throw new Error("FORM_VALIDATION_FAILED");
      }
      if (!s3SecretAccessKey && !hasS3Secret) {
        form.setError("s3SecretAccessKey", {
          type: "validate",
          message: t("settings:SETTINGS_VALIDATION_REQUIRED"),
        });
        throw new Error("FORM_VALIDATION_FAILED");
      }

      const patchValue: Record<string, unknown> = {
        s3_endpoint_url: s3EndpointUrl,
        s3_region: normalizeOptionalString(values.s3Region),
        s3_bucket: s3Bucket,
        s3_public_bucket: normalizeOptionalString(s3PublicBucket),
        s3_access_key_id: s3AccessKeyId,
        s3_force_path_style: Boolean(values.s3ForcePathStyle),
        s3_presign_expires_seconds: s3PresignExpiresSeconds,
      };
      if (s3SecretAccessKey) {
        patchValue.s3_secret_access_key = s3SecretAccessKey;
      }

      await persistPatch(
        { storage: patchValue },
        {
          ...form.getValues(),
          s3EndpointUrl,
          s3Region: String(values.s3Region || "").trim(),
          s3Bucket,
          s3PublicBucket,
          s3AccessKeyId,
          s3SecretAccessKey: "",
          s3ForcePathStyle: Boolean(values.s3ForcePathStyle),
          s3PresignExpiresSeconds,
        },
      );
    });

  const overlayConfigs = useMemo<readonly SettingOverlayConfig<StorageOverlayKey>[]>(() => {
    const providerError = getFieldErrorMessage(form, "storageProvider");
    const publicBaseUrlError = getFieldErrorMessage(form, "publicBaseUrl");
    const publicDeliveryModeError = getFieldErrorMessage(form, "publicDeliveryMode");
    const endpointError = getFieldErrorMessage(form, "s3EndpointUrl");
    const regionError = getFieldErrorMessage(form, "s3Region");
    const bucketError = getFieldErrorMessage(form, "s3Bucket");
    const publicBucketError = getFieldErrorMessage(form, "s3PublicBucket");
    const accessKeyError = getFieldErrorMessage(form, "s3AccessKeyId");
    const secretError = getFieldErrorMessage(form, "s3SecretAccessKey");
    const presignExpiresSecondsError = getFieldErrorMessage(form, "s3PresignExpiresSeconds");

    return [
      {
        key: "provider",
        type: "dialog",
        title: t("settings:SETTINGS_STORAGE_DRAWER_PROVIDER_TITLE"),
        description: t("settings:SETTINGS_STORAGE_PROVIDER_DIALOG_DESC"),
        footer: (ctx) => (
          <SettingOverlayFooter
            close={ctx.close}
            backText={t("common:CANCEL")}
            saveText={t("settings:SETTINGS_SAVE")}
            saveLoading={savingKey === "storage.provider"}
            disabled={patchMutation.isPending}
            onSave={saveProvider}
          />
        ),
        content: () => (
          <SettingDialogFields>
            <Controller
              control={form.control}
              name="storageProvider"
              rules={{ required: t("settings:SETTINGS_VALIDATION_REQUIRED") }}
              render={({ field }) => (
                <OverlayField
                  label={t("settings:SETTINGS_STORAGE_PROVIDER_LABEL")}
                  message={providerError}
                >
                  <RadioGroup
                    value={field.value}
                    onValueChange={field.onChange}
                    className="grid gap-3"
                  >
                    <label className="flex w-full items-start gap-3 py-2">
                      <RadioGroupItem value="local" className="mt-1" />
                      <div className="grid min-w-0 gap-1">
                        <div className="text-headline text-label-primary">
                          {t("settings:SETTINGS_STORAGE_PROVIDER_LOCAL")}
                        </div>
                        <div className="text-label-secondary">
                          {t("settings:SETTINGS_SYSTEM_STORAGE_PROVIDER_LOCAL_HELP")}
                        </div>
                      </div>
                    </label>
                    <label className="flex w-full items-start gap-3 py-2">
                      <RadioGroupItem value="s3" className="mt-1" />
                      <div className="grid min-w-0 gap-1">
                        <div className="text-headline text-label-primary">
                          {t("settings:SETTINGS_STORAGE_PROVIDER_S3")}
                        </div>
                        <div className="text-label-secondary">
                          {t("settings:SETTINGS_SYSTEM_STORAGE_PROVIDER_S3_HELP")}
                        </div>
                      </div>
                    </label>
                  </RadioGroup>
                </OverlayField>
              )}
            />
          </SettingDialogFields>
        ),
      },
      {
        key: "delivery",
        type: "dialog",
        title: t("settings:SETTINGS_SYSTEM_STORAGE_DELIVERY_MODE_TITLE"),
        description: t("settings:SETTINGS_SYSTEM_STORAGE_DELIVERY_MODE_DESC"),
        footer: (ctx) => (
          <SettingOverlayFooter
            close={ctx.close}
            backText={t("common:CANCEL")}
            saveText={t("settings:SETTINGS_SAVE")}
            saveLoading={savingKey === "storage.delivery"}
            disabled={patchMutation.isPending}
            onSave={saveDelivery}
          />
        ),
        content: () => (
          <SettingDialogFields>
            <Controller
              control={form.control}
              name="publicDeliveryMode"
              rules={{ required: t("settings:SETTINGS_VALIDATION_REQUIRED") }}
              render={({ field }) => (
                <OverlayField
                  label={t("settings:SETTINGS_STORAGE_PUBLIC_DELIVERY_MODE_LABEL")}
                  message={publicDeliveryModeError}
                >
                  <RadioGroup
                    value={field.value}
                    onValueChange={field.onChange}
                    className="grid gap-3"
                  >
                    <label className="flex w-full items-start gap-3 py-2">
                      <RadioGroupItem value="auto" className="mt-1" />
                      <div className="grid min-w-0 gap-1">
                        <div className="text-headline text-label-primary">
                          {t("settings:SETTINGS_STORAGE_PUBLIC_DELIVERY_MODE_AUTO")}
                        </div>
                        <div className="text-label-secondary">
                          {t("settings:SETTINGS_STORAGE_PUBLIC_DELIVERY_MODE_AUTO_HELP")}
                        </div>
                      </div>
                    </label>
                    <label className="flex w-full items-start gap-3 py-2">
                      <RadioGroupItem value="direct" className="mt-1" />
                      <div className="grid min-w-0 gap-1">
                        <div className="text-headline text-label-primary">
                          {t("settings:SETTINGS_STORAGE_PUBLIC_DELIVERY_MODE_DIRECT")}
                        </div>
                        <div className="text-label-secondary">
                          {t("settings:SETTINGS_STORAGE_PUBLIC_DELIVERY_MODE_DIRECT_HELP")}
                        </div>
                      </div>
                    </label>
                    <label className="flex w-full items-start gap-3 py-2">
                      <RadioGroupItem value="presign" className="mt-1" />
                      <div className="grid min-w-0 gap-1">
                        <div className="text-headline text-label-primary">
                          {t("settings:SETTINGS_STORAGE_PUBLIC_DELIVERY_MODE_PRESIGN")}
                        </div>
                        <div className="text-label-secondary">
                          {t("settings:SETTINGS_STORAGE_PUBLIC_DELIVERY_MODE_PRESIGN_HELP")}
                        </div>
                      </div>
                    </label>
                  </RadioGroup>
                </OverlayField>
              )}
            />

            <Controller
              control={form.control}
              name="publicBaseUrl"
              render={({ field }) => (
                <OverlayField
                  label={t("settings:SETTINGS_STORAGE_PUBLIC_BASE_URL_LABEL")}
                  description={t("settings:SETTINGS_STORAGE_PUBLIC_BASE_URL_DIALOG_HELP")}
                  message={publicBaseUrlError}
                >
                  <Input
                    {...field}
                    placeholder={t("settings:SETTINGS_STORAGE_PUBLIC_BASE_URL_PLACEHOLDER")}
                  />
                </OverlayField>
              )}
            />
          </SettingDialogFields>
        ),
      },
      {
        key: "s3",
        type: "sheet",
        title: t("settings:SETTINGS_STORAGE_DRAWER_S3_CONFIG_TITLE"),
        description: t("settings:SETTINGS_STORAGE_S3_CONFIG_SHEET_DESC"),
        footer: (ctx) => (
          <SettingOverlayFooter
            close={ctx.close}
            backText={t("common:CANCEL")}
            saveText={t("settings:SETTINGS_SAVE")}
            saveLoading={savingKey === "storage.s3"}
            disabled={patchMutation.isPending}
            onSave={saveS3Connection}
          />
        ),
        content: () => (
          <SettingDialogFields>
            <Controller
              control={form.control}
              name="s3EndpointUrl"
              rules={{
                validate: (value) =>
                  isValidHttpUrl(value) || t("settings:SETTINGS_STORAGE_VALIDATION_URL_INVALID"),
              }}
              render={({ field }) => (
                <OverlayField
                  label={t("settings:SETTINGS_STORAGE_S3_ENDPOINT_URL_LABEL")}
                  message={endpointError}
                >
                  <Input
                    {...field}
                    placeholder={t("settings:SETTINGS_STORAGE_S3_ENDPOINT_URL_PLACEHOLDER")}
                  />
                </OverlayField>
              )}
            />
            <Controller
              control={form.control}
              name="s3Region"
              render={({ field }) => (
                <OverlayField
                  label={t("settings:SETTINGS_STORAGE_S3_REGION_LABEL")}
                  message={regionError}
                >
                  <Input {...field} placeholder="us-east-1" />
                </OverlayField>
              )}
            />
            <Controller
              control={form.control}
              name="s3Bucket"
              render={({ field }) => (
                <OverlayField
                  label={t("settings:SETTINGS_STORAGE_S3_BUCKET_LABEL")}
                  message={bucketError}
                >
                  <Input {...field} placeholder="assets-private" />
                </OverlayField>
              )}
            />
            <Controller
              control={form.control}
              name="s3PublicBucket"
              render={({ field }) => (
                <OverlayField
                  label={t("settings:SETTINGS_STORAGE_S3_PUBLIC_BUCKET_LABEL")}
                  description={t("settings:SETTINGS_STORAGE_S3_PUBLIC_BUCKET_HELP")}
                  message={publicBucketError}
                >
                  <Input {...field} placeholder="assets-public" />
                </OverlayField>
              )}
            />
            <Controller
              control={form.control}
              name="s3AccessKeyId"
              render={({ field }) => (
                <OverlayField
                  label={t("settings:SETTINGS_STORAGE_S3_ACCESS_KEY_ID_LABEL")}
                  message={accessKeyError}
                >
                  <Input {...field} autoComplete="off" />
                </OverlayField>
              )}
            />
            <Controller
              control={form.control}
              name="s3SecretAccessKey"
              render={({ field }) => (
                <OverlayField
                  label={t("settings:SETTINGS_STORAGE_S3_SECRET_ACCESS_KEY_LABEL")}
                  description={
                    hasS3Secret
                      ? t("settings:SETTINGS_SYSTEM_STORAGE_SECRET_SET_HINT")
                      : t("settings:SETTINGS_SYSTEM_STORAGE_SECRET_EMPTY_HINT")
                  }
                  message={secretError}
                >
                  <Input
                    {...field}
                    type="password"
                    autoComplete="new-password"
                    placeholder={t("settings:SETTINGS_MESSAGING_MAIL_PASSWORD_PLACEHOLDER")}
                  />
                </OverlayField>
              )}
            />
            <Controller
              control={form.control}
              name="s3ForcePathStyle"
              render={({ field }) => (
                <OverlayBooleanField
                  label={t("settings:SETTINGS_STORAGE_S3_FORCE_PATH_STYLE_LABEL")}
                  description={t("settings:SETTINGS_SYSTEM_STORAGE_FORCE_PATH_STYLE_HELP")}
                  checked={Boolean(field.value)}
                  onCheckedChange={field.onChange}
                  stateLabel={
                    field.value ? t("settings:SETTINGS_ENABLED") : t("settings:SETTINGS_DISABLED")
                  }
                />
              )}
            />
            <Controller
              control={form.control}
              name="s3PresignExpiresSeconds"
              rules={{ validate: (value) => validatePresignTtl(value, t) }}
              render={({ field }) => (
                <OverlayField
                  label={t("settings:SETTINGS_STORAGE_S3_PRESIGN_EXPIRES_SECONDS_LABEL")}
                  description={t("settings:SETTINGS_STORAGE_S3_PRESIGN_EXPIRES_SECONDS_HELP")}
                  message={presignExpiresSecondsError}
                >
                  <NumberInput
                    value={field.value}
                    min={60}
                    max={86400}
                    onValueChange={field.onChange}
                  />
                </OverlayField>
              )}
            />
          </SettingDialogFields>
        ),
      },
    ] as const;
  }, [
    form,
    hasS3Secret,
    patchMutation.isPending,
    saveDelivery,
    saveProvider,
    saveS3Connection,
    savingKey,
    t,
  ]);

  const overlays = useSettingOverlays(overlayConfigs);
  const openOverlay = (key: StorageOverlayKey) => {
    form.reset(initialValues);
    overlays.open(key);
  };
  const storageProvider = initialValues.storageProvider;
  const deliverySummary = joinSummaryParts([
    formatDeliveryModeSummary(initialValues.publicDeliveryMode, t),
    initialValues.publicBaseUrl,
  ]);
  const connectionSummary = joinSummaryParts([
    initialValues.s3Bucket,
    initialValues.s3PublicBucket ? `public:${initialValues.s3PublicBucket}` : null,
    initialValues.s3Region,
    initialValues.s3EndpointUrl,
  ]);

  return (
    <ContentGuard
      loading={coreSettingsQuery.isLoading && !coreSettingsQuery.coreSettings}
      error={coreSettingsQuery.error}
      onRetry={() => void coreSettingsQuery.refetch()}
    >
      <SettingPanel
        title={t("settings:SETTINGS_SYSTEM_STORAGE_PAGE_TITLE")}
        description={t("settings:SETTINGS_SYSTEM_STORAGE_PAGE_DESC")}
        bordered={false}
      >
        <SettingActionGroup>
          <SettingActionItem
            title={t("settings:SETTINGS_STORAGE_PROVIDER_LABEL")}
            summary={formatProviderSummary(storageProvider, t)}
            description={t("settings:SETTINGS_STORAGE_PROVIDER_DESC")}
            onTrigger={() => openOverlay("provider")}
          />
          {storageProvider === "s3" ? (
            <SettingActionItem
              title={t("settings:SETTINGS_SYSTEM_STORAGE_DELIVERY_MODE_TITLE")}
              summary={deliverySummary}
              description={t("settings:SETTINGS_SYSTEM_STORAGE_DELIVERY_MODE_DESC")}
              onTrigger={() => openOverlay("delivery")}
            />
          ) : null}
          {storageProvider === "s3" ? (
            <SettingActionItem
              title={t("settings:SETTINGS_STORAGE_S3_CONFIG_LABEL")}
              summary={connectionSummary}
              description={t("settings:SETTINGS_STORAGE_S3_CONFIG_DESC")}
              onTrigger={() => openOverlay("s3")}
            />
          ) : null}
        </SettingActionGroup>

        {overlays.renderOverlays()}
      </SettingPanel>
    </ContentGuard>
  );
}
