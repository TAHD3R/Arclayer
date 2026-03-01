export type MyWorkspace = {
  workspaceId: string;
  organizationId: string;
  slug: string;
  name: string;
  visibleOnly: boolean;
  isCreatorAdmin: boolean;
};

export type MyWorkspaceListResult = {
  items: MyWorkspace[];
};
