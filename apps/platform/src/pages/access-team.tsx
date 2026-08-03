import { Link } from "@tanstack/react-router";
import { Link2, Plus, ShieldCheck, UserRoundCog, UsersRound } from "lucide-react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  PlatformInvitationDetailOut,
  PlatformTeamOperatorOut,
  PlatformTeamQueueOut,
  PlatformTeamUserOut,
} from "@arclayer/platform-openapi";

import {
  getPlatformInvitation,
  getCurrentPlatformTeamIdentity,
  getPlatformTeam,
  listPlatformInvitations,
  listPlatformRoles,
} from "@/access/access-api";
import { AccessPage, AccessQueryState, useAccessQuery } from "@/access/access-ui";
import {
  AssignOperatorRolesDialog,
  InviteOperatorDialog,
  RevokeInvitationDialog,
} from "@/access/platform-team-dialogs";
import { formatDateTime } from "@/monitoring/format";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function person(user: PlatformTeamUserOut) {
  return user.displayName ?? user.username;
}

function OperatorRow({
  canManageRoles,
  onAssignRoles,
  operator,
}: Readonly<{
  canManageRoles: boolean;
  onAssignRoles: () => void;
  operator: PlatformTeamOperatorOut;
}>) {
  const { t } = useTranslation("access");
  return (
    <li className="grid gap-3 border-t px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
      <div>
        <p className="font-medium">{person(operator.user)}</p>
        <p className="text-sm text-muted-foreground">{operator.user.username}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {operator.roles.length ? (
          operator.roles.map((role) => (
            <Badge key={role.roleId} variant="secondary">
              {role.name}
            </Badge>
          ))
        ) : (
          <span className="text-sm text-muted-foreground">{t("NO_ROLES")}</span>
        )}
      </div>
      <div className="space-y-2 text-sm text-muted-foreground">
        <p>{t(`OPERATOR_${operator.status.toUpperCase()}`)}</p>
        <p>{t("MFA_SUMMARY", { count: operator.mfa.verifiedMethodCount })}</p>
        <p>{t("SESSION_SUMMARY", { count: operator.sessions.activeSessionCount })}</p>
        {operator.status !== "deactivated" && canManageRoles ? (
          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <Button size="sm" variant="outline" onClick={onAssignRoles}>
              <UserRoundCog aria-hidden="true" />
              {t("ADD_ROLES")}
            </Button>
          </div>
        ) : null}
      </div>
    </li>
  );
}

function InvitationRow({
  canRevoke = false,
  invitation,
  onRevoke,
}: Readonly<{
  canRevoke?: boolean;
  invitation: PlatformInvitationDetailOut;
  onRevoke?: () => void;
}>) {
  const { t } = useTranslation("access");
  return (
    <li className="flex flex-col gap-3 border-t px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-medium">{person(invitation.recipient)}</p>
        <p className="text-sm text-muted-foreground">
          {t("INVITED_BY", { name: person(invitation.inviter) })} ·{" "}
          {t("EXPIRES", { date: formatDateTime(invitation.expiresAt) })}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Badge variant={invitation.isEffective ? "secondary" : "outline"}>
          {t(`INVITATION_${invitation.status.toUpperCase()}`)}
        </Badge>
        <Link
          className="text-sm font-medium text-primary underline underline-offset-4"
          params={{ invitationId: invitation.invitationId }}
          to="/access/team/invitations/$invitationId"
        >
          {t("VIEW_DETAILS")}
        </Link>
        {canRevoke && invitation.isEffective ? (
          <Button size="sm" variant="outline" onClick={onRevoke}>
            {t("REVOKE_INVITATION")}
          </Button>
        ) : null}
      </div>
    </li>
  );
}

