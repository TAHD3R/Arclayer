"use client";

import * as React from "react";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { z } from "zod";

import {
  abortSystemDirectoryUserAvatarUpload,
  commitSystemDirectoryUserAvatarUploadPart,
  completeSystemDirectoryUserAvatarUpload,
  initSystemDirectoryUserAvatarUpload,
  presignSystemDirectoryUserAvatarUploadPart,
  uploadSystemDirectoryUserAvatarPart,
} from "@/api/system-directory";
import { PasswordRequirementChecklist } from "@/components/auth/password-requirement-checklist";
import { AvatarUploadSlot } from "@/components/common/avatar-upload-slot";
import { PASSWORD_PATTERN } from "@/lib/auth/form-feedback";
import { resolveAssetRefToPublicUrlPath } from "@/lib/assets/asset-urls";
import { uploadPresignedPart } from "@/lib/assets/storage-transfer";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { notifyError } from "@/lib/notifications";
import type { SystemDirectoryUser } from "@arclayer/openapi/admin-types";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@arclayer/ui/alert-dialog";
import { Button } from "@arclayer/ui/button";
import { Input } from "@arclayer/ui/input";
import { PasswordInput } from "@arclayer/ui/password-input";
import { SettingDialog } from "@arclayer/ui/setting-dialog";
import { SettingDialogField, SettingDialogFields } from "@arclayer/ui/setting-dialog-field";
import {
  AlertDialogAction as AlertDialogActionPrimitive,
  AlertDialogCancel as AlertDialogCancelPrimitive,
} from "@arclayer/ui/radix-primitives/radix-alert-dialog";

export type UserActionTarget = Pick<
  SystemDirectoryUser,
  | "userId"
  | "username"
  | "displayName"
  | "email"
  | "status"
  | "avatarUrl"
  | "avatar_url"
  | "hasPassword"
  | "twoFactorEnabled"
  | "linkedOauthProviders"
> & {
  linkedOauthProviders: string[];
};

type EditAccountValues = {
  displayName: string;
  email: string;
  avatarAssetId: string;
};

type ResetPasswordValues = {
  newPassword: string;
  confirmPassword: string;
};

function normalizeOptionalString(input: string): string | null {
  const value = String(input || "").trim();
  return value ? value : null;
}

