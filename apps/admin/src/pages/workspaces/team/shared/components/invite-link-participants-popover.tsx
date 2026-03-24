import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, X } from "@arclayer/ui/icons/lucide-animated";
import { useTranslation } from "react-i18next";

import { listTeamInviteLinkParticipants } from "@/api/team";
import { listOrganizationInviteLinkParticipants } from "@/api/organization-members";
import type { TeamInviteLinkParticipant, TeamUserRef } from "@/types/api";
import { Button } from "@arclayer/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@arclayer/ui/input-group";
import { notifyError } from "@/lib/notifications";
import { useWorkspaceDateTimeFormatter } from "@/hooks/use-workspace-date-time-formatter";
import { Popover, PopoverContent, PopoverTrigger } from "@arclayer/ui/popover";
import { Spinner } from "@arclayer/ui/spinner";
import { UsesCountTag } from "@/components/ui/tags";
import { Button as ButtonPrimitive } from "@arclayer/ui/button-primitive";

import { InvitationUserLabel } from "./invitation-user-label";
import { buildInvitationUserDetails } from "./invitation-user-details";

function normalizeQuery(input: string): string {
  return String(input || "").trim();
}

export function InviteLinkParticipantsPopover(props: {
  scope?: "workspace" | "organization";
  workspaceId?: string;
  linkId: string;
  usesCount: number;
  primaryUser: TeamUserRef | null;
  lastUsedAt?: string | null;
}) {
  const { t } = useTranslation(["team", "common"]);
  const dateTime = useWorkspaceDateTimeFormatter({ workspaceId: props.workspaceId || undefined });
  const [open, setOpen] = React.useState(false);
  const [page, setPage] = React.useState(1);
  const [rawQ, setRawQ] = React.useState("");
  const [q, setQ] = React.useState("");

  React.useEffect(() => {
    const handle = window.setTimeout(() => setQ(normalizeQuery(rawQ)), 250);
    return () => window.clearTimeout(handle);
  }, [rawQ]);

  React.useEffect(() => {
    if (!open) return;
    setPage(1);
  }, [open, q]);

  const isOrg = props.scope === "organization";
  const enabled = open && Boolean(props.linkId) && (isOrg || Boolean(props.workspaceId));
  const query = useQuery({
    queryKey: [
      "team",
      "invite-link-participants",
      props.scope ?? "workspace",
      props.workspaceId ?? "",
      props.linkId,
      page,
      q,
    ],
    enabled,
    queryFn: async () => {
      if (isOrg) {
        return listOrganizationInviteLinkParticipants(props.linkId, { page, size: 10 });
      }
      return listTeamInviteLinkParticipants(props.workspaceId!, props.linkId, {
        page,
        size: 10,
        q,
      });
    },
    retry: false,
    meta: { silent: true },
  });
  const totalPages = query.data?.pages || 0;

  const content = (
    <div className="w-[380px] max-w-[85vw]">
      <div className="flex items-center justify-between gap-2">
        <div className="text-footnote font-medium">
          {t("team:TEAM_INVITE_LINKS_PARTICIPANT_POPOVER_TITLE")}
        </div>
        <UsesCountTag label={props.usesCount} />
      </div>

      <div className="mt-2">
        <InputGroup>
          <InputGroupAddon>
            <Search className="size-4 text-label-secondary" />
          </InputGroupAddon>
          <InputGroupInput
            value={rawQ}
            onChange={(event) => setRawQ(event.target.value)}
            placeholder={t("team:TEAM_INVITE_LINKS_PARTICIPANT_SEARCH_PLACEHOLDER")}
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
      </div>

      <div className="mt-3">
        {query.isLoading ? (
          <div className="py-8 flex items-center justify-center">
            <Spinner className="size-4 text-label-secondary" />
          </div>
        ) : query.isError ? (
          <div className="py-6 text-center">
            <div className="text-footnote text-label-secondary">{t("common:REQUEST_FAILED")}</div>
            <Button
              variant="secondary"
              size="sm"
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
            {(query.data?.items?.length ?? 0) > 0 ? (
              <ul>
                {(query.data?.items ?? []).map((item: TeamInviteLinkParticipant) => (
                  <li
                    key={`${item.user?.username || item.user?.email || "user"}:${item.usedAt}`}
                    className="py-2"
                  >
                    <div className="flex items-center justify-between gap-3 w-full min-w-0">
                      <div className="min-w-0">
                        <InvitationUserLabel
                          user={item.user}
                          details={buildInvitationUserDetails({
                            t,
                            dateTime,
                            lastUsedAt: item.usedAt,
                            lastUsedAtLabel: t("team:TEAM_INVITE_LINKS_COL_LAST_USED"),
                          })}
                        />
                      </div>
                      <div className="text-caption text-label-secondary whitespace-nowrap">
                        {dateTime.formatDateTime(item.usedAt, { emptyValue: "-" })}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="rounded-md border border-dashed p-4 text-center text-label-secondary">
                {t("team:TEAM_INVITE_LINKS_PARTICIPANT_EMPTY")}
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
  );

  if (props.usesCount <= 0) {
    return (
      <span className="text-label-secondary">{t("team:TEAM_INVITE_LINKS_PARTICIPANT_EMPTY")}</span>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <ButtonPrimitive
          type="button"
          tapScale={1}
          className="flex w-full items-center gap-2 min-w-0 text-left hover:opacity-90"
          aria-label={t("team:TEAM_INVITE_LINKS_ACTION_VIEW_PARTICIPANTS")}
        >
          <UsesCountTag label={props.usesCount} />
          <div className="min-w-0 flex-1">
            <InvitationUserLabel
              user={props.primaryUser}
              usesCount={props.usesCount}
              details={buildInvitationUserDetails({
                t,
                dateTime,
                lastUsedAt: props.lastUsedAt,
                lastUsedAtLabel: t("team:TEAM_INVITE_LINKS_COL_LAST_USED"),
              })}
            />
          </div>
        </ButtonPrimitive>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={8} className="w-[380px] max-w-[85vw] p-3">
        {content}
      </PopoverContent>
    </Popover>
  );
}
