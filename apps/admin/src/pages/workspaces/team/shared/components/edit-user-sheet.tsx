"use client";

import * as React from "react";
import { useTranslation } from "react-i18next";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { PencilLine, Trash2, UploadCloud } from "lucide-react";

import type { TeamMember } from "@arclayer/openapi/admin-types";
import { patchTeamMemberUser } from "@/api/team";
import { AssetPickerDialog } from "@/pages/workspaces/assets/components/asset-picker-dialog";
import { Button } from "@arclayer/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuIconItem,
  DropdownMenuTrigger,
} from "@arclayer/ui/dropdown-menu";
import { Input } from "@arclayer/ui/input";
import { SettingDialogField, SettingDialogFields } from "@arclayer/ui/setting-dialog-field";
import { SettingSheet } from "@arclayer/ui/setting-sheet";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import { resolvePublicAssetUrlPath } from "@/lib/assets/asset-urls";

type FormValues = {
  username: string;
  displayName: string;
  email: string;
  avatarUrl: string;
};

function normalizeOptionalString(input: string): string | null {
  const value = String(input || "").trim();
  return value ? value : null;
}

const AVATAR_IMAGE_FALLBACK_DATA_URI = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
    <rect width="96" height="96" rx="48" fill="#E2E8F0"/>
    <circle cx="48" cy="38" r="16" fill="#CBD5E1"/>
    <path d="M20 82c6-18 20-26 28-26s22 8 28 26" fill="#CBD5E1"/>
  </svg>`,
)}`;

