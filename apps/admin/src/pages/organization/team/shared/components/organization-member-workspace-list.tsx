import { useMemo, useState } from "react";
import { Avatar, Input } from "antd";
import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { OrganizationMemberWorkspace } from "@/types/api";
import { TeamRoleTag } from "@/components/ui/tags";
import { cn } from "@celestial/lib/utils";
import { Button as ButtonPrimitive } from "@celestial/ui/button-primitive";

export type ResolvedMemberWorkspace = OrganizationMemberWorkspace & {
  description?: string | null;
  iconUrl?: string | null;
};

type OrganizationMemberWorkspaceListProps = {
  workspaces: ResolvedMemberWorkspace[];
  roleNameByCode: Map<string, string>;
  onEnterWorkspace: (workspaceId: string) => void;
  searchable?: boolean;
  className?: string;
  emptyText?: string;
};

function roleSummary(roleNameByCode: Map<string, string>, roleCodes: string[]): string {
  const normalized = roleCodes
    .map((code) => String(code || "").trim())
    .filter(Boolean)
    .map((code) => roleNameByCode.get(code) || code);
  if (!normalized.length) return "-";
  if (normalized.length === 1) return normalized[0];
  return `${normalized[0]} +${normalized.length - 1}`;
}

function normalizeSearch(input: string): string {
  return String(input || "")
    .trim()
    .toLowerCase();
}

export function OrganizationMemberWorkspaceList({
  workspaces,
  roleNameByCode,
  onEnterWorkspace,
  searchable = false,
  className,
  emptyText,
}: OrganizationMemberWorkspaceListProps) {
  const { t } = useTranslation(["common"]);
  const [searchInput, setSearchInput] = useState("");

  const filtered = useMemo(() => {
    const keyword = normalizeSearch(searchInput);
    if (!keyword) return workspaces;
    return workspaces.filter((workspace) => {
      const text = [workspace.workspaceName, workspace.workspaceSlug, workspace.description]
        .map((v) => String(v || "").toLowerCase())
        .join(" ");
      return text.includes(keyword);
    });
  }, [searchInput, workspaces]);

  return (
    <div className={cn("space-y-3", className)}>
      {searchable ? (
        <Input
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder={t("common:ORG_MEMBERS_WORKSPACE_SEARCH_PLACEHOLDER")}
          allowClear
          variant="filled"
          prefix={<Search className="size-4 text-label-secondary" />}
        />
      ) : null}

      {!filtered.length ? (
        <div className="rounded-md border border-dashed p-4 text-label-secondary">
          {emptyText || t("common:ORG_MEMBERS_WORKSPACE_EMPTY")}
        </div>
      ) : (
        <div className="space-y-1 p-2">
          {filtered.map((workspace) => {
            const title = workspace.workspaceName || workspace.workspaceSlug;
            const desc = workspace.description || t("common:ORG_WORKSPACES_DESCRIPTION_FALLBACK");
            const clickable = workspace.membershipStatus === "active";
            return (
              <ButtonPrimitive
                type="button"
                key={`${workspace.workspaceId}:${workspace.membershipStatus}`}
                disabled={!clickable}
                hoverScale={1}
                tapScale={1}
                onClick={() => {
                  if (!clickable) return;
                  onEnterWorkspace(workspace.workspaceId);
                }}
                className={cn(
                  "w-full rounded-md text-left transition-colors p-2",
                  clickable
                    ? "cursor-pointer hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    : "cursor-not-allowed opacity-60",
                )}
              >
                <div className="grid grid-cols-[auto_1fr] gap-3">
                  <Avatar
                    size={34}
                    src={workspace.iconUrl ?? undefined}
                    className="shrink-0 bg-muted text-foreground"
                  >
                    {title.slice(0, 1).toUpperCase()}
                  </Avatar>

                  <div className="min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="truncate font-medium">{title}</div>
                      <TeamRoleTag
                        className="!mr-0"
                        label={roleSummary(roleNameByCode, workspace.roleCodes)}
                      />
                    </div>

                    <div className="mt-0.5 truncate text-label-secondary">{desc}</div>
                  </div>
                </div>
              </ButtonPrimitive>
            );
          })}
        </div>
      )}
    </div>
  );
}
