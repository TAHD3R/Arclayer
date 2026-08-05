export type TabKey = "pending" | "accepted" | "links";

export type InvitationTableMode = TabKey;

export type InvitationLinkStatus = "active" | "disabled" | "expired" | "exhausted";

export type InvitationTableFilters = {
  roleCode?: string;
  status?: InvitationLinkStatus;
};

export type InvitationSort =
  | "email"
  | "-email"
  | "created_at"
  | "-created_at"
  | "expires_at"
  | "-expires_at"
  | "uses_count"
  | "-uses_count";
export type RenewExpiresInSeconds = number | null;
