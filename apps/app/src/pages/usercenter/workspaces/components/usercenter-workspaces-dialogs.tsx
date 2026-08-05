import { useState, type Dispatch, type SetStateAction } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@arclayer/ui/alert-dialog";
import { AlertDialogCancel as AlertDialogCancelPrimitive } from "@arclayer/ui/radix-primitives/radix-alert-dialog";
import { Button } from "@arclayer/ui/button";
import { Input } from "@arclayer/ui/input";
import { SettingDialogField, SettingDialogFields } from "@arclayer/ui/setting-dialog-field";
import { SettingDialog } from "@arclayer/ui/setting-dialog";
import { Textarea } from "@arclayer/ui/textarea";

import type { UserCenterWorkspacesTranslateFn } from "../types";
import type { UserCenterWorkspaceListItem } from "../types";
import type { WorkspaceIconDialogValues } from "../hooks/use-workspace-menu-actions";
import { WorkspaceIconDialog } from "./workspace-icon-dialog";

export type CreateWorkspaceFormValues = {
  name: string;
  description?: string;
};

type WorkspaceDangerDialogTarget = {
  workspaceId: string;
  name: string;
  archiveRevision: number;
  operationId: string;
};

interface UserCenterWorkspacesDialogsProps {
  t: UserCenterWorkspacesTranslateFn;
  createDialog: {
    open: boolean;
    setOpen: Dispatch<SetStateAction<boolean>>;
    values: CreateWorkspaceFormValues;
    setValues: Dispatch<SetStateAction<CreateWorkspaceFormValues>>;
    pending: boolean;
    onSubmit: (values: CreateWorkspaceFormValues) => Promise<void>;
  };
  archiveDialog: {
    workspace: WorkspaceDangerDialogTarget | null;
    setWorkspace: Dispatch<SetStateAction<WorkspaceDangerDialogTarget | null>>;
    pending: boolean;
    onConfirm: (workspace: WorkspaceDangerDialogTarget) => Promise<void>;
  };
  deleteDialog: {
    workspace: WorkspaceDangerDialogTarget | null;
    setWorkspace: Dispatch<SetStateAction<WorkspaceDangerDialogTarget | null>>;
    confirmName: string;
    setConfirmName: Dispatch<SetStateAction<string>>;
    confirmMatches: boolean;
    pending: boolean;
    onConfirm: (payload: { workspaceId: string; confirmName: string }) => Promise<void>;
  };
  iconDialog: {
    workspace: UserCenterWorkspaceListItem | null;
    setWorkspace: Dispatch<SetStateAction<UserCenterWorkspaceListItem | null>>;
    values: WorkspaceIconDialogValues;
    setValues: Dispatch<SetStateAction<WorkspaceIconDialogValues>>;
    pending: boolean;
    onConfirm: () => Promise<void>;
    onClose: () => void;
  };
}

export type WorkspaceActionDialogsProps = Pick<
  UserCenterWorkspacesDialogsProps,
  "t" | "archiveDialog" | "deleteDialog"
> & {
  iconDialog?: UserCenterWorkspacesDialogsProps["iconDialog"];
};

export function WorkspaceActionDialogs(props: WorkspaceActionDialogsProps) {
  const { t, archiveDialog, deleteDialog, iconDialog } = props;

  return (
    <>
      <AlertDialog
        open={Boolean(archiveDialog.workspace)}
        onOpenChange={(open) => {
          if (!open) archiveDialog.setWorkspace(null);
        }}
      >
        <AlertDialogContent className="sm:max-w-130">
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
            <Button
              variant="destructive"
              loading={archiveDialog.pending}
              onClick={async () => {
                if (!archiveDialog.workspace) return;
                await archiveDialog.onConfirm(archiveDialog.workspace);
                archiveDialog.setWorkspace(null);
              }}
            >
              {t("common:ORG_WORKSPACES_ACTION_ARCHIVE")}
            </Button>
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
        <SettingDialogField
          title={t("common:ORG_WORKSPACES_DELETE_CONFIRM_INPUT_LABEL", {
            name: deleteDialog.workspace?.name || "",
          })}
          description={t("common:ORG_WORKSPACES_DELETE_CONFIRM_INPUT_HELP")}
        >
          <Input
            id="workspace-delete-confirm-name"
            value={deleteDialog.confirmName}
            onChange={(event) => deleteDialog.setConfirmName(event.target.value)}
            placeholder={t("common:ORG_WORKSPACES_DELETE_CONFIRM_INPUT_PLACEHOLDER")}
            disabled={deleteDialog.pending}
          />
        </SettingDialogField>
      </SettingDialog>

      {iconDialog ? <WorkspaceIconDialog t={t} dialog={iconDialog} /> : null}
    </>
  );
}

export function UserCenterWorkspacesDialogs(props: UserCenterWorkspacesDialogsProps) {
  const { t, createDialog, archiveDialog, deleteDialog, iconDialog } = props;
  return (
    <>
      <WorkspaceCreateDialog t={t} createDialog={createDialog} />
      <WorkspaceIconDialog t={t} dialog={iconDialog} />
      <WorkspaceActionDialogs t={t} archiveDialog={archiveDialog} deleteDialog={deleteDialog} />
    </>
  );
}

export function WorkspaceCreateDialog(props: {
  t: UserCenterWorkspacesTranslateFn;
  createDialog: UserCenterWorkspacesDialogsProps["createDialog"];
}) {
  const { t, createDialog } = props;
  const [createNameTouched, setCreateNameTouched] = useState(false);
  const createNameMissing = !createDialog.values.name.trim();
  const showCreateNameError = createNameTouched && createNameMissing;
  const createConfirmDisabled = createNameMissing;
  return (
    <SettingDialog
      open={createDialog.open}
      onOpenChange={(open) => {
        if (!createDialog.pending) {
          createDialog.setOpen(open);
        }
      }}
      title={t("common:ORG_WORKSPACES_CREATE_TEAM")}
      description={t("common:ORG_WORKSPACES_CREATE_TEAM_DIALOG_DESC")}
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
            disabled={createConfirmDisabled}
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
      <SettingDialogFields>
        <SettingDialogField
          title={t("common:ORG_WORKSPACES_FIELD_NAME")}
          description={t("common:ORG_WORKSPACES_FIELD_NAME_HELP")}
          error={
            showCreateNameError ? (
              <span className="text-caption text-destructive">
                {t("common:ORG_WORKSPACES_FIELD_NAME_REQUIRED")}
              </span>
            ) : undefined
          }
        >
          <Input
            value={createDialog.values.name}
            onChange={(event) => {
              setCreateNameTouched(true);
              createDialog.setValues((prev) => {
                return {
                  ...prev,
                  name: event.target.value,
                };
              });
            }}
            onBlur={() => setCreateNameTouched(true)}
            placeholder={t("common:ORG_WORKSPACES_FIELD_NAME_PLACEHOLDER")}
            aria-invalid={showCreateNameError}
          />
        </SettingDialogField>

        <SettingDialogField
          title={t("common:ORG_WORKSPACES_FIELD_DESCRIPTION")}
          description={t("common:ORG_WORKSPACES_FIELD_DESCRIPTION_HELP")}
        >
          <Textarea
            rows={3}
            value={createDialog.values.description ?? ""}
            onChange={(event) => {
              createDialog.setValues((prev) => ({
                ...prev,
                description: event.target.value,
              }));
            }}
            placeholder={t("common:ORG_WORKSPACES_FIELD_DESCRIPTION_PLACEHOLDER")}
            className="resize-none"
          />
        </SettingDialogField>
      </SettingDialogFields>
    </SettingDialog>
  );
}
