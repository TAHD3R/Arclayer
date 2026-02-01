import { api } from "@/lib/http";

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
}

export async function getMyOrganization(): Promise<MyOrganization> {
  return api.get<MyOrganization>("/me/organization");
}
