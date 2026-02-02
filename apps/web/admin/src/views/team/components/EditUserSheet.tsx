"use client";

import { Button as AntButton, Image, Input, Select } from "antd";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { PencilLine, Trash2, UploadCloud } from "lucide-react";

import type { TeamMember } from "@/api/team";
import { patchTeamMemberUser } from "@/api/team";
import { AssetPickerDialog } from "@/components/app/assetPickerDialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/animate-ui/components/radix/sheet";
import { zodResolver } from "@/lib/forms/zodResolver";
import { notifyError, notifySuccessText } from "@/utils/notifications";
import { useWorkspaceStore } from "@/stores/useWorkspaceStore";
import { resolvePublicAssetUrlPath } from "@/views/assets/utils/assetUrls";

type FormValues = {
  username: string;
  displayName: string;
  email: string;
  avatarUrl: string;
};

function normalizeOptionalString(input: string): string | null {
  const v = String(input || "").trim();
  return v ? v : null;
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
  // Match both relative and absolute URLs containing /assets/<id>
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
  const workspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const [avatarPickerOpen, setAvatarPickerOpen] = React.useState(false);
  const [avatarActionOpen, setAvatarActionOpen] = React.useState(false);
  const popupContainerRef = React.useRef<HTMLDivElement | null>(null);

  const schema = React.useMemo(() => {
    const max = (n: number) => t("team:TEAM_VALIDATION_MAX_LENGTH", { max: n });

    return z.object({
      username: z.string().trim(),
      displayName: z.string().trim().max(64, max(64)),
      email: z
        .string()
        .trim()
        .max(255, max(255))
        .superRefine((v, ctx) => {
          if (!v) return;
          if (!z.string().email().safeParse(v).success) {
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
  const { control } = form;

  React.useEffect(() => {
    const m = props.member;
    if (!m) return;
    form.reset({
      username: m.username ?? "",
      displayName: m.displayName ?? "",
      email: m.email ?? "",
      avatarUrl: m.avatarUrl ?? "",
    });
  }, [form, props.member]);

  React.useEffect(() => {
    // Ensure nested dialogs do not stay open when the sheet closes.
    if (!props.open) {
      setAvatarPickerOpen(false);
      setAvatarActionOpen(false);
    }
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
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent side="right" className="w-115 sm:w-130">
        <div ref={popupContainerRef} className="flex min-h-0 flex-1 flex-col">
          <SheetHeader>
            <SheetTitle className="font-bold!">{title}</SheetTitle>
            <SheetDescription>{t("team:TEAM_EDIT_USER_DESC")}</SheetDescription>
          </SheetHeader>

          <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col gap-4 px-4">
            <input type="hidden" {...form.register("avatarUrl")} />

            {/* Avatar (above username for better identification) */}
            <div className="grid gap-2">
              <label className="text-sm text-muted-foreground">{t("team:TEAM_FIELD_AVATAR")}</label>
              <div className="relative h-16 w-16">
                <div
                  role="button"
                  tabIndex={0}
                  className="h-16 w-16 overflow-hidden rounded-full border border-border/60 bg-muted/20 cursor-pointer outline-none"
                  onClick={() => setAvatarPickerOpen(true)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    setAvatarPickerOpen(true);
                  }}
                  aria-label={t("team:TEAM_FIELD_AVATAR_DESC")}
                >
                  {avatarPreviewUrl ? (
                    <Image
                      width={64}
                      height={64}
                      src={avatarPreviewUrl}
                      fallback={AVATAR_IMAGE_FALLBACK_DATA_URI}
                      preview={false}
                      className="h-16 w-16 rounded-full"
                    />
                  ) : (
                    <div className="h-16 w-16 grid place-items-center text-xs text-muted-foreground">
                      {t("team:TEAM_FIELD_AVATAR_EMPTY")}
                    </div>
                  )}
                </div>

                {/* Action trigger (bottom-right) */}
                <div className="absolute -bottom-1 -right-1">
                  <AntButton
                    size="small"
                    type="primary"
                    shape="circle"
                    icon={<PencilLine size={14} />}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setAvatarActionOpen(true);
                    }}
                    aria-label={t("team:TEAM_FIELD_AVATAR")}
                  />
                  <Select
                    open={avatarActionOpen}
                    onDropdownVisibleChange={(open) => setAvatarActionOpen(open)}
                    value={undefined}
                    // Keep the Select trigger hidden; only the dropdown is used.
                    style={{
                      position: "absolute",
                      inset: 0,
                      opacity: 0,
                      pointerEvents: "none",
                    }}
                    // Important: render popup inside the Sheet to avoid Radix "outside click" interception.
                    getPopupContainer={() => popupContainerRef.current ?? document.body}
                    dropdownMatchSelectWidth={false}
                    options={[]}
                    dropdownRender={() => (
                      <div className="p-1">
                        <AntButton
                          type="text"
                          className="!w-full !justify-start"
                          icon={<UploadCloud size={16} />}
                          onClick={() => {
                            setAvatarActionOpen(false);
                            setAvatarPickerOpen(true);
                          }}
                        >
                          {t("team:TEAM_AVATAR_ACTION_UPLOAD")}
                        </AntButton>
                        <AntButton
                          type="text"
                          danger
                          disabled={!avatarUrl}
                          className="!w-full !justify-start"
                          icon={<Trash2 size={16} />}
                          onClick={() => {
                            setAvatarActionOpen(false);
                            form.setValue("avatarUrl", "", {
                              shouldDirty: true,
                              shouldValidate: true,
                            });
                          }}
                        >
                          {t("team:TEAM_AVATAR_ACTION_REMOVE")}
                        </AntButton>
                      </div>
                    )}
                  />
                </div>
              </div>
            </div>

            <div className="grid gap-1.5">
              <label className="text-sm text-muted-foreground" htmlFor="username">
                {t("team:TEAM_FIELD_USERNAME")}
              </label>
              <Controller
                control={control}
                name="username"
                render={({ field }) => (
                  <Input id="username" size="large" disabled value={field.value} />
                )}
              />
            </div>

            <div className="grid gap-1.5">
              <label className="text-sm text-muted-foreground" htmlFor="displayName">
                {t("team:TEAM_FIELD_DISPLAY_NAME")}
              </label>
              <Controller
                control={control}
                name="displayName"
                render={({ field }) => (
                  <Input
                    id="displayName"
                    size="large"
                    placeholder={t("team:TEAM_FIELD_DISPLAY_NAME_PLACEHOLDER")}
                    status={form.formState.errors.displayName ? "error" : undefined}
                    value={field.value}
                    onChange={(e) => field.onChange(e.target.value)}
                    onBlur={field.onBlur}
                    name={field.name}
                  />
                )}
              />
              {form.formState.errors.displayName?.message ? (
                <div className="text-sm text-destructive">
                  {String(form.formState.errors.displayName.message)}
                </div>
              ) : null}
            </div>

            <div className="grid gap-1.5">
              <label className="text-sm text-muted-foreground" htmlFor="email">
                {t("team:TEAM_FIELD_EMAIL")}
              </label>
              <Controller
                control={control}
                name="email"
                render={({ field }) => (
                  <Input
                    id="email"
                    size="large"
                    placeholder={t("team:TEAM_FIELD_EMAIL_PLACEHOLDER")}
                    status={form.formState.errors.email ? "error" : undefined}
                    value={field.value}
                    onChange={(e) => field.onChange(e.target.value)}
                    onBlur={field.onBlur}
                    name={field.name}
                  />
                )}
              />
              {form.formState.errors.email?.message ? (
                <div className="text-sm text-destructive">
                  {String(form.formState.errors.email.message)}
                </div>
              ) : null}
            </div>
          </form>

          <SheetFooter>
            <div className="flex items-center justify-end gap-2">
              <AntButton onClick={() => props.onOpenChange(false)} disabled={mutation.isPending}>
                {t("common:CANCEL")}
              </AntButton>
              <AntButton
                type="primary"
                loading={mutation.isPending}
                onClick={() => void onSubmit()}
              >
                {t("common:CONFIRM")}
              </AntButton>
            </div>
          </SheetFooter>
        </div>
      </SheetContent>

      <AssetPickerDialog
        open={avatarPickerOpen}
        onOpenChange={setAvatarPickerOpen}
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
    </Sheet>
  );
}
