import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, PencilLine, PlugZap, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";

import {
  SYSTEM_STORAGE_PROFILES_QUERY_KEY,
  createStorageProfile,
  deleteStorageProfile,
  listStorageProfiles,
  testStorageProfile,
  updateStorageProfile,
} from "@/api/storage-profiles";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { getFieldErrorMessage } from "@/lib/forms/rhf-form-helpers";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import {
  SystemSettingField,
  SystemSettingFooterActions,
  SystemSettingItem,
  SystemSettingStack,
} from "@/pages/system/components/system-setting-item";
import {
  getSystemSettingsSection,
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
import { useSavingKey } from "@arclayer/hooks/use-saving-key";
import { Badge } from "@arclayer/ui/badge";
import { Button } from "@arclayer/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@arclayer/ui/empty";
import { Input } from "@arclayer/ui/input";
import { NumberInput } from "@arclayer/ui/number-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";
import { SettingDialog } from "@arclayer/ui/setting-dialog";
import { SettingDialogFields } from "@arclayer/ui/setting-dialog-field";
import { SettingOverlayFooter } from "@arclayer/ui/setting-overlay-footer";
import type {
  ObjectStorageProviderKind,
  StorageProfileConfigPayloadInput,
  StorageProfileOut,
} from "@arclayer/openapi";

type StorageProfileDialogMode = "create" | "edit";
type PendingAction =
  | { type: "create" | "update" }
  | { type: "test" | "delete"; profileKey: string }
  | null;
type PublicDeliveryMode = "auto" | "direct" | "presign";

type StorageProfileFormValues = {
  profileKey: string;
  displayName: string;
  provider: ObjectStorageProviderKind;
  endpointUrl: string;
  region: string;
  bucket: string;
  publicBucket: string;
  publicBaseUrl: string;
  publicDeliveryMode: PublicDeliveryMode;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
  presignExpiresSeconds: number;
  isActive: boolean;
  isDefault: boolean;
};

type StorageLimitsFormValues = {
  defaultProfileKey: string;
  uploadChunkSizeMb: number;
  uploadMaxFileSizeMb: number;
  uploadMaxAvatarSizeMb: number;
  uploadMaxSiteLogoSizeMb: number;
  uploadMaxFaviconSizeMb: number;
  uploadSessionTtlSeconds: number;
  recycleBinRetentionDays: number;
};

type StorageProviderOption = {
  value: ObjectStorageProviderKind;
  labelKey: string;
  descriptionKey: string;
  defaultDisplayName: string;
  defaultEndpointUrl: string;
  defaultRegion: string;
  defaultForcePathStyle: boolean;
  requiresRemoteConfig: boolean;
  requiresEndpoint: boolean;
  supportsPublicBucket: boolean;
  supportsPathStyle: boolean;
};

const STORAGE_PROFILE_KEY_PATTERN = /^[a-z0-9][a-z0-9_-]{1,127}$/;
const ENV_DEFAULT_PROFILE_KEY = "env-default";
const STORAGE_LIMIT_FIELDS = [
  "uploadChunkSizeMb",
  "uploadMaxFileSizeMb",
  "uploadMaxAvatarSizeMb",
  "uploadMaxSiteLogoSizeMb",
  "uploadMaxFaviconSizeMb",
  "uploadSessionTtlSeconds",
  "recycleBinRetentionDays",
] as const;
const PROVIDER_OPTIONS: readonly StorageProviderOption[] = [
  {
    value: "local",
    labelKey: "settings:SETTINGS_STORAGE_PROVIDER_LOCAL",
    descriptionKey: "settings:SETTINGS_SYSTEM_STORAGE_PROVIDER_LOCAL_HELP",
    defaultDisplayName: "Local storage",
    defaultEndpointUrl: "",
    defaultRegion: "",
    defaultForcePathStyle: false,
    requiresRemoteConfig: false,
    requiresEndpoint: false,
    supportsPublicBucket: false,
    supportsPathStyle: false,
  },
  {
    value: "aws_s3",
    labelKey: "settings:SETTINGS_STORAGE_PROVIDER_AWS_S3",
    descriptionKey: "settings:SETTINGS_SYSTEM_STORAGE_PROVIDER_AWS_S3_HELP",
    defaultDisplayName: "AWS S3",
    defaultEndpointUrl: "",
    defaultRegion: "us-east-1",
    defaultForcePathStyle: false,
    requiresRemoteConfig: true,
    requiresEndpoint: false,
    supportsPublicBucket: true,
    supportsPathStyle: false,
  },
  {
    value: "minio",
    labelKey: "settings:SETTINGS_STORAGE_PROVIDER_MINIO",
    descriptionKey: "settings:SETTINGS_SYSTEM_STORAGE_PROVIDER_MINIO_HELP",
    defaultDisplayName: "MinIO",
    defaultEndpointUrl: "http://127.0.0.1:9000",
    defaultRegion: "us-east-1",
    defaultForcePathStyle: true,
    requiresRemoteConfig: true,
    requiresEndpoint: true,
    supportsPublicBucket: true,
    supportsPathStyle: true,
  },
  {
    value: "cloudflare_r2",
    labelKey: "settings:SETTINGS_STORAGE_PROVIDER_CLOUDFLARE_R2",
    descriptionKey: "settings:SETTINGS_SYSTEM_STORAGE_PROVIDER_CLOUDFLARE_R2_HELP",
    defaultDisplayName: "Cloudflare R2",
    defaultEndpointUrl: "https://<account-id>.r2.cloudflarestorage.com",
    defaultRegion: "auto",
    defaultForcePathStyle: false,
    requiresRemoteConfig: true,
    requiresEndpoint: true,
    supportsPublicBucket: false,
    supportsPathStyle: false,
  },
  {
    value: "aliyun_oss",
    labelKey: "settings:SETTINGS_STORAGE_PROVIDER_ALIYUN_OSS",
    descriptionKey: "settings:SETTINGS_SYSTEM_STORAGE_PROVIDER_ALIYUN_OSS_HELP",
    defaultDisplayName: "Aliyun OSS",
    defaultEndpointUrl: "https://oss-cn-hangzhou.aliyuncs.com",
    defaultRegion: "cn-hangzhou",
    defaultForcePathStyle: false,
    requiresRemoteConfig: true,
    requiresEndpoint: true,
    supportsPublicBucket: true,
    supportsPathStyle: false,
  },
  {
    value: "volcengine_tos",
    labelKey: "settings:SETTINGS_STORAGE_PROVIDER_VOLCENGINE_TOS",
    descriptionKey: "settings:SETTINGS_SYSTEM_STORAGE_PROVIDER_VOLCENGINE_TOS_HELP",
    defaultDisplayName: "Volcengine TOS",
    defaultEndpointUrl: "https://tos-cn-beijing.volces.com",
    defaultRegion: "cn-beijing",
    defaultForcePathStyle: false,
    requiresRemoteConfig: true,
    requiresEndpoint: true,
    supportsPublicBucket: true,
    supportsPathStyle: false,
  },
] as const;

function getProviderOption(provider: ObjectStorageProviderKind): StorageProviderOption {
  return PROVIDER_OPTIONS.find((item) => item.value === provider) ?? PROVIDER_OPTIONS[0];
}

function createDefaultFormValues(
  provider: ObjectStorageProviderKind = "local",
): StorageProfileFormValues {
  const option = getProviderOption(provider);
  return {
    profileKey: "",
    displayName: option.defaultDisplayName,
    provider,
    endpointUrl: option.defaultEndpointUrl,
    region: option.defaultRegion,
    bucket: "",
    publicBucket: "",
    publicBaseUrl: "",
    publicDeliveryMode: "auto",
    accessKeyId: "",
    secretAccessKey: "",
    forcePathStyle: option.defaultForcePathStyle,
    presignExpiresSeconds: 900,
    isActive: true,
    isDefault: false,
  };
}

function buildFormValues(profile: StorageProfileOut): StorageProfileFormValues {
  return {
    profileKey: profile.profileKey,
    displayName: profile.displayName,
    provider: profile.provider,
    endpointUrl: profile.config.endpointUrl ?? "",
    region: profile.config.region ?? "",
    bucket: profile.config.bucket ?? "",
    publicBucket: profile.config.publicBucket ?? "",
    publicBaseUrl: profile.config.publicBaseUrl ?? "",
    publicDeliveryMode:
      profile.config.publicDeliveryMode === "direct" ||
      profile.config.publicDeliveryMode === "presign"
        ? profile.config.publicDeliveryMode
        : "auto",
    accessKeyId: profile.config.accessKeyId ?? "",
    secretAccessKey: "",
    forcePathStyle: Boolean(profile.config.forcePathStyle),
    presignExpiresSeconds: profile.config.presignExpiresSeconds ?? 900,
    isActive: profile.isActive,
    isDefault: profile.isDefault,
  };
}

function buildStorageLimitsInitialValues(
  input: ReturnType<typeof useSystemCoreSettings>["coreSettings"],
): StorageLimitsFormValues {
  const storage = getSystemSettingsSection(input, "storage");
  return {
    defaultProfileKey: readStringValue(storage, "default_profile_key") ?? "",
    uploadChunkSizeMb: readNumberValue(storage, "upload_chunk_size_mb") ?? 8,
    uploadMaxFileSizeMb: readNumberValue(storage, "upload_max_file_size_mb") ?? 2048,
    uploadMaxAvatarSizeMb: readNumberValue(storage, "upload_max_avatar_size_mb") ?? 10,
    uploadMaxSiteLogoSizeMb: readNumberValue(storage, "upload_max_site_logo_size_mb") ?? 20,
    uploadMaxFaviconSizeMb: readNumberValue(storage, "upload_max_favicon_size_mb") ?? 2,
    uploadSessionTtlSeconds: readNumberValue(storage, "upload_session_ttl_seconds") ?? 3600,
    recycleBinRetentionDays: readNumberValue(storage, "recycle_bin_retention_days") ?? 90,
  };
}

function isReadOnlyProfile(profile: StorageProfileOut): boolean {
  return profile.profileKey === ENV_DEFAULT_PROFILE_KEY;
}

function buildStorageProfileConfigPayload(
  values: StorageProfileFormValues,
): StorageProfileConfigPayloadInput {
  const option = getProviderOption(values.provider);
  return {
    publicBaseUrl: normalizeOptionalString(values.publicBaseUrl),
    publicDeliveryMode: values.publicDeliveryMode,
    presignExpiresSeconds: values.presignExpiresSeconds,
    forcePathStyle: option.supportsPathStyle ? values.forcePathStyle : false,
    endpointUrl: option.requiresRemoteConfig ? normalizeOptionalString(values.endpointUrl) : null,
    region: option.requiresRemoteConfig ? normalizeOptionalString(values.region) : null,
    bucket: option.requiresRemoteConfig ? normalizeOptionalString(values.bucket) : null,
    publicBucket:
      option.requiresRemoteConfig && option.supportsPublicBucket
        ? normalizeOptionalString(values.publicBucket)
        : null,
    accessKeyId: option.requiresRemoteConfig ? normalizeOptionalString(values.accessKeyId) : null,
    secretAccessKey:
      option.requiresRemoteConfig && values.secretAccessKey.trim()
        ? values.secretAccessKey.trim()
        : undefined,
  };
}

function formatProviderLabel(
  provider: ObjectStorageProviderKind,
  t: (key: string) => string,
): string {
  return t(getProviderOption(provider).labelKey);
}

function formatDeliveryLabel(mode: string | null | undefined, t: (key: string) => string): string {
  if (mode === "direct") return t("settings:SETTINGS_STORAGE_PUBLIC_DELIVERY_MODE_DIRECT");
  if (mode === "presign") return t("settings:SETTINGS_STORAGE_PUBLIC_DELIVERY_MODE_PRESIGN");
  return t("settings:SETTINGS_STORAGE_PUBLIC_DELIVERY_MODE_AUTO");
}

function formatDateTime(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  } catch {
    return value;
  }
}