function tryExtractAssetIdFromUrl(url: string): string | null {
  const raw = String(url || "").trim();
  if (!raw) return null;
  const match = raw.match(/\/assets\/([^/?#]+)/i);
  return match?.[1] ? String(match[1]) : null;
}

export function EditUserSheet(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: TeamMember | null;
  onSaved?: () => void;
}) {
  const { t } = useTranslation(["team", "common"]);
  const workspaceId = useWorkspaceStore((state) => state.currentWorkspaceId);
  const projectId = useWorkspaceStore((state) => state.currentProjectId);
  const assetScope = React.useMemo(
    () => (projectId ? { type: "project" as const, id: String(projectId) } : null),
    [projectId],
  );
  const [avatarPickerOpen, setAvatarPickerOpen] = React.useState(false);

  const schema = React.useMemo(() => {
    const max = (size: number) => t("team:TEAM_VALIDATION_MAX_LENGTH", { max: size });

    return z.object({
      username: z.string().trim(),
      displayName: z.string().trim().max(64, max(64)),
      email: z
        .string()
        .trim()
        .max(255, max(255))
        .superRefine((value, ctx) => {
          if (!value) return;
          if (!z.string().email().safeParse(value).success) {
            ctx.addIssue({ code: "custom", message: t("team:TEAM_VALIDATION_EMAIL_INVALID") });
          }
        }),
      avatarUrl: z.string().trim().max(512, max(512)),
    });
  }, [t]);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      username: "",
      displayName: "",
      email: "",
      avatarUrl: "",
    },
    mode: "onSubmit",
  });

  React.useEffect(() => {
    const member = props.member;
    if (!member) return;
    form.reset({
      username: member.username ?? "",
      displayName: member.displayName ?? "",
      email: member.email ?? "",
      avatarUrl: member.avatarUrl ?? "",
    });
  }, [form, props.member]);

  React.useEffect(() => {
    if (props.open) return;
    setAvatarPickerOpen(false);
  }, [props.open]);

  const avatarUrl = form.watch("avatarUrl");
  const avatarPreviewUrl = React.useMemo(() => resolvePublicAssetUrlPath(avatarUrl), [avatarUrl]);
  const selectedAvatarAssetId = React.useMemo(() => {
    if (!avatarUrl) return null;
    return tryExtractAssetIdFromUrl(avatarUrl);
  }, [avatarUrl]);

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const member = props.member;
      if (!member) return null;
      if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
      return patchTeamMemberUser(workspaceId, member.membershipId, {
        displayName: normalizeOptionalString(values.displayName),
        email: normalizeOptionalString(values.email),
        avatarUrl: normalizeOptionalString(values.avatarUrl),
      });
    },
    onSuccess: () => {
      notifySuccessText(t("team:TEAM_ACTION_SUCCESS"));
      props.onSaved?.();
      props.onOpenChange(false);
    },
    onError: (err) => notifyError(err),
  });

  const onSubmit = form.handleSubmit(async (values) => {
    await mutation.mutateAsync(values);
  });

  const title = props.member
    ? t("team:TEAM_EDIT_USER_TITLE", { username: props.member.username })
    : t("team:TEAM_EDIT_USER_TITLE_FALLBACK");

  return (
    <SettingSheet
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={title}
      description={t("team:TEAM_EDIT_USER_DESC")}
      contentClassName="w-115 sm:w-130"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="ghost"
            onClick={() => props.onOpenChange(false)}
            disabled={mutation.isPending}
          >
            {t("common:CANCEL")}
          </Button>
          <Button loading={mutation.isPending} onClick={() => void onSubmit()}>
            {t("common:CONFIRM")}
          </Button>
        </div>
      }
    >
      <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col py-2">
        <input type="hidden" {...form.register("avatarUrl")} />
        <SettingDialogFields>
          <SettingDialogField
            title={t("team:TEAM_FIELD_AVATAR")}
            description={t("team:TEAM_FIELD_AVATAR_DESC")}
          >
            <div className="relative h-16 w-16">
              <button
                type="button"
                className="h-16 w-16 overflow-hidden rounded-full border border-border/60 bg-muted/20 outline-none"
                onClick={() => {
                  if (!assetScope) return;
                  setAvatarPickerOpen(true);
                }}
                aria-label={t("team:TEAM_FIELD_AVATAR_DESC")}
              >
                {avatarPreviewUrl ? (
                  <img
                    src={avatarPreviewUrl}
                    alt={t("team:TEAM_FIELD_AVATAR")}
                    className="h-16 w-16 rounded-full object-cover"
                    onError={(event) => {
                      event.currentTarget.src = AVATAR_IMAGE_FALLBACK_DATA_URI;
                    }}
                  />
                ) : (
                  <div className="grid h-16 w-16 place-items-center text-caption text-label-secondary">
                    {t("team:TEAM_FIELD_AVATAR_EMPTY")}
                  </div>
                )}
              </button>

              <div className="absolute -right-1 -bottom-1">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="icon-xs"
                      className="rounded-full "
                      aria-label={t("team:TEAM_FIELD_AVATAR")}
                    >
                      <PencilLine size={14} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuIconItem
                      icon={<UploadCloud size={16} />}
                      onSelect={() => {
                        if (!assetScope) return;
                        setAvatarPickerOpen(true);
                      }}
                    >
                      {t("team:TEAM_AVATAR_ACTION_UPLOAD")}
                    </DropdownMenuIconItem>
                    <DropdownMenuIconItem
                      icon={<Trash2 size={16} />}
                      variant="destructive"
                      disabled={!avatarUrl}
                      onSelect={() => {
                        form.setValue("avatarUrl", "", {
                          shouldDirty: true,
                          shouldValidate: true,
                        });
                      }}
                    >
                      {t("team:TEAM_AVATAR_ACTION_REMOVE")}
                    </DropdownMenuIconItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </SettingDialogField>

          <SettingDialogField
            title={t("team:TEAM_FIELD_USERNAME")}
            description={t("team:TEAM_FIELD_USERNAME_HELP")}
          >
            <Controller
              control={form.control}
              name="username"
              render={({ field }) => <Input id="username" disabled value={field.value} />}
            />
          </SettingDialogField>

          <SettingDialogField
            title={t("team:TEAM_FIELD_DISPLAY_NAME")}
            description={t("team:TEAM_FIELD_DISPLAY_NAME_HELP")}
            error={
              form.formState.errors.displayName?.message
                ? String(form.formState.errors.displayName.message)
                : undefined
            }
          >
            <Controller
              control={form.control}
              name="displayName"
              render={({ field }) => (
                <Input
                  id="displayName"
                  placeholder={t("team:TEAM_FIELD_DISPLAY_NAME_PLACEHOLDER")}
                  aria-invalid={form.formState.errors.displayName ? true : undefined}
                  value={field.value}
                  onChange={(event) => field.onChange(event.target.value)}
                  onBlur={field.onBlur}
                  name={field.name}
                />
              )}
            />
          </SettingDialogField>

          <SettingDialogField
            title={t("team:TEAM_FIELD_EMAIL")}
            description={t("team:TEAM_FIELD_EMAIL_HELP")}
            error={
              form.formState.errors.email?.message
                ? String(form.formState.errors.email.message)
                : undefined
            }
          >
            <Controller
              control={form.control}
              name="email"
              render={({ field }) => (
                <Input
                  id="email"
                  placeholder={t("team:TEAM_FIELD_EMAIL_PLACEHOLDER")}
                  aria-invalid={form.formState.errors.email ? true : undefined}
                  value={field.value}
                  onChange={(event) => field.onChange(event.target.value)}
                  onBlur={field.onBlur}
                  name={field.name}
                />
              )}
            />
          </SettingDialogField>
        </SettingDialogFields>
      </form>

      {assetScope ? (
        <AssetPickerDialog
          open={avatarPickerOpen}
          onOpenChange={setAvatarPickerOpen}
          scope={assetScope}
          mode="single"
          value={{ assetIds: selectedAvatarAssetId ? [selectedAvatarAssetId] : [] }}
          mimePrefix="image/"
          uploadPurpose="avatar"
          title={t("team:TEAM_FIELD_AVATAR")}
          description={t("team:TEAM_FIELD_AVATAR_DESC")}
          onConfirm={({ assetIds }) => {
            const assetId = assetIds[0];
            if (!assetId) return;
            form.setValue("avatarUrl", `/assets/${assetId}`, {
              shouldDirty: true,
              shouldValidate: true,
            });
          }}
        />
      ) : null}
    </SettingSheet>
  );
}
