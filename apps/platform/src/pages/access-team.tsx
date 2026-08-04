import { Link } from "@tanstack/react-router";
import { Plus, Search } from "lucide-react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import type { PlatformInvitationDetailOut, PlatformTeamUserOut } from "@arclayer/platform-openapi";

import {
  getCurrentPlatformTeamIdentity,
  getPlatformInvitation,
  getPlatformTeam,
  listPlatformInvitations,
  listPlatformRoles,
} from "@/access/access-api";
import { AccessPage, AccessQueryState, useAccessQuery } from "@/access/access-ui";
import {
  InviteOperatorDialog,
  ManageOperatorRolesDialog,
  OffboardOperatorDialog,
  OperatorSessionsDrawer,
  ResetOperatorMfaDialog,
  RevokeInvitationDialog,
} from "@/access/platform-team-dialogs";
import { PlatformTeamTable, type PlatformTeamMemberAction } from "@/access/platform-team-table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDateTime } from "@/monitoring/format";

type TeamTab = "operators" | "invitations" | "removed";
type OperatorAction = PlatformTeamMemberAction;

function person(user: PlatformTeamUserOut) {
  return user.displayName ?? user.username;
}

export function PlatformTeamPage() {
  const { t } = useTranslation("access");
  const [tab, setTab] = useState<TeamTab>("operators");
  const [memberQuery, setMemberQuery] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [operatorAction, setOperatorAction] = useState<OperatorAction | null>(null);
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
  const ready = state.status === "ready" ? state.data : null;
  const canInvite = Boolean(
    ready?.identity.isInstanceOwner ||
    ready?.identity.effectivePermissions.includes("platform:access-team:invite"),
  );

  return (
    <Tabs value={tab} onValueChange={(value) => setTab(value as TeamTab)}>
      <AccessPage
        description={t("TEAM_DESCRIPTION")}
        extra={
          <div className="flex flex-wrap items-center gap-3">
            {tab !== "invitations" ? (
              <div className="relative min-w-56 flex-1 sm:max-w-xs">
                <Search
                  aria-hidden="true"
                  className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  aria-label={t("TEAM_MEMBER_SEARCH")}
                  className="pl-9"
                  onChange={(event) => setMemberQuery(event.target.value)}
                  placeholder={t("TEAM_MEMBER_SEARCH_PLACEHOLDER")}
                  value={memberQuery}
                />
              </div>
            ) : null}
            <TabsList>
              <TabsTrigger value="operators">{t("TEAM_TAB_OPERATORS")}</TabsTrigger>
              <TabsTrigger value="invitations">{t("TEAM_TAB_INVITATIONS")}</TabsTrigger>
              <TabsTrigger value="removed">{t("TEAM_TAB_REMOVED")}</TabsTrigger>
            </TabsList>
          </div>
        }
        primaryAction={
          canInvite ? (
            <Button onClick={() => setInviteOpen(true)}>
              <Plus aria-hidden="true" />
              {t("INVITE_OPERATOR")}
            </Button>
          ) : undefined
        }
        title={t("TEAM_TITLE")}
      >
        {successKey ? (
          <Alert role="status">
            <AlertDescription>{t(successKey)}</AlertDescription>
          </Alert>
        ) : null}
        <AccessQueryState
          isEmpty={(data) =>
            !data.team.owner &&
            data.team.operators.length === 0 &&
            data.team.invitations.length === 0
          }
          retry={retry}
          state={state}
        >
          {(data) => {
            const canManageRoles =
              data.identity.isInstanceOwner ||
              data.identity.effectivePermissions.includes("platform:access-roles:manage");
            const canRemove =
              data.identity.isInstanceOwner ||
              data.identity.effectivePermissions.includes("platform:access-team:remove");
            const canReadSessions =
              data.identity.isInstanceOwner ||
              data.identity.effectivePermissions.includes("platform:access-sessions:read");
            const canRevokeSessions =
              data.identity.isInstanceOwner ||
              data.identity.effectivePermissions.includes("platform:access-sessions:revoke");
            const canResetMfa =
              data.identity.isInstanceOwner ||
              data.identity.effectivePermissions.includes("platform:access-mfa:reset");
            const complete = (messageKey: string) => {
              setSuccessKey(messageKey);
              retry();
            };
            return (
              <>
                <TabsContent className="mt-0 space-y-5" value="operators">
                  <PlatformTeamTable
                    capabilities={{
                      canManageRoles,
                      canReadSessions,
                      canRemove,
                      canResetMfa,
                    }}
                    currentUserId={data.identity.userId}
                    includeOwner
                    onAction={setOperatorAction}
                    operators={data.team.operators.filter(
                      (operator) => operator.status !== "deactivated",
                    )}
                    owner={data.team.owner}
                    query={memberQuery}
                  />
                </TabsContent>
                <TabsContent className="mt-0" value="invitations">
                  <InvitationDirectory
                    canRevoke={canInvite}
                    invitations={data.team.invitations}
                    onRevoke={setRevokeInvitation}
                  />
                </TabsContent>
                <TabsContent className="mt-0" value="removed">
                  <PlatformTeamTable
                    capabilities={{
                      canManageRoles: false,
                      canReadSessions: false,
                      canRemove: false,
                      canResetMfa: false,
                    }}
                    currentUserId={data.identity.userId}
                    includeOwner={false}
                    onAction={setOperatorAction}
                    operators={data.team.operators.filter(
                      (operator) => operator.status === "deactivated",
                    )}
                    owner={null}
                    query={memberQuery}
                  />
                </TabsContent>
                {inviteOpen ? (
                  <InviteOperatorDialog onCompleted={complete} onOpenChange={setInviteOpen} open />
                ) : null}
                {operatorAction?.kind === "roles" ? (
                  <ManageOperatorRolesDialog
                    onCompleted={complete}
                    onOpenChange={(open) => !open && setOperatorAction(null)}
                    open
                    operator={operatorAction.operator}
                    roles={data.roles}
                  />
                ) : null}
                {operatorAction?.kind === "offboard" ? (
                  <OffboardOperatorDialog
                    onCompleted={complete}
                    onOpenChange={(open) => !open && setOperatorAction(null)}
                    open
                    operator={operatorAction.operator}
                    roles={data.roles}
                  />
                ) : null}
                {operatorAction?.kind === "sessions" ? (
                  <OperatorSessionsDrawer
                    canRevoke={canRevokeSessions}
                    onCompleted={complete}
                    onOpenChange={(open) => !open && setOperatorAction(null)}
                    open
                    operator={operatorAction.operator}
                  />
                ) : null}
                {operatorAction?.kind === "reset-mfa" ? (
                  <ResetOperatorMfaDialog
                    onCompleted={complete}
                    onOpenChange={(open) => !open && setOperatorAction(null)}
                    open
                    operator={operatorAction.operator}
                  />
                ) : null}
                {revokeInvitation ? (
                  <RevokeInvitationDialog
                    invitation={revokeInvitation}
                    onCompleted={complete}
                    onOpenChange={(open) => !open && setRevokeInvitation(null)}
                    open
                  />
                ) : null}
              </>
            );
          }}
        </AccessQueryState>
      </AccessPage>
    </Tabs>
  );
}

