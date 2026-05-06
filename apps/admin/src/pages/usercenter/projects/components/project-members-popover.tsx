import { useEffect, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { listProjectMembers } from "@/api/project-members";
import { UserAvatar } from "@/components/common/entity-avatar";
import type { ProjectMember } from "@arclayer/openapi/admin-types";
import { Button } from "@arclayer/ui/button";
import { AvatarGroup, AvatarGroupCount } from "@arclayer/ui/avatar";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@arclayer/ui/input-group";
import { Popover, PopoverContent, PopoverTrigger } from "@arclayer/ui/popover";
import { Spinner } from "@arclayer/ui/spinner";
import { cn } from "@arclayer/lib/utils";
import type { UserCenterProjectsTranslateFn } from "../types";
import type { UserCenterProjectListItem } from "../project-list-items";

function normalizeQuery(input: string): string {
  return String(input || "").trim();
}

type ProjectMembersPopoverProject = Pick<
  UserCenterProjectListItem,
  "projectId" | "memberCount" | "membersPreview"
>;

export function ProjectMembersPopover({
  project,
  t: tOverride,
  triggerClassName,
}: {
  project: ProjectMembersPopoverProject;
  t?: UserCenterProjectsTranslateFn;
  triggerClassName?: string;
}) {
  const { t: defaultT } = useTranslation(["common"]);
  const t = tOverride ?? defaultT;
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
    queryKey: ["project-members", project.projectId, page, q],
    enabled: open && project.memberCount > 0,
    queryFn: async () =>
      listProjectMembers(project.projectId, {
        page,
        size: 10,
        q,
      }),
    retry: false,
    meta: { silent: true },
  });

  const renderMember = (member: ProjectMember) => {
    const primary = member.displayName || member.username || member.email || "U";
    return (
      <li key={member.id} className="py-2">
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
  const memberCount = Math.max(0, project.memberCount);
  const visibleMembers = project.membersPreview.slice(0, 3);
  const hiddenMemberCount = Math.max(0, memberCount - visibleMembers.length);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "h-auto min-h-6 gap-2 py-1 pl-0 font-medium text-label-primary hover:bg-transparent",
            triggerClassName,
          )}
        >
          {visibleMembers.length > 0 ? (
            <AvatarGroup aria-hidden="true" className="shrink-0">
              {visibleMembers.map((member) => (
                <UserAvatar
                  key={member.userId}
                  name={member.displayName || member.username || "U"}
                  assetRef={member.avatarUrl}
                  size={24}
                />
              ))}
              {hiddenMemberCount > 0 ? (
                <AvatarGroupCount className="size-6 bg-muted text-caption text-label-secondary">
                  +{hiddenMemberCount}
                </AvatarGroupCount>
              ) : null}
            </AvatarGroup>
          ) : null}
          <span className="leading-none">
            {t("common:ORG_WORKSPACES_MEMBERS_COUNT", { count: memberCount })}
          </span>
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        sideOffset={8}
        collisionPadding={16}
        className="flex w-80 max-w-[90vw] max-h-(--radix-popover-content-available-height) flex-col overflow-hidden p-3"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <div className="font-semibold">{t("account:ACCOUNT_PROJECTS_MEMBERS_POPOVER_TITLE")}</div>

          <InputGroup>
            <InputGroupAddon>
              <Search className="size-4 text-label-secondary" />
            </InputGroupAddon>
            <InputGroupInput
              value={rawQ}
              onChange={(event) => setRawQ(event.target.value)}
              placeholder={t("account:SETTINGS_PROJECT_MEMBERS_SEARCH_PLACEHOLDER")}
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

          <div className="min-h-0 flex-1 overflow-auto">
            {membersQuery.isLoading ? (
              <div className="flex justify-center py-8">
                <Spinner className="size-4 text-label-secondary" />
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
                  <div className="rounded-md p-4 text-center text-label-secondary">
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
