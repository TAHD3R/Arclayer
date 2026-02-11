import { Button as AntButton, Select } from "antd";
import { useTranslation } from "react-i18next";

import type {
  OrganizationMember,
  OrganizationMemberWorkspace,
} from "@/api/organization-members";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getPopupContainerWithinOverlay } from "@/lib/antd/popup-container";
import {
  InviteOrganizationMemberDialog,
  type InviteOrganizationMemberFormValues,
  type InviteOrganizationRoleOption,
} from "../shared/invite-organization-member-dialog";
import { OrganizationMemberInspectSheet } from "../shared/organization-member-inspect-sheet";
import { type ResolvedMemberWorkspace } from "../shared/organization-member-workspace-list";
import { type DisplayOrganizationPermission } from "./members-display";

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

      <Dialog open={Boolean(editingRoleMember)} onOpenChange={onRoleDialogOpenChange}>
        <DialogContent className="sm:max-w-md">
          <div className="space-y-4">
            <DialogHeader>
              <DialogTitle>{t("common:ORG_MEMBERS_ACTION_CHANGE_ROLE")}</DialogTitle>
              <DialogDescription>
                {t("common:ORG_MEMBERS_ROLE_DIALOG_DESC", {
                  name: editingRoleMember?.displayName || editingRoleMember?.username || "",
                })}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-1.5">
              <label className="text-sm font-medium text-foreground">
                {t("common:ORG_MEMBERS_INVITE_ROLE")}
              </label>
              <Select
                value={roleDraft}
                onChange={(next) => onRoleDraftChange(String(next))}
                options={roleOptions}
                className="w-full"
                getPopupContainer={(node) => getPopupContainerWithinOverlay(node)}
                disabled={roleUpdateLoading}
              />
            </div>

            <DialogFooter>
              <AntButton onClick={() => onRoleDialogOpenChange(false)} disabled={roleUpdateLoading}>
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
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

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
