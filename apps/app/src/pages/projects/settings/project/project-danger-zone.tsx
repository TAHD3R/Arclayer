import { useMutation, useQuery } from "@tanstack/react-query";
import { Archive, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { archiveProject, deleteProject, getProjectDangerCapabilities } from "@/api/projects";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { Alert, AlertDescription } from "@arclayer/ui/alert";
import { Button } from "@arclayer/ui/button";
import { Input } from "@arclayer/ui/input";
import { SettingDialog } from "@arclayer/ui/setting-dialog";
import { SettingDialogField } from "@arclayer/ui/setting-dialog-field";

function getBlockedReasonText(
  code: string | null | undefined,
  t: ReturnType<typeof useTranslation>["t"],
) {
  if (!code) return null;
  const key = `errors:${code}`;
  const translated = t(key);
  return translated === key ? code : translated;
}

export function ProjectDangerZone(props: {
  projectId: string;
  projectName: string;
  canManageProject: boolean;
  onProjectRemoved: () => Promise<void>;
}) {
  const { t } = useTranslation(["account", "common", "errors"]);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const dangerQuery = useQuery({
    queryKey: ["project", "danger-capabilities", props.projectId],
    queryFn: async () => getProjectDangerCapabilities(props.projectId),
    retry: false,
    meta: { silent: true },
  });

  const archiveProjectMutation = useMutation({
    mutationFn: async () => archiveProject(props.projectId),
    onSuccess: async () => {
      notifySuccessText(t("account:SETTINGS_PROJECT_ARCHIVED"));
      setArchiveOpen(false);
      await props.onProjectRemoved();
    },
    onError: (error) => notifyError(error),
  });
  const deleteProjectMutation = useMutation({
    mutationFn: async () => deleteProject(props.projectId, deleteConfirmation.trim()),
    onSuccess: async () => {
      notifySuccessText(t("account:SETTINGS_PROJECT_DELETED"));
      setDeleteOpen(false);
      setDeleteConfirmation("");
      await props.onProjectRemoved();
    },
    onError: (error) => notifyError(error),
  });

  const capabilities = dangerQuery.data;
  const archiveEnabled =
    props.canManageProject && Boolean(capabilities?.archiveAction.enabled) && !dangerQuery.isError;
  const deleteEnabled =
    props.canManageProject && Boolean(capabilities?.deleteAction.enabled) && !dangerQuery.isError;
  const confirmDeleteName = capabilities?.confirmDeleteName ?? props.projectName;
  const deleteConfirmationMatches = deleteConfirmation.trim() === confirmDeleteName;
  const archiveBlockedReason = useMemo(
    () => getBlockedReasonText(capabilities?.archiveAction.blockedReason, t),
    [capabilities?.archiveAction.blockedReason, t],
  );
  const deleteBlockedReason = useMemo(
    () => getBlockedReasonText(capabilities?.deleteAction.blockedReason, t),
    [capabilities?.deleteAction.blockedReason, t],
  );

  return (
    <>
      <section
        className="mt-12 border-t border-border pt-8"
        aria-labelledby="project-danger-title"
        aria-busy={dangerQuery.isPending}
      >
        <h2 id="project-danger-title" className="text-title2 font-semibold text-label-primary">
          {t("account:SETTINGS_PROJECT_DANGER_TITLE")}
        </h2>
        <p className="mt-1 max-w-2xl text-body text-label-secondary">
          {t("account:SETTINGS_PROJECT_DANGER_DESC")}
        </p>

        {dangerQuery.isPending ? (
          <p
            id="project-danger-loading"
            className="mt-3 text-footnote text-label-secondary"
            role="status"
          >
            {t("account:SETTINGS_PROJECT_DANGER_LOADING")}
          </p>
        ) : null}

        {dangerQuery.isError ? (
          <Alert variant="destructive" className="mt-5">
            <AlertDescription>{t("account:SETTINGS_PROJECT_DANGER_LOAD_ERROR")}</AlertDescription>
          </Alert>
        ) : null}

        <div className="mt-5 divide-y divide-border rounded-lg border border-destructive/25 bg-card px-5">
          <div className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-2xl">
              <div className="flex items-center gap-2 text-headline font-medium text-label-primary">
                <Archive aria-hidden="true" size={17} />
                {t("account:SETTINGS_PROJECT_ARCHIVE_TITLE")}
              </div>
              <p className="mt-1 text-footnote text-label-secondary">
                {t("account:SETTINGS_PROJECT_ARCHIVE_DESC")}
              </p>
              {archiveBlockedReason ? (
                <p id="project-archive-blocked-reason" className="mt-1 text-footnote text-negative">
                  {archiveBlockedReason}
                </p>
              ) : null}
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={!archiveEnabled || archiveProjectMutation.isPending}
              aria-describedby={
                dangerQuery.isPending
                  ? "project-danger-loading"
                  : archiveBlockedReason
                    ? "project-archive-blocked-reason"
                    : undefined
              }
              onClick={() => setArchiveOpen(true)}
              data-testid="project-archive-trigger"
            >
              {t("account:SETTINGS_PROJECT_ARCHIVE_ACTION")}
            </Button>
          </div>
          <div className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-2xl">
              <div className="flex items-center gap-2 text-headline font-medium text-label-primary">
                <Trash2 aria-hidden="true" size={17} />
                {t("account:SETTINGS_PROJECT_DELETE_TITLE")}
              </div>
              <p className="mt-1 text-footnote text-label-secondary">
                {t("account:SETTINGS_PROJECT_DELETE_DESC")}
              </p>
              {deleteBlockedReason ? (
                <p id="project-delete-blocked-reason" className="mt-1 text-footnote text-negative">
                  {deleteBlockedReason}
                </p>
              ) : null}
            </div>
            <Button
              type="button"
              variant="destructive"
              disabled={!deleteEnabled || deleteProjectMutation.isPending}
              aria-describedby={
                dangerQuery.isPending
                  ? "project-danger-loading"
                  : deleteBlockedReason
                    ? "project-delete-blocked-reason"
                    : undefined
              }
              onClick={() => {
                setDeleteConfirmation("");
                setDeleteOpen(true);
              }}
              data-testid="project-delete-trigger"
            >
              {t("account:SETTINGS_PROJECT_DELETE_ACTION")}
            </Button>
          </div>
        </div>
      </section>

      <SettingDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        preventInitialFocus={false}
        title={t("account:ACCOUNT_PROJECTS_ARCHIVE_CONFIRM_TITLE")}
        description={t("account:ACCOUNT_PROJECTS_ARCHIVE_CONFIRM_DESC", {
          name: props.projectName,
        })}
        footer={
          <div className="flex w-full justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={archiveProjectMutation.isPending}
              onClick={() => setArchiveOpen(false)}
            >
              {t("common:CANCEL")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              loading={archiveProjectMutation.isPending}
              disabled={!archiveEnabled}
              onClick={() => void archiveProjectMutation.mutateAsync()}
              data-testid="project-archive-confirm"
            >
              {t("account:SETTINGS_PROJECT_ARCHIVE_ACTION")}
            </Button>
          </div>
        }
      >
        <div className="border-y border-border py-3 text-footnote text-label-secondary">
          {t("account:SETTINGS_PROJECT_ARCHIVE_RUNTIME_WARNING")}
        </div>
      </SettingDialog>

      <SettingDialog
        open={deleteOpen}
        onOpenChange={(open) => {
          if (!deleteProjectMutation.isPending) setDeleteOpen(open);
          if (!open) setDeleteConfirmation("");
        }}
        preventInitialFocus={false}
        title={t("account:ACCOUNT_PROJECTS_DELETE_CONFIRM_TITLE")}
        description={t("account:ACCOUNT_PROJECTS_DELETE_CONFIRM_DESC", {
          name: props.projectName,
        })}
        footer={
          <div className="flex w-full justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={deleteProjectMutation.isPending}
              onClick={() => setDeleteOpen(false)}
            >
              {t("common:CANCEL")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              loading={deleteProjectMutation.isPending}
              disabled={!deleteEnabled || !deleteConfirmationMatches}
              onClick={() => void deleteProjectMutation.mutateAsync()}
              data-testid="project-delete-confirm"
            >
              {t("account:SETTINGS_PROJECT_DELETE_ACTION")}
            </Button>
          </div>
        }
      >
        <SettingDialogField
          title={t("account:ACCOUNT_PROJECTS_DELETE_CONFIRM_INPUT_LABEL", {
            name: confirmDeleteName,
          })}
          description={t("account:ACCOUNT_PROJECTS_DELETE_CONFIRM_INPUT_HELP")}
        >
          <Input
            id="project-delete-confirm-name"
            name="confirmName"
            aria-label={t("account:ACCOUNT_PROJECTS_DELETE_CONFIRM_INPUT_PLACEHOLDER")}
            value={deleteConfirmation}
            onChange={(event) => setDeleteConfirmation(event.target.value)}
            autoComplete="off"
            disabled={deleteProjectMutation.isPending}
          />
        </SettingDialogField>
      </SettingDialog>
    </>
  );
}
