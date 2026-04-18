import type { UserStatus } from "./team";

export type ProjectMemberRole = "owner" | "editor" | "viewer";

export type ProjectMember = {
  id: string;
  projectId: string;
  workspaceId: string;
  userId: string;
  username: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  userStatus: UserStatus;
  role: ProjectMemberRole;
};
