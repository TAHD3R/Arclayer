import { Button as AntButton, Input, Select } from "antd";

import {
  type OrganizationInvitation,
  type OrganizationInviteLink,
} from "@/api/organization-members";
import { SettingDialog } from "@/components/common/setting-dialog";
import { getPopupContainerWithinOverlay } from "@/lib/antd/popup-container";
import type { InviteOrganizationRoleOption } from "@/pages/organization/team/shared/invite-organization-member-dialog";

import type { RenewExpiresInSeconds } from "./invitations-constants";

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
            >
              {t("common:CANCEL")}
            </AntButton>
            <AntButton type="primary" loading={createLinkPending} onClick={onCreateLink}>
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
              type="text"
              onClick={renewInvitationDialog.close}
              disabled={renewInvitationPending}
            >
              {t("common:CANCEL")}
            </AntButton>
            <AntButton
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
          <div className="grid gap-1.5 py-2">
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
        ) : null}
      </SettingDialog>

      <SettingDialog
        open={revokeInvitationDialog.open}
        onOpenChange={revokeInvitationDialog.onOpenChange}
        title={t("team:TEAM_INVITATIONS_DELETE_TITLE")}
        description={
          revokeInvitationDialog.displayPayload
            ? t("team:TEAM_INVITATIONS_DELETE_DESC", {
                email: revokeInvitationDialog.displayPayload.email || "-",
              })
            : undefined
        }
        contentClassName="sm:max-w-xl"
        footer={
          <>
            <AntButton
              type="text"
              onClick={revokeInvitationDialog.close}
              disabled={revokeInvitationPending}
            >
              {t("common:CANCEL")}
            </AntButton>
            <AntButton
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
          </>
        }
      >
        <></>
      </SettingDialog>

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
            <AntButton type="text" onClick={renewLinkDialog.close} disabled={renewLinkPending}>
              {t("common:CANCEL")}
            </AntButton>
            <AntButton
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
          <div className="grid gap-1.5 py-2">
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
        ) : null}
      </SettingDialog>

      <SettingDialog
        open={disableLinkDialog.open}
        onOpenChange={disableLinkDialog.onOpenChange}
        title={t("team:TEAM_INVITE_LINKS_ACTION_DISABLE")}
        description={
          disableLinkDialog.displayPayload
            ? t("team:TEAM_INVITE_LINKS_DISABLE_DESC", {
                code: disableLinkDialog.displayPayload.displayCode,
              })
            : undefined
        }
        contentClassName="sm:max-w-xl"
        footer={
          <>
            <AntButton type="text" onClick={disableLinkDialog.close} disabled={disableLinkPending}>
              {t("common:CANCEL")}
            </AntButton>
            <AntButton
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
          </>
        }
      >
        <></>
      </SettingDialog>
    </>
  );
}
