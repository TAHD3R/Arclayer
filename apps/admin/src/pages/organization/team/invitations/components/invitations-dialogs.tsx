import { Button as AntButton, Input, Select } from "antd";

import type { OrganizationInvitation, OrganizationInviteLink } from "@/types/api";
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
import { SettingDialog } from "@celestial/ui/setting-dialog";
import { getPopupContainerWithinOverlay } from "@/lib/antd/popup-container";
import type { InviteOrganizationRoleOption } from "@/pages/organization/team/shared/components/invite-organization-member-dialog";

import type { RenewExpiresInSeconds } from "../constants";

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

type DialogSnapshotState<T> = {
  open: boolean;
  displayPayload: T | null;
  onOpenChange: (open: boolean) => void;
  close: () => void;
};

interface OrganizationTeamInvitationsDialogsProps {
  t: TranslateFn;
  roleOptions: InviteOrganizationRoleOption[];
  renewOptions: Array<{ value: RenewExpiresInSeconds; label: string }>;
  linkCreateOpen: boolean;
  onLinkCreateOpenChange: (open: boolean) => void;
  linkRoleCode: string;
  onLinkRoleCodeChange: (value: string) => void;
  linkExpiresInSeconds: RenewExpiresInSeconds;
  onLinkExpiresInSecondsChange: (value: RenewExpiresInSeconds) => void;
  linkAllowedDomain: string;
  onLinkAllowedDomainChange: (value: string) => void;
  createLinkPending: boolean;
  onCreateLink: () => void;
  renewExpiresInSeconds: RenewExpiresInSeconds;
  onRenewExpiresInSecondsChange: (value: RenewExpiresInSeconds) => void;
  renewInvitationDialog: DialogSnapshotState<OrganizationInvitation>;
  renewInvitationPending: boolean;
  onRenewInvitation: (invitationId: string) => void;
  revokeInvitationDialog: DialogSnapshotState<OrganizationInvitation>;
  revokeInvitationPending: boolean;
  onRevokeInvitation: (invitationId: string) => void;
  renewLinkDialog: DialogSnapshotState<OrganizationInviteLink>;
  renewLinkPending: boolean;
  onRenewLink: (linkId: string) => void;
  disableLinkDialog: DialogSnapshotState<OrganizationInviteLink>;
  disableLinkPending: boolean;
  onDisableLink: (linkId: string) => void;
}

