import { Button as AntButton, Select } from "antd";
import * as React from "react";
import { getPopupContainerWithinOverlay } from "@/lib/antd/popup-container";

import type { TeamInvitation, TeamInviteLink } from "@/api/team";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
      <Dialog
        open={Boolean(deleteInvitation)}
        onOpenChange={(open) => (!open ? setDeleteInvitation(null) : null)}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{t("team:TEAM_INVITATIONS_DELETE_TITLE")}</DialogTitle>
            <DialogDescription>
              {deleteInvitation
                ? t("team:TEAM_INVITATIONS_DELETE_DESC", { email: deleteInvitation.email })
                : null}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <AntButton onClick={() => setDeleteInvitation(null)} disabled={deleteInvitationPending}>
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
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(renewInvitation)}
        onOpenChange={(open) => (!open ? setRenewInvitation(null) : null)}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{t("team:TEAM_INVITATIONS_RENEW_TITLE")}</DialogTitle>
            <DialogDescription>
              {renewInvitation
                ? t("team:TEAM_INVITATIONS_RENEW_DESC", { email: renewInvitation.email })
                : null}
            </DialogDescription>
          </DialogHeader>

          {renewInvitation ? (
            <div className="space-y-3 py-2">
              <Select<RenewExpiresInSeconds>
                value={renewExpiresInSeconds}
                onChange={(value) => setRenewExpiresInSeconds(value)}
                options={renewOptions}
                style={{ width: "100%" }}
                getPopupContainer={(node) => getPopupContainerWithinOverlay(node)}
              />
            </div>
          ) : null}

          <DialogFooter>
            <AntButton onClick={() => setRenewInvitation(null)} disabled={renewInvitationPending}>
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
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(renewLink)}
        onOpenChange={(open) => (!open ? setRenewLink(null) : null)}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{t("team:TEAM_INVITE_LINKS_RENEW_TITLE")}</DialogTitle>
            <DialogDescription>
              {renewLink
                ? t("team:TEAM_INVITE_LINKS_RENEW_DESC", { code: renewLink.displayCode })
                : null}
            </DialogDescription>
          </DialogHeader>

          {renewLink ? (
            <div className="space-y-3 py-2">
              <Select<RenewExpiresInSeconds>
                value={renewExpiresInSeconds}
                onChange={(value) => setRenewExpiresInSeconds(value)}
                options={renewOptions}
                style={{ width: "100%" }}
                getPopupContainer={(node) => getPopupContainerWithinOverlay(node)}
              />
            </div>
          ) : null}

          <DialogFooter>
            <AntButton onClick={() => setRenewLink(null)} disabled={renewLinkPending}>
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
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
