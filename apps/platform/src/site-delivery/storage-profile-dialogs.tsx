import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import type {
  ObjectStorageProviderKind,
  StorageProfileConfigPayloadInput,
  StorageProfileOut,
} from "@arclayer/platform-openapi";

import {
  createStorageProfile,
  deleteStorageProfile,
  PlatformSiteDeliveryApiError,
  updateStorageProfile,
} from "@/site-delivery/site-delivery-api";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SettingDialog } from "@/components/setting-dialog";
import { SettingDialogField, SettingDialogFields } from "@/components/setting-dialog-field";

const STORAGE_PROVIDERS: readonly ObjectStorageProviderKind[] = [
  "local",
  "aws_s3",
  "minio",
  "cloudflare_r2",
  "aliyun_oss",
  "volcengine_tos",
];

type DialogProps = Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompleted: (messageKey: string) => void;
}>;

function errorKey(error: unknown): string {
  if (!(error instanceof PlatformSiteDeliveryApiError)) return "STORAGE_CHANGE_ERROR";
  if (error.status === 401 || error.status === 403) return "STORAGE_CHANGE_PERMISSION_ERROR";
  if (error.status === 409) return "STORAGE_CHANGE_CONFLICT_ERROR";
  if (error.status === 422) return "STORAGE_CHANGE_VALIDATION_ERROR";
  return "STORAGE_CHANGE_ERROR";
}

function MutationError({ messageKey }: Readonly<{ messageKey: string }>) {
  const { t } = useTranslation("siteDelivery");
  return (
    <Alert variant="destructive">
      <AlertTitle>{t("STORAGE_CHANGE_FAILED")}</AlertTitle>
      <AlertDescription>{t(messageKey)}</AlertDescription>
    </Alert>
  );
}

function optional(form: FormData, name: string): string | null {
  const value = String(form.get(name) ?? "").trim();
  return value || null;
}

function configFrom(form: FormData): StorageProfileConfigPayloadInput {
  const expiry = Number(form.get("presignExpiresSeconds") ?? 0);
  return {
    accessKeyId: optional(form, "accessKeyId"),
    bucket: optional(form, "bucket"),
    endpointUrl: optional(form, "endpointUrl"),
    forcePathStyle: form.get("forcePathStyle") === "on",
    presignExpiresSeconds: Number.isInteger(expiry) && expiry > 0 ? expiry : 3600,
    publicBaseUrl: optional(form, "publicBaseUrl"),
    publicBucket: optional(form, "publicBucket"),
    publicDeliveryMode: optional(form, "publicDeliveryMode") ?? "proxy",
    region: optional(form, "region"),
    secretAccessKey: optional(form, "secretAccessKey"),
  };
}

type EditorProps = DialogProps & Readonly<{ profile?: StorageProfileOut }>;

