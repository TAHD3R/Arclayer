import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { CheckCircle2 } from "lucide-react";

import { checkProjectSlugAvailability } from "@/api/projects";
import { useDebouncedValue } from "@/lib/auth/form-feedback";
import {
  applyManualProjectSlugInput,
  syncProjectSlugWithName,
  type ProjectSlugSource,
} from "@/lib/project-slug";
import { cn } from "@arclayer/lib/utils";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@arclayer/ui/alert-dialog";
import {
  AlertDialogAction as AlertDialogActionPrimitive,
  AlertDialogCancel as AlertDialogCancelPrimitive,
} from "@arclayer/ui/radix-primitives/radix-alert-dialog";
import { Button } from "@arclayer/ui/button";
import { Input } from "@arclayer/ui/input";
import { SettingDialogField, SettingDialogFields } from "@arclayer/ui/setting-dialog-field";
import { SettingDialog } from "@arclayer/ui/setting-dialog";

import type { ProjectIconDialogValues } from "../hooks/use-project-menu-actions";
import type { UserCenterProjectListItem, UserCenterProjectsTranslateFn } from "../types";
import { ProjectIconDialog } from "./project-icon-dialog";

export type CreateProjectFormValues = {
  workspaceId: string;
  name: string;
  slug: string;
  slugSource: ProjectSlugSource;
  description?: string;
};

type ProjectDangerDialogTarget = {
  projectId: string;
  name: string;
};

