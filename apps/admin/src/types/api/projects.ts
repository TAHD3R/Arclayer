export type Project = {
  id: string;
  workspaceId: string;
  slug: string;
  name: string;
  description: string | null;
  isActive: boolean;
};

export type ProjectRuntime = {
  id: string;
  projectId: string;
  kind: string;
  name: string;
  isActive: boolean;
};

export type ProjectListItem = Project & {
  primaryRuntime: ProjectRuntime | null;
};

export type ProjectCreateInput = {
  name: string;
  description?: string;
};

export type ProjectDetail = {
  project: Project;
  primaryRuntime: ProjectRuntime | null;
};
