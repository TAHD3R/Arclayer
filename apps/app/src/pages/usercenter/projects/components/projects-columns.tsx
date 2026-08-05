import { useMemo } from "react";
import { type ColumnDef } from "@tanstack/react-table";

import { ProjectAvatar, projectAvatarPropsFromIdentity } from "@/components/common/project-avatar";
import { useAdminDateTimeFormatter } from "@/hooks/use-admin-date-time-formatter";

import type {
  ProjectMenuItem,
  UserCenterProjectListItem,
  UserCenterProjectsTranslateFn,
} from "../types";
import type { ProjectEditingField } from "../hooks/use-project-menu-actions";
import { ProjectActionsDropdown } from "./project-actions-dropdown";
import { ProjectInlineNameEditor } from "./project-inline-name-editor";
import { ProjectMembersPopover } from "./project-members-popover";

const PROJECT_NAME_MAX_LENGTH = 128;
const PROJECT_DESCRIPTION_MAX_LENGTH = 256;

function normalizeProjectDescriptionPreview(value?: string | null) {
  return (value ?? "").replace(/\s*[\r\n]+\s*/g, " ").trim();
}

interface UserCenterProjectsColumnsOptions {
  t: UserCenterProjectsTranslateFn;
  buildMenuItems: (project: UserCenterProjectListItem) => ProjectMenuItem[];
  onPrepareProjectMenu: (projectId: string) => void;
  editingProjectId: string | null;
  editingProjectField: ProjectEditingField | null;
  editingProjectName: string;
  editingProjectDescription: string;
  onEditingProjectNameChange: (value: string) => void;
  onEditingProjectDescriptionChange: (value: string) => void;
  onCommitProjectEdit: (project: UserCenterProjectListItem, field: ProjectEditingField) => void;
  onCancelProjectEdit: () => void;
}

export function useUserCenterProjectsColumns(
  options: UserCenterProjectsColumnsOptions,
): Array<ColumnDef<UserCenterProjectListItem, unknown>> {
  const { t, buildMenuItems } = options;
  const dateTime = useAdminDateTimeFormatter({ workspaceId: null });

  return useMemo<Array<ColumnDef<UserCenterProjectListItem, unknown>>>(
    () => [
      {
        id: "project",
        meta: {
          title: t("account:ACCOUNT_PAGE_PROJECTS_TITLE"),
          sortKey: "name",
          kind: "primary",
        },
        header: t("account:ACCOUNT_PAGE_PROJECTS_TITLE"),
        cell: ({ row }) => {
          const item = row.original;
          const descriptionPreview = normalizeProjectDescriptionPreview(item.description);

          return (
            <div className="flex min-w-0 items-center gap-3">
              <ProjectAvatar name={item.name} size={42} {...projectAvatarPropsFromIdentity(item)} />
              <div className="min-w-0 flex-1">
                <ProjectInlineNameEditor
                  editing={
                    options.editingProjectId === item.projectId &&
                    options.editingProjectField === "name"
                  }
                  value={item.name}
                  draftValue={options.editingProjectName}
                  ariaLabel={t("account:ACCOUNT_PROJECTS_RENAME_INPUT_LABEL")}
                  maxLength={PROJECT_NAME_MAX_LENGTH}
                  className="block truncate text-headline font-semibold"
                  inputClassName="w-full text-headline font-semibold"
                  onDraftChange={options.onEditingProjectNameChange}
                  onCommit={() => void options.onCommitProjectEdit(item, "name")}
                  onCancel={options.onCancelProjectEdit}
                />
                <ProjectInlineNameEditor
                  editing={
                    options.editingProjectId === item.projectId &&
                    options.editingProjectField === "description"
                  }
                  value={descriptionPreview}
                  draftValue={options.editingProjectDescription}
                  ariaLabel={t("account:ACCOUNT_PROJECTS_DESCRIPTION_INPUT_LABEL")}
                  maxLength={PROJECT_DESCRIPTION_MAX_LENGTH}
                  emptyFallback={t("account:ACCOUNT_PROJECTS_DESCRIPTION_FALLBACK")}
                  className="block truncate text-label-secondary"
                  containerClassName="mt-1"
                  inputClassName="w-full text-footnote text-label-primary"
                  onDraftChange={options.onEditingProjectDescriptionChange}
                  onCommit={() => void options.onCommitProjectEdit(item, "description")}
                  onCancel={options.onCancelProjectEdit}
                />
              </div>
              <ProjectActionsDropdown
                menuItems={buildMenuItems(item)}
                ariaLabel={t("common:MORE")}
                onPrepareMenu={() => options.onPrepareProjectMenu(item.projectId)}
              />
            </div>
          );
        },
        size: 340,
        minSize: 300,
      },
      {
        id: "members",
        meta: {
          title: t("account:ACCOUNT_PROJECTS_TABLE_MEMBERS"),
          sortKey: "member_count",
          kind: "meta",
        },
        header: t("account:ACCOUNT_PROJECTS_TABLE_MEMBERS"),
        cell: ({ row }) => <ProjectMembersPopover project={row.original} t={t} />,
        size: 200,
        minSize: 180,
      },
      {
        id: "createdAt",
        meta: {
          title: t("common:ORG_WORKSPACES_TABLE_CREATED_AT"),
          sortKey: "created_at",
          kind: "time",
        },
        header: t("common:ORG_WORKSPACES_TABLE_CREATED_AT"),
        cell: ({ row }) =>
          row.original.createdAt ? (
            <span>{dateTime.formatDateTime(row.original.createdAt)}</span>
          ) : (
            <span>-</span>
          ),
        size: 190,
        minSize: 170,
      },
    ],
    [
      buildMenuItems,
      dateTime.formatDateTime,
      options.onPrepareProjectMenu,
      options.editingProjectDescription,
      options.editingProjectField,
      options.editingProjectId,
      options.editingProjectName,
      options.onCancelProjectEdit,
      options.onCommitProjectEdit,
      options.onEditingProjectDescriptionChange,
      options.onEditingProjectNameChange,
      t,
    ],
  );
}
