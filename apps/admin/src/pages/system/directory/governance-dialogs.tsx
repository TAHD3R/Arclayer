"use client";

import * as React from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";

import { ProjectAvatar } from "@/components/common/project-avatar";
import { WorkspaceAvatar } from "@/components/common/entity-avatar";
import { PROJECT_ICON_GLYPH_IDS } from "@/components/common/project-icon-glyphs";
import { WORKSPACE_ICON_GLYPH_IDS } from "@/components/common/workspace-icon-glyphs";
import { useImageFallback } from "@/components/common/use-image-fallback";
import { uploadSingleAssetFromFile } from "@/lib/assets/scoped-uploads";
import { getFieldErrorMessage } from "@/lib/forms/rhf-form-helpers";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import type {
  SystemDirectoryProject,
  SystemDirectoryWorkspace,
} from "@arclayer/openapi/admin-types";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@arclayer/ui/alert-dialog";
import { Button } from "@arclayer/ui/button";
import { ColorPicker } from "@arclayer/ui/color-picker";
import { Input } from "@arclayer/ui/input";
import {
  AlertDialogAction as AlertDialogActionPrimitive,
  AlertDialogCancel as AlertDialogCancelPrimitive,
} from "@arclayer/ui/radix-primitives/radix-alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";
import { SettingDialog } from "@arclayer/ui/setting-dialog";
import { SettingDialogField, SettingDialogFields } from "@arclayer/ui/setting-dialog-field";
import { SpinnerOverlay } from "@arclayer/ui/spinner";
import { Textarea } from "@arclayer/ui/textarea";

export type DirectoryIconValues = {
  iconMode: "initials" | "glyph" | "emoji" | "image";
  iconColor: string;
  iconGlyph: string | null;
  iconEmoji: string | null;
  iconUrl: string | null;
};

type EditWorkspaceValues = {
  name: string;
  description: string;
};

type WorkspaceRoleValues = {
  defaultRoleCode: string;
  assignRoleCode: string;
  confirmName: string;
};

type EditProjectValues = {
  name: string;
  slug: string;
  description: string;
};

const ICON_COLOR_PRESETS = [
  "#111827",
  "#475569",
  "#78716c",
  "#b45309",
  "#d97706",
  "#ca8a04",
  "#65a30d",
  "#16a34a",
  "#059669",
  "#0f766e",
  "#0891b2",
  "#2563eb",
  "#4f46e5",
  "#7c3aed",
  "#9333ea",
  "#c026d3",
  "#db2777",
  "#dc2626",
] as const;

const ICON_EMOJIS = ["🚀", "⚡", "💬", "💼", "🏁", "🔥", "📁", "🌍", "✅", "🧩"] as const;

function normalizeOptionalString(value: string): string | null {
  const normalized = String(value || "").trim();
  return normalized ? normalized : null;
}

function normalizeRequiredString(value: string): string {
  return String(value || "").trim();
}

function buildIconValues(entity: {
  iconMode?: string | null;
  iconColor?: string | null;
  iconGlyph?: string | null;
  iconEmoji?: string | null;
  iconUrl?: string | null;
}): DirectoryIconValues {
  const mode = entity.iconMode;
  return {
    iconMode: mode === "glyph" || mode === "emoji" || mode === "image" ? mode : "initials",
    iconColor: entity.iconColor || "#337ea9",
    iconGlyph: entity.iconGlyph ?? null,
    iconEmoji: entity.iconEmoji ?? null,
    iconUrl: entity.iconUrl ?? null,
  };
}

function resolveNonImageMode(values: DirectoryIconValues): "initials" | "glyph" | "emoji" {
  if (values.iconMode === "glyph" && values.iconGlyph) return "glyph";
  if (values.iconMode === "emoji" && values.iconEmoji) return "emoji";
  if (values.iconGlyph) return "glyph";
  if (values.iconEmoji) return "emoji";
  return "initials";
}

function IconTile(props: {
  selected: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={props.label}
      aria-pressed={props.selected}
      onClick={props.onClick}
      className={[
        "flex size-12 cursor-pointer items-center justify-center rounded-md p-1 outline-none transition-colors",
        props.selected ? "bg-accent/35 ring-2 ring-primary/45" : "hover:bg-accent/20",
      ].join(" ")}
    >
      {props.children}
    </button>
  );
}

