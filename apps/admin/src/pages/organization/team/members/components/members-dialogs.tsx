import { useTranslation } from "react-i18next";

import type { OrganizationMember, OrganizationMemberWorkspace } from "@/types/api";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";
import { SettingDialog } from "@arclayer/ui/setting-dialog";
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
            <Button
              variant="ghost"
              onClick={() => onRoleDialogOpenChange(false)}
              disabled={roleUpdateLoading}
            >
              {t("common:CANCEL")}
            </Button>
            <Button
              loading={roleUpdateLoading}
              onClick={async () => {
                if (!editingRoleMember) return;
                await onConfirmRoleChange(editingRoleMember, roleDraft);
              }}
            >
              {t("common:CONFIRM")}
            </Button>
          </>
        }
      >
        <div className="grid gap-1.5">
          <label className="font-semibold text-foreground">
            {t("team:TEAM_INVITE_FIELD_ROLE")}
          </label>
          <div className="text-label-secondary">{t("team:TEAM_ROLE_CHANGE_FIELD_ROLE_HELP")}</div>
          <Select value={roleDraft} onValueChange={onRoleDraftChange} disabled={roleUpdateLoading}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" align="start">
              {roleOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </SettingDialog>

      <AlertDialog open={Boolean(pendingRemove)} onOpenChange={onPendingRemoveOpenChange}>
        <AlertDialogContent className="sm:max-w-[520px]">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingRemoveIsCurrentUser
                ? t("common:ORG_MEMBERS_LEAVE_CONFIRM_TITLE")
                : t("common:ORG_MEMBERS_REMOVE_CONFIRM_TITLE")}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-body">
              {pendingRemoveIsCurrentUser
                ? t("common:ORG_MEMBERS_LEAVE_CONFIRM_DESC")
                : t("common:ORG_MEMBERS_REMOVE_CONFIRM_DESC", {
                    name: pendingRemove?.displayName || pendingRemove?.username || "",
                  })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancelPrimitive asChild>
              <Button
                variant="ghost"
                onClick={() => onPendingRemoveOpenChange(false)}
                disabled={removeLoading}
              >
                {t("common:CANCEL")}
              </Button>
            </AlertDialogCancelPrimitive>
            <AlertDialogActionPrimitive asChild>
              <Button
                variant="destructive"
                loading={removeLoading}
                onClick={() => {
                  if (!pendingRemove) return;
                  void onConfirmRemove(pendingRemove);
                }}
              >
                {t("common:CONFIRM")}
              </Button>
            </AlertDialogActionPrimitive>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
