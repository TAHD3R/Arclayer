import type { OrganizationInvitation, OrganizationInviteLink } from "@/types/api";
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
import { Input } from "@arclayer/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";
import { SettingDialog } from "@arclayer/ui/setting-dialog";
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
            <Button
              variant="ghost"
              onClick={() => onLinkCreateOpenChange(false)}
              disabled={createLinkPending}
            >
              {t("common:CANCEL")}
            </Button>
            <Button loading={createLinkPending} onClick={onCreateLink}>
              {t("common:CONFIRM")}
            </Button>
          </>
        }
      >
        <div className="grid gap-5">
          <div className="grid gap-1.5">
            <label className="font-semibold text-foreground">
              {t("team:TEAM_INVITE_FIELD_ROLE")}
            </label>
            <div className="text-label-secondary">{t("team:TEAM_INVITE_ROLE_HELP")}</div>
            <Select value={linkRoleCode} onValueChange={onLinkRoleCodeChange}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t("team:TEAM_INVITE_FIELD_ROLE_PLACEHOLDER")} />
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
            <Select
              value={String(linkExpiresInSeconds)}
              onValueChange={(next) =>
                onLinkExpiresInSecondsChange(next === "null" ? null : Number(next))
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" align="start">
                {renewOptions.map((option) => (
                  <SelectItem key={String(option.value)} value={String(option.value)}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
            <Button
              variant="ghost"
              onClick={renewInvitationDialog.close}
              disabled={renewInvitationPending}
            >
              {t("common:CANCEL")}
            </Button>
            <Button
              loading={renewInvitationPending}
              onClick={() => {
                const active = renewInvitationDialog.displayPayload;
                if (!active) return;
                onRenewInvitation(active.id);
              }}
            >
              {t("team:TEAM_ACTION_RENEW")}
            </Button>
          </>
        }
      >
        {renewInvitationDialog.displayPayload ? (
          <div className="grid gap-1.5">
            <label className="font-semibold text-foreground">
              {t("team:TEAM_INVITE_LINK_FIELD_EXPIRES")}
            </label>
            <div className="text-label-secondary">{t("team:TEAM_INVITE_FIELD_EXPIRES_HELP")}</div>
            <Select
              value={String(renewExpiresInSeconds)}
              onValueChange={(value) =>
                onRenewExpiresInSecondsChange(value === "null" ? null : Number(value))
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" align="start">
                {renewOptions.map((option) => (
                  <SelectItem key={String(option.value)} value={String(option.value)}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
              <Button
                variant="ghost"
                onClick={revokeInvitationDialog.close}
                disabled={revokeInvitationPending}
              >
                {t("common:CANCEL")}
              </Button>
            </AlertDialogCancelPrimitive>
            <AlertDialogActionPrimitive asChild>
              <Button
                variant="destructive"
                loading={revokeInvitationPending}
                onClick={() => {
                  const active = revokeInvitationDialog.displayPayload;
                  if (!active) return;
                  onRevokeInvitation(active.id);
                }}
              >
                {t("team:TEAM_ACTION_DELETE")}
              </Button>
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
            <Button variant="ghost" onClick={renewLinkDialog.close} disabled={renewLinkPending}>
              {t("common:CANCEL")}
            </Button>
            <Button
              loading={renewLinkPending}
              onClick={() => {
                const active = renewLinkDialog.displayPayload;
                if (!active) return;
                onRenewLink(active.id);
              }}
            >
              {t("team:TEAM_ACTION_RENEW")}
            </Button>
          </>
        }
      >
        {renewLinkDialog.displayPayload ? (
          <div className="grid gap-1.5">
            <label className="font-semibold text-foreground">
              {t("team:TEAM_INVITE_LINK_FIELD_EXPIRES")}
            </label>
            <div className="text-label-secondary">{t("team:TEAM_INVITE_FIELD_EXPIRES_HELP")}</div>
            <Select
              value={String(renewExpiresInSeconds)}
              onValueChange={(value) =>
                onRenewExpiresInSecondsChange(value === "null" ? null : Number(value))
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" align="start">
                {renewOptions.map((option) => (
                  <SelectItem key={String(option.value)} value={String(option.value)}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
              <Button
                variant="ghost"
                onClick={disableLinkDialog.close}
                disabled={disableLinkPending}
              >
                {t("common:CANCEL")}
              </Button>
            </AlertDialogCancelPrimitive>
            <AlertDialogActionPrimitive asChild>
              <Button
                variant="destructive"
                loading={disableLinkPending}
                onClick={() => {
                  const active = disableLinkDialog.displayPayload;
                  if (!active) return;
                  onDisableLink(active.id);
                }}
              >
                {t("team:TEAM_INVITE_LINKS_ACTION_DISABLE")}
              </Button>
            </AlertDialogActionPrimitive>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
