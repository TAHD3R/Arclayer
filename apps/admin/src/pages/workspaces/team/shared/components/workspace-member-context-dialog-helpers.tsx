import type { ReactNode } from "react";

import type { TeamMember } from "@/types/api";

export function SummaryCard(props: { title: string; body: ReactNode; footer?: ReactNode }) {
  return (
    <section className="rounded-xl border border-border/60 bg-card p-4">
      <div className="text-callout font-bold uppercase text-label-secondary">{props.title}</div>
      <div className="mt-3 space-y-2">{props.body}</div>
      {props.footer ? (
        <div className="mt-3 text-callout text-label-secondary">{props.footer}</div>
      ) : null}
    </section>
  );
}

export function workspaceMembershipLabel(
  t: (key: string) => string,
  status: TeamMember["membershipStatus"],
): string {
  if (status === "active") return t("team:TEAM_MEMBERSHIP_STATUS_ACTIVE");
  if (status === "invited") return t("team:TEAM_MEMBERSHIP_STATUS_INVITED");
  return t("team:TEAM_MEMBERSHIP_STATUS_DISABLED");
}

export function workspaceUserStatusLabel(
  t: (key: string) => string,
  status: TeamMember["userStatus"],
): string {
  if (status === "active") return t("team:TEAM_USER_STATUS_ACTIVE");
  if (status === "disabled") return t("team:TEAM_USER_STATUS_DISABLED");
  return t("team:TEAM_USER_STATUS_LOCKED");
}
