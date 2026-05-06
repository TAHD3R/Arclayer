import { api } from "@/lib/http";
import type {
  MyOrganization,
  MyOrganizationListResult,
  CreateMyOrganizationInput,
} from "@arclayer/openapi/admin-types";

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
