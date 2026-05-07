import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ColumnDef, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import {
  CircleAlert,
  CopyPlus,
  MoreHorizontal,
  PencilLine,
  PlugZap,
  Plus,
  RadioTower,
  Trash2,
} from "lucide-react";
import { type ComponentProps, useEffect, useMemo, useState } from "react";
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
import {
  buildDataTableActionsColumnMeta,
  DataTableActionsCell,
} from "@/components/common/data-table-actions-cell";
import { buildDataTableToolsLabels } from "@/components/common/data-table-tools-labels";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { getFieldErrorMessage } from "@/lib/forms/rhf-form-helpers";
import { notifyError, notifySuccessText, notifyWarningText } from "@/lib/notifications";
import {
  SystemSettingFooterActions,
  SystemSettingItem,
  SystemSettingRow,
  SystemSettingStack,
} from "@/pages/system/components/system-setting-item";
import {
  getSystemSettingsSection,
  SYSTEM_CORE_SETTINGS_QUERY_KEY,
  readNumberValue,
  readStringValue,
  usePatchSystemCoreSettings,
  useSystemCoreSettings,
} from "@/pages/system/hooks/use-system-core-settings";
import {
  OverlayBooleanField,
  OverlayField,
  isValidHttpUrl,
  normalizeOptionalString,
} from "@/pages/system/system-settings-form-utils";
import { useSavingKey } from "@arclayer/hooks/use-saving-key";
import { BaseTag, lucideTagIcon } from "@/components/ui/tags";
import { Alert, AlertDescription, AlertTitle } from "@arclayer/ui/alert";
import { Button } from "@arclayer/ui/button";
import { DataTablePresenter } from "@arclayer/ui/data-table";
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@arclayer/ui/drawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuIconItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@arclayer/ui/dropdown-menu";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@arclayer/ui/empty";
import { Input } from "@arclayer/ui/input";
import { NumberInput } from "@arclayer/ui/number-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";
import { SettingDialog } from "@arclayer/ui/setting-dialog";
import { SettingDialogField, SettingDialogFields } from "@arclayer/ui/setting-dialog-field";
import { Switch } from "@arclayer/ui/switch";
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
type ProfileTestState = {
  status: StorageProfileOut["lastTestStatus"];
  message: string | null;
  testedAt: string | null;
};

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