function resolveAvatarAssetId(ref: string | null | undefined): string {
  const raw = String(ref || "").trim();
  const match = raw.match(/\/assets\/([^/?#]+)/i);
  return match?.[1] ? String(match[1]) : "";
}

function resolveLinkedProviders(user: UserActionTarget | null): string[] {
  return Array.isArray(user?.linkedOauthProviders) ? user!.linkedOauthProviders : [];
}

async function uploadDirectoryUserAvatarFile(params: {
  userId: string;
  file: File;
  signal?: AbortSignal;
}): Promise<string> {
  let uploadId: string | null = null;
  try {
    const init = await initSystemDirectoryUserAvatarUpload(params.userId, {
      purpose: "avatar",
      filename: params.file.name,
      mime: params.file.type || null,
      sizeBytes: params.file.size,
      expectedSha256: null,
      visibility: "public",
      indexable: false,
      folderId: null,
    });
    uploadId = init.uploadId;
    const chunkSize = Math.max(1, Number(init.chunkSize || 0));
    const totalParts = Math.max(1, Number(init.totalParts || 1));
    const method = String(init.method || "local");
    const parts = Array.from({ length: totalParts }, (_, index) => index + 1);

    await parts.reduce<Promise<void>>((chain, partNumber) => {
      return chain.then(async () => {
        const start = (partNumber - 1) * chunkSize;
        const end = Math.min(params.file.size, start + chunkSize);
        const chunk = params.file.slice(start, end);

        if (method === "s3_multipart") {
          const presign = await presignSystemDirectoryUserAvatarUploadPart({
            userId: params.userId,
            uploadId: init.uploadId,
            partNumber,
          });
          const etag = await uploadPresignedPart({
            presign,
            chunk,
            signal: params.signal,
            errorMessage: "Avatar upload failed on multipart PUT request.",
            missingEtagMessage: "Avatar upload response is missing ETag.",
          });
          await commitSystemDirectoryUserAvatarUploadPart({
            userId: params.userId,
            uploadId: init.uploadId,
            partNumber,
            payload: { etag, sizeBytes: chunk.size },
          });
          return;
        }

        await uploadSystemDirectoryUserAvatarPart({
          userId: params.userId,
          uploadId: init.uploadId,
          partNumber,
          chunk,
          signal: params.signal,
        });
      });
    }, Promise.resolve());

    const done = await completeSystemDirectoryUserAvatarUpload(params.userId, init.uploadId);
    return done.assetId;
  } catch (error) {
    if (uploadId) {
      try {
        await abortSystemDirectoryUserAvatarUpload(params.userId, uploadId);
      } catch {
        // Keep original upload failure visible to the caller.
      }
    }
    throw error;
  }
}

export function EditAccountDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: UserActionTarget | null;
  pending: boolean;
  onSubmit: (values: {
    displayName?: string | null;
    email?: string | null;
    avatarAssetId?: string | null;
  }) => Promise<void>;
}) {
  const { t } = useTranslation(["settings", "common", "assets"]);
  const avatarFileInputRef = React.useRef<HTMLInputElement | null>(null);
  const [avatarUploading, setAvatarUploading] = React.useState(false);

  const schema = React.useMemo(
    () =>
      z.object({
        displayName: z.string().trim().max(64),
        email: z
          .string()
          .trim()
          .max(255)
          .superRefine((value, ctx) => {
            if (!value) return;
            if (!z.string().email().safeParse(value).success) {
              ctx.addIssue({
                code: "custom",
                message: t("settings:SETTINGS_VALIDATION_EMAIL_INVALID"),
              });
            }
          }),
        avatarAssetId: z.string().trim().max(64),
      }),
    [t],
  );

  const form = useForm<EditAccountValues>({
    resolver: zodResolver(schema),
    defaultValues: { displayName: "", email: "", avatarAssetId: "" },
    mode: "onSubmit",
  });

  React.useEffect(() => {
    if (!props.open) return;
    form.reset({
      displayName: props.user?.displayName ?? "",
      email: props.user?.email ?? "",
      avatarAssetId: resolveAvatarAssetId(props.user?.avatarUrl ?? props.user?.avatar_url),
    });
  }, [form, props.open, props.user]);

  const avatarAssetId = form.watch("avatarAssetId");
  const avatarPreviewUrl = resolveAssetRefToPublicUrlPath(avatarAssetId);
  const avatarFallback =
    props.user?.displayName?.trim()?.slice(0, 1) ||
    props.user?.username?.trim()?.slice(0, 1) ||
    "?";
  const avatarBusy = props.pending || avatarUploading;

  const handleAvatarFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.currentTarget.value = "";
    if (!file || !props.user || avatarBusy) return;
    if (!file.type?.startsWith("image/")) {
      notifyError(new Error(t("assets:ASSET_UPLOAD_IMAGE_ONLY_REQUIRED")));
      return;
    }

    setAvatarUploading(true);
    void uploadDirectoryUserAvatarFile({ userId: props.user.userId, file })
      .then((assetId) => {
        form.setValue("avatarAssetId", assetId, {
          shouldDirty: true,
          shouldValidate: true,
        });
      })
      .catch((error) => notifyError(error))
      .finally(() => setAvatarUploading(false));
  };

  const onSubmit = form.handleSubmit(async (values) => {
    await props.onSubmit({
      displayName: normalizeOptionalString(values.displayName),
      email: normalizeOptionalString(values.email),
      avatarAssetId: normalizeOptionalString(values.avatarAssetId),
    });
    props.onOpenChange(false);
  });

  return (
    <>
      <SettingDialog
        open={props.open}
        onOpenChange={(open) => {
          if (!props.pending) props.onOpenChange(open);
        }}
        title={t("settings:SETTINGS_SYSTEM_DIRECTORY_EDIT_ACCOUNT_TITLE")}
        description={t("settings:SETTINGS_SYSTEM_DIRECTORY_EDIT_ACCOUNT_DESC")}
        footer={
          <div className="flex w-full items-center justify-end gap-2">
            <Button
              variant="outline"
              disabled={avatarBusy}
              onClick={() => props.onOpenChange(false)}
            >
              {t("common:CANCEL")}
            </Button>
            <Button
              loading={props.pending}
              disabled={avatarUploading}
              onClick={() => void onSubmit()}
            >
              {t("common:CONFIRM")}
            </Button>
          </div>
        }
      >
        <form onSubmit={onSubmit}>
          <SettingDialogFields>
            <input type="hidden" {...form.register("avatarAssetId")} />

            <SettingDialogField
              title={t("settings:SETTINGS_SYSTEM_DIRECTORY_EDIT_ACCOUNT_AVATAR")}
              description={t("settings:SETTINGS_SYSTEM_DIRECTORY_EDIT_ACCOUNT_AVATAR_DESC")}
            >
              <div className="ml-1">
                <input
                  ref={avatarFileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  tabIndex={-1}
                  onChange={handleAvatarFileChange}
                />
                <AvatarUploadSlot
                  shape="circle"
                  size={72}
                  disabled={avatarBusy}
                  loading={avatarUploading}
                  src={avatarPreviewUrl}
                  fallback={<span className="text-title3">{avatarFallback}</span>}
                  uploadAriaLabel={t("settings:SETTINGS_SYSTEM_DIRECTORY_EDIT_ACCOUNT_AVATAR_PICK")}
                  removeAriaLabel={t(
                    "settings:SETTINGS_SYSTEM_DIRECTORY_EDIT_ACCOUNT_AVATAR_REMOVE",
                  )}
                  canRemove={Boolean(avatarAssetId)}
                  onPick={() => avatarFileInputRef.current?.click()}
                  onRemove={() => {
                    form.setValue("avatarAssetId", "", {
                      shouldDirty: true,
                      shouldValidate: true,
                    });
                  }}
                />
              </div>
            </SettingDialogField>

            <SettingDialogField
              title={t("settings:SETTINGS_SYSTEM_DIRECTORY_EDIT_ACCOUNT_DISPLAY_NAME")}
              error={form.formState.errors.displayName?.message?.toString()}
            >
              <Input
                id="system-directory-edit-display-name"
                placeholder={t(
                  "settings:SETTINGS_SYSTEM_DIRECTORY_EDIT_ACCOUNT_DISPLAY_NAME_PLACEHOLDER",
                )}
                disabled={avatarBusy}
                {...form.register("displayName")}
              />
            </SettingDialogField>

            <SettingDialogField
              title={t("settings:SETTINGS_SYSTEM_DIRECTORY_EDIT_ACCOUNT_EMAIL")}
              description={t("settings:SETTINGS_SYSTEM_DIRECTORY_EDIT_ACCOUNT_EMAIL_HELP")}
              error={form.formState.errors.email?.message?.toString()}
            >
              <Input
                id="system-directory-edit-email"
                placeholder={t("settings:SETTINGS_SYSTEM_DIRECTORY_EDIT_ACCOUNT_EMAIL_PLACEHOLDER")}
                disabled={avatarBusy}
                {...form.register("email")}
              />
            </SettingDialogField>
          </SettingDialogFields>
        </form>
      </SettingDialog>
    </>
  );
}

export function ResetPasswordDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: UserActionTarget | null;
  pending: boolean;
  onSubmit: (values: { newPassword: string }) => Promise<void>;
}) {
  const { t } = useTranslation(["settings", "common", "auth", "team"]);

  const schema = React.useMemo(
    () =>
      z
        .object({
          newPassword: z
            .string()
            .min(1, t("auth:VALIDATION_PASSWORD_REQUIRED"))
            .regex(PASSWORD_PATTERN, t("auth:PASSWORD_INVALID")),
          confirmPassword: z.string().min(1, t("auth:VALIDATION_CONFIRM_PASSWORD_REQUIRED")),
        })
        .superRefine((value, ctx) => {
          if (value.newPassword !== value.confirmPassword) {
            ctx.addIssue({
              code: "custom",
              path: ["confirmPassword"],
              message: t("team:TEAM_VALIDATION_PASSWORD_MISMATCH"),
            });
          }
        }),
    [t],
  );

  const form = useForm<ResetPasswordValues>({
    resolver: zodResolver(schema),
    defaultValues: { newPassword: "", confirmPassword: "" },
    mode: "onSubmit",
  });

  const newPasswordValue = form.watch("newPassword");

  React.useEffect(() => {
    if (!props.open) {
      form.reset({ newPassword: "", confirmPassword: "" });
    }
  }, [form, props.open]);

  const onSubmit = form.handleSubmit(async (values) => {
    await props.onSubmit({ newPassword: values.newPassword });
    props.onOpenChange(false);
  });

  return (
    <SettingDialog
      open={props.open}
      onOpenChange={(open) => {
        if (!props.pending) props.onOpenChange(open);
      }}
      title={t("settings:SETTINGS_SYSTEM_DIRECTORY_RESET_PASSWORD_TITLE")}
      description={t("settings:SETTINGS_SYSTEM_DIRECTORY_RESET_PASSWORD_DESC")}
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Button
            variant="outline"
            disabled={props.pending}
            onClick={() => props.onOpenChange(false)}
          >
            {t("common:CANCEL")}
          </Button>
          <Button loading={props.pending} onClick={() => void onSubmit()}>
            {t("common:CONFIRM")}
          </Button>
        </div>
      }
    >
      <form onSubmit={onSubmit}>
        <SettingDialogFields>
          <SettingDialogField
            title={t("settings:SETTINGS_SYSTEM_DIRECTORY_RESET_PASSWORD_NEW")}
            description={t("settings:SETTINGS_SYSTEM_DIRECTORY_RESET_PASSWORD_NEW_HELP")}
            error={form.formState.errors.newPassword?.message?.toString()}
          >
            <div className="grid gap-3">
              <PasswordInput
                id="system-directory-reset-password"
                autoComplete="new-password"
                disabled={props.pending}
                {...form.register("newPassword")}
              />
              <PasswordRequirementChecklist
                password={newPasswordValue}
                active={
                  Boolean(form.formState.dirtyFields.newPassword) || newPasswordValue.length > 0
                }
                t={t}
              />
            </div>
          </SettingDialogField>

          <SettingDialogField
            title={t("settings:SETTINGS_SYSTEM_DIRECTORY_RESET_PASSWORD_CONFIRM")}
            description={t("settings:SETTINGS_SYSTEM_DIRECTORY_RESET_PASSWORD_CONFIRM_HELP")}
            error={form.formState.errors.confirmPassword?.message?.toString()}
          >
            <PasswordInput
              id="system-directory-reset-password-confirm"
              autoComplete="new-password"
              disabled={props.pending}
              {...form.register("confirmPassword")}
            />
          </SettingDialogField>
        </SettingDialogFields>
      </form>
    </SettingDialog>
  );
}

