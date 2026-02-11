import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Avatar, Button as AntButton, Tag, Tooltip } from "antd";
import { Check, Minus } from "lucide-react";
import { useTranslation } from "react-i18next";

import { listSystemActivity, type ActivityEvent } from "@/api/activity";
import type {
  OrgRole,
  OrgUserStatus,
  OrganizationMember,
  OrganizationMemberWorkspace,
} from "@/api/organization-members";
import type { OrganizationRbacMatrixPermissionRow } from "@/api/organization-rbac";
import { ActivityDetailDialog } from "@/components/activity/activity-detail-dialog";
import { ActivityTimeline } from "@/components/activity/activity-timeline";
import { PageSkeleton } from "@/components/common/page-skeleton";
import { PageState } from "@/components/common/page-state";
import {
  ChromeTabs,
  ChromeTabsContent,
  ChromeTabsList,
  ChromeTabsTrigger,
} from "@/components/ui/chrome-tabs";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { type ResolvedMemberWorkspace, OrganizationMemberWorkspaceList } from "./organization-member-workspace-list";

type InspectTab = "role" | "workspaces" | "activity";

type RoleDisplay = {
  name: string;
  description: string | null;
};

type DisplayOrganizationPermission = OrganizationRbacMatrixPermissionRow & {
  displayName: string;
  displayDescription: string | null;
};

type OrganizationMemberInspectSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: OrganizationMember | null;
  currentUserId: string | null;
  roleDetailsByCode: Map<string, RoleDisplay>;
  rolesLoading: boolean;
  rolesError: unknown;
  workspaceDataLoading: boolean;
  workspaceDataError: unknown;
  resolveWorkspaces: (workspaces: OrganizationMemberWorkspace[]) => ResolvedMemberWorkspace[];
  workspaceLabelById: Record<string, string>;
  permissions: DisplayOrganizationPermission[];
  permissionsLoading: boolean;
  permissionsError: unknown;
  onEnterWorkspace: (workspaceId: string) => void;
  onAdjustRole: (member: OrganizationMember) => void;
  onRemoveMember: (member: OrganizationMember) => void;
};

function roleTagColor(role: OrgRole): string {
  if (role === "owner") return "gold";
  if (role === "admin") return "blue";
  return "default";
}

function userTagColor(status: OrgUserStatus): string {
  if (status === "active") return "green";
  if (status === "disabled") return "red";
  return "gold";
}

function userStatusLabel(
  t: (key: string, opts?: Record<string, unknown>) => string,
  status: OrgUserStatus,
): string {
  if (status === "active") return t("team:TEAM_USER_STATUS_ACTIVE");
  if (status === "disabled") return t("team:TEAM_USER_STATUS_DISABLED");
  return t("team:TEAM_USER_STATUS_LOCKED");
}

