import { Avatar, Button, Input, List, Pagination, Popover, Spin, Tag } from "antd";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import {
  listTeamInviteLinkParticipants,
  type TeamInviteLinkParticipant,
  type TeamUserRef,
} from "@/api/team";
import { notifyError } from "@/lib/notifications";
import { resolveAssetRefToPublicUrlPath } from "@/lib/assets/asset-urls";
import { useWorkspaceDateTimeFormatter } from "@/hooks/use-workspace-date-time-formatter";

function userInitials(label: string | null | undefined): string {
  const v = String(label || "U").trim();
  return v.slice(0, 1).toUpperCase();
}

function renderUserLabel(user: TeamUserRef | null): React.ReactNode {
  if (!user) return <span className="text-muted-foreground">-</span>;
  const primary = (user.displayName || user.username || user.email || "-").trim() || "-";
  const secondary = user.email || user.username || "";
  return (
    <div className="flex items-center gap-2 min-w-0">
      <Avatar
        size={24}
        shape="square"
        src={resolveAssetRefToPublicUrlPath(user.avatarUrl) || undefined}
        style={{
          backgroundColor: "var(--color-muted)",
          color: "var(--color-foreground)",
          flexShrink: 0,
        }}
      >
        {userInitials(primary)}
      </Avatar>
      <div className="min-w-0">
        <div className="text-sm font-medium truncate">{primary}</div>
        {secondary ? (
          <div className="text-xs text-muted-foreground truncate">{secondary}</div>
        ) : null}
      </div>
    </div>
  );
}

function normalizeQuery(input: string): string {
  return String(input || "").trim();
}

export function InviteLinkParticipantsPopover(props: {
  workspaceId: string;
  linkId: string;
  usesCount: number;
  primaryUser: TeamUserRef | null;
}) {
  const { t } = useTranslation(["team", "common"]);
  const dateTime = useWorkspaceDateTimeFormatter({ workspaceId: props.workspaceId || undefined });
  const [open, setOpen] = React.useState(false);
  const [page, setPage] = React.useState(1);
  const [rawQ, setRawQ] = React.useState("");
  const [q, setQ] = React.useState("");

  // Debounce search input to avoid refetching on every keystroke.
  React.useEffect(() => {
    const handle = window.setTimeout(() => setQ(normalizeQuery(rawQ)), 250);
    return () => window.clearTimeout(handle);
  }, [rawQ]);

  React.useEffect(() => {
    if (!open) return;
    setPage(1);
  }, [open, q]);

  const enabled = open && Boolean(props.workspaceId) && Boolean(props.linkId);
  const query = useQuery({
    queryKey: ["team", "invite-link-participants", props.workspaceId, props.linkId, page, q],
    enabled,
    queryFn: async () =>
      listTeamInviteLinkParticipants(props.workspaceId, props.linkId, { page, size: 10, q }),
    retry: false,
    meta: { silent: true },
  });

  const content = (
    <div className="w-[380px] max-w-[85vw]">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium">
          {t("team:TEAM_INVITE_LINKS_PARTICIPANT_POPOVER_TITLE")}
        </div>
        <Tag color="blue" style={{ marginInlineEnd: 0 }}>
          {props.usesCount}
        </Tag>
      </div>

      <div className="mt-2">
        <Input
          allowClear
          value={rawQ}
          onChange={(e) => setRawQ(e.target.value)}
          placeholder={t("team:TEAM_INVITE_LINKS_PARTICIPANT_SEARCH_PLACEHOLDER")}
        />
      </div>

      <div className="mt-3">
        {query.isLoading ? (
          <div className="py-8 flex items-center justify-center">
            <Spin />
          </div>
        ) : query.isError ? (
          <div className="py-6 text-center">
            <div className="text-sm text-muted-foreground">{t("common:REQUEST_FAILED")}</div>
            <Button
              size="small"
              className="mt-2"
              onClick={() => {
                void query.refetch().catch((err) => notifyError(err));
              }}
            >
              {t("common:RETRY")}
            </Button>
          </div>
        ) : (
          <>
            <List<TeamInviteLinkParticipant>
              size="small"
              dataSource={query.data?.items ?? []}
              locale={{ emptyText: t("team:TEAM_INVITE_LINKS_PARTICIPANT_EMPTY") }}
              renderItem={(item) => {
                return (
                  <List.Item className="py-2">
                    <div className="flex items-center justify-between gap-3 w-full min-w-0">
                      <div className="min-w-0">{renderUserLabel(item.user)}</div>
                      <div className="text-xs text-muted-foreground whitespace-nowrap">
                        {dateTime.formatDateTime(item.usedAt, { emptyValue: "-" })}
                      </div>
                    </div>
                  </List.Item>
                );
              }}
            />

            {query.data?.pages && query.data.pages > 1 ? (
              <div className="mt-3 flex justify-end">
                <Pagination
                  size="small"
                  current={page}
                  total={query.data.total}
                  pageSize={query.data.size}
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

  if (props.usesCount <= 0) return <span className="text-muted-foreground">{t("common:NA")}</span>;

  return (
    <Popover
      trigger="click"
      open={open}
      onOpenChange={(next) => setOpen(next)}
      content={content}
      placement="bottomLeft"
    >
      <button
        type="button"
        className="flex items-center gap-2 min-w-0 text-left hover:opacity-90"
        aria-label={t("team:TEAM_INVITE_LINKS_ACTION_VIEW_PARTICIPANTS")}
      >
        <Tag color="blue" style={{ marginInlineEnd: 0 }}>
          {props.usesCount}
        </Tag>
        <div className="min-w-0">{renderUserLabel(props.primaryUser)}</div>
      </button>
    </Popover>
  );
}