interface UserCenterProjectsDialogsProps {
  t: UserCenterProjectsTranslateFn;
  createDialog: {
    open: boolean;
    workspaceId?: string;
    setOpen: Dispatch<SetStateAction<boolean>>;
    values: CreateProjectFormValues;
    setValues: Dispatch<SetStateAction<CreateProjectFormValues>>;
    pending: boolean;
    onSubmit: (values: CreateProjectFormValues) => Promise<void>;
  };
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

export function UserCenterProjectsDialogs(props: UserCenterProjectsDialogsProps) {
  const { t, createDialog, archiveDialog, deleteDialog, iconDialog } = props;
  return (
    <>
      <ProjectCreateDialog t={t} createDialog={createDialog} />
      <ProjectIconDialog t={t} dialog={iconDialog} />
      <ProjectActionDialogs t={t} archiveDialog={archiveDialog} deleteDialog={deleteDialog} />
    </>
  );
}

export function ProjectCreateDialog(props: {
  t: UserCenterProjectsTranslateFn;
  createDialog: UserCenterProjectsDialogsProps["createDialog"];
}) {
  const { t, createDialog } = props;
  const [createNameTouched, setCreateNameTouched] = useState(false);
  const [createSlugTouched, setCreateSlugTouched] = useState(false);
  const [createSlugCheck, setCreateSlugCheck] = useState<{
    slug: string;
    available: boolean;
    reason: "invalid" | "reserved" | "exists" | null;
  } | null>(null);
  const [createSlugChecking, setCreateSlugChecking] = useState(false);
  const [createSlugCheckFailedSlug, setCreateSlugCheckFailedSlug] = useState<string | null>(null);
  const createNameMissing = !createDialog.values.name.trim();
  const createWorkspaceMissing = !createDialog.values.workspaceId.trim();
  const createSlug = createDialog.values.slug.trim();
  const createSlugMissing = !createSlug;
  const showCreateNameError = createNameTouched && createNameMissing;
  const debouncedCreateSlug = useDebouncedValue(createSlug, 250);
  const createSlugCheckMatchesCurrentValue = createSlugCheck?.slug === createSlug;
  const createSlugCheckFailed = createSlugCheckFailedSlug === createSlug;
  const createSlugAvailable =
    createSlugCheckMatchesCurrentValue && createSlugCheck?.available === true;
  const createSlugUnavailableReason =
    createSlugCheckMatchesCurrentValue && createSlugCheck?.available === false
      ? createSlugCheck.reason
      : null;
  const showCreateSlugRequired =
    (createNameTouched || createSlugTouched) && !createNameMissing && createSlugMissing;
  const createSlugNeedsFreshCheck =
    createDialog.open &&
    !createSlugMissing &&
    (debouncedCreateSlug !== createSlug || !createSlugCheckMatchesCurrentValue);
  const createSlugStatusChecking =
    createDialog.open && !createSlugMissing && (createSlugChecking || createSlugNeedsFreshCheck);
  const createConfirmDisabled =
    createWorkspaceMissing ||
    createNameMissing ||
    createSlugMissing ||
    createSlugStatusChecking ||
    !createSlugAvailable;

  useEffect(() => {
    if (createDialog.open) {
      setCreateNameTouched(false);
      setCreateSlugTouched(false);
      return;
    }

    setCreateSlugCheck(null);
    setCreateSlugChecking(false);
    setCreateSlugCheckFailedSlug(null);
  }, [createDialog.open]);

  useEffect(() => {
    if (!createDialog.open || !debouncedCreateSlug || !createDialog.values.workspaceId) {
      setCreateSlugCheck(null);
      setCreateSlugChecking(false);
      setCreateSlugCheckFailedSlug(null);
      return;
    }

    let active = true;
    setCreateSlugChecking(true);
    setCreateSlugCheckFailedSlug(null);

    void checkProjectSlugAvailability(createDialog.values.workspaceId, debouncedCreateSlug)
      .then((availability) => {
        if (!active) return;
        setCreateSlugCheck({
          slug: debouncedCreateSlug,
          available: availability.available,
          reason: availability.reason,
        });
      })
      .catch(() => {
        if (!active) return;
        setCreateSlugCheck({
          slug: debouncedCreateSlug,
          available: false,
          reason: null,
        });
        setCreateSlugCheckFailedSlug(debouncedCreateSlug);
      })
      .finally(() => {
        if (!active) return;
        setCreateSlugChecking(false);
      });

    return () => {
      active = false;
    };
  }, [createDialog.open, createDialog.values.workspaceId, debouncedCreateSlug]);

  return (
    <SettingDialog
      open={createDialog.open}
      onOpenChange={(open) => {
        if (!createDialog.pending) {
          createDialog.setOpen(open);
        }
      }}
      title={t("account:ACCOUNT_PROJECTS_CREATE_TITLE")}
      description={t("account:ACCOUNT_PROJECTS_CREATE_DESC")}
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
                workspaceId: createDialog.values.workspaceId.trim(),
                name: createDialog.values.name.trim(),
                slug: createSlug,
                slugSource: createDialog.values.slugSource,
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
          title={t("account:ACCOUNT_PROJECTS_FIELD_NAME")}
          description={t("account:ACCOUNT_PROJECTS_FIELD_NAME_DESC")}
          error={
            showCreateNameError ? (
              <span className="text-caption text-destructive">
                {t("account:ACCOUNT_PROJECTS_FIELD_NAME_REQUIRED")}
              </span>
            ) : createWorkspaceMissing ? (
              <span className="text-caption text-destructive">
                {t("account:ACCOUNT_PROJECTS_FIELD_WORKSPACE_REQUIRED")}
              </span>
            ) : undefined
          }
        >
          <Input
            value={createDialog.values.name}
            onChange={(event) => {
              setCreateNameTouched(true);
              createDialog.setValues((prev) => {
                const nextName = event.target.value;
                const nextSlugState = syncProjectSlugWithName(
                  {
                    value: prev.slug,
                    source: prev.slugSource,
                  },
                  nextName,
                );

                return {
                  ...prev,
                  name: nextName,
                  slug: nextSlugState.value,
                  slugSource: nextSlugState.source,
                };
              });
            }}
            onBlur={() => setCreateNameTouched(true)}
            placeholder={t("account:ACCOUNT_PROJECTS_FIELD_NAME_PLACEHOLDER")}
            aria-invalid={showCreateNameError || createWorkspaceMissing}
          />
        </SettingDialogField>

        <SettingDialogField
          title={t("account:ACCOUNT_PROJECTS_FIELD_SLUG")}
          description={t("account:ACCOUNT_PROJECTS_FIELD_SLUG_HELP")}
        >
          <div className="space-y-2">
            <Input
              value={createDialog.values.slug}
              onChange={(event) => {
                setCreateSlugTouched(true);
                createDialog.setValues((prev) => {
                  const nextSlugState = applyManualProjectSlugInput(event.target.value);
                  return {
                    ...prev,
                    slug: nextSlugState.value,
                    slugSource: nextSlugState.source,
                  };
                });
              }}
              onBlur={() => setCreateSlugTouched(true)}
              placeholder={t("account:ACCOUNT_PROJECTS_FIELD_SLUG_PLACEHOLDER")}
              aria-invalid={
                showCreateSlugRequired || createSlugCheckFailed || createSlugUnavailableReason
                  ? true
                  : undefined
              }
            />
            {showCreateSlugRequired ? (
              <div className="text-footnote text-destructive">
                {t("account:ACCOUNT_PROJECTS_FIELD_SLUG_REQUIRED")}
              </div>
            ) : createSlugStatusChecking ? (
              <div className="text-footnote text-label-secondary">
                {t("account:ACCOUNT_PROJECTS_FIELD_SLUG_CHECKING")}
              </div>
            ) : createSlugAvailable ? (
              <div className="flex items-center gap-2 text-footnote text-success">
                <CheckCircle2 className="size-4" />
                <span>{t("account:ACCOUNT_PROJECTS_FIELD_SLUG_AVAILABLE")}</span>
              </div>
            ) : createSlugCheckFailed ? (
              <div className="text-footnote text-destructive">
                {t("account:ACCOUNT_PROJECTS_FIELD_SLUG_CHECK_FAILED")}
              </div>
            ) : createSlugUnavailableReason ? (
              <div className="text-footnote text-destructive">
                {resolveProjectSlugReasonText(createSlugUnavailableReason, t)}
              </div>
            ) : null}
          </div>
        </SettingDialogField>

        <SettingDialogField
          title={t("account:ACCOUNT_PROJECTS_FIELD_DESCRIPTION")}
          description={t("account:ACCOUNT_PROJECTS_FIELD_DESCRIPTION_DESC")}
        >
          <textarea
            rows={3}
            value={createDialog.values.description ?? ""}
            onChange={(event) => {
              createDialog.setValues((prev) => ({
                ...prev,
                description: event.target.value,
              }));
            }}
            placeholder={t("account:ACCOUNT_PROJECTS_FIELD_DESCRIPTION_PLACEHOLDER")}
            className={cn(
              "w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-body transition-colors",
              "placeholder:text-label-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              "disabled:cursor-not-allowed disabled:opacity-50",
            )}
          />
        </SettingDialogField>
      </SettingDialogFields>
    </SettingDialog>
  );
}

function resolveProjectSlugReasonText(
  reason: "invalid" | "reserved" | "exists",
  t: (key: string) => string,
) {
  if (reason === "reserved") return t("account:ACCOUNT_PROJECTS_FIELD_SLUG_RESERVED");
  if (reason === "exists") return t("account:ACCOUNT_PROJECTS_FIELD_SLUG_EXISTS");
  return t("account:ACCOUNT_PROJECTS_FIELD_SLUG_INVALID");
}
