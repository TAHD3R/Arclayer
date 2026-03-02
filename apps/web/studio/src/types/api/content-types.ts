export type ContentTypeOut = {
  id: string;
  workspaceId: string;
  siteId: string;
  code: string;
  name: string;
  kind: string;
  fieldSchema?: Record<string, unknown> | null;
};
