import { useEffect, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { Avatar, Button as AntButton, Input, List, Pagination } from "antd";
import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";

import { listOrganizationWorkspaceMembers } from "@/api/organization-workspaces";
import type { OrganizationWorkspace, OrganizationWorkspaceMember } from "@/types/api";
import { LoaderOne } from "@celestial/ui/loader";
import { Popover, PopoverContent, PopoverTrigger } from "@celestial/ui/popover";

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
        <div className="flex w-full items-center gap-2">
          <Avatar src={member.avatarUrl ?? undefined}>{primary.slice(0, 1).toUpperCase()}</Avatar>
          <div className="min-w-0">
            <div className="truncate font-medium">{primary}</div>
            <div className="truncate text-label-secondary">{member.email || "-"}</div>
          </div>
        </div>
      </List.Item>
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <AntButton
          type="text"
          className="!h-auto !px-2 !py-1 !font-medium !text-foreground hover:!bg-accent"
          autoInsertSpace={false}
        >
          {t("common:ORG_WORKSPACES_MEMBERS_COUNT", { count: workspace.memberCount })}
        </AntButton>
      </PopoverTrigger>

      <PopoverContent align="start" sideOffset={8} className="w-80 max-w-[90vw] p-3">
        <div className="space-y-3">
          <div className="font-semibold">{t("common:ORG_WORKSPACES_MEMBERS_POPOVER_TITLE")}</div>

          <Input
            allowClear
            value={rawQ}
            onChange={(event) => setRawQ(event.target.value)}
            variant="filled"
            prefix={<Search className="size-4 text-label-secondary" />}
            placeholder={t("common:ORG_WORKSPACES_MEMBERS_SEARCH_PLACEHOLDER")}
          />

          <div className="max-h-[420px] overflow-auto pr-1">
            {membersQuery.isLoading ? (
              <div className="flex justify-center py-8">
                <LoaderOne />
              </div>
            ) : membersQuery.isError ? (
              <div className="py-6 text-center">
                <div className="text-label-secondary">{t("common:REQUEST_FAILED")}</div>
                <AntButton
                  className="mt-2"
                  onClick={() => void membersQuery.refetch()}
                  autoInsertSpace={false}
                >
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
      </PopoverContent>
    </Popover>
  );
}
