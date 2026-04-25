import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, PencilLine, PlugZap, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
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
  OverlayBooleanField,
  OverlayField,
  isValidHttpUrl,
  joinSummaryParts,
  normalizeOptionalString,
} from "@/pages/system/system-settings-form-utils";
import { Badge } from "@arclayer/ui/badge";
import { Button } from "@arclayer/ui/button";
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

export function SystemSettingsStoragePage() {
  const { t } = useTranslation(["settings", "common"]);
  const queryClient = useQueryClient();
  const [dialogMode, setDialogMode] = useState<StorageProfileDialogMode | null>(null);
  const [editingProfile, setEditingProfile] = useState<StorageProfileOut | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StorageProfileOut | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

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
  const selectedProvider = form.watch("provider");
  const selectedProviderOption = getProviderOption(selectedProvider);
  const isCreateDialogOpen = dialogMode !== null;
  const isEditing = dialogMode === "edit" && editingProfile !== null;
  const formHasSecret = Boolean(editingProfile?.secrets?.secretAccessKey);
  const formBusy = createMutation.isPending || updateMutation.isPending;
  const pageEmpty = !profilesQuery.isLoading && !profilesQuery.isError && profiles.length === 0;
  const pendingProfileKey = getPendingProfileKey(pendingAction);

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

  const panelDescription = useMemo(() => t("settings:SETTINGS_SYSTEM_STORAGE_PAGE_DESC"), [t]);

  return (
    <>
      <ContentGuard
        loading={profilesQuery.isLoading && !profilesQuery.data}
        error={profilesQuery.error}
        empty={pageEmpty}
        onRetry={() => void profilesQuery.refetch()}
        emptyTitle={t("settings:SETTINGS_SYSTEM_STORAGE_EMPTY_TITLE")}
        emptyDescription={t("settings:SETTINGS_SYSTEM_STORAGE_EMPTY_DESC")}
        emptyExtra={
          <Button onClick={openCreateDialog}>
            <Plus className="size-4" />
            {t("settings:SETTINGS_SYSTEM_STORAGE_CREATE_ACTION")}
          </Button>
        }
      >
        <div className="grid gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-3xl space-y-1">
              <h2 className="text-title-3 font-semibold text-label-primary">
                {t("settings:SETTINGS_SYSTEM_STORAGE_PAGE_TITLE")}
              </h2>
              <p className="text-callout text-label-secondary">{panelDescription}</p>
            </div>
            <Button onClick={openCreateDialog} disabled={Boolean(pendingAction)}>
              <Plus className="size-4" />
              {t("settings:SETTINGS_SYSTEM_STORAGE_CREATE_ACTION")}
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {profiles.map((profile) => {
              const providerLabel = formatProviderLabel(profile.provider, t);
              const isReadOnly = isReadOnlyProfile(profile);
              const isTesting = testMutation.isPending && pendingProfileKey === profile.profileKey;
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
                ? joinSummaryParts(
                    [
                      profile.lastTestStatus === "passed"
                        ? t("settings:SETTINGS_SYSTEM_STORAGE_TEST_STATUS_PASSED")
                        : t("settings:SETTINGS_SYSTEM_STORAGE_TEST_STATUS_FAILED"),
                      formatDateTime(profile.lastTestedAt),
                    ],
                    undefined,
                  )
                : t("settings:SETTINGS_SYSTEM_STORAGE_TEST_STATUS_IDLE");

              return (
                <div
                  key={profile.id}
                  className="col-span-1 flex min-h-[220px] flex-col rounded-lg border border-border bg-card p-4 transition-colors duration-200 hover:border-border/80 hover:bg-accent/50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-2">
                      <div className="truncate text-headline font-semibold text-label-primary">
                        {profile.displayName}
                      </div>
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
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
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={t("settings:SETTINGS_SYSTEM_STORAGE_EDIT_ACTION")}
                        disabled={Boolean(pendingAction) || isReadOnly}
                        onClick={(event) => {
                          stopEvent(event);
                          openEditDialog(profile);
                        }}
                      >
                        <PencilLine className="size-4" />
                        <span className="sr-only">
                          {t("settings:SETTINGS_SYSTEM_STORAGE_EDIT_ACTION")}
                        </span>
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={t("settings:SETTINGS_SYSTEM_STORAGE_TEST_ACTION")}
                        disabled={Boolean(pendingAction)}
                        loading={isTesting}
                        onClick={(event) => {
                          stopEvent(event);
                          void handleTestProfile(profile);
                        }}
                      >
                        <PlugZap className="size-4" />
                        <span className="sr-only">
                          {t("settings:SETTINGS_SYSTEM_STORAGE_TEST_ACTION")}
                        </span>
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
                          <span className="sr-only">{t("settings:SETTINGS_REMOVE")}</span>
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 text-footnote">
                    <div className="min-w-0">
                      <div className="text-label-secondary">
                        {t("settings:SETTINGS_SYSTEM_STORAGE_PROFILE_KEY_LABEL")}
                      </div>
                      <div className="truncate font-medium text-label-primary">
                        {profile.profileKey}
                      </div>
                    </div>
                    <div className="min-w-0">
                      <div className="text-label-secondary">
                        {t("settings:SETTINGS_SYSTEM_STORAGE_LOCATION_LABEL")}
                      </div>
                      <div className="truncate text-label-primary">{summary}</div>
                    </div>
                    {profile.config.endpointUrl ? (
                      <div className="min-w-0">
                        <div className="text-label-secondary">
                          {t("settings:SETTINGS_SYSTEM_STORAGE_ENDPOINT_SHORT")}
                        </div>
                        <div className="truncate text-label-primary">
                          {profile.config.endpointUrl}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-auto grid gap-2 pt-4 text-footnote text-label-secondary">
                    <div>{testDescription}</div>
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
              );
            })}
          </div>
        </div>
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
