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

export type ProjectDetail = {
  project: Project;
  primaryRuntime: ProjectRuntime | null;
};