export function StorageProfileEditorDialog(props: EditorProps) {
  const { t } = useTranslation("siteDelivery");
  const [provider, setProvider] = useState<ObjectStorageProviderKind>(
    props.profile?.provider ?? "aws_s3",
  );
  const [forcePathStyle, setForcePathStyle] = useState(
    props.profile?.config.forcePathStyle ?? false,
  );
  const [isActive, setIsActive] = useState(props.profile?.isActive ?? true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const displayName = String(form.get("displayName") ?? "").trim();
    const profileKey = String(form.get("profileKey") ?? "").trim();
    if (!displayName || (!props.profile && !profileKey)) return;
    const config = { ...configFrom(form), forcePathStyle };
    if (props.profile && !config.secretAccessKey) delete config.secretAccessKey;
    setPending(true);
    setError(null);
    try {
      if (props.profile) {
        await updateStorageProfile(props.profile.id, {
          config,
          displayName,
          isActive,
        });
      } else {
        await createStorageProfile({
          config,
          displayName,
          isActive,
          profileKey,
          provider,
        });
      }
      props.onCompleted(props.profile ? "STORAGE_PROFILE_UPDATED" : "STORAGE_PROFILE_CREATED");
      props.onOpenChange(false);
    } catch (caught) {
      setError(errorKey(caught));
    } finally {
      setPending(false);
    }
  };

  const config = props.profile?.config;
  return (
    <SettingDialog
      open={props.open}
      onOpenChange={(open) => !pending && props.onOpenChange(open)}
      title={t(props.profile ? "EDIT_STORAGE_PROFILE" : "CREATE_STORAGE_PROFILE")}
      description={t(
        props.profile ? "EDIT_STORAGE_PROFILE_DESCRIPTION" : "CREATE_STORAGE_PROFILE_DESCRIPTION",
      )}
      footer={
        <>
          <Button disabled={pending} variant="outline" onClick={() => props.onOpenChange(false)}>
            {t("CANCEL")}
          </Button>
          <Button disabled={pending} form="storage-profile-editor" type="submit">
            {pending ? t("WORKING") : t("SAVE_STORAGE_PROFILE")}
          </Button>
        </>
      }
    >
      <form id="storage-profile-editor" onSubmit={submit}>
        <SettingDialogFields>
          {error ? <MutationError messageKey={error} /> : null}
          <SettingDialogField
            title={<label htmlFor="storage-display-name">{t("DISPLAY_NAME")}</label>}
          >
            <Input
              id="storage-display-name"
              name="displayName"
              defaultValue={props.profile?.displayName}
              required
            />
          </SettingDialogField>
          <SettingDialogField
            title={<label htmlFor="storage-profile-key">{t("PROFILE_KEY")}</label>}
            description={t("PROFILE_KEY_HELP")}
          >
            <Input
              id="storage-profile-key"
              name="profileKey"
              defaultValue={props.profile?.profileKey}
              disabled={Boolean(props.profile)}
              required={!props.profile}
            />
          </SettingDialogField>
          <SettingDialogField title={t("PROVIDER")}>
            <Select
              disabled={Boolean(props.profile)}
              value={provider}
              onValueChange={(value) => setProvider(value as ObjectStorageProviderKind)}
            >
              <SelectTrigger aria-label={t("PROVIDER")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STORAGE_PROVIDERS.map((item) => (
                  <SelectItem key={item} value={item}>
                    {t(`STORAGE_PROVIDER_${item.toUpperCase()}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingDialogField>
          <SettingDialogField title={<label htmlFor="storage-bucket">{t("STORAGE_BUCKET")}</label>}>
            <Input id="storage-bucket" name="bucket" defaultValue={config?.bucket ?? ""} />
          </SettingDialogField>
          <SettingDialogField
            title={<label htmlFor="storage-endpoint">{t("STORAGE_ENDPOINT")}</label>}
          >
            <Input
              id="storage-endpoint"
              name="endpointUrl"
              defaultValue={config?.endpointUrl ?? ""}
            />
          </SettingDialogField>
          <SettingDialogField title={<label htmlFor="storage-region">{t("STORAGE_REGION")}</label>}>
            <Input id="storage-region" name="region" defaultValue={config?.region ?? ""} />
          </SettingDialogField>
          <SettingDialogField
            title={<label htmlFor="storage-access-key">{t("STORAGE_ACCESS_KEY")}</label>}
          >
            <Input
              id="storage-access-key"
              name="accessKeyId"
              defaultValue={config?.accessKeyId ?? ""}
              autoComplete="off"
            />
          </SettingDialogField>
          <SettingDialogField
            title={<label htmlFor="storage-secret-key">{t("STORAGE_SECRET_KEY")}</label>}
            description={props.profile ? t("STORAGE_SECRET_UNCHANGED_HELP") : undefined}
          >
            <Input
              id="storage-secret-key"
              name="secretAccessKey"
              type="password"
              autoComplete="new-password"
            />
          </SettingDialogField>
          <SettingDialogField
            title={<label htmlFor="storage-public-base-url">{t("STORAGE_PUBLIC_BASE_URL")}</label>}
          >
            <Input
              id="storage-public-base-url"
              name="publicBaseUrl"
              defaultValue={config?.publicBaseUrl ?? ""}
            />
          </SettingDialogField>
          <SettingDialogField
            title={<label htmlFor="storage-public-bucket">{t("STORAGE_PUBLIC_BUCKET")}</label>}
          >
            <Input
              id="storage-public-bucket"
              name="publicBucket"
              defaultValue={config?.publicBucket ?? ""}
            />
          </SettingDialogField>
          <SettingDialogField
            title={<label htmlFor="storage-public-mode">{t("STORAGE_PUBLIC_MODE")}</label>}
          >
            <Input
              id="storage-public-mode"
              name="publicDeliveryMode"
              defaultValue={config?.publicDeliveryMode ?? "proxy"}
            />
          </SettingDialogField>
          <SettingDialogField
            title={<label htmlFor="storage-presign-expiry">{t("STORAGE_LINK_EXPIRY")}</label>}
          >
            <Input
              id="storage-presign-expiry"
              name="presignExpiresSeconds"
              type="number"
              min={1}
              defaultValue={config?.presignExpiresSeconds ?? 3600}
            />
          </SettingDialogField>
          <label className="flex items-center gap-3 text-sm">
            <Checkbox
              checked={forcePathStyle}
              onCheckedChange={(checked) => setForcePathStyle(checked === true)}
            />
            {t("STORAGE_FORCE_PATH_STYLE")}
          </label>
          <label className="flex items-center gap-3 text-sm">
            <Checkbox
              checked={isActive}
              onCheckedChange={(checked) => setIsActive(checked === true)}
            />
            {t("STORAGE_PROFILE_ACTIVE")}
          </label>
        </SettingDialogFields>
      </form>
    </SettingDialog>
  );
}

type DeleteProps = DialogProps & Readonly<{ profile: StorageProfileOut }>;

export function DeleteStorageProfileDialog(props: DeleteProps) {
  const { t } = useTranslation("siteDelivery");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remove = async () => {
    setPending(true);
    setError(null);
    try {
      await deleteStorageProfile(props.profile.id);
      props.onCompleted("STORAGE_PROFILE_DELETED");
      props.onOpenChange(false);
    } catch (caught) {
      setError(errorKey(caught));
    } finally {
      setPending(false);
    }
  };
  return (
    <SettingDialog
      open={props.open}
      onOpenChange={(open) => !pending && props.onOpenChange(open)}
      title={t("DELETE_STORAGE_PROFILE_TITLE")}
      description={t("DELETE_STORAGE_PROFILE_DESCRIPTION", { name: props.profile.displayName })}
      footer={
        <>
          <Button disabled={pending} variant="outline" onClick={() => props.onOpenChange(false)}>
            {t("CANCEL")}
          </Button>
          <Button disabled={pending} variant="destructive" onClick={remove}>
            {pending ? t("WORKING") : t("CONFIRM_DELETE_STORAGE_PROFILE")}
          </Button>
        </>
      }
    >
      {error ? <MutationError messageKey={error} /> : null}
      <p className="text-sm text-muted-foreground">{t("DELETE_STORAGE_PROFILE_CONSEQUENCE")}</p>
    </SettingDialog>
  );
}
