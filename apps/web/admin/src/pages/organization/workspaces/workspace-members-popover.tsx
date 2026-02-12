import { useEffect, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { Avatar, Button as AntButton, Input, List, Pagination, Popover, Spin } from "antd";
import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  listOrganizationWorkspaceMembers,
  type OrganizationWorkspace,
  type OrganizationWorkspaceMember,
} from "@/api/organization-workspaces";

function normalizeQuery(input: string): string {
  return String(input || "").trim();
}

export function WorkspaceMembersPopover({ workspace }: { workspace: OrganizationWorkspace }) {
  const { t } = useTranslation(["common"]);
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [rawQ, setRawQ] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => {
    const handle = window.setTimeout(() => setQ(normalizeQuery(rawQ)), 250);
    return () => window.clearTimeout(handle);
  }, [rawQ]);

  useEffect(() => {
    if (!open) return;
    setPage(1);
  }, [open, q]);

  const membersQuery = useQuery({
    queryKey: ["organization-workspace-members", workspace.workspaceId, page, q],
    enabled: open && workspace.memberCount > 0,
    queryFn: async () =>
      listOrganizationWorkspaceMembers(workspace.organizationId, workspace.workspaceId, {
        page,
        size: 10,
        q,
      }),
    retry: false,
    meta: { silent: true },
  });

  const renderMember = (member: OrganizationWorkspaceMember) => {
    const primary = member.displayName || member.username || member.email || "U";
    return (
      <List.Item key={member.membershipId} className="py-2">
        <div className="flex w-full items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <Avatar src={member.avatarUrl ?? undefined}>{primary.slice(0, 1).toUpperCase()}</Avatar>
            <div className="min-w-0">
              <div className="truncate font-medium">{primary}</div>
              <div className="truncate text-muted-foreground">{member.email || "-"}</div>
            </div>
          </div>
        </div>
      </List.Item>
    );
  };

  const content = (
    <div className="w-80 max-w-[85vw]">
      <div className="flex items-center justify-between gap-2">
        <div className="font-semibold">{t("common:ORG_WORKSPACES_MEMBERS_POPOVER_TITLE")}</div>
      </div>

      <Input
        className="mt-3"
        allowClear
        value={rawQ}
        onChange={(event) => setRawQ(event.target.value)}
        prefix={<Search className="size-4 text-muted-foreground" />}
        placeholder={t("common:ORG_WORKSPACES_MEMBERS_SEARCH_PLACEHOLDER")}
      />

      <div className="mt-3">
        {membersQuery.isLoading ? (
          <div className="flex justify-center py-8">
            <Spin />
          </div>
        ) : membersQuery.isError ? (
          <div className="py-6 text-center">
            <div className="text-muted-foreground">{t("common:REQUEST_FAILED")}</div>
            <AntButton className="mt-2" onClick={() => void membersQuery.refetch()}>
              {t("common:RETRY")}
            </AntButton>
          </div>
        ) : (
          <>
            <List
              dataSource={membersQuery.data?.items ?? []}
              locale={{ emptyText: t("common:EMPTY_DESC") }}
              renderItem={renderMember}
            />

            {(membersQuery.data?.pages || 0) > 1 ? (
              <div className="mt-3 flex justify-end">
                <Pagination
                  current={page}
                  total={membersQuery.data?.total || 0}
                  pageSize={membersQuery.data?.size || 10}
                  showSizeChanger={false}
                  onChange={(next) => setPage(next)}
                />
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );

  return (
    <Popover
      trigger="click"
      placement="bottomLeft"
      open={open}
      onOpenChange={(next) => setOpen(next)}
      content={content}
    >
      <button
        type="button"
        className="inline-flex items-center gap-2 rounded-md px-2 py-1 transition-colors hover:bg-accent"
      >
        <Avatar.Group max={{ count: 4 }}>
          {workspace.membersPreview.map((member) => {
            const primary = member.displayName || member.username || member.email || "U";
            return (
              <Avatar key={member.userId} src={member.avatarUrl ?? undefined}>
                {primary.slice(0, 1).toUpperCase()}
              </Avatar>
            );
          })}
        </Avatar.Group>
        <span className="font-medium">
          {t("common:ORG_WORKSPACES_MEMBERS_COUNT", { count: workspace.memberCount })}
        </span>
      </button>
    </Popover>
  );
}
