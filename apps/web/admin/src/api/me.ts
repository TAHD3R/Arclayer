import { api } from "@/lib/http";

export interface MyOrganizationMemberPreview {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface MyOrganization {
  organization: {
    id: string;
    name: string;
    slug: string;
    logoUrl?: string | null;
  };
  membership: {
    id: string;
    organizationId: string;
    role: "owner" | "admin" | "member";
    status: string;
  };
  memberCount: number;
  membersPreview: MyOrganizationMemberPreview[];
}

export interface MyOrganizationListResult {
  items: MyOrganization[];
  total: number;
}

export interface CreateMyOrganizationInput {
  name: string;
}

export async function getMyOrganization(): Promise<MyOrganization> {
  return api.get<MyOrganization>("/me/organization");
}

export async function listMyOrganizations(): Promise<MyOrganizationListResult> {
  return api.get<MyOrganizationListResult>("/me/organizations");
}

export async function createMyOrganization(
  input: CreateMyOrganizationInput,
): Promise<MyOrganization> {
  return api.post<MyOrganization>("/me/organizations", input);
}
