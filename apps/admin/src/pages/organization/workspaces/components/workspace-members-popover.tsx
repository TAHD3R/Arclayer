import { useEffect, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { listOrganizationWorkspaceMembers } from "@/api/organization-workspaces";
import { UserAvatar } from "@/components/common/entity-avatar";
import type { OrganizationWorkspace, OrganizationWorkspaceMember } from "@/types/api";
import { Button } from "@celestial/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@celestial/ui/input-group";
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
      <li key={member.membershipId} className="py-2">
        <div className="flex w-full items-center gap-2">
          <UserAvatar name={primary} assetRef={member.avatarUrl} />
          <div className="min-w-0">
            <div className="truncate font-medium">{primary}</div>
            <div className="truncate text-label-secondary">{member.email || "-"}</div>
          </div>
        </div>
      </li>
    );
  };

  const totalPages = membersQuery.data?.pages || 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-auto px-2 py-1 font-medium text-foreground hover:bg-accent"
        >
          {t("common:ORG_WORKSPACES_MEMBERS_COUNT", { count: workspace.memberCount })}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="start" sideOffset={8} className="w-80 max-w-[90vw] p-3">
        <div className="space-y-3">
          <div className="font-semibold">{t("common:ORG_WORKSPACES_MEMBERS_POPOVER_TITLE")}</div>

          <InputGroup>
            <InputGroupAddon>
              <Search className="size-4 text-label-secondary" />
            </InputGroupAddon>
            <InputGroupInput
              value={rawQ}
              onChange={(event) => setRawQ(event.target.value)}
              placeholder={t("common:ORG_WORKSPACES_MEMBERS_SEARCH_PLACEHOLDER")}
            />
            {rawQ ? (
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  aria-label={t("common:CLEAR")}
                  size="icon-xs"
                  onClick={() => setRawQ("")}
                >
                  <X className="size-3.5" />
                </InputGroupButton>
              </InputGroupAddon>
            ) : null}
          </InputGroup>

          <div className="max-h-[420px] overflow-auto pr-1">
            {membersQuery.isLoading ? (
              <div className="flex justify-center py-8">
                <LoaderOne />
              </div>
            ) : membersQuery.isError ? (
              <div className="py-6 text-center">
                <div className="text-label-secondary">{t("common:REQUEST_FAILED")}</div>
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-2"
                  onClick={() => void membersQuery.refetch()}
                >
                  {t("common:RETRY")}
                </Button>
              </div>
            ) : (
              <>
                {(membersQuery.data?.items?.length ?? 0) > 0 ? (
                  <ul>{(membersQuery.data?.items ?? []).map(renderMember)}</ul>
                ) : (
                  <div className="rounded-md border border-dashed p-4 text-center text-label-secondary">
                    {t("common:EMPTY_DESC")}
                  </div>
                )}

                {totalPages > 1 ? (
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div className="text-footnote text-label-secondary">
                      {page}/{totalPages}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page <= 1}
                        onClick={() => setPage((current) => Math.max(1, current - 1))}
                      >
                        {t("common:PREVIOUS")}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page >= totalPages}
                        onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                      >
                        {t("common:NEXT")}
                      </Button>
                    </div>
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
