import { Button as AntButton, Select } from "antd";
import * as React from "react";
import { getPopupContainerWithinOverlay } from "@/lib/antd/popup-container";

import type { TeamInvitation, TeamInviteLink } from "@/api/team";
import { SettingDialog } from "@/components/common/setting-dialog";

import type { RenewExpiresInSeconds } from "./invitations-helpers";

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

interface TeamInvitationsDialogsProps {
  t: TranslateFn;
  deleteInvitation: TeamInvitation | null;
  setDeleteInvitation: React.Dispatch<React.SetStateAction<TeamInvitation | null>>;
  deleteInvitationPending: boolean;
  onDeleteInvitation: (invitationId: string) => Promise<unknown>;
  renewInvitation: TeamInvitation | null;
  setRenewInvitation: React.Dispatch<React.SetStateAction<TeamInvitation | null>>;
  renewInvitationPending: boolean;
  onRenewInvitation: (payload: {
    invitationId: string;
    expiresInSeconds: RenewExpiresInSeconds;
  }) => Promise<unknown>;
  renewLink: TeamInviteLink | null;
  setRenewLink: React.Dispatch<React.SetStateAction<TeamInviteLink | null>>;
  renewLinkPending: boolean;
  onRenewLink: (payload: {
    linkId: string;
    expiresInSeconds: RenewExpiresInSeconds;
  }) => Promise<unknown>;
  renewExpiresInSeconds: RenewExpiresInSeconds;
  setRenewExpiresInSeconds: React.Dispatch<React.SetStateAction<RenewExpiresInSeconds>>;
  renewOptions: Array<{ label: string; value: RenewExpiresInSeconds }>;
}

export function TeamInvitationsDialogs(props: TeamInvitationsDialogsProps) {
  const {
    t,
    deleteInvitation,
    setDeleteInvitation,
    deleteInvitationPending,
    onDeleteInvitation,
    renewInvitation,
    setRenewInvitation,
    renewInvitationPending,
    onRenewInvitation,
    renewLink,
    setRenewLink,
    renewLinkPending,
    onRenewLink,
    renewExpiresInSeconds,
    setRenewExpiresInSeconds,
    renewOptions,
  } = props;

  return (
    <>
      <SettingDialog
        open={Boolean(deleteInvitation)}
        onOpenChange={(open) => (!open ? setDeleteInvitation(null) : null)}
        title={t("team:TEAM_INVITATIONS_DELETE_TITLE")}
        description={
          deleteInvitation
            ? t("team:TEAM_INVITATIONS_DELETE_DESC", { email: deleteInvitation.email })
            : undefined
        }
        contentClassName="sm:max-w-xl"
        footer={
          <>
            <AntButton
              type="text"
              onClick={() => setDeleteInvitation(null)}
              disabled={deleteInvitationPending}
            >
              {t("common:CANCEL")}
            </AntButton>
            <AntButton
              type="primary"
              danger
              loading={deleteInvitationPending}
              onClick={() => {
                const invitation = deleteInvitation;
                if (!invitation) return;
                void onDeleteInvitation(invitation.id)
                  .then(() => setDeleteInvitation(null))
                  .catch(() => undefined);
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
        open={Boolean(renewInvitation)}
        onOpenChange={(open) => (!open ? setRenewInvitation(null) : null)}
        title={t("team:TEAM_INVITATIONS_RENEW_TITLE")}
        description={
          renewInvitation
            ? t("team:TEAM_INVITATIONS_RENEW_DESC", { email: renewInvitation.email })
            : undefined
        }
        contentClassName="sm:max-w-xl"
        footer={
          <>
            <AntButton
              type="text"
              onClick={() => setRenewInvitation(null)}
              disabled={renewInvitationPending}
            >
              {t("common:CANCEL")}
            </AntButton>
            <AntButton
              type="primary"
              loading={renewInvitationPending}
              onClick={() => {
                const invitation = renewInvitation;
                if (!invitation) return;
                void onRenewInvitation({
                  invitationId: invitation.id,
                  expiresInSeconds: renewExpiresInSeconds,
                }).catch(() => undefined);
              }}
            >
              {t("team:TEAM_ACTION_RENEW")}
            </AntButton>
          </>
        }
      >
        {renewInvitation ? (
          <div className="grid gap-1.5 py-2">
            <label className="font-semibold text-foreground">
              {t("team:TEAM_INVITE_LINK_FIELD_EXPIRES")}
            </label>
            <div className="text-label-secondary">{t("team:TEAM_INVITE_FIELD_EXPIRES_HELP")}</div>
            <Select<RenewExpiresInSeconds>
              value={renewExpiresInSeconds}
              onChange={(value) => setRenewExpiresInSeconds(value)}
              options={renewOptions}
              className="w-full"
              getPopupContainer={(node) => getPopupContainerWithinOverlay(node)}
            />
          </div>
        ) : null}
      </SettingDialog>

      <SettingDialog
        open={Boolean(renewLink)}
        onOpenChange={(open) => (!open ? setRenewLink(null) : null)}
        title={t("team:TEAM_INVITE_LINKS_RENEW_TITLE")}
        description={
          renewLink
            ? t("team:TEAM_INVITE_LINKS_RENEW_DESC", { code: renewLink.displayCode })
            : undefined
        }
        contentClassName="sm:max-w-xl"
        footer={
          <>
            <AntButton type="text" onClick={() => setRenewLink(null)} disabled={renewLinkPending}>
              {t("common:CANCEL")}
            </AntButton>
            <AntButton
              type="primary"
              loading={renewLinkPending}
              onClick={() => {
                const link = renewLink;
                if (!link) return;
                void onRenewLink({
                  linkId: link.id,
                  expiresInSeconds: renewExpiresInSeconds,
                }).catch(() => undefined);
              }}
            >
              {t("team:TEAM_ACTION_RENEW")}
            </AntButton>
          </>
        }
      >
        {renewLink ? (
          <div className="grid gap-1.5 py-2">
            <label className="font-semibold text-foreground">
              {t("team:TEAM_INVITE_LINK_FIELD_EXPIRES")}
            </label>
            <div className="text-label-secondary">{t("team:TEAM_INVITE_FIELD_EXPIRES_HELP")}</div>
            <Select<RenewExpiresInSeconds>
              value={renewExpiresInSeconds}
              onChange={(value) => setRenewExpiresInSeconds(value)}
              options={renewOptions}
              className="w-full"
              getPopupContainer={(node) => getPopupContainerWithinOverlay(node)}
            />
          </div>
        ) : null}
      </SettingDialog>
    </>
  );
}