export function OrganizationTeamInvitationsDialogs(props: OrganizationTeamInvitationsDialogsProps) {
  const {
    t,
    roleOptions,
    renewOptions,
    linkCreateOpen,
    onLinkCreateOpenChange,
    linkRoleCode,
    onLinkRoleCodeChange,
    linkExpiresInSeconds,
    onLinkExpiresInSecondsChange,
    linkAllowedDomain,
    onLinkAllowedDomainChange,
    createLinkPending,
    onCreateLink,
    renewExpiresInSeconds,
    onRenewExpiresInSecondsChange,
    renewInvitationDialog,
    renewInvitationPending,
    onRenewInvitation,
    revokeInvitationDialog,
    revokeInvitationPending,
    onRevokeInvitation,
    renewLinkDialog,
    renewLinkPending,
    onRenewLink,
    disableLinkDialog,
    disableLinkPending,
    onDisableLink,
  } = props;

  return (
    <>
      <SettingDialog
        open={linkCreateOpen}
        onOpenChange={onLinkCreateOpenChange}
        title={t("team:TEAM_INVITE_CREATE_LINK_ACTION")}
        description={t("common:ORG_INVITATIONS_DESC")}
        contentClassName="sm:max-w-xl"
        footer={
          <>
            <AntButton
              type="text"
              onClick={() => onLinkCreateOpenChange(false)}
              disabled={createLinkPending}
              autoInsertSpace={false}
            >
              {t("common:CANCEL")}
            </AntButton>
            <AntButton
              type="primary"
              loading={createLinkPending}
              onClick={onCreateLink}
              autoInsertSpace={false}
            >
              {t("common:CONFIRM")}
            </AntButton>
          </>
        }
      >
        <div className="grid gap-5 py-2">
          <div className="grid gap-1.5">
            <label className="font-semibold text-foreground">
              {t("team:TEAM_INVITE_FIELD_ROLE")}
            </label>
            <div className="text-label-secondary">{t("team:TEAM_INVITE_ROLE_HELP")}</div>
            <Select
              value={linkRoleCode}
              showSearch
              optionFilterProp="label"
              onChange={(next) => onLinkRoleCodeChange(String(next))}
              options={roleOptions}
              placeholder={t("team:TEAM_INVITE_FIELD_ROLE_PLACEHOLDER")}
              getPopupContainer={(node) => getPopupContainerWithinOverlay(node)}
              className="w-full"
            />
          </div>

          <div className="grid gap-1.5">
            <label className="font-semibold text-foreground">
              {t("common:ORG_INVITE_LINK_ALLOWED_DOMAIN_LABEL")}
            </label>
            <div className="text-label-secondary">
              {t("team:TEAM_INVITE_LINK_ALLOWED_DOMAIN_HELP")}
            </div>
            <Input
              value={linkAllowedDomain}
              onChange={(event) => onLinkAllowedDomainChange(event.target.value)}
              placeholder={t("common:ORG_INVITE_LINK_ALLOWED_DOMAIN_PLACEHOLDER")}
            />
          </div>

          <div className="grid gap-1.5">
            <label className="font-semibold text-foreground">
              {t("team:TEAM_INVITE_LINK_FIELD_EXPIRES")}
            </label>
            <div className="text-label-secondary">{t("team:TEAM_INVITE_FIELD_EXPIRES_HELP")}</div>
            <Select<RenewExpiresInSeconds>
              value={linkExpiresInSeconds}
              onChange={(next) => onLinkExpiresInSecondsChange(next)}
              options={renewOptions}
              getPopupContainer={(node) => getPopupContainerWithinOverlay(node)}
              className="w-full"
            />
          </div>
        </div>
      </SettingDialog>

      <SettingDialog
        open={renewInvitationDialog.open}
        onOpenChange={renewInvitationDialog.onOpenChange}
        title={t("team:TEAM_INVITATIONS_RENEW_TITLE")}
        description={
          renewInvitationDialog.displayPayload
            ? t("team:TEAM_INVITATIONS_RENEW_DESC", {
                email: renewInvitationDialog.displayPayload.email || "-",
              })
            : undefined
        }
        contentClassName="sm:max-w-xl"
        footer={
          <>
            <AntButton
              autoInsertSpace={false}
              type="text"
              onClick={renewInvitationDialog.close}
              disabled={renewInvitationPending}
            >
              {t("common:CANCEL")}
            </AntButton>
            <AntButton
              autoInsertSpace={false}
              type="primary"
              loading={renewInvitationPending}
              onClick={() => {
                const active = renewInvitationDialog.displayPayload;
                if (!active) return;
                onRenewInvitation(active.id);
              }}
            >
              {t("team:TEAM_ACTION_RENEW")}
            </AntButton>
          </>
        }
      >
        {renewInvitationDialog.displayPayload ? (
          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5">
              <label className="font-semibold text-foreground">
                {t("team:TEAM_INVITE_LINK_FIELD_EXPIRES")}
              </label>
              <div className="text-label-secondary">{t("team:TEAM_INVITE_FIELD_EXPIRES_HELP")}</div>
              <Select<RenewExpiresInSeconds>
                value={renewExpiresInSeconds}
                onChange={(value) => onRenewExpiresInSecondsChange(value)}
                options={renewOptions}
                className="w-full"
                getPopupContainer={(node) => getPopupContainerWithinOverlay(node)}
              />
            </div>
          </div>
        ) : null}
      </SettingDialog>

      <AlertDialog
        open={revokeInvitationDialog.open}
        onOpenChange={revokeInvitationDialog.onOpenChange}
      >
        <AlertDialogContent className="sm:max-w-[520px]">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("team:TEAM_INVITATIONS_DELETE_TITLE")}</AlertDialogTitle>
            {revokeInvitationDialog.displayPayload ? (
              <AlertDialogDescription className="text-body">
                {t("team:TEAM_INVITATIONS_DELETE_DESC", {
                  email: revokeInvitationDialog.displayPayload.email || "-",
                })}
              </AlertDialogDescription>
            ) : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancelPrimitive asChild>
              <AntButton
                autoInsertSpace={false}
                type="text"
                onClick={revokeInvitationDialog.close}
                disabled={revokeInvitationPending}
              >
                {t("common:CANCEL")}
              </AntButton>
            </AlertDialogCancelPrimitive>
            <AlertDialogActionPrimitive asChild>
              <AntButton
                autoInsertSpace={false}
                type="primary"
                danger
                loading={revokeInvitationPending}
                onClick={() => {
                  const active = revokeInvitationDialog.displayPayload;
                  if (!active) return;
                  onRevokeInvitation(active.id);
                }}
              >
                {t("team:TEAM_ACTION_DELETE")}
              </AntButton>
            </AlertDialogActionPrimitive>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SettingDialog
        open={renewLinkDialog.open}
        onOpenChange={renewLinkDialog.onOpenChange}
        title={t("team:TEAM_INVITE_LINKS_RENEW_TITLE")}
        description={
          renewLinkDialog.displayPayload
            ? t("team:TEAM_INVITE_LINKS_RENEW_DESC", {
                code: renewLinkDialog.displayPayload.displayCode,
              })
            : undefined
        }
        contentClassName="sm:max-w-xl"
        footer={
          <>
            <AntButton
              autoInsertSpace={false}
              type="text"
              onClick={renewLinkDialog.close}
              disabled={renewLinkPending}
            >
              {t("common:CANCEL")}
            </AntButton>
            <AntButton
              autoInsertSpace={false}
              type="primary"
              loading={renewLinkPending}
              onClick={() => {
                const active = renewLinkDialog.displayPayload;
                if (!active) return;
                onRenewLink(active.id);
              }}
            >
              {t("team:TEAM_ACTION_RENEW")}
            </AntButton>
          </>
        }
      >
        {renewLinkDialog.displayPayload ? (
          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5">
              <label className="font-semibold text-foreground">
                {t("team:TEAM_INVITE_LINK_FIELD_EXPIRES")}
              </label>
              <div className="text-label-secondary">{t("team:TEAM_INVITE_FIELD_EXPIRES_HELP")}</div>
              <Select<RenewExpiresInSeconds>
                value={renewExpiresInSeconds}
                onChange={(value) => onRenewExpiresInSecondsChange(value)}
                options={renewOptions}
                className="w-full"
                getPopupContainer={(node) => getPopupContainerWithinOverlay(node)}
              />
            </div>
          </div>
        ) : null}
      </SettingDialog>

      <AlertDialog open={disableLinkDialog.open} onOpenChange={disableLinkDialog.onOpenChange}>
        <AlertDialogContent className="sm:max-w-[520px]">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("team:TEAM_INVITE_LINKS_ACTION_DISABLE")}</AlertDialogTitle>
            {disableLinkDialog.displayPayload ? (
              <AlertDialogDescription className="text-body">
                {t("team:TEAM_INVITE_LINKS_DISABLE_DESC", {
                  code: disableLinkDialog.displayPayload.displayCode,
                })}
              </AlertDialogDescription>
            ) : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancelPrimitive asChild>
              <AntButton
                autoInsertSpace={false}
                type="text"
                onClick={disableLinkDialog.close}
                disabled={disableLinkPending}
              >
                {t("common:CANCEL")}
              </AntButton>
            </AlertDialogCancelPrimitive>
            <AlertDialogActionPrimitive asChild>
              <AntButton
                autoInsertSpace={false}
                type="primary"
                danger
                loading={disableLinkPending}
                onClick={() => {
                  const active = disableLinkDialog.displayPayload;
                  if (!active) return;
                  onDisableLink(active.id);
                }}
              >
                {t("team:TEAM_INVITE_LINKS_ACTION_DISABLE")}
              </AntButton>
            </AlertDialogActionPrimitive>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
