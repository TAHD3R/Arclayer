import { useEffect, useMemo, useRef, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Avatar, Button, Form, Input } from "antd";
import { AnimatePresence, motion } from "motion/react";
import { Building2, ChevronRight, ChevronsUpDown, Plus, RefreshCw, Search } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  createMyOrganization,
  listMyOrganizations,
  type CreateMyOrganizationInput,
  type MyOrganizationMemberPreview,
} from "@/api/me";
import {
  listAllOrganizationWorkspaces,
  type OrganizationWorkspace,
} from "@/api/organization-workspaces";
import { PageState } from "@/components/common/page-state";
import { SettingDialog } from "@/components/common/setting-dialog";
import {
  FloatingPanelContent,
  FloatingPanelRoot,
  FloatingPanelTrigger,
  useFloatingPanel,
} from "@/components/ui/floating-panel";
import { Skeleton } from "@/components/ui/skeleton";
import { buildOrganizationPath, parseOrganizationIdFromPath } from "@/lib/organization-routing";
import { switchWorkspacePath } from "@/lib/workspace-routing";
import { cn } from "@/lib/utils";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { useAuthStore } from "@/stores/use-auth-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

type OrganizationOption = {
  id: string;
  name: string;
  slug: string;
  role: "owner" | "admin" | "member";
  memberCount: number;
  membersPreview: MyOrganizationMemberPreview[];
};

type CreateOrganizationFormValues = {
  name: string;
};

function normalizeSearch(input: string): string {
  return String(input || "")
    .trim()
    .toLowerCase();
}

function firstLetter(input: string): string {
  const text = String(input || "").trim();
  if (!text) return "?";
  return text.slice(0, 1).toUpperCase();
}

function workspaceSearchText(workspace: OrganizationWorkspace): string {
  return [workspace.name, workspace.slug, workspace.description]
    .map((value) => String(value || "").toLowerCase())
    .join(" ");
}

function PanelListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2 px-3 py-2">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="rounded-md border border-border/60 px-3 py-2">
          <Skeleton className="h-4 w-3/4" />
        </div>
      ))}
    </div>
  );
}

const HOVER_CLOSE_DELAY_MS = 150;

type WorkspaceSwitcherPanelProps = {
  organizations: OrganizationOption[];
  organizationsLoading: boolean;
  organizationsFetching: boolean;
  organizationsError: unknown;
  onRetryOrganizations: () => void;
  currentOrganizationId: string | null;
  currentWorkspaceId: string | null;
  onSelectOrganization: (organizationId: string) => void;
  onSelectWorkspace: (workspaceId: string) => void;
  onOpenCreateOrganization: () => void;
};