export function PlatformTeamPage() {
  const { t } = useTranslation("access");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [operatorAction, setOperatorAction] = useState<PlatformTeamOperatorOut | null>(null);
  const [revokeInvitation, setRevokeInvitation] = useState<PlatformInvitationDetailOut | null>(
    null,
  );
  const [successKey, setSuccessKey] = useState<string | null>(null);
  const load = useCallback(async () => {
    const identity = await getCurrentPlatformTeamIdentity();
    const canManageRoles = identity.effectivePermissions.includes("platform:access-roles:manage");
    const [team, roles] = await Promise.all([
      getPlatformTeam(),
      canManageRoles ? listPlatformRoles() : Promise.resolve([]),
    ]);
    return { identity, roles, team };
  }, []);
  const { state, retry } = useAccessQuery(load, []);
  return (
    <AccessPage description={t("TEAM_DESCRIPTION")} title={t("TEAM_TITLE")}>
      <AccessQueryState
        isEmpty={(data) =>
          !data.team.owner && data.team.operators.length === 0 && data.team.invitations.length === 0
        }
        retry={retry}
        state={state}
      >
        {(data) => {
          const canInvite = data.identity.effectivePermissions.includes(
            "platform:access-team:invite",
          );
          const canManageRoles = data.identity.effectivePermissions.includes(
            "platform:access-roles:manage",
          );
          const completed = (messageKey: string) => {
            setSuccessKey(messageKey);
            retry();
          };
          return (
            <>
              <div className="flex justify-end">
                {canInvite ? (
                  <Button onClick={() => setInviteOpen(true)}>
                    <Plus data-icon="inline-start" />
                    {t("INVITE_OPERATOR")}
                  </Button>
                ) : null}
              </div>
              {successKey ? (
                <Alert>
                  <AlertDescription>{t(successKey)}</AlertDescription>
                </Alert>
              ) : null}
              <TeamContent
                canInvite={canInvite}
                canManageRoles={canManageRoles}
                onAssignRoles={setOperatorAction}
                onRevokeInvitation={setRevokeInvitation}
                team={data.team}
              />
              {inviteOpen ? (
                <InviteOperatorDialog open onOpenChange={setInviteOpen} onCompleted={completed} />
              ) : null}
              {operatorAction ? (
                <AssignOperatorRolesDialog
                  open
                  onOpenChange={(open) => !open && setOperatorAction(null)}
                  onCompleted={completed}
                  operator={operatorAction}
                  roles={data.roles}
                />
              ) : null}
              {revokeInvitation ? (
                <RevokeInvitationDialog
                  invitation={revokeInvitation}
                  open
                  onOpenChange={(open) => !open && setRevokeInvitation(null)}
                  onCompleted={completed}
                />
              ) : null}
            </>
          );
        }}
      </AccessQueryState>
    </AccessPage>
  );
}

