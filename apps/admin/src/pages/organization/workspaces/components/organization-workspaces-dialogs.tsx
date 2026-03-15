import type { Dispatch, SetStateAction } from "react";

import type { OrganizationWorkspace } from "@/types/api";
import { cn } from "@celestial/lib/utils";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@celestial/ui/alert-dialog";
import {
  AlertDialogAction as AlertDialogActionPrimitive,
  AlertDialogCancel as AlertDialogCancelPrimitive,
} from "@celestial/ui/radix-primitives/radix-alert-dialog";
import { Button } from "@celestial/ui/button";
import { Input } from "@celestial/ui/input";
import { SettingDialog } from "@celestial/ui/setting-dialog";

import type { OrganizationWorkspacesTranslateFn } from "../types";

export type CreateWorkspaceFormValues = {
  name: string;
  description?: string;
};

interface OrganizationWorkspacesDialogsProps {
  t: OrganizationWorkspacesTranslateFn;
  createDialog: {
    open: boolean;
    setOpen: Dispatch<SetStateAction<boolean>>;
    values: CreateWorkspaceFormValues;
    setValues: Dispatch<SetStateAction<CreateWorkspaceFormValues>>;
    pending: boolean;
    onSubmit: (values: CreateWorkspaceFormValues) => Promise<void>;
  };
  archiveDialog: {
    workspace: OrganizationWorkspace | null;
    setWorkspace: Dispatch<SetStateAction<OrganizationWorkspace | null>>;
    pending: boolean;
    onConfirm: (workspaceId: string) => Promise<void>;
  };
  deleteDialog: {
    workspace: OrganizationWorkspace | null;
    setWorkspace: Dispatch<SetStateAction<OrganizationWorkspace | null>>;
    confirmName: string;
    setConfirmName: Dispatch<SetStateAction<string>>;
    confirmMatches: boolean;
    pending: boolean;
    onConfirm: (payload: { workspaceId: string; confirmName: string }) => Promise<void>;
  };
}

