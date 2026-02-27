export type BootstrapState = {
  ready: boolean;
  repairRequired: boolean;
  organizationId: string | null;
  workspaceId: string | null;
  siteId: string | null;
  nextPath: string;
  reason: string | null;
};

export type BootstrapRepairResult = {
  repaired: boolean;
  ready: boolean;
  organizationId: string | null;
  workspaceId: string | null;
  siteId: string | null;
  actions: string[];
};
