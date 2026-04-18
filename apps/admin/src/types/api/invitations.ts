export type InvitationPreviewInvitation = {
  email: string | null;
  maskedEmail: string | null;
  roleCode: string | null;
  expiresAt: string | null;
};

export type InvitationPreviewOrganization = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
};

export type InvitationPreviewWorkspace = {
  id: string;
  name: string;
  slug: string;
};

export type InvitationPreviewInviter = {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
};

export type InvitationPreviewRole = {
  code: string;
  name: string;
  description: string | null;
};

export type InvitationPreviewResult = {
  invitation: InvitationPreviewInvitation;
  organization: InvitationPreviewOrganization;
  workspace: InvitationPreviewWorkspace | null;
  inviter: InvitationPreviewInviter | null;
  role: InvitationPreviewRole | null;
  userExists: boolean;
};

export type AcceptExistingInvitationResult = {
  organizationId: string;
  workspaceId: string | null;
  projectId: string | null;
  roleCode: string | null;
};

export type MyInvitationOrganization = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
};

export type MyInvitationWorkspace = {
  id: string;
  name: string;
  slug: string;
};

export type MyInvitationInviter = {
  id: string;
  username: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
};

export type MyInvitation = {
  id: string;
  email: string;
  roleCode: string | null;
  expiresAt: string | null;
  organization: MyInvitationOrganization;
  workspace: MyInvitationWorkspace | null;
  inviter: MyInvitationInviter | null;
  status: "pending" | "accepted";
  acceptedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
