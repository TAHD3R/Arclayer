import { Button as AntButton, Select } from "antd";
import { useTranslation } from "react-i18next";

import type { OrganizationMember, OrganizationMemberWorkspace } from "@/types/api";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { SettingDialog } from "@/components/settings-primitives/setting-dialog";
import { getPopupContainerWithinOverlay } from "@/lib/antd/popup-container";
import {
  InviteOrganizationMemberDialog,
  type InviteOrganizationMemberFormValues,
  type InviteOrganizationRoleOption,
} from "../../shared/components/invite-organization-member-dialog";
import { OrganizationMemberInspectSheet } from "../../shared/components/organization-member-inspect-sheet";
import { type ResolvedMemberWorkspace } from "../../shared/components/organization-member-workspace-list";
import { type DisplayOrganizationPermission } from "../utils";

interface OrganizationMembersDialogsProps {
  inviteOpen: boolean;
  onInviteOpenChange: (open: boolean) => void;
  inviteLoading: boolean;
  roleOptions: InviteOrganizationRoleOption[];
  defaultRoleCode: string;
  onInviteSubmit: (values: InviteOrganizationMemberFormValues) => Promise<void>;
  inspectingMember: OrganizationMember | null;
  onInspectingMemberChange: (member: OrganizationMember | null) => void;
  currentUserId: string | null;
  roleDetailsByCode: Map<string, { name: string; description: string | null }>;
  rolesLoading: boolean;
  rolesError: unknown;
  workspaceDataLoading: boolean;
  workspaceDataError: unknown;
  resolveWorkspaces: (workspaces: OrganizationMemberWorkspace[]) => ResolvedMemberWorkspace[];
  workspaceLabelById: Record<string, string>;
  permissions: DisplayOrganizationPermission[];
  permissionsLoading: boolean;
  permissionsError: unknown;
  onEnterWorkspace: (workspaceId: string) => void;
  onAdjustRoleFromInspect: (member: OrganizationMember) => void;
  onRemoveMemberFromInspect: (member: OrganizationMember) => void;
  editingRoleMember: OrganizationMember | null;
  onRoleDialogOpenChange: (open: boolean) => void;
  roleDraft: string;
  onRoleDraftChange: (roleCode: string) => void;
  roleUpdateLoading: boolean;
  onConfirmRoleChange: (member: OrganizationMember, roleCode: string) => Promise<void>;
  pendingRemove: OrganizationMember | null;
  pendingRemoveIsCurrentUser: boolean;
  removeLoading: boolean;
  onPendingRemoveOpenChange: (open: boolean) => void;
  onConfirmRemove: (member: OrganizationMember) => Promise<void>;
}

export function OrganizationMembersDialogs({
  inviteOpen,
  onInviteOpenChange,
  inviteLoading,
  roleOptions,
  defaultRoleCode,
  onInviteSubmit,
  inspectingMember,
  onInspectingMemberChange,
  currentUserId,
  roleDetailsByCode,
  rolesLoading,
  rolesError,
  workspaceDataLoading,
  workspaceDataError,
  resolveWorkspaces,
  workspaceLabelById,
  permissions,
  permissionsLoading,
  permissionsError,
  onEnterWorkspace,
  onAdjustRoleFromInspect,
  onRemoveMemberFromInspect,
  editingRoleMember,
  onRoleDialogOpenChange,
  roleDraft,
  onRoleDraftChange,
  roleUpdateLoading,
  onConfirmRoleChange,
  pendingRemove,
  pendingRemoveIsCurrentUser,
  removeLoading,
  onPendingRemoveOpenChange,
  onConfirmRemove,
}: OrganizationMembersDialogsProps) {
  const { t } = useTranslation(["common", "team"]);

  return (
    <>
      <InviteOrganizationMemberDialog
        open={inviteOpen}
        onOpenChange={onInviteOpenChange}
        loading={inviteLoading}
        roleOptions={roleOptions}
        defaultRoleCode={defaultRoleCode}
        onSubmit={onInviteSubmit}
      />

      <OrganizationMemberInspectSheet
        open={Boolean(inspectingMember)}
        onOpenChange={(open) => {
          if (!open) onInspectingMemberChange(null);
        }}
        member={inspectingMember}
        currentUserId={currentUserId}
        roleDetailsByCode={roleDetailsByCode}
        rolesLoading={rolesLoading}
        rolesError={rolesError}
        workspaceDataLoading={workspaceDataLoading}
        workspaceDataError={workspaceDataError}
        resolveWorkspaces={resolveWorkspaces}
        workspaceLabelById={workspaceLabelById}
        permissions={permissions}
        permissionsLoading={permissionsLoading}
        permissionsError={permissionsError}
        onEnterWorkspace={onEnterWorkspace}
        onAdjustRole={(member) => {
          onInspectingMemberChange(null);
          onAdjustRoleFromInspect(member);
        }}
        onRemoveMember={(member) => {
          onInspectingMemberChange(null);
          onRemoveMemberFromInspect(member);
        }}
      />

      <SettingDialog
        open={Boolean(editingRoleMember)}
        onOpenChange={onRoleDialogOpenChange}
        title={t("common:ORG_MEMBERS_ACTION_CHANGE_ROLE")}
        description={t("common:ORG_MEMBERS_ROLE_DIALOG_DESC", {
          name: editingRoleMember?.displayName || editingRoleMember?.username || "",
        })}
        contentClassName="sm:max-w-md"
        footer={
          <>
            <AntButton
              type="text"
              onClick={() => onRoleDialogOpenChange(false)}
              disabled={roleUpdateLoading}
            >
              {t("common:CANCEL")}
            </AntButton>
            <AntButton
              type="primary"
              loading={roleUpdateLoading}
              onClick={async () => {
                if (!editingRoleMember) return;
                await onConfirmRoleChange(editingRoleMember, roleDraft);
              }}
            >
              {t("common:CONFIRM")}
            </AntButton>
          </>
        }
      >
        <div className="grid gap-1.5 py-2">
          <label className="font-semibold text-foreground">
            {t("team:TEAM_INVITE_FIELD_ROLE")}
          </label>
          <div className="text-label-secondary">{t("team:TEAM_ROLE_CHANGE_FIELD_ROLE_HELP")}</div>
          <Select
            value={roleDraft}
            onChange={(next) => onRoleDraftChange(String(next))}
            options={roleOptions}
            className="w-full"
            getPopupContainer={(node) => getPopupContainerWithinOverlay(node)}
            disabled={roleUpdateLoading}
          />
        </div>
      </SettingDialog>

      <ConfirmDialog
        open={Boolean(pendingRemove)}
        onOpenChange={onPendingRemoveOpenChange}
        title={
          pendingRemoveIsCurrentUser
            ? t("common:ORG_MEMBERS_LEAVE_CONFIRM_TITLE")
            : t("common:ORG_MEMBERS_REMOVE_CONFIRM_TITLE")
        }
        description={
          pendingRemoveIsCurrentUser
            ? t("common:ORG_MEMBERS_LEAVE_CONFIRM_DESC")
            : t("common:ORG_MEMBERS_REMOVE_CONFIRM_DESC", {
                name: pendingRemove?.displayName || pendingRemove?.username || "",
              })
        }
        cancelText={t("common:CANCEL")}
        confirmText={t("common:CONFIRM")}
        danger
        loading={removeLoading}
        onConfirm={async () => {
          if (!pendingRemove) return;
          await onConfirmRemove(pendingRemove);
        }}
      />
    </>
  );
}
