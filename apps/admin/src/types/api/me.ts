export type MyOrganizationMemberPreview = {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
};

export type MyOrganization = {
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
};

export type MyOrganizationListResult = {
  items: MyOrganization[];
  total: number;
};

export type CreateMyOrganizationInput = {
  name: string;
};
