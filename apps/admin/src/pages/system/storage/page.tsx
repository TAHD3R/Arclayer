import { useEffect, useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { RadioGroup, RadioGroupItem } from "@arclayer/ui/radio-group";
import { Input } from "@arclayer/ui/input";
import { SettingActionGroup } from "@arclayer/ui/setting-action-group";
import { SettingActionItem } from "@arclayer/ui/setting-action-item";
import { SettingOverlayFooter } from "@arclayer/ui/setting-overlay-footer";
import { SettingPanel } from "@arclayer/ui/setting-panel";
import { useSavingKey } from "@arclayer/hooks/use-saving-key";

import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { getFieldErrorMessage, validateFormFields } from "@/lib/forms/rhf-form-helpers";
import { type SettingOverlayConfig, useSettingOverlays } from "@/hooks/use-setting-overlays";
import {
  getSystemSettingsSection,
  getSystemSettingsSecrets,
  readBooleanValue,
  readStringValue,
  usePatchSystemCoreSettings,
  useSystemCoreSettings,
} from "@/pages/system/hooks/use-system-core-settings";
import {
  OverlayField,
  OverlayBooleanField,
  isValidHttpUrl,
  joinSummaryParts,
  normalizeOptionalString,
} from "@/pages/system/system-settings-form-utils";

type StorageFormValues = {
  storageProvider: "local" | "s3";
  s3EndpointUrl: string;
  s3Region: string;
  s3Bucket: string;
  s3AccessKeyId: string;
  s3SecretAccessKey: string;
  s3ForcePathStyle: boolean;
};

type StorageOverlayKey = "provider" | "s3";

function buildInitialValues(
  input: ReturnType<typeof useSystemCoreSettings>["coreSettings"],
): StorageFormValues {
  const storage = getSystemSettingsSection(input, "storage");
  return {
    storageProvider: readStringValue(storage, "provider") === "s3" ? "s3" : "local",
    s3EndpointUrl: readStringValue(storage, "s3_endpoint_url") ?? "",
    s3Region: readStringValue(storage, "s3_region") ?? "",
    s3Bucket: readStringValue(storage, "s3_bucket") ?? "",
    s3AccessKeyId: readStringValue(storage, "s3_access_key_id") ?? "",
    s3SecretAccessKey: "",
    s3ForcePathStyle: Boolean(readBooleanValue(storage, "s3_force_path_style")),
  };
}

function formatProviderSummary(value: "local" | "s3", t: (key: string) => string) {
  return value === "s3"
    ? t("settings:SETTINGS_STORAGE_PROVIDER_S3")
    : t("settings:SETTINGS_STORAGE_PROVIDER_LOCAL");
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
    try {
      await patchMutation.mutateAsync(patch);
      form.reset(nextValues);
      notifySuccessText(t("settings:SETTINGS_SAVED"));
    } catch (error) {
      notifyError(error);
      throw error;
    }
  };

  const saveProvider = () =>
    withSavingKey("storage.provider", async () => {
      const values = await validateFormFields(form, ["storageProvider"]);
      const provider = values.storageProvider === "s3" ? "s3" : "local";
      await persistPatch(
        { storage: { provider } },
        {
          ...form.getValues(),
          storageProvider: provider,
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
        "s3AccessKeyId",
        "s3SecretAccessKey",
        "s3ForcePathStyle",
      ]);
      const endpoint = String(values.s3EndpointUrl || "").trim();
      const bucket = String(values.s3Bucket || "").trim();
      const accessKeyId = String(values.s3AccessKeyId || "").trim();
      const secret = String(values.s3SecretAccessKey || "").trim();

      if (!endpoint) {
        form.setError("s3EndpointUrl", {
          type: "validate",
          message: t("settings:SETTINGS_VALIDATION_REQUIRED"),
        });
        throw new Error("FORM_VALIDATION_FAILED");
      }
      if (!bucket) {
        form.setError("s3Bucket", {
          type: "validate",
          message: t("settings:SETTINGS_VALIDATION_REQUIRED"),
        });
        throw new Error("FORM_VALIDATION_FAILED");
      }
      if (!accessKeyId) {
        form.setError("s3AccessKeyId", {
          type: "validate",
          message: t("settings:SETTINGS_VALIDATION_REQUIRED"),
        });
        throw new Error("FORM_VALIDATION_FAILED");
      }
      if (!secret && !hasS3Secret) {
        form.setError("s3SecretAccessKey", {
          type: "validate",
          message: t("settings:SETTINGS_VALIDATION_REQUIRED"),
        });
        throw new Error("FORM_VALIDATION_FAILED");
      }

      const patchValue: Record<string, unknown> = {
        s3_endpoint_url: endpoint,
        s3_region: normalizeOptionalString(values.s3Region),
        s3_bucket: bucket,
        s3_access_key_id: accessKeyId,
        s3_force_path_style: Boolean(values.s3ForcePathStyle),
      };
      if (secret) {
        patchValue.s3_secret_access_key = secret;
      }

      await persistPatch(
        { storage: patchValue },
        {
          ...form.getValues(),
          s3EndpointUrl: endpoint,
          s3Region: String(values.s3Region || "").trim(),
          s3Bucket: bucket,
          s3AccessKeyId: accessKeyId,
          s3SecretAccessKey: "",
          s3ForcePathStyle: Boolean(values.s3ForcePathStyle),
        },
      );
    });

  const overlayConfigs = useMemo<readonly SettingOverlayConfig<StorageOverlayKey>[]>(() => {
    const providerError = getFieldErrorMessage(form, "storageProvider");
    const endpointError = getFieldErrorMessage(form, "s3EndpointUrl");
    const regionError = getFieldErrorMessage(form, "s3Region");
    const bucketError = getFieldErrorMessage(form, "s3Bucket");
    const accessKeyError = getFieldErrorMessage(form, "s3AccessKeyId");
    const secretError = getFieldErrorMessage(form, "s3SecretAccessKey");

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
          <div className="space-y-4">
            <div className="text-label-secondary">
              {t("settings:SETTINGS_STORAGE_PROVIDER_DIALOG_HELP")}
            </div>
            <Controller
              control={form.control}
              name="storageProvider"
              rules={{ required: t("settings:SETTINGS_VALIDATION_REQUIRED") }}
              render={({ field }) => (
                <OverlayField
                  label={t("settings:SETTINGS_STORAGE_PROVIDER_LABEL")}
                  message={providerError}
                >
                  <RadioGroup value={field.value} onValueChange={field.onChange}>
                    <label className="flex items-start gap-3 rounded-xl border border-border p-4">
                      <RadioGroupItem value="local" className="mt-1" />
                      <div className="space-y-1">
                        <div className="font-medium">
                          {t("settings:SETTINGS_STORAGE_PROVIDER_LOCAL")}
                        </div>
                        <div className="text-footnote text-label-secondary">
                          {t("settings:SETTINGS_SYSTEM_STORAGE_PROVIDER_LOCAL_HELP")}
                        </div>
                      </div>
                    </label>
                    <label className="flex items-start gap-3 rounded-xl border border-border p-4">
                      <RadioGroupItem value="s3" className="mt-1" />
                      <div className="space-y-1">
                        <div className="font-medium">
                          {t("settings:SETTINGS_STORAGE_PROVIDER_S3")}
                        </div>
                        <div className="text-footnote text-label-secondary">
                          {t("settings:SETTINGS_SYSTEM_STORAGE_PROVIDER_S3_HELP")}
                        </div>
                      </div>
                    </label>
                  </RadioGroup>
                </OverlayField>
              )}
            />
          </div>
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
          <div className="space-y-5">
            <div className="text-label-secondary">
              {t("settings:SETTINGS_STORAGE_S3_CONFIG_SHEET_HELP")}
            </div>
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
                  <Input {...field} placeholder="assets-prod" />
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
          </div>
        ),
      },
    ] as const;
  }, [
    form,
    hasS3Secret,
    initialValues.storageProvider,
    patchMutation.isPending,
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
  const connectionSummary = joinSummaryParts([
    initialValues.s3Bucket,
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