function ColorSwatch(props: { color: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={props.color}
      aria-pressed={props.selected}
      onClick={props.onClick}
      className={[
        "size-7 rounded-full border transition-transform hover:scale-105",
        props.selected ? "border-primary" : "border-border/70",
      ].join(" ")}
      style={{ backgroundColor: props.color }}
    />
  );
}

export function EditWorkspaceDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspace: SystemDirectoryWorkspace | null;
  pending: boolean;
  onSubmit: (values: { name: string; description: string | null }) => Promise<void>;
}) {
  const { t } = useTranslation(["settings", "common"]);
  const form = useForm<EditWorkspaceValues>({
    defaultValues: { name: "", description: "" },
  });

  React.useEffect(() => {
    if (!props.open) return;
    form.reset({
      name: props.workspace?.name ?? "",
      description: props.workspace?.description ?? "",
    });
  }, [form, props.open, props.workspace]);

  const onSubmit = form.handleSubmit(async (values) => {
    const name = normalizeRequiredString(values.name);
    if (!name) return;
    await props.onSubmit({ name, description: normalizeOptionalString(values.description) });
    props.onOpenChange(false);
  });

  return (
    <SettingDialog
      open={props.open}
      onOpenChange={(open) => {
        if (!props.pending) props.onOpenChange(open);
      }}
      title={t("settings:SETTINGS_SYSTEM_DIRECTORY_EDIT_WORKSPACE_TITLE")}
      description={t("settings:SETTINGS_SYSTEM_DIRECTORY_EDIT_WORKSPACE_DESC")}
      footer={
        <div className="flex w-full justify-end gap-2">
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
          <SettingDialogField title={t("settings:SETTINGS_SYSTEM_DIRECTORY_EDIT_WORKSPACE_NAME")}>
            <Input disabled={props.pending} {...form.register("name")} />
          </SettingDialogField>
          <SettingDialogField title={t("settings:SETTINGS_SYSTEM_DIRECTORY_EDIT_DESCRIPTION")}>
            <Textarea disabled={props.pending} rows={4} {...form.register("description")} />
          </SettingDialogField>
        </SettingDialogFields>
      </form>
    </SettingDialog>
  );
}

export function WorkspaceRoleDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspace: SystemDirectoryWorkspace | null;
  roles: Array<{ code: string; name: string; description: string | null }>;
  defaultRoleCode: string;
  loading?: boolean;
  pending: boolean;
  onUpdateDefaultRole: (roleCode: string) => Promise<void>;
  onAssignRole: (values: { roleCode: string; confirmName: string }) => Promise<void>;
}) {
  const { t } = useTranslation(["settings", "common"]);
  const form = useForm<WorkspaceRoleValues>({
    defaultValues: { defaultRoleCode: "", assignRoleCode: "", confirmName: "" },
  });

  React.useEffect(() => {
    if (!props.open) return;
    form.reset({
      defaultRoleCode: props.defaultRoleCode || "",
      assignRoleCode: "",
      confirmName: "",
    });
  }, [form, props.defaultRoleCode, props.open]);

  const updateDefaultRole = React.useCallback(async () => {
    const defaultRoleCode = normalizeRequiredString(form.getValues("defaultRoleCode"));
    if (!defaultRoleCode) {
      form.setError("defaultRoleCode", {
        type: "required",
        message: t("common:SELECT"),
      });
      return;
    }

    await props.onUpdateDefaultRole(defaultRoleCode);
  }, [form, props, t]);

  const assignRole = React.useCallback(async () => {
    const assignRoleCode = normalizeRequiredString(form.getValues("assignRoleCode"));
    const confirmName = normalizeRequiredString(form.getValues("confirmName"));
    const expectedName = props.workspace?.name ?? "";

    let hasError = false;
    if (!assignRoleCode) {
      form.setError("assignRoleCode", {
        type: "required",
        message: t("common:SELECT"),
      });
      hasError = true;
    }
    if (!confirmName) {
      form.setError("confirmName", {
        type: "required",
        message: t("settings:SETTINGS_WORKSPACE_ASSIGN_ROLE_ALL_CONFIRM_NAME_REQUIRED"),
      });
      hasError = true;
    } else if (confirmName !== expectedName) {
      form.setError("confirmName", {
        type: "validate",
        message: t("settings:SETTINGS_WORKSPACE_ASSIGN_ROLE_ALL_CONFIRM_NAME_MISMATCH"),
      });
      hasError = true;
    }
    if (hasError) return;

    await props.onAssignRole({
      roleCode: assignRoleCode,
      confirmName,
    });
    props.onOpenChange(false);
  }, [form, props, t]);

  return (
    <SettingDialog
      open={props.open}
      onOpenChange={(open) => {
        if (!props.pending) props.onOpenChange(open);
      }}
      title={t("settings:SETTINGS_SYSTEM_DIRECTORY_WORKSPACE_RBAC_TITLE")}
      description={t("settings:SETTINGS_SYSTEM_DIRECTORY_WORKSPACE_RBAC_DESC")}
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button
            variant="outline"
            disabled={props.pending}
            onClick={() => props.onOpenChange(false)}
          >
            {t("common:CANCEL")}
          </Button>
          <Button
            loading={props.pending}
            disabled={props.loading}
            onClick={() => void assignRole()}
          >
            {t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_ASSIGN_WORKSPACE_ROLE")}
          </Button>
        </div>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void assignRole();
        }}
      >
        <SettingDialogFields>
          <SettingDialogField
            title={t("settings:SETTINGS_WORKSPACE_DEFAULT_ROLE_TITLE")}
            description={t("settings:SETTINGS_WORKSPACE_DEFAULT_ROLE_DESC")}
            error={getFieldErrorMessage(form, "defaultRoleCode") ?? undefined}
          >
            <div className="flex gap-2">
              <Controller
                control={form.control}
                name="defaultRoleCode"
                render={({ field, fieldState }) => (
                  <Select
                    value={field.value || undefined}
                    disabled={props.pending || props.loading}
                    onValueChange={(value) => {
                      field.onChange(value);
                      form.clearErrors("defaultRoleCode");
                    }}
                  >
                    <SelectTrigger
                      className="min-w-0 flex-1"
                      aria-invalid={fieldState.error ? true : undefined}
                    >
                      <SelectValue placeholder={t("common:SELECT")} />
                    </SelectTrigger>
                    <SelectContent position="popper" align="start">
                      {props.roles.map((role) => (
                        <SelectItem key={role.code} value={role.code}>
                          {role.name || role.code}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <Button
                type="button"
                variant="outline"
                disabled={props.pending || props.loading}
                onClick={() => void updateDefaultRole()}
              >
                {t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_SAVE_DEFAULT_ROLE")}
              </Button>
            </div>
          </SettingDialogField>
          <SettingDialogField
            title={t("settings:SETTINGS_WORKSPACE_ASSIGN_ROLE_ALL_TITLE")}
            description={t("settings:SETTINGS_WORKSPACE_ASSIGN_ROLE_ALL_DESC")}
            error={getFieldErrorMessage(form, "assignRoleCode") ?? undefined}
          >
            <Controller
              control={form.control}
              name="assignRoleCode"
              render={({ field, fieldState }) => (
                <Select
                  value={field.value || undefined}
                  disabled={props.pending || props.loading}
                  onValueChange={(value) => {
                    field.onChange(value);
                    form.clearErrors("assignRoleCode");
                  }}
                >
                  <SelectTrigger
                    className="w-full"
                    aria-invalid={fieldState.error ? true : undefined}
                  >
                    <SelectValue placeholder={t("common:SELECT")} />
                  </SelectTrigger>
                  <SelectContent position="popper" align="start">
                    {props.roles.map((role) => (
                      <SelectItem key={role.code} value={role.code}>
                        {role.name || role.code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </SettingDialogField>
          <SettingDialogField
            title={t("settings:SETTINGS_DIALOG_CONFIRM_NAME_LABEL")}
            description={t("settings:SETTINGS_SYSTEM_DIRECTORY_WORKSPACE_RBAC_CONFIRM_DESC", {
              name: props.workspace?.name ?? "",
            })}
            error={getFieldErrorMessage(form, "confirmName") ?? undefined}
          >
            <Input
              disabled={props.pending}
              placeholder={t(
                "settings:SETTINGS_WORKSPACE_ASSIGN_ROLE_ALL_CONFIRM_NAME_PLACEHOLDER",
              )}
              aria-invalid={getFieldErrorMessage(form, "confirmName") ? true : undefined}
              {...form.register("confirmName", {
                onChange: () => form.clearErrors("confirmName"),
              })}
            />
          </SettingDialogField>
        </SettingDialogFields>
      </form>
    </SettingDialog>
  );
}

export function EditProjectDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: SystemDirectoryProject | null;
  pending: boolean;
  onSubmit: (values: { name: string; slug: string; description: string | null }) => Promise<void>;
}) {
  const { t } = useTranslation(["settings", "common"]);
  const form = useForm<EditProjectValues>({
    defaultValues: { name: "", slug: "", description: "" },
  });

  React.useEffect(() => {
    if (!props.open) return;
    form.reset({
      name: props.project?.name ?? "",
      slug: props.project?.slug ?? "",
      description: props.project?.description ?? "",
    });
  }, [form, props.open, props.project]);

  const onSubmit = form.handleSubmit(async (values) => {
    const name = normalizeRequiredString(values.name);
    const slug = normalizeRequiredString(values.slug);
    if (!name || !slug) return;
    await props.onSubmit({ name, slug, description: normalizeOptionalString(values.description) });
    props.onOpenChange(false);
  });

  return (
    <SettingDialog
      open={props.open}
      onOpenChange={(open) => {
        if (!props.pending) props.onOpenChange(open);
      }}
      title={t("settings:SETTINGS_SYSTEM_DIRECTORY_EDIT_PROJECT_TITLE")}
      description={t("settings:SETTINGS_SYSTEM_DIRECTORY_EDIT_PROJECT_DESC")}
      footer={
        <div className="flex w-full justify-end gap-2">
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
          <SettingDialogField title={t("settings:SETTINGS_SYSTEM_DIRECTORY_EDIT_PROJECT_NAME")}>
            <Input disabled={props.pending} {...form.register("name")} />
          </SettingDialogField>
          <SettingDialogField
            title={t("settings:SETTINGS_SYSTEM_DIRECTORY_EDIT_PROJECT_SLUG")}
            description={t("settings:SETTINGS_SYSTEM_DIRECTORY_EDIT_PROJECT_SLUG_HELP")}
          >
            <Input disabled={props.pending} {...form.register("slug")} />
          </SettingDialogField>
          <SettingDialogField title={t("settings:SETTINGS_SYSTEM_DIRECTORY_EDIT_DESCRIPTION")}>
            <Textarea disabled={props.pending} rows={4} {...form.register("description")} />
          </SettingDialogField>
        </SettingDialogFields>
      </form>
    </SettingDialog>
  );
}

type DirectoryIconDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  onSubmit: (values: DirectoryIconValues) => Promise<void>;
} & (
  | {
      kind: "workspace";
      entity: SystemDirectoryWorkspace | null;
    }
  | {
      kind: "project";
      entity: SystemDirectoryProject | null;
    }
);

export function DirectoryIconDialog(props: DirectoryIconDialogProps) {
  const { t } = useTranslation(["settings", "common", "assets"]);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const [values, setValues] = React.useState<DirectoryIconValues>({
    iconMode: "initials",
    iconColor: "#337ea9",
    iconGlyph: null,
    iconEmoji: null,
    iconUrl: null,
  });
  const [uploading, setUploading] = React.useState(false);
  const glyphs = props.kind === "project" ? PROJECT_ICON_GLYPH_IDS : WORKSPACE_ICON_GLYPH_IDS;
  const Avatar = props.kind === "project" ? ProjectAvatar : WorkspaceAvatar;
  const previewMode =
    values.iconMode === "image" && values.iconUrl ? "image" : resolveNonImageMode(values);
  const previewImageSrc = previewMode === "image" ? (values.iconUrl ?? undefined) : undefined;
  const { canRenderImage, markImageFailed } = useImageFallback(previewImageSrc);

  React.useEffect(() => {
    if (!props.open || !props.entity) return;
    setValues(buildIconValues(props.entity));
  }, [props.entity, props.open]);

  const busy = props.pending || uploading;
  const uploadFile = (file: File | null) => {
    if (!file || !props.entity || busy) return;
    if (!file.type?.startsWith("image/")) {
      notifyError(new Error(t("assets:ASSET_UPLOAD_IMAGE_ONLY_REQUIRED")));
      return;
    }

    setUploading(true);
    uploadSingleAssetFromFile({
      scope:
        props.kind === "project"
          ? { type: "project", id: props.entity.projectId }
          : { type: "workspace", id: props.entity.workspaceId },
      purpose: "workspace_icon",
      file,
      t,
    })
      .then((assetId) => {
        setValues((prev) => ({ ...prev, iconMode: "image", iconUrl: `/assets/${assetId}` }));
        notifySuccessText(t("assets:ASSET_UPLOAD_SUCCESS"));
      })
      .catch((error) => notifyError(error))
      .finally(() => setUploading(false));
  };

  return (
    <SettingDialog
      open={props.open}
      onOpenChange={(open) => {
        if (!busy) props.onOpenChange(open);
      }}
      title={
        props.kind === "project"
          ? t("settings:SETTINGS_SYSTEM_DIRECTORY_PROJECT_ICON_TITLE")
          : t("settings:SETTINGS_SYSTEM_DIRECTORY_WORKSPACE_ICON_TITLE")
      }
      description={t("settings:SETTINGS_SYSTEM_DIRECTORY_ICON_DESC")}
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button variant="outline" disabled={busy} onClick={() => props.onOpenChange(false)}>
            {t("common:CANCEL")}
          </Button>
          <Button
            loading={props.pending}
            disabled={uploading}
            onClick={async () => {
              await props.onSubmit(values);
              props.onOpenChange(false);
            }}
          >
            {t("common:CONFIRM")}
          </Button>
        </div>
      }
    >
      <SettingDialogFields>
        <SettingDialogField title={t("settings:SETTINGS_SYSTEM_DIRECTORY_ICON_UPLOAD")}>
          <div className="relative inline-flex">
            <button
              type="button"
              className="relative flex size-24 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-border/70 bg-muted transition-colors hover:bg-accent/55 disabled:pointer-events-none disabled:opacity-70"
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
            >
              {previewMode === "image" && previewImageSrc && canRenderImage ? (
                <img
                  src={previewImageSrc}
                  alt={props.entity?.name ?? ""}
                  className="size-full object-cover"
                  onError={markImageFailed}
                />
              ) : (
                <Avatar
                  name={props.entity?.name}
                  size={96}
                  iconMode={previewMode}
                  iconColor={values.iconColor}
                  iconGlyph={values.iconGlyph}
                  iconEmoji={values.iconEmoji}
                  className={
                    previewMode === "emoji" ? "rounded-full text-[2.2rem]" : "rounded-full"
                  }
                />
              )}
              {uploading ? (
                <SpinnerOverlay
                  className="rounded-full bg-card/40"
                  spinnerContainerClassName="border-0 bg-transparent p-0"
                />
              ) : null}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                uploadFile(event.target.files?.[0] ?? null);
                event.target.value = "";
              }}
            />
          </div>
        </SettingDialogField>
        <SettingDialogField title={t("settings:SETTINGS_SYSTEM_DIRECTORY_ICON_GALLERY")}>
          <div className="grid grid-cols-6 gap-2">
            <IconTile
              selected={values.iconMode === "initials"}
              label={t("settings:SETTINGS_SYSTEM_DIRECTORY_ICON_INITIALS")}
              onClick={() => setValues((prev) => ({ ...prev, iconMode: "initials" }))}
            >
              <Avatar
                name={props.entity?.name}
                size={38}
                iconMode="initials"
                iconColor={values.iconColor}
              />
            </IconTile>
            {glyphs.slice(0, 8).map((glyph) => (
              <IconTile
                key={glyph}
                selected={values.iconMode === "glyph" && values.iconGlyph === glyph}
                label={glyph}
                onClick={() =>
                  setValues((prev) => ({
                    ...prev,
                    iconMode: "glyph",
                    iconGlyph: glyph,
                    iconEmoji: null,
                  }))
                }
              >
                <Avatar
                  name={props.entity?.name}
                  size={38}
                  iconMode="glyph"
                  iconColor={values.iconColor}
                  iconGlyph={glyph}
                />
              </IconTile>
            ))}
            {ICON_EMOJIS.map((emoji) => (
              <IconTile
                key={emoji}
                selected={values.iconMode === "emoji" && values.iconEmoji === emoji}
                label={emoji}
                onClick={() =>
                  setValues((prev) => ({
                    ...prev,
                    iconMode: "emoji",
                    iconEmoji: emoji,
                    iconGlyph: null,
                  }))
                }
              >
                <Avatar
                  name={props.entity?.name}
                  size={38}
                  iconMode="emoji"
                  iconColor={values.iconColor}
                  iconEmoji={emoji}
                />
              </IconTile>
            ))}
          </div>
        </SettingDialogField>
        <SettingDialogField title={t("settings:SETTINGS_SYSTEM_DIRECTORY_ICON_COLOR")}>
          <div className="flex flex-wrap items-center gap-3">
            <ColorPicker
              color={values.iconColor}
              onChange={(color) =>
                setValues((prev) => ({
                  ...prev,
                  iconMode: prev.iconMode === "image" ? resolveNonImageMode(prev) : prev.iconMode,
                  iconColor: color,
                }))
              }
              ariaLabel={t("settings:SETTINGS_SYSTEM_DIRECTORY_ICON_COLOR")}
              textInputLabel={t("settings:SETTINGS_SYSTEM_DIRECTORY_ICON_COLOR")}
              variant="swatch"
            />
            {ICON_COLOR_PRESETS.map((color) => (
              <ColorSwatch
                key={color}
                color={color}
                selected={values.iconColor.toLowerCase() === color}
                onClick={() =>
                  setValues((prev) => ({
                    ...prev,
                    iconMode: prev.iconMode === "image" ? resolveNonImageMode(prev) : prev.iconMode,
                    iconColor: color,
                  }))
                }
              />
            ))}
          </div>
        </SettingDialogField>
      </SettingDialogFields>
    </SettingDialog>
  );
}

export function ConfirmDirectoryActionDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  pending: boolean;
  variant?: "default" | "destructive";
  confirmName?: {
    expected: string;
    label: string;
    placeholder: string;
    mismatchMessage: string;
  };
  onConfirm: (values?: { confirmName: string }) => Promise<void>;
}) {
  const { t } = useTranslation(["common"]);
  const [confirmName, setConfirmName] = React.useState("");
  const [confirmNameTouched, setConfirmNameTouched] = React.useState(false);
  const needsConfirmName = Boolean(props.confirmName);
  const confirmNameMatches =
    !props.confirmName || confirmName.trim() === props.confirmName.expected;
  const confirmNameError =
    confirmNameTouched && !confirmNameMatches ? props.confirmName?.mismatchMessage : null;

  React.useEffect(() => {
    if (!props.open) return;
    setConfirmName("");
    setConfirmNameTouched(false);
  }, [props.open]);

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
        {props.confirmName ? (
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground" htmlFor="directory-confirm-name">
              {props.confirmName.label}
            </label>
            <Input
              id="directory-confirm-name"
              value={confirmName}
              disabled={props.pending}
              placeholder={props.confirmName.placeholder}
              aria-invalid={confirmNameError ? true : undefined}
              onBlur={() => setConfirmNameTouched(true)}
              onChange={(event) => setConfirmName(event.target.value)}
            />
            {confirmNameError ? (
              <p className="text-xs text-destructive">{confirmNameError}</p>
            ) : null}
          </div>
        ) : null}
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
              disabled={needsConfirmName && !confirmNameMatches}
              onClick={async () => {
                if (props.confirmName && !confirmNameMatches) {
                  setConfirmNameTouched(true);
                  return;
                }
                await props.onConfirm(
                  props.confirmName ? { confirmName: confirmName.trim() } : undefined,
                );
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
