export type OrganizationWorkspacesTab = "active" | "archived";

export type OrganizationWorkspacesViewMode = "card" | "table";

export type OrganizationWorkspacesTranslateFn = (
  key: string,
  options?: Record<string, unknown>,
) => string;
