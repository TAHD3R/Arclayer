import { Button as AntButton, Input, Select } from "antd";

import {
  type OrganizationInvitation,
  type OrganizationInviteLink,
} from "@/api/organization-members";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
      <Dialog open={linkCreateOpen} onOpenChange={onLinkCreateOpenChange}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{t("team:TEAM_INVITE_CREATE_LINK_ACTION")}</DialogTitle>
            <DialogDescription>{t("common:ORG_INVITATIONS_DESC")}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-5 py-2">
            <div className="grid gap-1.5">
              <label className="text-sm font-medium text-foreground">
                {t("team:TEAM_INVITE_FIELD_ROLE")}
              </label>
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
              <div className="text-xs text-muted-foreground">{t("team:TEAM_INVITE_ROLE_HELP")}</div>
            </div>

            <div className="grid gap-1.5">
              <label className="text-sm font-medium text-foreground">
                {t("team:TEAM_INVITE_LINK_FIELD_EXPIRES")}
              </label>
              <Select<RenewExpiresInSeconds>
                value={linkExpiresInSeconds}
                onChange={(next) => onLinkExpiresInSecondsChange(next)}
                options={renewOptions}
                getPopupContainer={(node) => getPopupContainerWithinOverlay(node)}
                className="w-full"
              />
            </div>

            <div className="grid gap-1.5">
              <label className="text-sm font-medium text-foreground">
                {t("common:ORG_INVITE_LINK_ALLOWED_DOMAIN_LABEL")}
              </label>
              <Input
                value={linkAllowedDomain}
                onChange={(event) => onLinkAllowedDomainChange(event.target.value)}
                placeholder={t("common:ORG_INVITE_LINK_ALLOWED_DOMAIN_PLACEHOLDER")}
              />
            </div>
          </div>

          <DialogFooter>
            <AntButton onClick={() => onLinkCreateOpenChange(false)} disabled={createLinkPending}>
              {t("common:CANCEL")}
            </AntButton>
            <AntButton type="primary" loading={createLinkPending} onClick={onCreateLink}>
              {t("common:CONFIRM")}
            </AntButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={renewInvitationDialog.open} onOpenChange={renewInvitationDialog.onOpenChange}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{t("team:TEAM_INVITATIONS_RENEW_TITLE")}</DialogTitle>
            <DialogDescription>
              {renewInvitationDialog.displayPayload
                ? t("team:TEAM_INVITATIONS_RENEW_DESC", {
                    email: renewInvitationDialog.displayPayload.email || "-",
                  })
                : null}
            </DialogDescription>
          </DialogHeader>

          {renewInvitationDialog.displayPayload ? (
            <div className="space-y-3 py-2">
              <Select<RenewExpiresInSeconds>
                value={renewExpiresInSeconds}
                onChange={(value) => onRenewExpiresInSecondsChange(value)}
                options={renewOptions}
                className="w-full"
                getPopupContainer={(node) => getPopupContainerWithinOverlay(node)}
              />
            </div>
          ) : null}

          <DialogFooter>
            <AntButton onClick={renewInvitationDialog.close} disabled={renewInvitationPending}>
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
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={revokeInvitationDialog.open} onOpenChange={revokeInvitationDialog.onOpenChange}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{t("team:TEAM_INVITATIONS_DELETE_TITLE")}</DialogTitle>
            <DialogDescription>
              {revokeInvitationDialog.displayPayload
                ? t("team:TEAM_INVITATIONS_DELETE_DESC", {
                    email: revokeInvitationDialog.displayPayload.email || "-",
                  })
                : null}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <AntButton onClick={revokeInvitationDialog.close} disabled={revokeInvitationPending}>
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
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={renewLinkDialog.open} onOpenChange={renewLinkDialog.onOpenChange}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{t("team:TEAM_INVITE_LINKS_RENEW_TITLE")}</DialogTitle>
            <DialogDescription>
              {renewLinkDialog.displayPayload
                ? t("team:TEAM_INVITE_LINKS_RENEW_DESC", {
                    code: renewLinkDialog.displayPayload.displayCode,
                  })
                : null}
            </DialogDescription>
          </DialogHeader>

          {renewLinkDialog.displayPayload ? (
            <div className="space-y-3 py-2">
              <Select<RenewExpiresInSeconds>
                value={renewExpiresInSeconds}
                onChange={(value) => onRenewExpiresInSecondsChange(value)}
                options={renewOptions}
                className="w-full"
                getPopupContainer={(node) => getPopupContainerWithinOverlay(node)}
              />
            </div>
          ) : null}

          <DialogFooter>
            <AntButton onClick={renewLinkDialog.close} disabled={renewLinkPending}>
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
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={disableLinkDialog.open} onOpenChange={disableLinkDialog.onOpenChange}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{t("team:TEAM_INVITE_LINKS_ACTION_DISABLE")}</DialogTitle>
            <DialogDescription>
              {disableLinkDialog.displayPayload
                ? t("team:TEAM_INVITE_LINKS_DISABLE_DESC", {
                    code: disableLinkDialog.displayPayload.displayCode,
                  })
                : null}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <AntButton onClick={disableLinkDialog.close} disabled={disableLinkPending}>
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
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
