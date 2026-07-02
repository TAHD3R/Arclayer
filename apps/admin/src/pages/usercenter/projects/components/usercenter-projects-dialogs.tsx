import type { Dispatch, SetStateAction } from "react";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@arclayer/ui/alert-dialog";
import { Button } from "@arclayer/ui/button";
import {
  AlertDialogAction as AlertDialogActionPrimitive,
  AlertDialogCancel as AlertDialogCancelPrimitive,
} from "@arclayer/ui/radix-primitives/radix-alert-dialog";
import { SettingDialog } from "@arclayer/ui/setting-dialog";
import { SettingDialogField } from "@arclayer/ui/setting-dialog-field";
import { Input } from "@arclayer/ui/input";

import type { ProjectIconDialogValues } from "../hooks/use-project-menu-actions";
import type { UserCenterProjectListItem, UserCenterProjectsTranslateFn } from "../types";
import { ProjectIconDialog } from "./project-icon-dialog";

type ProjectDangerDialogTarget = {
  projectId: string;
  name: string;
};

interface UserCenterProjectsDialogsProps {
  t: UserCenterProjectsTranslateFn;
  archiveDialog: {
    project: ProjectDangerDialogTarget | null;
    setProject: Dispatch<SetStateAction<ProjectDangerDialogTarget | null>>;
    pending: boolean;
    onConfirm: (projectId: string) => Promise<unknown>;
  };
  deleteDialog: {
    project: ProjectDangerDialogTarget | null;
    setProject: Dispatch<SetStateAction<ProjectDangerDialogTarget | null>>;
    confirmName: string;
    setConfirmName: Dispatch<SetStateAction<string>>;
    confirmMatches: boolean;
    pending: boolean;
    onConfirm: (payload: { projectId: string; confirmName: string }) => Promise<unknown>;
  };
  iconDialog: {
    project: UserCenterProjectListItem | null;
    setProject: Dispatch<SetStateAction<UserCenterProjectListItem | null>>;
    values: ProjectIconDialogValues;
    setValues: Dispatch<SetStateAction<ProjectIconDialogValues>>;
    pending: boolean;
    onConfirm: () => Promise<unknown>;
    onClose: () => void;
  };
}

export type ProjectActionDialogsProps = Pick<
  UserCenterProjectsDialogsProps,
  "t" | "archiveDialog" | "deleteDialog"
> & {
  iconDialog?: UserCenterProjectsDialogsProps["iconDialog"];
};

export function ProjectActionDialogs(props: ProjectActionDialogsProps) {
  const { t, archiveDialog, deleteDialog, iconDialog } = props;

  return (
    <>
      <AlertDialog
        open={Boolean(archiveDialog.project)}
        onOpenChange={(open) => {
          if (!open) archiveDialog.setProject(null);
        }}
      >
        <AlertDialogContent className="sm:max-w-130">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("account:ACCOUNT_PROJECTS_ARCHIVE_CONFIRM_TITLE")}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-body">
              {t("account:ACCOUNT_PROJECTS_ARCHIVE_CONFIRM_DESC", {
                name: archiveDialog.project?.name || "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancelPrimitive asChild>
              <Button
                variant="outline"
                onClick={() => archiveDialog.setProject(null)}
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
                  if (!archiveDialog.project) return;
                  void archiveDialog
                    .onConfirm(archiveDialog.project.projectId)
                    .then(() => archiveDialog.setProject(null));
                }}
              >
                {t("account:ACCOUNT_PROJECTS_ACTION_ARCHIVE")}
              </Button>
            </AlertDialogActionPrimitive>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SettingDialog
        open={Boolean(deleteDialog.project)}
        onOpenChange={(open) => {
          if (!open && !deleteDialog.pending) {
            deleteDialog.setProject(null);
            deleteDialog.setConfirmName("");
          }
        }}
        title={t("account:ACCOUNT_PROJECTS_DELETE_CONFIRM_TITLE")}
        description={t("account:ACCOUNT_PROJECTS_DELETE_CONFIRM_DESC", {
          name: deleteDialog.project?.name || "",
        })}
        footer={
          <div className="flex w-full items-center justify-end gap-2">
            <Button
              variant="outline"
              disabled={deleteDialog.pending}
              onClick={() => {
                deleteDialog.setProject(null);
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
                if (!deleteDialog.project) return;
                await deleteDialog.onConfirm({
                  projectId: deleteDialog.project.projectId,
                  confirmName: deleteDialog.confirmName.trim(),
                });
              }}
            >
              {t("account:ACCOUNT_PROJECTS_ACTION_DELETE")}
            </Button>
          </div>
        }
      >
        <SettingDialogField
          title={t("account:ACCOUNT_PROJECTS_DELETE_CONFIRM_INPUT_LABEL", {
            name: deleteDialog.project?.name || "",
          })}
          description={t("account:ACCOUNT_PROJECTS_DELETE_CONFIRM_INPUT_HELP")}
        >
          <Input
            id="project-delete-confirm-name"
            value={deleteDialog.confirmName}
            onChange={(event) => deleteDialog.setConfirmName(event.target.value)}
            placeholder={t("account:ACCOUNT_PROJECTS_DELETE_CONFIRM_INPUT_PLACEHOLDER")}
            disabled={deleteDialog.pending}
          />
        </SettingDialogField>
      </SettingDialog>

      {iconDialog ? <ProjectIconDialog t={t} dialog={iconDialog} /> : null}
    </>
  );
}