function InvitationDirectory({
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
    <Card>
      <CardHeader>
        <CardTitle>{t("INVITATIONS_TITLE")}</CardTitle>
        <CardDescription>{t("INVITATIONS_DESCRIPTION")}</CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        {invitations.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("INVITATION_COLUMN_PERSON")}</TableHead>
                <TableHead>{t("INVITATION_COLUMN_ROLES")}</TableHead>
                <TableHead>{t("INVITATION_COLUMN_EXPIRES")}</TableHead>
                <TableHead>{t("STATUS")}</TableHead>
                <TableHead className="text-right">{t("ACTIONS")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invitations.map((invitation) => (
                <TableRow key={invitation.invitationId}>
                  <TableCell>
                    <p className="font-medium">{person(invitation.recipient)}</p>
                    <p className="text-sm text-muted-foreground">
                      {t("INVITED_BY", { name: person(invitation.inviter) })}
                    </p>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1.5">
                      {invitation.roles.map((role) => (
                        <Badge key={role.roleId} variant="secondary">
                          {role.name}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>{formatDateTime(invitation.expiresAt)}</TableCell>
                  <TableCell>
                    <Badge variant={invitation.isEffective ? "secondary" : "outline"}>
                      {t(`INVITATION_${invitation.status.toUpperCase()}`)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button asChild size="sm" variant="outline">
                        <Link
                          params={{ invitationId: invitation.invitationId }}
                          to="/access/team/invitations/$invitationId"
                        >
                          {t("VIEW_DETAILS")}
                        </Link>
                      </Button>
                      {canRevoke && invitation.isEffective ? (
                        <Button onClick={() => onRevoke(invitation)} size="sm" variant="ghost">
                          {t("REVOKE_INVITATION")}
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="px-5 py-8 text-center text-base text-muted-foreground">
            {t("INVITATIONS_EMPTY")}
          </p>
        )}
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
          <InvitationDirectory
            canRevoke={false}
            invitations={[invitation]}
            onRevoke={() => undefined}
          />
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
          <InvitationDirectory canRevoke={false} invitations={items} onRevoke={() => undefined} />
        )}
      </AccessQueryState>
    </AccessPage>
  );
}
