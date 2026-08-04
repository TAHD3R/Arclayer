import { Link } from "@tanstack/react-router";
import {
  KeyRound,
  LaptopMinimal,
  MoreHorizontal,
  Plus,
  ShieldCheck,
  UserRoundCog,
  UserRoundX,
} from "lucide-react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  PlatformInvitationDetailOut,
  PlatformRoleCatalogItemOut,
  PlatformTeamOperatorOut,
  PlatformTeamQueueOut,
  PlatformTeamUserOut,
} from "@arclayer/platform-openapi";

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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
type OperatorAction = Readonly<{
  kind: "roles" | "sessions" | "reset-mfa" | "offboard";
  operator: PlatformTeamOperatorOut;
}>;

function person(user: PlatformTeamUserOut) {
  return user.displayName ?? user.username;
}

export function PlatformTeamPage() {
  const { t } = useTranslation("access");
  const [tab, setTab] = useState<TeamTab>("operators");
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
          <TabsList>
            <TabsTrigger value="operators">{t("TEAM_TAB_OPERATORS")}</TabsTrigger>
            <TabsTrigger value="invitations">{t("TEAM_TAB_INVITATIONS")}</TabsTrigger>
            <TabsTrigger value="removed">{t("TEAM_TAB_REMOVED")}</TabsTrigger>
          </TabsList>
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
                  <OwnerCard team={data.team} />
                  <OperatorDirectory
                    canManageRoles={canManageRoles}
                    canReadSessions={canReadSessions}
                    canRemove={canRemove}
                    canResetMfa={canResetMfa}
                    currentUserId={data.identity.userId}
                    onAction={setOperatorAction}
                    operators={data.team.operators.filter(
                      (operator) => operator.status !== "deactivated",
                    )}
                    roles={data.roles}
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
                  <OperatorDirectory
                    canManageRoles={false}
                    canReadSessions={false}
                    canRemove={false}
                    canResetMfa={false}
                    currentUserId={data.identity.userId}
                    onAction={setOperatorAction}
                    operators={data.team.operators.filter(
                      (operator) => operator.status === "deactivated",
                    )}
                    roles={data.roles}
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

function OwnerCard({ team }: Readonly<{ team: PlatformTeamQueueOut }>) {
  const { t } = useTranslation("access");
  return (
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
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="font-medium">{person(team.owner.user)}</p>
              <p className="text-sm text-muted-foreground">{team.owner.user.username}</p>
            </div>
            <div className="text-sm text-muted-foreground">
              {t("MFA_SUMMARY", { count: team.owner.mfa.verifiedMethodCount })} ·{" "}
              {t("SESSION_SUMMARY", { count: team.owner.sessions.activeSessionCount })}
            </div>
          </div>
        ) : (
          <p className="text-base text-muted-foreground">{t("OWNER_EMPTY")}</p>
        )}
      </CardContent>
    </Card>
  );
}

function OperatorDirectory({
  canManageRoles,
  canReadSessions,
  canRemove,
  canResetMfa,
  currentUserId,
  onAction,
  operators,
}: Readonly<{
  canManageRoles: boolean;
  canReadSessions: boolean;
  canRemove: boolean;
  canResetMfa: boolean;
  currentUserId: string;
  onAction: (action: OperatorAction) => void;
  operators: PlatformTeamOperatorOut[];
  roles: readonly PlatformRoleCatalogItemOut[];
}>) {
  const { t } = useTranslation("access");
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("OPERATORS_TITLE")}</CardTitle>
        <CardDescription>{t("OPERATORS_DESCRIPTION")}</CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        {operators.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("OPERATOR_COLUMN_PERSON")}</TableHead>
                <TableHead>{t("OPERATOR_COLUMN_ROLES")}</TableHead>
                <TableHead>{t("OPERATOR_COLUMN_SECURITY")}</TableHead>
                <TableHead>{t("OPERATOR_COLUMN_STATUS")}</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">{t("ACTIONS")}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {operators.map((operator) => (
                <TableRow key={operator.operatorId}>
                  <TableCell>
                    <p className="font-medium">{person(operator.user)}</p>
                    <p className="text-sm text-muted-foreground">{operator.user.username}</p>
                  </TableCell>
                  <TableCell>
                    <div className="flex max-w-md flex-wrap gap-1.5">
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
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    <p>{t("MFA_SUMMARY", { count: operator.mfa.verifiedMethodCount })}</p>
                    <p>{t("SESSION_SUMMARY", { count: operator.sessions.activeSessionCount })}</p>
                  </TableCell>
                  <TableCell>
                    <Badge variant={operator.status === "active" ? "secondary" : "outline"}>
                      {t(`OPERATOR_${operator.status.toUpperCase()}`)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {operator.status !== "deactivated" &&
                    (canManageRoles ||
                      ((canReadSessions || canResetMfa || canRemove) &&
                        operator.user.userId !== currentUserId)) ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            aria-label={t("OPERATOR_ACTIONS", { name: person(operator.user) })}
                            size="icon"
                            variant="ghost"
                          >
                            <MoreHorizontal aria-hidden="true" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {canManageRoles ? (
                            <DropdownMenuItem
                              onSelect={() => onAction({ kind: "roles", operator })}
                            >
                              <UserRoundCog aria-hidden="true" />
                              {t("MANAGE_ROLES")}
                            </DropdownMenuItem>
                          ) : null}
                          {canReadSessions && operator.user.userId !== currentUserId ? (
                            <DropdownMenuItem
                              onSelect={() => onAction({ kind: "sessions", operator })}
                            >
                              <LaptopMinimal aria-hidden="true" />
                              {t("VIEW_OPERATOR_SESSIONS")}
                            </DropdownMenuItem>
                          ) : null}
                          {canResetMfa && operator.user.userId !== currentUserId ? (
                            <DropdownMenuItem
                              onSelect={() => onAction({ kind: "reset-mfa", operator })}
                            >
                              <KeyRound aria-hidden="true" />
                              {t("RESET_OPERATOR_MFA")}
                            </DropdownMenuItem>
                          ) : null}
                          {(canManageRoles || canReadSessions || canResetMfa) &&
                          canRemove &&
                          operator.user.userId !== currentUserId ? (
                            <DropdownMenuSeparator />
                          ) : null}
                          {canRemove && operator.user.userId !== currentUserId ? (
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onSelect={() => onAction({ kind: "offboard", operator })}
                            >
                              <UserRoundX aria-hidden="true" />
                              {t("REMOVE_PLATFORM_ACCESS")}
                            </DropdownMenuItem>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="px-5 py-8 text-center text-base text-muted-foreground">
            {t("OPERATORS_EMPTY")}
          </p>
        )}
      </CardContent>
    </Card>
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