export function OrganizationMemberInspectSheet({
  open,
  onOpenChange,
  member,
  currentUserId,
  roleDetailsByCode,
  rolesLoading,
  rolesError,
  workspaceDataLoading,
  workspaceDataError,
  resolveWorkspaces,
  workspaceLabelById,
  permissions,
  permissionsLoading,
  permissionsError,
  onEnterWorkspace,
  onAdjustRole,
  onRemoveMember,
}: OrganizationMemberInspectSheetProps) {
  const { t } = useTranslation(["common", "team", "activity"]);
  const [tab, setTab] = useState<InspectTab>("role");
  const [selectedActivity, setSelectedActivity] = useState<ActivityEvent | null>(null);

  const activityScrollRef = useRef<HTMLDivElement | null>(null);
  const activitySentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      setTab("role");
      setSelectedActivity(null);
      return;
    }
    setTab("role");
    setSelectedActivity(null);
  }, [member?.membershipId, open]);

  const activityFrom = useMemo(() => {
    return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  }, []);

  const actorActivityQuery = useInfiniteQuery({
    queryKey: ["organization-member-inspect-activity", "actor", member?.userId, activityFrom],
    enabled: open && tab === "activity" && Boolean(member?.userId),
    queryFn: async ({ pageParam }) =>
      listSystemActivity({
        page: Number(pageParam) || 1,
        size: 20,
        actorUserId: member?.userId,
        occurredFrom: activityFrom,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.next ?? undefined,
    staleTime: 30 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const subjectActivityQuery = useInfiniteQuery({
    queryKey: ["organization-member-inspect-activity", "subject", member?.userId, activityFrom],
    enabled: open && tab === "activity" && Boolean(member?.userId),
    queryFn: async ({ pageParam }) =>
      listSystemActivity({
        page: Number(pageParam) || 1,
        size: 20,
        subjectUserId: member?.userId,
        occurredFrom: activityFrom,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.next ?? undefined,
    staleTime: 30 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const fetchNextActivityPage = useCallback(() => {
    if (actorActivityQuery.hasNextPage && !actorActivityQuery.isFetchingNextPage) {
      void actorActivityQuery.fetchNextPage();
    }
    if (subjectActivityQuery.hasNextPage && !subjectActivityQuery.isFetchingNextPage) {
      void subjectActivityQuery.fetchNextPage();
    }
  }, [
    actorActivityQuery.fetchNextPage,
    actorActivityQuery.hasNextPage,
    actorActivityQuery.isFetchingNextPage,
    subjectActivityQuery.fetchNextPage,
    subjectActivityQuery.hasNextPage,
    subjectActivityQuery.isFetchingNextPage,
  ]);

  const hasMoreActivity = Boolean(actorActivityQuery.hasNextPage || subjectActivityQuery.hasNextPage);
  const isFetchingNextActivityPage =
    actorActivityQuery.isFetchingNextPage || subjectActivityQuery.isFetchingNextPage;

  useEffect(() => {
    if (!open || tab !== "activity") return;
    const root = activityScrollRef.current;
    const target = activitySentinelRef.current;
    if (!root || !target) return;
    if (!hasMoreActivity || isFetchingNextActivityPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        if (!hasMoreActivity || isFetchingNextActivityPage) return;
        fetchNextActivityPage();
      },
      {
        root,
        rootMargin: "160px",
        threshold: 0,
      },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [fetchNextActivityPage, hasMoreActivity, isFetchingNextActivityPage, open, tab]);

  const activityItems = useMemo(() => {
    const map = new Map<string, ActivityEvent>();
    for (const page of actorActivityQuery.data?.pages ?? []) {
      for (const event of page.items ?? []) {
        map.set(event.id, event);
      }
    }
    for (const page of subjectActivityQuery.data?.pages ?? []) {
      for (const event of page.items ?? []) {
        map.set(event.id, event);
      }
    }
    return Array.from(map.values()).sort((a, b) => String(b.occurredAt).localeCompare(String(a.occurredAt)));
  }, [actorActivityQuery.data?.pages, subjectActivityQuery.data?.pages]);

  const activityLoading = actorActivityQuery.isLoading || subjectActivityQuery.isLoading;
  const activityError =
    activityItems.length === 0 ? actorActivityQuery.error || subjectActivityQuery.error : null;

  const resolvedWorkspaces = useMemo(() => {
    if (!member) return [];
    return resolveWorkspaces(member.workspaces);
  }, [member, resolveWorkspaces]);

  const roleDetail = useMemo<RoleDisplay | null>(() => {
    if (!member) return null;
    const fromMap = roleDetailsByCode.get(member.roleCode);
    if (fromMap?.name) return fromMap;

    const fallbackName = t(`common:ORG_ROLE_${member.role.toUpperCase()}`);
    const fallbackDesc = t(`common:ORG_ROLE_${member.role.toUpperCase()}_DESC`);
    return {
      name: fallbackName,
      description: fallbackDesc,
    };
  }, [member, roleDetailsByCode, t]);

  const roleNameByCode = useMemo(() => {
    const map = new Map<string, string>();
    for (const [code, role] of roleDetailsByCode.entries()) {
      map.set(code, role.name);
    }
    return map;
  }, [roleDetailsByCode]);

  const rolePermissions = useMemo(() => {
    if (!member) return [];
    const roleCode = member.roleCode || member.role;
    return permissions.map((permission) => ({
      ...permission,
      granted: permission.grantedRoleCodes.includes(roleCode),
    }));
  }, [member, permissions]);

  const isCurrentUser = Boolean(member && currentUserId && member.userId === currentUserId);
  const isOwnerSelf = Boolean(isCurrentUser && member?.role === "owner");
  const primary = member?.displayName || member?.username || "";
  const secondary = member?.email || "-";

  const leaveLabel = isOwnerSelf ? (
    <Tooltip title={t("common:ORG_MEMBERS_OWNER_SELF_REMOVE_BLOCKED")}>
      <span>{t("common:ORG_MEMBERS_ACTION_LEAVE_ORGANIZATION")}</span>
    </Tooltip>
  ) : (
    t("common:ORG_MEMBERS_ACTION_LEAVE_ORGANIZATION")
  );

  const removeLabel = isOwnerSelf ? (
    <Tooltip title={t("common:ORG_MEMBERS_OWNER_SELF_REMOVE_BLOCKED")}>
      <span>{t("common:DELETE")}</span>
    </Tooltip>
  ) : (
    t("common:DELETE")
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[860px] max-w-[96vw] gap-0 p-0">
        {member ? (
          <div className="flex h-full min-h-0 flex-col">
            <SheetHeader className="sticky top-0 z-10 border-b bg-gradient-to-b from-muted/40 to-background px-6 pb-5 pt-5">
              <SheetTitle>{t("common:ORG_MEMBERS_INSPECT_TITLE")}</SheetTitle>
              <SheetDescription>{t("common:ORG_MEMBERS_INSPECT_DESC")}</SheetDescription>

              <div className="p-2">
                <div className="flex items-center gap-3">
                  <Avatar
                    size={64}
                    shape="square"
                    src={member.avatarUrl ?? undefined}
                    style={{
                      backgroundColor: "var(--color-muted)",
                      color: "var(--color-foreground)",
                      flexShrink: 0,
                    }}
                  >
                    {primary.slice(0, 1).toUpperCase()}
                  </Avatar>

                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{primary}</div>
                    <div className="truncate text-muted-foreground">{secondary}</div>
                  </div>

                  <div className="flex flex-wrap justify-end gap-1">
                    <Tag color={roleTagColor(member.role)} style={{ marginInlineEnd: 0 }}>
                      {roleDetail?.name || t(`common:ORG_ROLE_${member.role.toUpperCase()}`)}
                    </Tag>
                    <Tag color={userTagColor(member.userStatus)} style={{ marginInlineEnd: 0 }}>
                      {userStatusLabel(t, member.userStatus)}
                    </Tag>
                  </div>
                </div>
              </div>
            </SheetHeader>

            <div className="min-h-0 flex-1 overflow-hidden px-6 pb-4 pt-3">
              <ChromeTabs value={tab} onValueChange={(next) => setTab(next as InspectTab)}>
                <ChromeTabsList className="w-auto">
                  <ChromeTabsTrigger value="role">{t("common:ORG_MEMBERS_INSPECT_TAB_ROLE")}</ChromeTabsTrigger>
                  <ChromeTabsTrigger value="workspaces">
                    {t("common:ORG_MEMBERS_INSPECT_TAB_WORKSPACES")}
                  </ChromeTabsTrigger>
                  <ChromeTabsTrigger value="activity">{t("common:ORG_MEMBERS_INSPECT_TAB_ACTIVITY")}</ChromeTabsTrigger>
                </ChromeTabsList>

                <ChromeTabsContent value="role" className="min-h-0 pt-3">
                  <div className="min-h-[360px]">
                    {rolesLoading || permissionsLoading ? (
                      <PageSkeleton variant="form" />
                    ) : (
                      <PageState
                        loading={false}
                        error={
                          roleDetail?.name
                            ? permissionsError && rolePermissions.length === 0
                              ? permissionsError
                              : null
                            : rolesError || permissionsError
                        }
                        empty={!roleDetail?.name}
                        emptyTitle={t("common:ORG_MEMBERS_INSPECT_ROLE_EMPTY_TITLE")}
                        emptyDescription={t("common:ORG_MEMBERS_INSPECT_ROLE_EMPTY_DESC")}
                        variant="compact"
                        className="py-4"
                      >
                        <div className="px-8 flex flex-col">
                          <div className="text-lg font-semibold">{roleDetail?.name || "-"}</div>

                          <p className="text-muted-foreground">
                            {roleDetail?.description || t("common:ORG_MEMBERS_INSPECT_ROLE_DESC_EMPTY")}
                          </p>

                          <div className="max-h-[50vh] overflow-auto">
                            <div className="mb-2 text-lg font-medium">{t("team:TEAM_ROLES_COL_PERMISSION")}</div>
                            <div className="grow divide-y overflow-auto rounded-md border">
                              {rolePermissions.map((permission) => (
                                <div key={permission.code} className="grid grid-cols-[1fr_auto] gap-3 px-3 py-2">
                                  <div className="min-w-0">
                                    <div className="truncate font-medium">{permission.displayName}</div>
                                    {permission.displayDescription ? (
                                      <p className="mt-0.5 line-clamp-2 text-muted-foreground">
                                        {permission.displayDescription}
                                      </p>
                                    ) : null}
                                  </div>
                                  <div className="pt-1">
                                    {permission.granted ? (
                                      <Check className="size-4 text-emerald-600" />
                                    ) : (
                                      <Minus className="size-4 text-muted-foreground" />
                                    )}
                                  </div>
                                </div>
                              ))}

                              {!rolePermissions.length ? (
                                <div className="px-3 py-6 text-center text-muted-foreground">
                                  {t("common:ORG_MEMBERS_INSPECT_ROLE_PERMISSIONS_EMPTY")}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </PageState>
                    )}
                  </div>
                </ChromeTabsContent>

                <ChromeTabsContent value="workspaces" className="min-h-0 pt-3">
                  <div className="min-h-[360px]">
                    {workspaceDataLoading ? (
                      <PageSkeleton variant="table" />
                    ) : (
                      <PageState
                        loading={false}
                        error={workspaceDataError && resolvedWorkspaces.length === 0 ? workspaceDataError : null}
                        empty={resolvedWorkspaces.length === 0}
                        emptyTitle={t("common:ORG_MEMBERS_INSPECT_WORKSPACES_EMPTY_TITLE")}
                        emptyDescription={t("common:ORG_MEMBERS_INSPECT_WORKSPACES_EMPTY_DESC")}
                        variant="compact"
                        className="py-4"
                      >
                        <div className="px-8">
                        <OrganizationMemberWorkspaceList
                          workspaces={resolvedWorkspaces}
                          roleNameByCode={roleNameByCode}
                          onEnterWorkspace={onEnterWorkspace}
                          searchable
                        />
                        </div>
                      </PageState>
                    )}
                  </div>
                </ChromeTabsContent>

                <ChromeTabsContent value="activity" className="min-h-0 pt-3">
                  <div className="min-h-[420px]">
                    {activityLoading ? (
                      <PageSkeleton variant="table" />
                    ) : (
                      <PageState
                        loading={false}
                        error={activityError}
                        onRetry={() => {
                          void actorActivityQuery.refetch();
                          void subjectActivityQuery.refetch();
                        }}
                        empty={activityItems.length === 0}
                        emptyTitle={t("activity:ACTIVITY_EMPTY_TITLE")}
                        emptyDescription={t("activity:ACTIVITY_EMPTY_DESC")}
                        variant="compact"
                      >
                        <div ref={activityScrollRef} className="max-h-[48vh] overflow-auto px-8">
                          <div className="py-3">
                            <ActivityTimeline
                              items={activityItems}
                              onSelect={(event) => setSelectedActivity(event)}
                              loading={isFetchingNextActivityPage}
                              titleSpan={4}
                            />
                            <div ref={activitySentinelRef} className="h-10" />
                          </div>
                        </div>
                      </PageState>
                    )}
                  </div>
                </ChromeTabsContent>
              </ChromeTabs>
            </div>

            <SheetFooter className="sticky bottom-0 border-t bg-background px-6 py-3">
              <div className="flex w-full items-center justify-end gap-2">
                <AntButton onClick={() => onAdjustRole(member)}>
                  {t("common:ORG_MEMBERS_ACTION_CHANGE_ROLE")}
                </AntButton>
                <AntButton
                  danger
                  disabled={isOwnerSelf}
                  onClick={() => {
                    if (isOwnerSelf) return;
                    onRemoveMember(member);
                  }}
                >
                  {isCurrentUser ? leaveLabel : removeLabel}
                </AntButton>
              </div>
            </SheetFooter>
          </div>
        ) : null}
      </SheetContent>

      <ActivityDetailDialog
        open={Boolean(selectedActivity)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setSelectedActivity(null);
          }
        }}
        event={selectedActivity}
        workspaceLabelById={workspaceLabelById}
      />
    </Sheet>
  );
}