function TeamContent({
  canInvite,
  canManageRoles,
  onAssignRoles,
  onRevokeInvitation,
  team,
}: Readonly<{
  canInvite: boolean;
  canManageRoles: boolean;
  onAssignRoles: (operator: PlatformTeamOperatorOut) => void;
  onRevokeInvitation: (invitation: PlatformInvitationDetailOut) => void;
  team: PlatformTeamQueueOut;
}>) {
  const { t } = useTranslation("access");
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck aria-hidden="true" className="size-5 text-primary" />
              {t("OWNER_TITLE")}
            </CardTitle>
            <CardDescription>{t("OWNER_DESCRIPTION")}</CardDescription>
          </CardHeader>
          <CardContent>
            {team.owner ? (
              <div>
                <div>
                  <p className="font-medium">{person(team.owner.user)}</p>
                  <p className="text-sm text-muted-foreground">
                    {t("MFA_SUMMARY", { count: team.owner.mfa.verifiedMethodCount })} ·{" "}
                    {t("SESSION_SUMMARY", { count: team.owner.sessions.activeSessionCount })}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-base text-muted-foreground">{t("OWNER_EMPTY")}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UsersRound aria-hidden="true" className="size-5 text-primary" />
              {t("OPERATORS_TITLE")}
            </CardTitle>
            <CardDescription>{t("OPERATORS_DESCRIPTION")}</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <ul>
              {team.operators.length ? (
                team.operators.map((operator) => (
                  <OperatorRow
                    canManageRoles={canManageRoles}
                    key={operator.operatorId}
                    onAssignRoles={() => onAssignRoles(operator)}
                    operator={operator}
                  />
                ))
              ) : (
                <li className="px-5 py-4 text-base text-muted-foreground">
                  {t("OPERATORS_EMPTY")}
                </li>
              )}
            </ul>
          </CardContent>
        </Card>
      </div>
      <InvitationQueue
        canRevoke={canInvite}
        invitations={team.invitations}
        onRevoke={onRevokeInvitation}
      />
    </div>
  );
}

function InvitationQueue({
  canRevoke,
  invitations,
  onRevoke,
}: Readonly<{
  canRevoke: boolean;
  invitations: PlatformInvitationDetailOut[];
  onRevoke: (invitation: PlatformInvitationDetailOut) => void;
}>) {
  const { t } = useTranslation("access");
  return (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2 aria-hidden="true" className="size-5 text-primary" />
          {t("INVITATIONS_TITLE")}
        </CardTitle>
        <CardDescription>{t("INVITATIONS_DESCRIPTION")}</CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <ul>
          {invitations.length ? (
            invitations.map((invitation) => (
              <InvitationRow
                canRevoke={canRevoke}
                invitation={invitation}
                key={invitation.invitationId}
                onRevoke={() => onRevoke(invitation)}
              />
            ))
          ) : (
            <li className="px-5 py-4 text-base text-muted-foreground">{t("INVITATIONS_EMPTY")}</li>
          )}
        </ul>
      </CardContent>
    </Card>
  );
}

export function PlatformInvitationPage({ invitationId }: Readonly<{ invitationId: string }>) {
  const { t } = useTranslation("access");
  const load = useCallback(() => getPlatformInvitation(invitationId), [invitationId]);
  const { state, retry } = useAccessQuery(load, [invitationId]);
  return (
    <AccessPage description={t("INVITATION_DESCRIPTION")} title={t("INVITATION_TITLE")}>
      <AccessQueryState isEmpty={() => false} retry={retry} state={state}>
        {(invitation) => (
          <Card>
            <CardHeader>
              <CardTitle>{person(invitation.recipient)}</CardTitle>
              <CardDescription>
                {t("INVITED_BY", { name: person(invitation.inviter) })}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <dl className="grid gap-4 text-base sm:grid-cols-2">
                <div>
                  <dt className="text-sm text-muted-foreground">{t("STATUS")}</dt>
                  <dd>{t(`INVITATION_${invitation.status.toUpperCase()}`)}</dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">{t("EXPIRES_LABEL")}</dt>
                  <dd>{formatDateTime(invitation.expiresAt)}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-sm text-muted-foreground">{t("ROLES")}</dt>
                  <dd className="mt-2 flex flex-wrap gap-2">
                    {invitation.roles.map((role) => (
                      <Badge key={role.roleId} variant="secondary">
                        {role.name}
                      </Badge>
                    ))}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        )}
      </AccessQueryState>
    </AccessPage>
  );
}

export function PlatformInvitationListPage() {
  const { t } = useTranslation("access");
  const load = useCallback(() => listPlatformInvitations(), []);
  const { state, retry } = useAccessQuery(load, []);
  return (
    <AccessPage description={t("INVITATIONS_DESCRIPTION")} title={t("INVITATIONS_TITLE")}>
      <AccessQueryState isEmpty={(items) => items.length === 0} retry={retry} state={state}>
        {(items) => (
          <Card>
            <CardContent className="px-0">
              <ul>
                {items.map((invitation) => (
                  <InvitationRow invitation={invitation} key={invitation.invitationId} />
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </AccessQueryState>
    </AccessPage>
  );
}
