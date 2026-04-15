import { useMemo, useState } from "react";

import {
  WorkspaceAvatar,
  workspaceAvatarPropsFromIdentity,
} from "@/components/common/entity-avatar";
import { SettingAccordionItem } from "@arclayer/ui/setting-accordion-item";
import { WorkspaceIconDialog } from "@/pages/usercenter/workspaces/components/workspace-icon-dialog";
import type { WorkspaceIconDialogValues } from "@/pages/usercenter/workspaces/hooks/use-workspace-menu-actions";
import type { UserCenterWorkspaceListItem } from "@/pages/usercenter/workspaces/types";

import type { WorkspaceSettingsBasicsController } from "../hooks/use-workspace-settings-basics-controller";

function buildIconDialogValues(workspace: UserCenterWorkspaceListItem): WorkspaceIconDialogValues {
  return {
    iconMode: workspace.iconMode,
    iconColor: workspace.iconColor,
    iconGlyph: workspace.iconGlyph ?? null,
    iconEmoji: workspace.iconEmoji ?? null,
    iconUrl: workspace.iconUrl ?? null,
  };
}

function buildWorkspaceIconPatch(values: WorkspaceIconDialogValues) {
  return {
    iconMode: values.iconMode,
    iconColor: values.iconColor,
    iconGlyph: values.iconMode === "glyph" ? values.iconGlyph : null,
    iconEmoji: values.iconMode === "emoji" ? values.iconEmoji : null,
    iconUrl: values.iconMode === "image" ? values.iconUrl : null,
  } as const;
}

function buildWorkspaceListItem(
  controller: WorkspaceSettingsBasicsController,
): UserCenterWorkspaceListItem | null {
  const detail = controller.detailQuery.data;
  if (!detail) return null;

  return {
    id: detail.id,
    workspaceId: detail.id,
    organizationId: detail.organizationId,
    slug: detail.slug,
    name: detail.name,
    kind: "team",
    description: detail.description ?? null,
    iconMode: detail.iconMode,
    iconColor: detail.iconColor,
    iconGlyph: detail.iconGlyph ?? null,
    iconEmoji: detail.iconEmoji ?? null,
    iconUrl: detail.iconUrl ?? null,
    isArchived: false,
    archivedAt: null,
    archivedByUserId: null,
    memberCount: 0,
    membersPreview: [],
    createdAt: null,
    enterable: true,
  };
}

export function WorkspaceSettingsIconAccordionItem(props: {
  controller: WorkspaceSettingsBasicsController;
}) {
  const c = props.controller;
  const { t } = c;
  const [dialogWorkspace, setDialogWorkspace] = useState<UserCenterWorkspaceListItem | null>(null);
  const [dialogValues, setDialogValues] = useState<WorkspaceIconDialogValues>({
    iconMode: "initials",
    iconColor: "#337ea9",
    iconGlyph: null,
    iconEmoji: null,
    iconUrl: null,
  });

  const workspace = useMemo(() => buildWorkspaceListItem(c), [c]);

  const openDialog = () => {
    if (!workspace) return;
    setDialogWorkspace(workspace);
    setDialogValues(buildIconDialogValues(workspace));
  };

  const closeDialog = () => {
    setDialogWorkspace(null);
  };

  return (
    <>
      <SettingAccordionItem
        value="workspace_icon"
        variant="action"
        title={t("settings:SETTINGS_WORKSPACE_ICON_LABEL")}
        showSummary
        summary={
          workspace ? (
            <span className="inline-flex items-center">
              <WorkspaceAvatar
                name={workspace.name}
                size={40}
                {...workspaceAvatarPropsFromIdentity(workspace)}
              />
            </span>
          ) : null
        }
        placeholder={t("settings:SETTINGS_NOT_SET")}
        keepRendered
        disabled={c.disabled || !workspace}
      >
        <div className="flex flex-col gap-3">
          {workspace ? (
            <button
              type="button"
              aria-label={t("common:ORG_WORKSPACES_ACTION_CHANGE_ICON")}
              aria-haspopup="dialog"
              disabled={c.disabled || !workspace}
              onClick={openDialog}
              className="inline-flex w-fit cursor-pointer rounded-xl p-1.5 transition-colors hover:bg-accent/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:pointer-events-none disabled:opacity-60"
            >
              <WorkspaceAvatar
                name={workspace.name}
                size={80}
                {...workspaceAvatarPropsFromIdentity(workspace)}
              />
            </button>
          ) : null}
          <div className="text-callout text-label-secondary">
            {t("settings:SETTINGS_WORKSPACE_ICON_ITEM_DESC")}
          </div>
        </div>
      </SettingAccordionItem>

      <WorkspaceIconDialog
        t={t}
        dialog={{
          workspace: dialogWorkspace,
          setWorkspace: setDialogWorkspace,
          values: dialogValues,
          setValues: setDialogValues,
          pending: c.patchWorkspaceMutation.isPending,
          onConfirm: async () => {
            if (!dialogWorkspace) return;

            await c.withSavingKey("workspace:icon", async () => {
              await c.patchWorkspaceMutation.mutateAsync(buildWorkspaceIconPatch(dialogValues));
            });
            closeDialog();
          },
          onClose: closeDialog,
        }}
      />
    </>
  );
}
