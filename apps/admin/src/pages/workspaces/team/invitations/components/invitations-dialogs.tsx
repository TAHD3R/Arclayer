import { Button as AntButton, Select } from "antd";
import * as React from "react";
import { getPopupContainerWithinOverlay } from "@/lib/antd/popup-container";

import type { TeamInvitation, TeamInviteLink } from "@/types/api";
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

import type { RenewExpiresInSeconds } from "../types";

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
      <AlertDialog
        open={Boolean(deleteInvitation)}
        onOpenChange={(open) => {
          if (!open) setDeleteInvitation(null);
        }}
      >
        <AlertDialogContent className="sm:max-w-[520px]">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("team:TEAM_INVITATIONS_DELETE_TITLE")}</AlertDialogTitle>
            {deleteInvitation ? (
              <AlertDialogDescription className="text-body">
                {t("team:TEAM_INVITATIONS_DELETE_DESC", { email: deleteInvitation.email })}
              </AlertDialogDescription>
            ) : null}
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancelPrimitive asChild>
              <AntButton
                autoInsertSpace={false}
                type="text"
                onClick={() => setDeleteInvitation(null)}
                disabled={deleteInvitationPending}
              >
                {t("common:CANCEL")}
              </AntButton>
            </AlertDialogCancelPrimitive>
            <AlertDialogActionPrimitive asChild>
              <AntButton
                autoInsertSpace={false}
                type="primary"
                danger
                loading={deleteInvitationPending}
                onClick={() => {
                  const invitation = deleteInvitation;
                  if (!invitation) return;
                  void onDeleteInvitation(invitation.id).then(() => setDeleteInvitation(null));
                }}
              >
                {t("team:TEAM_ACTION_DELETE")}
              </AntButton>
            </AlertDialogActionPrimitive>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
              autoInsertSpace={false}
              type="text"
              onClick={() => setRenewInvitation(null)}
              disabled={renewInvitationPending}
            >
              {t("common:CANCEL")}
            </AntButton>
            <AntButton
              autoInsertSpace={false}
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
          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5">
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
            <AntButton
              autoInsertSpace={false}
              type="text"
              onClick={() => setRenewLink(null)}
              disabled={renewLinkPending}
            >
              {t("common:CANCEL")}
            </AntButton>
            <AntButton
              autoInsertSpace={false}
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
          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5">
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
          </div>
        ) : null}
      </SettingDialog>
    </>
  );
}