type StorageProfileTableMeta = {
  defaultProfileKey: string;
  pendingAction: PendingAction;
  pendingProfileKey: string | null;
  testStateByProfileKey: Record<string, ProfileTestState>;
  isTestingProfile: (profile: StorageProfileOut) => boolean;
  onEditProfile: (profile: StorageProfileOut) => void;
  onDuplicateProfile: (profile: StorageProfileOut) => void;
  onTestProfile: (profile: StorageProfileOut) => void;
  onDeleteProfile: (profile: StorageProfileOut) => void;
  t: (key: string, options?: Record<string, unknown>) => string;
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
    requiresEndpoint: true,
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
  const publicDeliveryMode = option.requiresRemoteConfig ? values.publicDeliveryMode : "auto";
  const presignExpiresSeconds = option.requiresRemoteConfig ? values.presignExpiresSeconds : 900;
  return {
    publicBaseUrl: option.requiresRemoteConfig
      ? normalizeOptionalString(values.publicBaseUrl)
      : null,
    publicDeliveryMode,
    presignExpiresSeconds,
    forcePathStyle: option.supportsPathStyle ? values.forcePathStyle : false,
    endpointUrl: option.requiresEndpoint ? normalizeOptionalString(values.endpointUrl) : null,
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

function formatProfileEndpoint(profile: StorageProfileOut, t: (key: string) => string): string {
  if (profile.provider === "local") {
    return t("settings:SETTINGS_SYSTEM_STORAGE_LOCATION_LOCAL");
  }
  return profile.config.endpointUrl || t("settings:SETTINGS_SYSTEM_STORAGE_SUMMARY_EMPTY");
}

function getTestStatusLabel(
  status: StorageProfileOut["lastTestStatus"],
  t: (key: string) => string,
): string {
  if (status === "passed") return t("settings:SETTINGS_SYSTEM_STORAGE_TEST_STATUS_PASSED");
  if (status === "failed") return t("settings:SETTINGS_SYSTEM_STORAGE_TEST_STATUS_FAILED");
  return t("settings:SETTINGS_SYSTEM_STORAGE_TEST_STATUS_IDLE");
}

function getTestStatusTagColor(
  status: StorageProfileOut["lastTestStatus"] | "pending",
): ComponentProps<typeof BaseTag>["color"] {
  if (status === "passed") return "green";
  if (status === "failed") return "red";
  if (status === "pending") return "blue";
  return "default";
}

function stopEvent(event: { stopPropagation?: () => void }) {
  event.stopPropagation?.();
}

function getPendingProfileKey(pendingAction: PendingAction): string | null {
  if (!pendingAction || !("profileKey" in pendingAction)) return null;
  return pendingAction.profileKey;
}

function getProfileTestState(
  profile: StorageProfileOut,
  meta: StorageProfileTableMeta,
): ProfileTestState {
  return (
    meta.testStateByProfileKey[profile.profileKey] ?? {
      status: profile.lastTestStatus,
      message: profile.lastTestMessage ?? null,
      testedAt: profile.lastTestedAt ?? null,
    }
  );
}

function StorageLimitNumberField(props: {
  label: string;
  description?: string;
  value: number;
  min: number;
  max?: number;
  onValueChange: (value: number) => void;
}) {
  return (
    <SystemSettingRow
      title={props.label}
      description={props.description}
      control={
        <NumberInput
          className="w-40"
          value={props.value}
          min={props.min}
          max={props.max}
          onValueChange={(next) => props.onValueChange(next ?? props.min)}
        />
      }
    />
  );
}

function buildStorageProfileColumns(meta: StorageProfileTableMeta): ColumnDef<StorageProfileOut>[] {
  return [
    {
      id: "name",
      size: 260,
      minSize: 220,
      header: meta.t("settings:SETTINGS_SYSTEM_STORAGE_TABLE_NAME"),
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-callout font-semibold text-label-primary">
              {row.original.displayName}
            </span>
            {row.original.profileKey === meta.defaultProfileKey || row.original.isDefault ? (
              <BaseTag color="blue" icon={lucideTagIcon(RadioTower)} textStyle="footnote">
                {meta.t("settings:SETTINGS_SYSTEM_STORAGE_BADGE_CURRENT")}
              </BaseTag>
            ) : null}
          </div>
        </div>
      ),
      meta: { title: meta.t("settings:SETTINGS_SYSTEM_STORAGE_TABLE_NAME") },
    },
    {
      id: "provider",
      size: 150,
      minSize: 100,
      header: meta.t("settings:SETTINGS_STORAGE_PROVIDER_LABEL"),
      cell: ({ row }) => (
        <BaseTag color="default" textStyle="footnote">
          {formatProviderLabel(row.original.provider, meta.t)}
        </BaseTag>
      ),
      meta: { title: meta.t("settings:SETTINGS_STORAGE_PROVIDER_LABEL") },
    },
    {
      id: "endpoint",
      size: 240,
      minSize: 180,
      header: meta.t("settings:SETTINGS_SYSTEM_STORAGE_ENDPOINT_SHORT"),
      cell: ({ row }) => (
        <span className="line-clamp-2">{formatProfileEndpoint(row.original, meta.t)}</span>
      ),
      meta: { title: meta.t("settings:SETTINGS_SYSTEM_STORAGE_ENDPOINT_SHORT") },
    },
    {
      id: "status",
      size: 210,
      minSize: 170,
      header: meta.t("settings:SETTINGS_SYSTEM_STORAGE_TABLE_STATUS"),
      cell: ({ row }) => {
        const profile = row.original;
        const testState = getProfileTestState(profile, meta);
        const pending =
          meta.pendingProfileKey === profile.profileKey && meta.pendingAction?.type === "test";
        const statusLabel = pending
          ? meta.t("settings:SETTINGS_SYSTEM_STORAGE_STATUS_PENDING")
          : getTestStatusLabel(testState.status, meta.t);
        const checkedAt = formatDateTime(testState.testedAt);
        const testStatus = pending ? "pending" : testState.status;
        return (
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap gap-1">
              <BaseTag color={getTestStatusTagColor(testStatus)} textStyle="footnote">
                {statusLabel}
              </BaseTag>
              {!profile.isActive ? (
                <BaseTag color="gold" textStyle="footnote">
                  {meta.t("settings:SETTINGS_SYSTEM_STORAGE_BADGE_INACTIVE")}
                </BaseTag>
              ) : null}
            </div>
            {checkedAt ? (
              <div className="mt-1 truncate text-footnote text-label-secondary">{checkedAt}</div>
            ) : null}
          </div>
        );
      },
      meta: { title: meta.t("settings:SETTINGS_SYSTEM_STORAGE_TABLE_STATUS") },
    },
    {
      id: "actions",
      size: 48,
      minSize: 48,
      maxSize: 48,
      header: "",
      cell: ({ row }) => {
        const profile = row.original;
        const readOnly = isReadOnlyProfile(profile);
        return (
          <DataTableActionsCell>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={meta.t("settings:SETTINGS_SYSTEM_STORAGE_ACTIONS_LABEL")}
                  disabled={Boolean(meta.pendingAction)}
                  loading={meta.isTestingProfile(profile)}
                  onClick={stopEvent}
                >
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" onClick={stopEvent}>
                <DropdownMenuGroup>
                  <DropdownMenuIconItem
                    icon={<PencilLine className="size-4" />}
                    disabled={readOnly || Boolean(meta.pendingAction)}
                    onSelect={() => meta.onEditProfile(profile)}
                  >
                    {meta.t("settings:SETTINGS_SYSTEM_STORAGE_EDIT_ACTION")}
                  </DropdownMenuIconItem>
                  <DropdownMenuIconItem
                    icon={<CopyPlus className="size-4" />}
                    disabled={Boolean(meta.pendingAction)}
                    onSelect={() => meta.onDuplicateProfile(profile)}
                  >
                    {meta.t("settings:SETTINGS_SYSTEM_STORAGE_DUPLICATE_ACTION")}
                  </DropdownMenuIconItem>
                  <DropdownMenuIconItem
                    icon={<PlugZap className="size-4" />}
                    disabled={Boolean(meta.pendingAction)}
                    onSelect={() => meta.onTestProfile(profile)}
                  >
                    {meta.t("settings:SETTINGS_SYSTEM_STORAGE_TEST_ACTION")}
                  </DropdownMenuIconItem>
                </DropdownMenuGroup>
                {!readOnly ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuIconItem
                      icon={<Trash2 className="size-4" />}
                      variant="destructive"
                      disabled={Boolean(meta.pendingAction)}
                      onSelect={() => meta.onDeleteProfile(profile)}
                    >
                      {meta.t("settings:SETTINGS_SYSTEM_STORAGE_DELETE_ACTION")}
                    </DropdownMenuIconItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </DataTableActionsCell>
        );
      },
      meta: buildDataTableActionsColumnMeta("right", "right"),
    },
  ];
}

export function SystemSettingsStoragePage() {
  const { t } = useTranslation(["settings", "common"]);
  const queryClient = useQueryClient();
  const { savingKey, withSavingKey } = useSavingKey();
  const [dialogMode, setDialogMode] = useState<StorageProfileDialogMode | null>(null);
  const [editingProfile, setEditingProfile] = useState<StorageProfileOut | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StorageProfileOut | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [testStateByProfileKey, setTestStateByProfileKey] = useState<
    Record<string, ProfileTestState>
  >({});
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
  const isProfileDrawerOpen = dialogMode !== null;
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

  useEffect(() => {
    if (!profilesQuery.data) return;
    setTestStateByProfileKey((current) => {
      let changed = false;
      const next = { ...current };
      for (const profile of profiles) {
        if (!profile.lastTestStatus) continue;
        const currentState = current[profile.profileKey];
        if (
          currentState?.status === profile.lastTestStatus &&
          currentState.message === (profile.lastTestMessage ?? null) &&
          currentState.testedAt === (profile.lastTestedAt ?? null)
        ) {
          continue;
        }
        next[profile.profileKey] = {
          status: profile.lastTestStatus,
          message: profile.lastTestMessage ?? null,
          testedAt: profile.lastTestedAt ?? null,
        };
        changed = true;
      }
      return changed ? next : current;
    });
  }, [profiles, profilesQuery.data]);

  const rememberProfileTestState = (
    profileKey: string,
    result: { status: StorageProfileOut["lastTestStatus"]; message: string | null },
  ) => {
    setTestStateByProfileKey((current) => ({
      ...current,
      [profileKey]: {
        status: result.status,
        message: result.message,
        testedAt: new Date().toISOString(),
      },
    }));
  };

  const closeProfileDrawer = () => {
    if (formBusy) return;
    setDialogMode(null);
    setEditingProfile(null);
    form.reset(createDefaultFormValues());
  };

  const invalidateProfiles = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: SYSTEM_STORAGE_PROFILES_QUERY_KEY,
      }),
      queryClient.invalidateQueries({
        queryKey: SYSTEM_CORE_SETTINGS_QUERY_KEY,
      }),
    ]);
  };

  const openCreateDrawer = () => {
    setDialogMode("create");
    setEditingProfile(null);
    form.reset(createDefaultFormValues());
  };

  const openEditDrawer = (profile: StorageProfileOut) => {
    setDialogMode("edit");
    setEditingProfile(profile);
    form.reset(buildFormValues(profile));
  };

  const openDuplicateDrawer = (profile: StorageProfileOut) => {
    const values = buildFormValues(profile);
    setDialogMode("create");
    setEditingProfile(null);
    form.reset({
      ...values,
      profileKey: "",
      displayName: t("settings:SETTINGS_SYSTEM_STORAGE_DUPLICATE_NAME", {
        name: profile.displayName,
      }),
      secretAccessKey: "",
      isDefault: false,
    });
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
      option.requiresRemoteConfig &&
      (!Number.isFinite(values.presignExpiresSeconds) ||
        values.presignExpiresSeconds < 60 ||
        values.presignExpiresSeconds > 24 * 3600)
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
    let createdProfile: StorageProfileOut | null = null;

    setPendingAction(isEditing ? { type: "update" } : { type: "create" });
    try {
      if (isEditing && editingProfile) {
        await updateMutation.mutateAsync({
          profileId: editingProfile.id,
          payload: {
            displayName: nextValues.displayName,
            config,
            isActive: true,
            isDefault: nextValues.isDefault,
          },
        });
      } else {
        createdProfile = await createMutation.mutateAsync({
          profileKey: nextValues.profileKey,
          provider: nextValues.provider,
          displayName: nextValues.displayName,
          config,
          isActive: true,
          isDefault: nextValues.isDefault,
        });
      }
      await invalidateProfiles();
      notifySuccessText(t("settings:SETTINGS_SAVED"));
      closeProfileDrawer();
    } catch (error) {
      if ((error as Error).message !== "FORM_VALIDATION_FAILED") {
        notifyError(error);
      }
      throw error;
    } finally {
      setPendingAction(null);
    }

    if (!createdProfile) return;

    setPendingAction({ type: "test", profileKey: createdProfile.profileKey });
    try {
      const testResult = await testMutation.mutateAsync(createdProfile);
      rememberProfileTestState(createdProfile.profileKey, {
        status: testResult.status,
        message: testResult.message,
      });
      await invalidateProfiles();
      if (!testResult.ok) {
        notifyWarningText(
          t("settings:SETTINGS_SYSTEM_STORAGE_CREATE_TEST_FAILED", {
            message: testResult.message,
          }),
        );
      }
    } catch (error) {
      notifyError(error);
    } finally {
      setPendingAction(null);
    }
  };

  const handleTestProfile = async (profile: StorageProfileOut) => {
    setPendingAction({ type: "test", profileKey: profile.profileKey });
    try {
      const result = await testMutation.mutateAsync(profile);
      rememberProfileTestState(profile.profileKey, {
        status: result.status,
        message: result.message,
      });
      await invalidateProfiles();
      if (result.ok) {
        notifySuccessText(result.message);
      } else {
        notifyWarningText(result.message);
      }
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

  const profileColumns = useMemo(
    () =>
      buildStorageProfileColumns({
        defaultProfileKey: limitValues.defaultProfileKey || defaultProfile?.profileKey || "",
        pendingAction,
        pendingProfileKey,
        testStateByProfileKey,
        isTestingProfile: (profile) =>
          testMutation.isPending && pendingProfileKey === profile.profileKey,
        onEditProfile: openEditDrawer,
        onDuplicateProfile: openDuplicateDrawer,
        onTestProfile: (profile) => void handleTestProfile(profile),
        onDeleteProfile: setDeleteTarget,
        t,
      }),
    [
      defaultProfile?.profileKey,
      limitValues.defaultProfileKey,
      pendingAction,
      pendingProfileKey,
      t,
      testStateByProfileKey,
      testMutation.isPending,
    ],
  );
  const profileTable = useReactTable({
    data: profiles,
    columns: profileColumns,
    getRowId: (row) => row.id,
    getCoreRowModel: getCoreRowModel(),
    enableColumnPinning: true,
    state: {
      columnPinning: {
        right: ["actions"],
      },
    },
  });
  const profileColumnMenuLabels = useMemo(() => buildDataTableToolsLabels(t), [t]);

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
            id="profiles"
            title={t("settings:SETTINGS_SYSTEM_STORAGE_PROFILES_TITLE")}
            description={t("settings:SETTINGS_SYSTEM_STORAGE_PROFILES_DESC")}
            headerAction={
              <Button onClick={openCreateDrawer} disabled={Boolean(pendingAction)}>
                <Plus className="size-4" />
                {t("settings:SETTINGS_SYSTEM_STORAGE_CREATE_ACTION")}
              </Button>
            }
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
              <div className="grid min-w-0 max-w-full gap-4 overflow-hidden">
                <DataTablePresenter
                  table={profileTable}
                  emptyText={t("settings:SETTINGS_SYSTEM_STORAGE_EMPTY_TITLE")}
                  className="min-w-0 max-w-full overflow-hidden"
                  surface="embedded"
                  rowHeight="tall"
                  wrapContent
                  columnMenuLabels={profileColumnMenuLabels}
                />
                <SystemSettingRow
                  className="max-w-full flex-wrap"
                  title={t("settings:SETTINGS_SYSTEM_STORAGE_CURRENT_PROFILE_TITLE")}
                  control={
                    <Select
                      value={limitValues.defaultProfileKey || defaultProfile?.profileKey || ""}
                      onValueChange={(next) =>
                        limitsForm.setValue("defaultProfileKey", next, { shouldDirty: true })
                      }
                    >
                      <SelectTrigger className="w-72 max-w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent position="popper" align="end">
                        {profiles.map((profile) => (
                          <SelectItem key={profile.id} value={profile.profileKey}>
                            {profile.displayName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  }
                />
              </div>
            )}
          </SystemSettingItem>

          <SystemSettingItem
            id="upload-limits"
            title={t("settings:SETTINGS_SYSTEM_STORAGE_UPLOAD_POLICY_TITLE")}
            description={t("settings:SETTINGS_SYSTEM_STORAGE_UPLOAD_POLICY_DESC")}
            footer={
              <SystemSettingFooterActions
                dirty={limitsDirty}
                pending={savingKey === "storage.limits" || patchCoreSettings.isPending}
                onReset={() => limitsForm.reset(limitsInitialValues)}
                onSave={() => void saveUploadLimits()}
              />
            }
          >
            <div className="grid gap-2">
              <StorageLimitNumberField
                label={t("settings:SETTINGS_STORAGE_UPLOAD_CHUNK_SIZE_MB_LABEL")}
                description={t("settings:SETTINGS_STORAGE_UPLOAD_CHUNK_SIZE_MB_DESC")}
                value={limitValues.uploadChunkSizeMb}
                min={1}
                onValueChange={(value) =>
                  limitsForm.setValue("uploadChunkSizeMb", value, { shouldDirty: true })
                }
              />
              <StorageLimitNumberField
                label={t("settings:SETTINGS_STORAGE_UPLOAD_MAX_FILE_SIZE_MB_LABEL")}
                description={t("settings:SETTINGS_STORAGE_UPLOAD_MAX_FILE_SIZE_MB_DESC")}
                value={limitValues.uploadMaxFileSizeMb}
                min={1}
                onValueChange={(value) =>
                  limitsForm.setValue("uploadMaxFileSizeMb", value, { shouldDirty: true })
                }
              />
              <StorageLimitNumberField
                label={t("settings:SETTINGS_STORAGE_UPLOAD_MAX_AVATAR_SIZE_MB_LABEL")}
                description={t("settings:SETTINGS_STORAGE_UPLOAD_MAX_AVATAR_SIZE_MB_DESC")}
                value={limitValues.uploadMaxAvatarSizeMb}
                min={1}
                onValueChange={(value) =>
                  limitsForm.setValue("uploadMaxAvatarSizeMb", value, { shouldDirty: true })
                }
              />
              <StorageLimitNumberField
                label={t("settings:SETTINGS_STORAGE_UPLOAD_MAX_SITE_LOGO_SIZE_MB_LABEL")}
                description={t("settings:SETTINGS_STORAGE_UPLOAD_MAX_SITE_LOGO_SIZE_MB_DESC")}
                value={limitValues.uploadMaxSiteLogoSizeMb}
                min={1}
                onValueChange={(value) =>
                  limitsForm.setValue("uploadMaxSiteLogoSizeMb", value, { shouldDirty: true })
                }
              />
              <StorageLimitNumberField
                label={t("settings:SETTINGS_STORAGE_UPLOAD_MAX_FAVICON_SIZE_MB_LABEL")}
                description={t("settings:SETTINGS_STORAGE_UPLOAD_MAX_FAVICON_SIZE_MB_DESC")}
                value={limitValues.uploadMaxFaviconSizeMb}
                min={1}
                onValueChange={(value) =>
                  limitsForm.setValue("uploadMaxFaviconSizeMb", value, { shouldDirty: true })
                }
              />
              <StorageLimitNumberField
                label={t("settings:SETTINGS_STORAGE_UPLOAD_SESSION_TTL_SECONDS_LABEL")}
                description={t("settings:SETTINGS_STORAGE_UPLOAD_SESSION_TTL_SECONDS_DESC")}
                value={limitValues.uploadSessionTtlSeconds}
                min={60}
                onValueChange={(value) =>
                  limitsForm.setValue("uploadSessionTtlSeconds", value, { shouldDirty: true })
                }
              />
              <StorageLimitNumberField
                label={t("settings:SETTINGS_STORAGE_RECYCLE_BIN_RETENTION_DAYS_LABEL")}
                description={t("settings:SETTINGS_STORAGE_RECYCLE_BIN_RETENTION_DAYS_DESC")}
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

      <Drawer
        open={isProfileDrawerOpen}
        onOpenChange={(open) => {
          if (!open) closeProfileDrawer();
        }}
        direction="right"
      >
        <DrawerContent className="w-full sm:max-w-xl">
          <DrawerHeader className="min-w-0 rounded-none px-6 py-5 pr-14 text-left md:max-w-none">
            <DrawerTitle className="text-title3 font-semibold text-label-primary">
              {isEditing
                ? t("settings:SETTINGS_SYSTEM_STORAGE_EDIT_DIALOG_TITLE")
                : t("settings:SETTINGS_SYSTEM_STORAGE_CREATE_DIALOG_TITLE")}
            </DrawerTitle>
            <DrawerDescription className="mb-0 text-body text-label-secondary">
              {isEditing
                ? t("settings:SETTINGS_SYSTEM_STORAGE_EDIT_DIALOG_DESC")
                : t("settings:SETTINGS_SYSTEM_STORAGE_CREATE_DIALOG_DESC")}
            </DrawerDescription>
          </DrawerHeader>
          <DrawerBody className="min-h-0 flex-1 overflow-auto md:max-w-none">
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
                  {selectedProviderOption.requiresEndpoint ? (
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
                  ) : null}

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
                      <OverlayField
                        label={t("settings:SETTINGS_STORAGE_PUBLIC_DELIVERY_MODE_LABEL")}
                      >
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
                </>
              ) : null}

              <Controller
                control={form.control}
                name="isDefault"
                render={({ field }) => (
                  <SettingDialogField
                    title={t("settings:SETTINGS_SYSTEM_STORAGE_DEFAULT_LABEL")}
                    description={t("settings:SETTINGS_SYSTEM_STORAGE_DEFAULT_DESC")}
                    className="grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-1"
                    headerClassName="col-start-1"
                    controlClassName="col-start-2 row-start-1 w-auto pt-0.5"
                  >
                    <Switch checked={Boolean(field.value)} onCheckedChange={field.onChange} />
                  </SettingDialogField>
                )}
              />
            </SettingDialogFields>
          </DrawerBody>
          <DrawerFooter className="md:max-w-none">
            <div className="flex w-full items-center justify-end gap-2">
              <Button variant="outline" disabled={formBusy} onClick={closeProfileDrawer}>
                {t("common:CANCEL")}
              </Button>
              <Button
                loading={formBusy}
                disabled={formBusy}
                onClick={() => {
                  void handleSaveProfile();
                }}
              >
                {isEditing
                  ? t("settings:SETTINGS_SAVE")
                  : t("settings:SETTINGS_SYSTEM_STORAGE_CREATE_ACTION")}
              </Button>
            </div>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

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
        <Alert>
          <CircleAlert />
          <AlertTitle>{deleteTarget?.displayName ?? "-"}</AlertTitle>
          <AlertDescription>{t("settings:SETTINGS_SYSTEM_STORAGE_DELETE_HINT")}</AlertDescription>
        </Alert>
      </SettingDialog>
    </>
  );
}