function stopEvent(event: { stopPropagation?: () => void }) {
  event.stopPropagation?.();
}

function getPendingProfileKey(pendingAction: PendingAction): string | null {
  if (!pendingAction || !("profileKey" in pendingAction)) return null;
  return pendingAction.profileKey;
}

function StorageMetric(props: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="min-w-0 py-2">
      <div className="text-caption text-label-secondary">{props.label}</div>
      <div className="mt-1 truncate text-footnote font-medium text-label-primary">
        {props.value || "-"}
      </div>
    </div>
  );
}

function StorageLimitNumberField(props: {
  label: string;
  value: number;
  min: number;
  max?: number;
  onValueChange: (value: number) => void;
}) {
  return (
    <SystemSettingField label={props.label}>
      <NumberInput
        value={props.value}
        min={props.min}
        max={props.max}
        onValueChange={(next) => props.onValueChange(next ?? props.min)}
      />
    </SystemSettingField>
  );
}

function FormField(props: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <SystemSettingField label={props.label} description={props.description}>
      {props.children}
    </SystemSettingField>
  );
}

export function SystemSettingsStoragePage() {
  const { t } = useTranslation(["settings", "common"]);
  const queryClient = useQueryClient();
  const { savingKey, withSavingKey } = useSavingKey();
  const [dialogMode, setDialogMode] = useState<StorageProfileDialogMode | null>(null);
  const [editingProfile, setEditingProfile] = useState<StorageProfileOut | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StorageProfileOut | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const coreSettingsQuery = useSystemCoreSettings();
  const patchCoreSettings = usePatchSystemCoreSettings();

  const profilesQuery = useQuery({
    queryKey: SYSTEM_STORAGE_PROFILES_QUERY_KEY,
    queryFn: listStorageProfiles,
    staleTime: 5 * 60 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const form = useForm<StorageProfileFormValues>({
    defaultValues: createDefaultFormValues(),
    mode: "onSubmit",
  });
  const limitsInitialValues = useMemo(
    () => buildStorageLimitsInitialValues(coreSettingsQuery.coreSettings),
    [coreSettingsQuery.coreSettings],
  );
  const limitsForm = useForm<StorageLimitsFormValues>({
    defaultValues: limitsInitialValues,
    mode: "onSubmit",
  });
  const limitValues = limitsForm.watch();

  const createMutation = useMutation({
    mutationFn: createStorageProfile,
  });
  const updateMutation = useMutation({
    mutationFn: ({
      profileId,
      payload,
    }: {
      profileId: string;
      payload: Parameters<typeof updateStorageProfile>[1];
    }) => updateStorageProfile(profileId, payload),
  });
  const testMutation = useMutation({
    mutationFn: testStorageProfile,
  });
  const deleteMutation = useMutation({
    mutationFn: deleteStorageProfile,
  });

  const profiles = profilesQuery.data ?? [];
  const defaultProfile =
    profiles.find((profile) => profile.profileKey === limitsInitialValues.defaultProfileKey) ??
    profiles.find((profile) => profile.isDefault) ??
    profiles[0] ??
    null;
  const selectedProvider = form.watch("provider");
  const selectedProviderOption = getProviderOption(selectedProvider);
  const isCreateDialogOpen = dialogMode !== null;
  const isEditing = dialogMode === "edit" && editingProfile !== null;
  const formHasSecret = Boolean(editingProfile?.secrets?.secretAccessKey);
  const formBusy = createMutation.isPending || updateMutation.isPending;
  const pendingProfileKey = getPendingProfileKey(pendingAction);
  const limitsDirty = STORAGE_LIMIT_FIELDS.some(
    (field) => limitValues[field] !== limitsInitialValues[field],
  );
  const defaultProfileDirty =
    limitValues.defaultProfileKey !== limitsInitialValues.defaultProfileKey;

  useEffect(() => {
    if (!coreSettingsQuery.coreSettings) return;
    if (limitsForm.formState.isDirty) return;
    limitsForm.reset(limitsInitialValues);
  }, [coreSettingsQuery.coreSettings, limitsForm, limitsInitialValues]);

  const closeDialog = () => {
    if (formBusy) return;
    setDialogMode(null);
    setEditingProfile(null);
    form.reset(createDefaultFormValues());
  };

  const invalidateProfiles = async () => {
    await queryClient.invalidateQueries({
      queryKey: SYSTEM_STORAGE_PROFILES_QUERY_KEY,
    });
  };

  const openCreateDialog = () => {
    setDialogMode("create");
    setEditingProfile(null);
    form.reset(createDefaultFormValues());
  };

  const openEditDialog = (profile: StorageProfileOut) => {
    if (isReadOnlyProfile(profile)) return;
    setDialogMode("edit");
    setEditingProfile(profile);
    form.reset(buildFormValues(profile));
  };

  const applyCreateProviderPreset = (provider: ObjectStorageProviderKind) => {
    const preset = createDefaultFormValues(provider);
    const current = form.getValues();
    form.setValue("provider", provider, { shouldDirty: true });
    form.setValue(
      "displayName",
      current.displayName.trim() ? current.displayName : preset.displayName,
      { shouldDirty: true },
    );
    form.setValue("endpointUrl", preset.endpointUrl, { shouldDirty: true });
    form.setValue("region", preset.region, { shouldDirty: true });
    form.setValue("forcePathStyle", preset.forcePathStyle, { shouldDirty: true });
    form.setValue("bucket", "", { shouldDirty: true });
    form.setValue("publicBucket", "", { shouldDirty: true });
    form.setValue("accessKeyId", "", { shouldDirty: true });
    form.setValue("secretAccessKey", "", { shouldDirty: true });
  };

  const validateProfileForm = () => {
    const values = form.getValues();
    const option = getProviderOption(values.provider);
    form.clearErrors();

    let hasError = false;
    const setError = (name: keyof StorageProfileFormValues, message: string) => {
      form.setError(name, { type: "validate", message });
      hasError = true;
    };

    const profileKey = values.profileKey.trim().toLowerCase();
    const displayName = values.displayName.trim();
    const endpointUrl = values.endpointUrl.trim();
    const bucket = values.bucket.trim();
    const accessKeyId = values.accessKeyId.trim();
    const secretAccessKey = values.secretAccessKey.trim();
    const publicBaseUrl = values.publicBaseUrl.trim();

    if (dialogMode === "create") {
      if (!profileKey) {
        setError("profileKey", t("settings:SETTINGS_VALIDATION_REQUIRED"));
      } else if (!STORAGE_PROFILE_KEY_PATTERN.test(profileKey)) {
        setError("profileKey", t("settings:SETTINGS_SYSTEM_STORAGE_PROFILE_KEY_INVALID"));
      }
    }

    if (!displayName) {
      setError("displayName", t("settings:SETTINGS_VALIDATION_REQUIRED"));
    }

    if (publicBaseUrl && !isValidHttpUrl(publicBaseUrl)) {
      setError("publicBaseUrl", t("settings:SETTINGS_STORAGE_VALIDATION_URL_INVALID"));
    }

    if (option.requiresRemoteConfig) {
      if (option.requiresEndpoint && !endpointUrl) {
        setError("endpointUrl", t("settings:SETTINGS_VALIDATION_REQUIRED"));
      }
      if (!bucket) {
        setError("bucket", t("settings:SETTINGS_VALIDATION_REQUIRED"));
      }
      if (!accessKeyId) {
        setError("accessKeyId", t("settings:SETTINGS_VALIDATION_REQUIRED"));
      }
      if (!secretAccessKey && (dialogMode === "create" || !formHasSecret)) {
        setError("secretAccessKey", t("settings:SETTINGS_VALIDATION_REQUIRED"));
      }
    }

    if (
      !Number.isFinite(values.presignExpiresSeconds) ||
      values.presignExpiresSeconds < 60 ||
      values.presignExpiresSeconds > 24 * 3600
    ) {
      setError("presignExpiresSeconds", t("settings:SETTINGS_VALIDATION_REQUIRED"));
    }

    if (hasError) {
      throw new Error("FORM_VALIDATION_FAILED");
    }

    return {
      ...values,
      profileKey,
      displayName,
      endpointUrl,
      bucket,
      accessKeyId,
      publicBaseUrl,
      secretAccessKey,
      region: values.region.trim(),
      publicBucket: values.publicBucket.trim(),
    };
  };

  const handleSaveProfile = async () => {
    const nextValues = validateProfileForm();
    const config = buildStorageProfileConfigPayload(nextValues);

    setPendingAction(isEditing ? { type: "update" } : { type: "create" });
    try {
      if (isEditing && editingProfile) {
        await updateMutation.mutateAsync({
          profileId: editingProfile.id,
          payload: {
            displayName: nextValues.displayName,
            config,
            isActive: nextValues.isActive,
            isDefault: nextValues.isDefault,
          },
        });
      } else {
        await createMutation.mutateAsync({
          profileKey: nextValues.profileKey,
          provider: nextValues.provider,
          displayName: nextValues.displayName,
          config,
          isActive: nextValues.isActive,
          isDefault: nextValues.isDefault,
        });
      }
      await invalidateProfiles();
      notifySuccessText(t("settings:SETTINGS_SAVED"));
      closeDialog();
    } catch (error) {
      if ((error as Error).message !== "FORM_VALIDATION_FAILED") {
        notifyError(error);
      }
      throw error;
    } finally {
      setPendingAction(null);
    }
  };

  const handleTestProfile = async (profile: StorageProfileOut) => {
    setPendingAction({ type: "test", profileKey: profile.profileKey });
    try {
      const result = await testMutation.mutateAsync(profile.id);
      await invalidateProfiles();
      notifySuccessText(result.message);
    } catch (error) {
      notifyError(error);
    } finally {
      setPendingAction(null);
    }
  };

  const handleDeleteProfile = async () => {
    if (!deleteTarget) return;
    setPendingAction({ type: "delete", profileKey: deleteTarget.profileKey });
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      await invalidateProfiles();
      notifySuccessText(t("settings:SETTINGS_SYSTEM_STORAGE_PROFILE_DELETED"));
      setDeleteTarget(null);
    } catch (error) {
      notifyError(error);
      throw error;
    } finally {
      setPendingAction(null);
    }
  };

  const saveUploadLimits = () =>
    withSavingKey("storage.limits", async () => {
      const values = limitsForm.getValues();
      await patchCoreSettings.mutateAsync({
        storage: {
          upload_chunk_size_mb: values.uploadChunkSizeMb,
          upload_max_file_size_mb: values.uploadMaxFileSizeMb,
          upload_max_avatar_size_mb: values.uploadMaxAvatarSizeMb,
          upload_max_site_logo_size_mb: values.uploadMaxSiteLogoSizeMb,
          upload_max_favicon_size_mb: values.uploadMaxFaviconSizeMb,
          upload_session_ttl_seconds: values.uploadSessionTtlSeconds,
          recycle_bin_retention_days: values.recycleBinRetentionDays,
        },
      });
      limitsForm.reset(values);
      notifySuccessText(t("settings:SETTINGS_SAVED"));
    });

  const saveDefaultProfile = () =>
    withSavingKey("storage.defaultProfile", async () => {
      const nextKey = limitsForm.getValues("defaultProfileKey").trim();
      await patchCoreSettings.mutateAsync({
        storage: {
          default_profile_key: nextKey || null,
        },
      });
      limitsForm.reset({
        ...limitsForm.getValues(),
        defaultProfileKey: nextKey,
      });
      await invalidateProfiles();
      notifySuccessText(t("settings:SETTINGS_SAVED"));
    });

  return (
    <>
      <ContentGuard
        loading={
          (profilesQuery.isLoading && !profilesQuery.data) ||
          (coreSettingsQuery.isLoading && !coreSettingsQuery.coreSettings)
        }
        error={profilesQuery.error ?? coreSettingsQuery.error}
        onRetry={() => {
          void profilesQuery.refetch();
          void coreSettingsQuery.refetch();
        }}
      >
        <SystemSettingStack>
          <SystemSettingItem
            id="default-profile"
            title={t("settings:SETTINGS_SYSTEM_STORAGE_DEFAULT_LABEL")}
            description={t("settings:SETTINGS_SYSTEM_STORAGE_DEFAULT_DESC")}
            footer={
              <SystemSettingFooterActions
                dirty={defaultProfileDirty}
                pending={savingKey === "storage.defaultProfile" || patchCoreSettings.isPending}
                onReset={() =>
                  limitsForm.reset({
                    ...limitsForm.getValues(),
                    defaultProfileKey: limitsInitialValues.defaultProfileKey,
                  })
                }
                onSave={() => void saveDefaultProfile()}
              />
            }
          >
            <div className="grid gap-3">
              <FormField label={t("settings:SETTINGS_SYSTEM_STORAGE_DEFAULT_LABEL")}>
                <Select
                  value={limitValues.defaultProfileKey || defaultProfile?.profileKey || ""}
                  onValueChange={(next) =>
                    limitsForm.setValue("defaultProfileKey", next, { shouldDirty: true })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper" align="start">
                    {profiles.map((profile) => (
                      <SelectItem key={profile.id} value={profile.profileKey}>
                        {profile.displayName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
              {defaultProfile ? (
                <div className="grid gap-3 md:grid-cols-2">
                  <StorageMetric
                    label={t("settings:SETTINGS_SYSTEM_STORAGE_PROFILE_KEY_LABEL")}
                    value={defaultProfile.profileKey}
                  />
                  <StorageMetric
                    label={t("settings:SETTINGS_STORAGE_PROVIDER_LABEL")}
                    value={formatProviderLabel(defaultProfile.provider, t)}
                  />
                  <StorageMetric
                    label={t("settings:SETTINGS_SYSTEM_STORAGE_LOCATION_LABEL")}
                    value={joinSummaryParts(
                      [
                        defaultProfile.config.bucket,
                        defaultProfile.config.publicBucket,
                        defaultProfile.config.publicBaseUrl,
                      ],
                      t("settings:SETTINGS_SYSTEM_STORAGE_SUMMARY_EMPTY"),
                    )}
                  />
                  <StorageMetric
                    label={t("settings:SETTINGS_SYSTEM_STORAGE_TEST_ACTION")}
                    value={
                      defaultProfile.lastTestStatus
                        ? joinSummaryParts([
                            defaultProfile.lastTestStatus === "passed"
                              ? t("settings:SETTINGS_SYSTEM_STORAGE_TEST_STATUS_PASSED")
                              : t("settings:SETTINGS_SYSTEM_STORAGE_TEST_STATUS_FAILED"),
                            formatDateTime(defaultProfile.lastTestedAt),
                          ])
                        : t("settings:SETTINGS_SYSTEM_STORAGE_TEST_STATUS_IDLE")
                    }
                  />
                </div>
              ) : (
                <Empty className="border border-dashed border-border/70 p-6 md:p-8">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <CircleAlert className="size-5" />
                    </EmptyMedia>
                    <EmptyTitle className="text-title3">
                      {t("settings:SETTINGS_SYSTEM_STORAGE_EMPTY_TITLE")}
                    </EmptyTitle>
                    <EmptyDescription className="text-footnote">
                      {t("settings:SETTINGS_SYSTEM_STORAGE_EMPTY_DESC")}
                    </EmptyDescription>
                  </EmptyHeader>
                  <EmptyContent>
                    <Button onClick={openCreateDialog} disabled={Boolean(pendingAction)}>
                      <Plus className="size-4" />
                      {t("settings:SETTINGS_SYSTEM_STORAGE_CREATE_ACTION")}
                    </Button>
                  </EmptyContent>
                </Empty>
              )}
            </div>
          </SystemSettingItem>

          <SystemSettingItem
            id="profiles"
            title={t("settings:SETTINGS_SYSTEM_STORAGE_PROFILES_TITLE")}
            description={t("settings:SETTINGS_SYSTEM_STORAGE_PROFILES_DESC")}
            headerAction={
              <Button onClick={openCreateDialog} disabled={Boolean(pendingAction)}>
                <Plus className="size-4" />
                {t("settings:SETTINGS_SYSTEM_STORAGE_CREATE_ACTION")}
              </Button>
            }
          >
            {profiles.length === 0 ? (
              <Empty className="border border-dashed border-border/70 p-6 md:p-8">
                <EmptyHeader>
                  <EmptyTitle className="text-title3">
                    {t("settings:SETTINGS_SYSTEM_STORAGE_EMPTY_TITLE")}
                  </EmptyTitle>
                  <EmptyDescription className="text-footnote">
                    {t("settings:SETTINGS_SYSTEM_STORAGE_EMPTY_DESC")}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="grid gap-3">
                {profiles.map((profile) => {
                  const providerLabel = formatProviderLabel(profile.provider, t);
                  const isReadOnly = isReadOnlyProfile(profile);
                  const isTesting =
                    testMutation.isPending && pendingProfileKey === profile.profileKey;
                  const isDeleting =
                    deleteMutation.isPending && pendingProfileKey === profile.profileKey;
                  const pending =
                    pendingProfileKey === profile.profileKey &&
                    (pendingAction?.type === "test" || pendingAction?.type === "delete");
                  const summary = joinSummaryParts(
                    [
                      profile.config.bucket
                        ? `${t("settings:SETTINGS_SYSTEM_STORAGE_BUCKET_SHORT")} ${profile.config.bucket}`
                        : null,
                      profile.config.publicBucket
                        ? `${t("settings:SETTINGS_SYSTEM_STORAGE_PUBLIC_BUCKET_SHORT")} ${profile.config.publicBucket}`
                        : null,
                      profile.config.publicBaseUrl || null,
                      formatDeliveryLabel(profile.config.publicDeliveryMode, t),
                    ],
                    t("settings:SETTINGS_SYSTEM_STORAGE_SUMMARY_EMPTY"),
                  );
                  const testDescription = profile.lastTestStatus
                    ? joinSummaryParts([
                        profile.lastTestStatus === "passed"
                          ? t("settings:SETTINGS_SYSTEM_STORAGE_TEST_STATUS_PASSED")
                          : t("settings:SETTINGS_SYSTEM_STORAGE_TEST_STATUS_FAILED"),
                        formatDateTime(profile.lastTestedAt),
                      ])
                    : t("settings:SETTINGS_SYSTEM_STORAGE_TEST_STATUS_IDLE");

                  return (
                    <div
                      key={profile.id}
                      className="grid gap-4 py-3 lg:grid-cols-[minmax(0,1fr)_auto]"
                    >
                      <div className="min-w-0 space-y-3">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <span className="min-w-0 truncate text-headline font-semibold text-label-primary">
                            {profile.displayName}
                          </span>
                          <Badge variant="outline">{providerLabel}</Badge>
                          {profile.isDefault ? (
                            <Badge variant="secondary">
                              {t("settings:SETTINGS_SYSTEM_STORAGE_BADGE_DEFAULT")}
                            </Badge>
                          ) : null}
                          {!profile.isActive ? (
                            <Badge variant="outline">
                              {t("settings:SETTINGS_SYSTEM_STORAGE_BADGE_INACTIVE")}
                            </Badge>
                          ) : null}
                          {isReadOnly ? (
                            <Badge variant="outline">
                              {t("settings:SETTINGS_SYSTEM_STORAGE_ROW_READ_ONLY")}
                            </Badge>
                          ) : null}
                          {pending ? (
                            <Badge variant="secondary">
                              {t("settings:SETTINGS_SYSTEM_STORAGE_STATUS_PENDING")}
                            </Badge>
                          ) : null}
                        </div>
                        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                          <StorageMetric
                            label={t("settings:SETTINGS_SYSTEM_STORAGE_PROFILE_KEY_LABEL")}
                            value={profile.profileKey}
                          />
                          <StorageMetric
                            label={t("settings:SETTINGS_SYSTEM_STORAGE_LOCATION_LABEL")}
                            value={summary}
                          />
                          <StorageMetric
                            label={t("settings:SETTINGS_SYSTEM_STORAGE_ENDPOINT_SHORT")}
                            value={profile.config.endpointUrl}
                          />
                          <StorageMetric
                            label={t("settings:SETTINGS_SYSTEM_STORAGE_TEST_ACTION")}
                            value={testDescription}
                          />
                        </div>
                        <div className="grid gap-1 text-footnote text-label-secondary">
                          <div>
                            {profile.secrets?.secretAccessKey
                              ? t("settings:SETTINGS_STORAGE_S3_SECRET_SET")
                              : t("settings:SETTINGS_STORAGE_S3_SECRET_NOT_SET")}
                          </div>
                          {isReadOnly ? (
                            <div>{t("settings:SETTINGS_SYSTEM_STORAGE_ENV_DEFAULT_DESC")}</div>
                          ) : null}
                          {profile.lastTestMessage ? (
                            <div className="text-label-primary">{profile.lastTestMessage}</div>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2 lg:justify-end">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={Boolean(pendingAction) || isReadOnly}
                          onClick={(event) => {
                            stopEvent(event);
                            openEditDialog(profile);
                          }}
                        >
                          <PencilLine className="size-4" />
                          {t("settings:SETTINGS_SYSTEM_STORAGE_EDIT_ACTION")}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={Boolean(pendingAction)}
                          loading={isTesting}
                          onClick={(event) => {
                            stopEvent(event);
                            void handleTestProfile(profile);
                          }}
                        >
                          <PlugZap className="size-4" />
                          {t("settings:SETTINGS_SYSTEM_STORAGE_TEST_ACTION")}
                        </Button>
                        {!isReadOnly ? (
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label={t("settings:SETTINGS_REMOVE")}
                            disabled={Boolean(pendingAction)}
                            loading={isDeleting}
                            onClick={(event) => {
                              stopEvent(event);
                              setDeleteTarget(profile);
                            }}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </SystemSettingItem>

          <SystemSettingItem
            id="create-profile"
            title={t("settings:SETTINGS_SYSTEM_STORAGE_CREATE_ACTION")}
            description={t("settings:SETTINGS_SYSTEM_STORAGE_CREATE_DESC")}
            headerAction={
              <Button onClick={openCreateDialog} disabled={Boolean(pendingAction)}>
                <Plus className="size-4" />
                {t("settings:SETTINGS_SYSTEM_STORAGE_CREATE_ACTION")}
              </Button>
            }
          />

          <SystemSettingItem
            id="upload-limits"
            title={t("settings:SETTINGS_SYSTEM_STORAGE_UPLOAD_LIMITS_TITLE")}
            description={t("settings:SETTINGS_SYSTEM_STORAGE_UPLOAD_LIMITS_DESC")}
            footer={
              <SystemSettingFooterActions
                dirty={limitsDirty}
                pending={savingKey === "storage.limits" || patchCoreSettings.isPending}
                onReset={() => limitsForm.reset(limitsInitialValues)}
                onSave={() => void saveUploadLimits()}
              />
            }
          >
            <div className="grid gap-3 md:grid-cols-2">
              <StorageLimitNumberField
                label={t("settings:SETTINGS_STORAGE_UPLOAD_CHUNK_SIZE_MB_LABEL")}
                value={limitValues.uploadChunkSizeMb}
                min={1}
                onValueChange={(value) =>
                  limitsForm.setValue("uploadChunkSizeMb", value, { shouldDirty: true })
                }
              />
              <StorageLimitNumberField
                label={t("settings:SETTINGS_STORAGE_UPLOAD_MAX_FILE_SIZE_MB_LABEL")}
                value={limitValues.uploadMaxFileSizeMb}
                min={1}
                onValueChange={(value) =>
                  limitsForm.setValue("uploadMaxFileSizeMb", value, { shouldDirty: true })
                }
              />
              <StorageLimitNumberField
                label={t("settings:SETTINGS_STORAGE_UPLOAD_MAX_AVATAR_SIZE_MB_LABEL")}
                value={limitValues.uploadMaxAvatarSizeMb}
                min={1}
                onValueChange={(value) =>
                  limitsForm.setValue("uploadMaxAvatarSizeMb", value, { shouldDirty: true })
                }
              />
              <StorageLimitNumberField
                label={t("settings:SETTINGS_STORAGE_UPLOAD_MAX_SITE_LOGO_SIZE_MB_LABEL")}
                value={limitValues.uploadMaxSiteLogoSizeMb}
                min={1}
                onValueChange={(value) =>
                  limitsForm.setValue("uploadMaxSiteLogoSizeMb", value, { shouldDirty: true })
                }
              />
              <StorageLimitNumberField
                label={t("settings:SETTINGS_STORAGE_UPLOAD_MAX_FAVICON_SIZE_MB_LABEL")}
                value={limitValues.uploadMaxFaviconSizeMb}
                min={1}
                onValueChange={(value) =>
                  limitsForm.setValue("uploadMaxFaviconSizeMb", value, { shouldDirty: true })
                }
              />
              <StorageLimitNumberField
                label={t("settings:SETTINGS_STORAGE_UPLOAD_SESSION_TTL_SECONDS_LABEL")}
                value={limitValues.uploadSessionTtlSeconds}
                min={60}
                onValueChange={(value) =>
                  limitsForm.setValue("uploadSessionTtlSeconds", value, { shouldDirty: true })
                }
              />
              <StorageLimitNumberField
                label={t("settings:SETTINGS_STORAGE_RECYCLE_BIN_RETENTION_DAYS_LABEL")}
                value={limitValues.recycleBinRetentionDays}
                min={0}
                onValueChange={(value) =>
                  limitsForm.setValue("recycleBinRetentionDays", value, { shouldDirty: true })
                }
              />
            </div>
          </SystemSettingItem>
        </SystemSettingStack>
      </ContentGuard>

      <SettingDialog
        open={isCreateDialogOpen}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
        title={
          isEditing
            ? t("settings:SETTINGS_SYSTEM_STORAGE_EDIT_DIALOG_TITLE")
            : t("settings:SETTINGS_SYSTEM_STORAGE_CREATE_DIALOG_TITLE")
        }
        description={
          isEditing
            ? t("settings:SETTINGS_SYSTEM_STORAGE_EDIT_DIALOG_DESC")
            : t("settings:SETTINGS_SYSTEM_STORAGE_CREATE_DIALOG_DESC")
        }
        footer={
          <SettingOverlayFooter
            close={closeDialog}
            backText={t("common:CANCEL")}
            saveText={
              isEditing
                ? t("settings:SETTINGS_SAVE")
                : t("settings:SETTINGS_SYSTEM_STORAGE_CREATE_ACTION")
            }
            saveLoading={formBusy}
            disabled={formBusy}
            onSave={handleSaveProfile}
          />
        }
      >
        <SettingDialogFields>
          <Controller
            control={form.control}
            name="profileKey"
            render={({ field }) => (
              <OverlayField
                label={t("settings:SETTINGS_SYSTEM_STORAGE_PROFILE_KEY_LABEL")}
                description={t("settings:SETTINGS_SYSTEM_STORAGE_PROFILE_KEY_DESC")}
                message={getFieldErrorMessage(form, "profileKey")}
              >
                <Input
                  {...field}
                  disabled={isEditing}
                  placeholder={t("settings:SETTINGS_SYSTEM_STORAGE_PROFILE_KEY_PLACEHOLDER")}
                />
              </OverlayField>
            )}
          />

          <Controller
            control={form.control}
            name="displayName"
            render={({ field }) => (
              <OverlayField
                label={t("settings:SETTINGS_SYSTEM_STORAGE_DISPLAY_NAME_LABEL")}
                message={getFieldErrorMessage(form, "displayName")}
              >
                <Input
                  {...field}
                  placeholder={t("settings:SETTINGS_SYSTEM_STORAGE_DISPLAY_NAME_PLACEHOLDER")}
                />
              </OverlayField>
            )}
          />

          <Controller
            control={form.control}
            name="provider"
            render={({ field }) => (
              <OverlayField
                label={t("settings:SETTINGS_STORAGE_PROVIDER_LABEL")}
                description={t(getProviderOption(field.value).descriptionKey)}
              >
                <Select
                  value={field.value}
                  onValueChange={(next) => {
                    if (isEditing) return;
                    applyCreateProviderPreset(next as ObjectStorageProviderKind);
                  }}
                  disabled={isEditing}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper" align="start">
                    {PROVIDER_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {t(option.labelKey)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </OverlayField>
            )}
          />

          {selectedProviderOption.requiresRemoteConfig ? (
            <>
              <Controller
                control={form.control}
                name="endpointUrl"
                render={({ field }) => (
                  <OverlayField
                    label={t("settings:SETTINGS_STORAGE_S3_ENDPOINT_URL_LABEL")}
                    message={getFieldErrorMessage(form, "endpointUrl")}
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
                name="region"
                render={({ field }) => (
                  <OverlayField
                    label={t("settings:SETTINGS_STORAGE_S3_REGION_LABEL")}
                    message={getFieldErrorMessage(form, "region")}
                  >
                    <Input {...field} placeholder="us-east-1" />
                  </OverlayField>
                )}
              />

              <Controller
                control={form.control}
                name="bucket"
                render={({ field }) => (
                  <OverlayField
                    label={t("settings:SETTINGS_STORAGE_S3_BUCKET_LABEL")}
                    message={getFieldErrorMessage(form, "bucket")}
                  >
                    <Input {...field} placeholder="assets-private" />
                  </OverlayField>
                )}
              />

              {selectedProviderOption.supportsPublicBucket ? (
                <Controller
                  control={form.control}
                  name="publicBucket"
                  render={({ field }) => (
                    <OverlayField
                      label={t("settings:SETTINGS_STORAGE_S3_PUBLIC_BUCKET_LABEL")}
                      description={t("settings:SETTINGS_STORAGE_S3_PUBLIC_BUCKET_HELP")}
                      message={getFieldErrorMessage(form, "publicBucket")}
                    >
                      <Input {...field} placeholder="assets-public" />
                    </OverlayField>
                  )}
                />
              ) : null}

              <Controller
                control={form.control}
                name="accessKeyId"
                render={({ field }) => (
                  <OverlayField
                    label={t("settings:SETTINGS_STORAGE_S3_ACCESS_KEY_ID_LABEL")}
                    message={getFieldErrorMessage(form, "accessKeyId")}
                  >
                    <Input {...field} autoComplete="off" />
                  </OverlayField>
                )}
              />

              <Controller
                control={form.control}
                name="secretAccessKey"
                render={({ field }) => (
                  <OverlayField
                    label={t("settings:SETTINGS_STORAGE_S3_SECRET_ACCESS_KEY_LABEL")}
                    description={
                      formHasSecret
                        ? t("settings:SETTINGS_SYSTEM_STORAGE_SECRET_SET_HINT")
                        : t("settings:SETTINGS_SYSTEM_STORAGE_SECRET_EMPTY_HINT")
                    }
                    message={getFieldErrorMessage(form, "secretAccessKey")}
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

              {selectedProviderOption.supportsPathStyle ? (
                <Controller
                  control={form.control}
                  name="forcePathStyle"
                  render={({ field }) => (
                    <OverlayBooleanField
                      label={t("settings:SETTINGS_STORAGE_S3_FORCE_PATH_STYLE_LABEL")}
                      description={t("settings:SETTINGS_SYSTEM_STORAGE_FORCE_PATH_STYLE_HELP")}
                      checked={Boolean(field.value)}
                      onCheckedChange={field.onChange}
                      variant="checkbox"
                    />
                  )}
                />
              ) : null}
            </>
          ) : null}

          <Controller
            control={form.control}
            name="publicBaseUrl"
            render={({ field }) => (
              <OverlayField
                label={t("settings:SETTINGS_STORAGE_PUBLIC_BASE_URL_LABEL")}
                description={t("settings:SETTINGS_STORAGE_PUBLIC_BASE_URL_DESC")}
                message={getFieldErrorMessage(form, "publicBaseUrl")}
              >
                <Input
                  {...field}
                  placeholder={t("settings:SETTINGS_STORAGE_PUBLIC_BASE_URL_PLACEHOLDER")}
                />
              </OverlayField>
            )}
          />

          <Controller
            control={form.control}
            name="publicDeliveryMode"
            render={({ field }) => (
              <OverlayField label={t("settings:SETTINGS_STORAGE_PUBLIC_DELIVERY_MODE_LABEL")}>
                <Select
                  value={field.value}
                  onValueChange={(next) => field.onChange(next as PublicDeliveryMode)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper" align="start">
                    <SelectItem value="auto">
                      {t("settings:SETTINGS_STORAGE_PUBLIC_DELIVERY_MODE_AUTO")}
                    </SelectItem>
                    <SelectItem value="direct">
                      {t("settings:SETTINGS_STORAGE_PUBLIC_DELIVERY_MODE_DIRECT")}
                    </SelectItem>
                    <SelectItem value="presign">
                      {t("settings:SETTINGS_STORAGE_PUBLIC_DELIVERY_MODE_PRESIGN")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </OverlayField>
            )}
          />

          <Controller
            control={form.control}
            name="presignExpiresSeconds"
            render={({ field }) => (
              <OverlayField
                label={t("settings:SETTINGS_STORAGE_S3_PRESIGN_EXPIRES_SECONDS_LABEL")}
                description={t("settings:SETTINGS_STORAGE_S3_PRESIGN_EXPIRES_SECONDS_HELP")}
                message={getFieldErrorMessage(form, "presignExpiresSeconds")}
              >
                <NumberInput
                  value={field.value}
                  min={60}
                  max={24 * 3600}
                  onValueChange={(next) => field.onChange(next ?? 900)}
                />
              </OverlayField>
            )}
          />

          <Controller
            control={form.control}
            name="isActive"
            render={({ field }) => (
              <OverlayBooleanField
                label={t("settings:SETTINGS_SYSTEM_STORAGE_ACTIVE_LABEL")}
                description={t("settings:SETTINGS_SYSTEM_STORAGE_ACTIVE_DESC")}
                checked={Boolean(field.value)}
                onCheckedChange={field.onChange}
                variant="checkbox"
              />
            )}
          />

          <Controller
            control={form.control}
            name="isDefault"
            render={({ field }) => (
              <OverlayBooleanField
                label={t("settings:SETTINGS_SYSTEM_STORAGE_DEFAULT_LABEL")}
                description={t("settings:SETTINGS_SYSTEM_STORAGE_DEFAULT_DESC")}
                checked={Boolean(field.value)}
                onCheckedChange={field.onChange}
                variant="checkbox"
              />
            )}
          />
        </SettingDialogFields>
      </SettingDialog>

      <SettingDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !deleteMutation.isPending) {
            setDeleteTarget(null);
          }
        }}
        title={t("settings:SETTINGS_SYSTEM_STORAGE_DELETE_TITLE")}
        description={t("settings:SETTINGS_SYSTEM_STORAGE_DELETE_DESC", {
          name: deleteTarget?.displayName ?? "",
        })}
        footer={
          <div className="flex w-full items-center justify-end gap-2">
            <Button
              variant="outline"
              disabled={deleteMutation.isPending}
              onClick={() => setDeleteTarget(null)}
            >
              {t("common:CANCEL")}
            </Button>
            <Button
              variant="destructive"
              loading={deleteMutation.isPending}
              onClick={() => {
                void handleDeleteProfile();
              }}
            >
              <Trash2 className="size-4" />
              {t("settings:SETTINGS_SYSTEM_STORAGE_DELETE_ACTION")}
            </Button>
          </div>
        }
      >
        <div className="flex items-start gap-3 rounded-lg border border-border bg-card px-4 py-3">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-label-secondary" />
          <div className="grid gap-1 text-sm">
            <div className="font-medium text-label-primary">{deleteTarget?.displayName ?? "-"}</div>
            <div className="text-label-secondary">
              {t("settings:SETTINGS_SYSTEM_STORAGE_DELETE_HINT")}
            </div>
          </div>
        </div>
      </SettingDialog>
    </>
  );
}