function WorkspaceSwitcherPanel(props: WorkspaceSwitcherPanelProps) {
  const { t } = useTranslation(["common"]);
  const navigate = useNavigate();
  const { closeFloatingPanel } = useFloatingPanel();

  const [organizationSearch, setOrganizationSearch] = useState("");
  const [workspaceSearch, setWorkspaceSearch] = useState("");
  const [openWorkspaceOrganizationId, setOpenWorkspaceOrganizationId] = useState<string | null>(null);
  const closeTimerRef = useRef<number | null>(null);

  const cancelWorkspacePanelClose = () => {
    if (closeTimerRef.current === null) return;
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  };

  const scheduleWorkspacePanelClose = () => {
    cancelWorkspacePanelClose();
    closeTimerRef.current = window.setTimeout(() => {
      setOpenWorkspaceOrganizationId(null);
      setWorkspaceSearch("");
      closeTimerRef.current = null;
    }, HOVER_CLOSE_DELAY_MS);
  };

  const openWorkspacePanel = (organizationId: string) => {
    cancelWorkspacePanelClose();
    setOpenWorkspaceOrganizationId(organizationId);
  };

  useEffect(() => {
    return () => {
      if (closeTimerRef.current === null) return;
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    };
  }, []);

  const filteredOrganizations = useMemo(() => {
    const keyword = normalizeSearch(organizationSearch);
    if (!keyword) return props.organizations;

    return props.organizations.filter((organization) => {
      const text = [organization.name, organization.slug]
        .map((value) => String(value || "").toLowerCase())
        .join(" ");
      return text.includes(keyword);
    });
  }, [organizationSearch, props.organizations]);

  useEffect(() => {
    setWorkspaceSearch("");
  }, [openWorkspaceOrganizationId]);

  const hoveredOrganization = useMemo(() => {
    if (!openWorkspaceOrganizationId) return null;
    return (
      props.organizations.find((organization) => organization.id === openWorkspaceOrganizationId) ?? null
    );
  }, [openWorkspaceOrganizationId, props.organizations]);

  const canCreateWorkspace =
    hoveredOrganization?.role === "owner" || hoveredOrganization?.role === "admin";

  const workspaceQuery = useQuery({
    queryKey: ["organization", "workspaces", "switcher", openWorkspaceOrganizationId],
    enabled: Boolean(openWorkspaceOrganizationId),
    queryFn: async () =>
      listAllOrganizationWorkspaces({
        organizationId: String(openWorkspaceOrganizationId),
        archived: false,
        enterableOnly: true,
        pageSize: 100,
      }),
    staleTime: 60 * 1000,
    meta: { silent: true },
  });

  const filteredWorkspaces = useMemo(() => {
    const items = workspaceQuery.data ?? [];
    const keyword = normalizeSearch(workspaceSearch);
    if (!keyword) return items;
    return items.filter((workspace) => workspaceSearchText(workspace).includes(keyword));
  }, [workspaceQuery.data, workspaceSearch]);

  const orgKeyword = normalizeSearch(organizationSearch);
  const workspaceKeyword = normalizeSearch(workspaceSearch);

  const organizationEmpty = !props.organizations.length || filteredOrganizations.length === 0;

  const workspaceSource = workspaceQuery.data ?? [];
  const workspaceEmpty =
    !hoveredOrganization ||
    workspaceSource.length === 0 ||
    (workspaceSource.length > 0 && filteredWorkspaces.length === 0);

  const onRefresh = () => {
    props.onRetryOrganizations();
    if (openWorkspaceOrganizationId) {
      void workspaceQuery.refetch();
    }
  };

  return (
    <div className="relative w-[320px] max-w-[calc(100vw-20px)]">
      <aside
        className="flex h-[420px] min-h-0 min-w-0 flex-col"
        onMouseEnter={cancelWorkspacePanelClose}
        onMouseLeave={scheduleWorkspacePanelClose}
      >
        <div className="flex items-center gap-1 border-b border-border/60 p-2">
          <Button
            type="text"
            icon={
              <RefreshCw
                className={cn(
                  "size-4",
                  props.organizationsFetching || workspaceQuery.isFetching ? "animate-spin" : undefined,
                )}
              />
            }
            aria-label={t("common:REFRESH")}
            onClick={onRefresh}
          />
          <Input
            value={organizationSearch}
            onChange={(event) => setOrganizationSearch(event.target.value)}
            placeholder={t("common:WORKSPACE_SWITCHER_ORG_SEARCH_PLACEHOLDER")}
            allowClear
            variant="borderless"
            prefix={<Search className="size-4 text-muted-foreground" />}
          />
        </div>

        <div className="flex-1 min-h-0 overflow-auto py-2">
          {props.organizationsLoading ? (
            <PanelListSkeleton rows={6} />
          ) : (
            <PageState
              loading={false}
              error={props.organizationsError}
              onRetry={props.onRetryOrganizations}
              empty={organizationEmpty}
              variant="compact"
              className="py-4"
              emptyTitle={
                orgKeyword
                  ? t("common:WORKSPACE_SWITCHER_ORG_NO_RESULTS_TITLE")
                  : t("common:WORKSPACE_SWITCHER_ORG_EMPTY")
              }
              emptyDescription={
                orgKeyword
                  ? t("common:WORKSPACE_SWITCHER_ORG_NO_RESULTS_DESC")
                  : t("common:WORKSPACE_SWITCHER_ORG_EMPTY_DESC")
              }
            >
              <div className="flex flex-col gap-2 pl-2">
                {filteredOrganizations.map((organization) => {
                  const hovered = organization.id === openWorkspaceOrganizationId;
                  const current = organization.id === props.currentOrganizationId;
                  const selected = hovered || current;

                  return (
                    <button
                      key={organization.id}
                      type="button"
                      className={cn(
                        "group flex w-full cursor-pointer flex-col gap-2 rounded-md px-3 py-2 text-left transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0",
                        current
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                      onMouseEnter={() => openWorkspacePanel(organization.id)}
                      onMouseLeave={scheduleWorkspacePanelClose}
                      onFocus={() => openWorkspacePanel(organization.id)}
                      onClick={() => {
                        closeFloatingPanel();
                        props.onSelectOrganization(organization.id);
                      }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 space-y-1">
                          <div
                            className={cn(
                              "truncate font-medium",
                              selected ? "text-accent-foreground" : "text-foreground",
                            )}
                          >
                            {organization.name}
                          </div>
                          <div
                            className="flex items-center gap-2 text-md text-muted-foreground"
                          >
                            {organization.membersPreview.length ? (
                              <Avatar.Group size={18} max={{ count: 4 }}>
                                {organization.membersPreview.map((member) => {
                                  const primary = member.displayName || member.username;
                                  return (
                                    <Avatar key={member.userId} src={member.avatarUrl ?? undefined}>
                                      {firstLetter(primary)}
                                    </Avatar>
                                  );
                                })}
                              </Avatar.Group>
                            ) : null}
                            <span>
                              {t("common:WORKSPACE_SWITCHER_ORG_MEMBERS_COUNT", {
                                count: organization.memberCount,
                              })}
                            </span>
                          </div>
                        </div>

                        <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      </div>
                    </button>
                  );
                })}
              </div>
            </PageState>
          )}
        </div>

        <div className="border-t border-border/60 p-2">
          <Button
            type="link"
            block
            className="justify-start px-0"
            icon={<Plus className="size-4" aria-hidden="true" />}
            onClick={() => {
              closeFloatingPanel();
              props.onOpenCreateOrganization();
            }}
          >
            {t("common:WORKSPACE_SWITCHER_CREATE_ORG")}
          </Button>
        </div>
      </aside>

      <AnimatePresence initial={false}>
        {hoveredOrganization ? (
          <motion.section
            key="workspace-flyout"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.16, ease: [0.2, 0, 0, 1] }}
            className={cn(
              "absolute left-full top-0 z-10 ml-2",
              "flex h-[420px] min-h-0 w-[430px] min-w-0 flex-col overflow-hidden",
              "rounded-xl border border-border bg-popover text-popover-foreground shadow-lg",
            )}
            onMouseEnter={cancelWorkspacePanelClose}
            onMouseLeave={scheduleWorkspacePanelClose}
          >
            <div className="flex items-center gap-1 border-b border-border/60 p-2">
              <Button
                type="text"
                icon={
                  <RefreshCw
                    className={cn("size-4", workspaceQuery.isFetching ? "animate-spin" : undefined)}
                  />
                }
                aria-label={t("common:REFRESH")}
                onClick={() => {
                  void workspaceQuery.refetch();
                }}
              />
              <Input
                value={workspaceSearch}
                onChange={(event) => setWorkspaceSearch(event.target.value)}
                placeholder={t("common:WORKSPACE_SWITCHER_WORKSPACE_SEARCH_PLACEHOLDER")}
                allowClear
                variant="borderless"
                prefix={<Search className="size-4 text-muted-foreground" />}
              />
            </div>

            <div className="flex-1 min-h-0 overflow-auto py-2">
              {workspaceQuery.isLoading ? (
                <PanelListSkeleton rows={7} />
              ) : (
                <PageState
                  loading={false}
                  error={workspaceQuery.error}
                  onRetry={() => {
                    void workspaceQuery.refetch();
                  }}
                  empty={workspaceEmpty}
                  variant="compact"
                  className="py-4"
                  emptyTitle={
                    workspaceKeyword
                      ? t("common:WORKSPACE_SWITCHER_WORKSPACE_NO_RESULTS_TITLE")
                      : t("common:WORKSPACE_SWITCHER_WORKSPACE_EMPTY")
                  }
                  emptyDescription={
                    workspaceKeyword
                      ? t("common:WORKSPACE_SWITCHER_WORKSPACE_NO_RESULTS_DESC")
                      : t("common:WORKSPACE_SWITCHER_WORKSPACE_EMPTY_DESC")
                  }
                >
                  <div className="flex flex-col gap-2 pl-2">
                    {filteredWorkspaces.map((workspace) => {
                      const title = workspace.name || workspace.slug;
                      const description =
                        workspace.description || t("common:ORG_WORKSPACES_DESCRIPTION_FALLBACK");
                      const current = workspace.workspaceId === props.currentWorkspaceId;

                      return (
                        <button
                          key={workspace.workspaceId}
                          type="button"
                          className={cn(
                            "flex w-full cursor-pointer flex-col gap-2 rounded-md px-3 py-2 text-left transition-colors",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0",
                            current
                              ? "bg-accent text-accent-foreground"
                              : "text-muted-foreground hover:bg-muted hover:text-foreground",
                          )}
                          onClick={() => {
                            closeFloatingPanel();
                            props.onSelectWorkspace(workspace.workspaceId);
                          }}
                        >
                          <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
                            <Avatar
                              size={30}
                              src={workspace.iconUrl ?? undefined}
                              className="shrink-0 bg-muted text-foreground"
                            >
                              {firstLetter(title)}
                            </Avatar>

                            <div className="min-w-0">
                              <div
                                className={cn(
                                  "truncate font-medium",
                                  current ? "text-accent-foreground" : "text-foreground",
                                )}
                              >
                                {title}
                              </div>
                              <div
                                className={cn(
                                  "truncate text-md",
                                  current ? "text-accent-foreground/80" : "text-muted-foreground",
                                )}
                              >
                                {description}
                              </div>
                            </div>

                            <div className="flex items-center gap-2 text-md text-muted-foreground">
                              {workspace.membersPreview.length ? (
                                <Avatar.Group size={18} max={{ count: 3 }}>
                                  {workspace.membersPreview.map((member) => {
                                    const primary = member.displayName || member.username;
                                    return (
                                      <Avatar key={member.userId} src={member.avatarUrl ?? undefined}>
                                        {firstLetter(primary)}
                                      </Avatar>
                                    );
                                  })}
                                </Avatar.Group>
                              ) : null}
                              <span>
                                {t("common:ORG_WORKSPACES_MEMBERS_COUNT", {
                                  count: workspace.memberCount,
                                })}
                              </span>
                              <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </PageState>
              )}
            </div>

            <div className="border-t border-border/60 p-2">
              <Button
                type="link"
                block
                className="justify-start px-0"
                icon={<Plus className="size-4" aria-hidden="true" />}
                disabled={!canCreateWorkspace}
                onClick={() => {
                  if (!canCreateWorkspace) return;
                  closeFloatingPanel();
                  void navigate({
                    to: buildOrganizationPath(hoveredOrganization.id, "/workspaces"),
                    search: { create: "1" } as never,
                  });
                }}
              >
                {t("common:WORKSPACE_SWITCHER_CREATE")}
              </Button>
            </div>
          </motion.section>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export function AdminWorkspaceSwitcher() {
  const { t } = useTranslation(["common"]);
  const accessToken = useAuthStore((state) => state.accessToken);
  const currentWorkspaceId = useWorkspaceStore((state) => state.currentWorkspaceId);
  const setCurrentWorkspaceId = useWorkspaceStore((state) => state.setCurrentWorkspaceId);
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const queryClient = useQueryClient();

  const [createOrganizationOpen, setCreateOrganizationOpen] = useState(false);
  const [createOrganizationForm] = Form.useForm<CreateOrganizationFormValues>();

  const organizationsQuery = useQuery({
    queryKey: ["organization", "me", "organizations", "switcher"],
    enabled: Boolean(accessToken),
    queryFn: listMyOrganizations,
    staleTime: 5 * 60 * 1000,
    meta: { silent: true },
  });

  const createOrganizationMutation = useMutation({
    mutationFn: async (payload: CreateMyOrganizationInput) => createMyOrganization(payload),
    onSuccess: async (created) => {
      notifySuccessText(t("common:ACTION_SUCCESS"));
      setCreateOrganizationOpen(false);
      createOrganizationForm.resetFields();
      await queryClient.invalidateQueries({ queryKey: ["organization", "me", "organizations", "switcher"] });
      void navigate({
        to: buildOrganizationPath(created.organization.id, "/workspaces"),
        search: { create: "1" } as never,
      });
    },
    onError: (error) => notifyError(error),
  });

  const organizations = useMemo<OrganizationOption[]>(() => {
    const items = organizationsQuery.data?.items ?? [];
    return items
      .filter((item) => item.membership.status === "active")
      .map((item) => ({
        id: item.organization.id,
        name: item.organization.name,
        slug: item.organization.slug,
        role: item.membership.role,
        memberCount: item.memberCount,
        membersPreview: item.membersPreview,
      }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [organizationsQuery.data?.items]);

  const routeOrganizationId = parseOrganizationIdFromPath(pathname);
  const currentOrganization = useMemo(() => {
    if (!organizations.length) return null;
    if (routeOrganizationId) {
      const matched = organizations.find((item) => item.id === routeOrganizationId);
      if (matched) return matched;
    }
    return organizations[0] ?? null;
  }, [organizations, routeOrganizationId]);

  const triggerClassName = cn(
    "group flex h-12 w-full items-center justify-between gap-2 rounded-none border-0 bg-transparent px-4 text-left",
    "text-muted-foreground transition-colors duration-150 ease-out",
    "hover:bg-primary hover:text-sidebar-accent-foreground",
    "data-[state=open]:bg-primary data-[state=open]:text-sidebar-accent-foreground",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0",
  );

  return (
    <>
      <FloatingPanelRoot className="w-full">
        <FloatingPanelTrigger
          title={t("common:WORKSPACE_SWITCHER_TRIGGER")}
          className={triggerClassName}
        >
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <Building2 className="size-4 shrink-0 opacity-80" aria-hidden="true" />
            <span className="truncate font-semibold">
              {currentOrganization?.name || t("common:WORKSPACE_SWITCHER_TRIGGER")}
            </span>
          </span>
          <ChevronsUpDown
            className="size-4 shrink-0 opacity-70 transition-colors group-hover:opacity-100"
            aria-hidden="true"
          />
        </FloatingPanelTrigger>

        <FloatingPanelContent placement="top" showTitle={false} className="overflow-visible p-0">
          <WorkspaceSwitcherPanel
            organizations={organizations}
            organizationsLoading={organizationsQuery.isLoading}
            organizationsFetching={organizationsQuery.isFetching}
            organizationsError={organizationsQuery.error}
            onRetryOrganizations={() => {
              void organizationsQuery.refetch();
            }}
            currentOrganizationId={currentOrganization?.id ?? null}
            currentWorkspaceId={currentWorkspaceId}
            onSelectOrganization={(organizationId) => {
              void navigate({ to: buildOrganizationPath(organizationId) });
            }}
            onSelectWorkspace={(nextWorkspaceId) => {
              setCurrentWorkspaceId(nextWorkspaceId);
              const nextPath = switchWorkspacePath({
                pathname,
                currentWorkspaceId,
                nextWorkspaceId,
              });
              void navigate({ to: nextPath as never });
            }}
            onOpenCreateOrganization={() => {
              setCreateOrganizationOpen(true);
            }}
          />
        </FloatingPanelContent>
      </FloatingPanelRoot>

      <SettingDialog
        open={createOrganizationOpen}
        onOpenChange={(open) => {
          if (createOrganizationMutation.isPending) return;
          setCreateOrganizationOpen(open);
        }}
        title={t("common:WORKSPACE_SWITCHER_CREATE_ORG")}
        description={t("common:WORKSPACE_SWITCHER_CREATE_ORG_DESC")}
        contentClassName="max-w-[460px]"
        footer={
          <>
            <Button
              onClick={() => {
                if (createOrganizationMutation.isPending) return;
                setCreateOrganizationOpen(false);
              }}
            >
              {t("common:CANCEL")}
            </Button>
            <Button
              type="primary"
              loading={createOrganizationMutation.isPending}
              onClick={() => {
                void createOrganizationForm.submit();
              }}
            >
              {t("common:WORKSPACE_SWITCHER_CREATE_ORG_CONFIRM")}
            </Button>
          </>
        }
      >
        <Form<CreateOrganizationFormValues>
          form={createOrganizationForm}
          layout="vertical"
          preserve={false}
          onFinish={async (values) => {
            const name = String(values.name || "").trim();
            await createOrganizationMutation.mutateAsync({ name });
          }}
        >
          <Form.Item
            label={t("common:WORKSPACE_SWITCHER_CREATE_ORG_NAME_LABEL")}
            name="name"
            rules={[
              { required: true, message: t("common:WORKSPACE_SWITCHER_CREATE_ORG_NAME_REQUIRED") },
              { max: 128, message: t("common:WORKSPACE_SWITCHER_CREATE_ORG_NAME_MAX") },
            ]}
          >
            <Input placeholder={t("common:WORKSPACE_SWITCHER_CREATE_ORG_NAME_PLACEHOLDER")} />
          </Form.Item>
        </Form>
      </SettingDialog>
    </>
  );
}
