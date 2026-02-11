import type { OrganizationInvitation } from "@/api/organization-members";

export type OrgInvitationsTab = "pending" | "processed" | "links";

export type RenewExpiresInSeconds = number | null;

export const DEFAULT_RENEW_EXPIRES_IN_SECONDS: RenewExpiresInSeconds = 7 * 24 * 60 * 60;

export const RENEW_OPTIONS: Array<{ value: RenewExpiresInSeconds; key: string }> = [
  { value: 24 * 60 * 60, key: "team:TEAM_INVITE_LINK_EXPIRES_1_DAY" },
  { value: 7 * 24 * 60 * 60, key: "team:TEAM_INVITE_LINK_EXPIRES_7_DAYS" },
  { value: 30 * 24 * 60 * 60, key: "team:TEAM_INVITE_LINK_EXPIRES_30_DAYS" },
  { value: null, key: "team:TEAM_INVITE_LINK_EXPIRES_NEVER" },
];

export function toStatusTagColor(status: OrganizationInvitation["status"]): string {
  if (status === "accepted") return "green";
  if (status === "revoked") return "red";
  if (status === "expired") return "gold";
  return "blue";
}