export function ConfirmUserActionDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  pending: boolean;
  variant?: "default" | "destructive";
  onConfirm: () => Promise<void>;
}) {
  const { t } = useTranslation(["common"]);

  return (
    <AlertDialog
      open={props.open}
      onOpenChange={(open) => {
        if (!props.pending) props.onOpenChange(open);
      }}
    >
      <AlertDialogContent className="sm:max-w-130">
        <AlertDialogHeader>
          <AlertDialogTitle>{props.title}</AlertDialogTitle>
          <AlertDialogDescription className="text-body">{props.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancelPrimitive asChild>
            <Button variant="outline" disabled={props.pending}>
              {t("common:CANCEL")}
            </Button>
          </AlertDialogCancelPrimitive>
          <AlertDialogActionPrimitive asChild>
            <Button
              variant={props.variant === "destructive" ? "destructive" : undefined}
              loading={props.pending}
              onClick={async () => {
                await props.onConfirm();
                props.onOpenChange(false);
              }}
            >
              {props.confirmLabel}
            </Button>
          </AlertDialogActionPrimitive>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function getUserActionAvailability(user: UserActionTarget | null) {
  const linkedProviders = resolveLinkedProviders(user);
  return {
    canSendResetPasswordEmail: Boolean(user?.email?.trim()),
    canDisableTwoFactor: Boolean(user?.twoFactorEnabled),
    linkedProviders,
    canUnlinkOAuth: linkedProviders.length > 0,
    canResetPassword: Boolean(user?.hasPassword || linkedProviders.length > 0),
  } as const;
}