export function OrganizationWorkspacesDialogs(props: OrganizationWorkspacesDialogsProps) {
  const { t, createDialog, archiveDialog, deleteDialog } = props;

  return (
    <>
      <SettingDialog
        open={createDialog.open}
        onOpenChange={(open) => {
          if (!createDialog.pending) {
            createDialog.setOpen(open);
          }
        }}
        title={t("common:ORG_WORKSPACES_CREATE")}
        description={t("common:ORG_WORKSPACES_CREATE_DIALOG_DESC")}
        contentClassName="sm:max-w-[620px]"
        footer={
          <div className="flex w-full items-center justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => createDialog.setOpen(false)}
              disabled={createDialog.pending}
            >
              {t("common:CANCEL")}
            </Button>
            <Button
              variant="default"
              loading={createDialog.pending}
              disabled={!createDialog.values.name.trim()}
              onClick={async () => {
                await createDialog.onSubmit({
                  name: createDialog.values.name.trim(),
                  description: createDialog.values.description?.trim() || undefined,
                });
              }}
            >
              {t("common:CONFIRM")}
            </Button>
          </div>
        }
      >
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <span className="font-semibold text-foreground">
              {t("common:ORG_WORKSPACES_FIELD_NAME")}
            </span>
            <span className="text-label-secondary">
              {t("common:ORG_WORKSPACES_FIELD_NAME_HELP")}
            </span>
            <Input
              value={createDialog.values.name}
              onChange={(event) =>
                createDialog.setValues((prev) => ({ ...prev, name: event.target.value }))
              }
              placeholder={t("common:ORG_WORKSPACES_FIELD_NAME_PLACEHOLDER")}
              aria-invalid={!createDialog.values.name.trim()}
            />
            {!createDialog.values.name.trim() ? (
              <span className="text-caption text-destructive">
                {t("common:ORG_WORKSPACES_FIELD_NAME_REQUIRED")}
              </span>
            ) : null}
          </div>

          <div className="grid gap-1.5">
            <span className="font-semibold text-foreground">
              {t("common:ORG_WORKSPACES_FIELD_DESCRIPTION")}
            </span>
            <span className="text-label-secondary">
              {t("common:ORG_WORKSPACES_FIELD_DESCRIPTION_HELP")}
            </span>
            <textarea
              rows={3}
              value={createDialog.values.description ?? ""}
              onChange={(event) =>
                createDialog.setValues((prev) => ({
                  ...prev,
                  description: event.target.value,
                }))
              }
              placeholder={t("common:ORG_WORKSPACES_FIELD_DESCRIPTION_PLACEHOLDER")}
              className={cn(
                "w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-body shadow-sm transition-colors",
                "placeholder:text-label-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                "disabled:cursor-not-allowed disabled:opacity-50",
              )}
            />
          </div>
        </div>
      </SettingDialog>

      <AlertDialog
        open={Boolean(archiveDialog.workspace)}
        onOpenChange={(open) => {
          if (!open) archiveDialog.setWorkspace(null);
        }}
      >
        <AlertDialogContent className="sm:max-w-[520px]">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("common:ORG_WORKSPACES_ARCHIVE_CONFIRM_TITLE")}</AlertDialogTitle>
            <AlertDialogDescription className="text-body">
              {t("common:ORG_WORKSPACES_ARCHIVE_CONFIRM_DESC", {
                name: archiveDialog.workspace?.name || "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancelPrimitive asChild>
              <Button
                variant="outline"
                onClick={() => archiveDialog.setWorkspace(null)}
                disabled={archiveDialog.pending}
              >
                {t("common:CANCEL")}
              </Button>
            </AlertDialogCancelPrimitive>
            <AlertDialogActionPrimitive asChild>
              <Button
                variant="destructive"
                loading={archiveDialog.pending}
                onClick={() => {
                  if (!archiveDialog.workspace) return;
                  void archiveDialog
                    .onConfirm(archiveDialog.workspace.workspaceId)
                    .then(() => archiveDialog.setWorkspace(null));
                }}
              >
                {t("common:ORG_WORKSPACES_ACTION_ARCHIVE")}
              </Button>
            </AlertDialogActionPrimitive>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SettingDialog
        open={Boolean(deleteDialog.workspace)}
        onOpenChange={(open) => {
          if (!open && !deleteDialog.pending) {
            deleteDialog.setWorkspace(null);
            deleteDialog.setConfirmName("");
          }
        }}
        title={t("common:ORG_WORKSPACES_DELETE_CONFIRM_TITLE")}
        description={t("common:ORG_WORKSPACES_DELETE_CONFIRM_DESC", {
          name: deleteDialog.workspace?.name || "",
        })}
        contentClassName="sm:max-w-[560px]"
        footer={
          <div className="flex w-full items-center justify-end gap-2">
            <Button
              variant="outline"
              disabled={deleteDialog.pending}
              onClick={() => {
                deleteDialog.setWorkspace(null);
                deleteDialog.setConfirmName("");
              }}
            >
              {t("common:CANCEL")}
            </Button>
            <Button
              variant="destructive"
              loading={deleteDialog.pending}
              disabled={!deleteDialog.confirmMatches}
              onClick={async () => {
                if (!deleteDialog.workspace) return;
                await deleteDialog.onConfirm({
                  workspaceId: deleteDialog.workspace.workspaceId,
                  confirmName: deleteDialog.confirmName.trim(),
                });
              }}
            >
              {t("common:ORG_WORKSPACES_ACTION_DELETE")}
            </Button>
          </div>
        }
      >
        <div className="grid gap-1.5">
          <label className="font-semibold text-foreground" htmlFor="workspace-delete-confirm-name">
            {t("common:ORG_WORKSPACES_DELETE_CONFIRM_INPUT_LABEL", {
              name: deleteDialog.workspace?.name || "",
            })}
          </label>
          <div className="text-label-secondary">
            {t("common:ORG_WORKSPACES_DELETE_CONFIRM_INPUT_HELP")}
          </div>
          <Input
            id="workspace-delete-confirm-name"
            value={deleteDialog.confirmName}
            onChange={(event) => deleteDialog.setConfirmName(event.target.value)}
            placeholder={t("common:ORG_WORKSPACES_DELETE_CONFIRM_INPUT_PLACEHOLDER")}
            disabled={deleteDialog.pending}
          />
        </div>
      </SettingDialog>
    </>
  );
}
