import { projectPath, toQueryString } from "@/lib/api";
import { api } from "@/lib/http";
import type {
  ApiKeyCreateOut,
  ApiKeyListOut,
  ApiKeyOut,
  DomainBindingCreateOut,
  DomainBindingDeleteOut,
  DomainBindingOut,
  DomainBindingVerifyOut,
  ProjectApiKeyCreateIn,
} from "@arclayer/openapi";

export type ProjectDomainBinding = DomainBindingOut;
export type ProjectDomainCreateOut = DomainBindingCreateOut;
export type ProjectDomainVerifyOut = DomainBindingVerifyOut;
export type ProjectDomainDeleteOut = DomainBindingDeleteOut;

export const PROJECT_DOMAINS_QUERY_KEY = ["project", "domains"] as const;

export function projectDomainsQueryKey(projectId: string) {
  return [...PROJECT_DOMAINS_QUERY_KEY, projectId] as const;
}

export async function listProjectDomains(projectId: string): Promise<ProjectDomainBinding[]> {
  const query = toQueryString({ page: 1, size: 100 });
  const page = await api.get<{ items?: ProjectDomainBinding[] }>(
    projectPath(projectId, `/domains${query}`),
  );
  return page.items ?? [];
}

export async function createProjectDomain(
  projectId: string,
  hostname: string,
): Promise<ProjectDomainCreateOut> {
  return api.post<ProjectDomainCreateOut>(projectPath(projectId, "/domains"), { hostname });
}

export async function verifyProjectDomain(
  projectId: string,
  bindingId: string,
): Promise<ProjectDomainVerifyOut> {
  return api.post<ProjectDomainVerifyOut>(
    projectPath(projectId, `/domains/${encodeURIComponent(bindingId)}/verify`),
  );
}

export async function updateProjectDomain(
  projectId: string,
  bindingId: string,
  payload: { isActive: boolean },
): Promise<ProjectDomainBinding> {
  return api.patch<ProjectDomainBinding>(
    projectPath(projectId, `/domains/${encodeURIComponent(bindingId)}`),
    payload,
  );
}

export async function deleteProjectDomain(
  projectId: string,
  bindingId: string,
): Promise<ProjectDomainDeleteOut> {
  return api.delete<ProjectDomainDeleteOut>(
    projectPath(projectId, `/domains/${encodeURIComponent(bindingId)}`),
  );
}

export async function listProjectApiKeys(projectId: string): Promise<ApiKeyOut[]> {
  const data = await api.get<ApiKeyListOut>(projectPath(projectId, "/api-keys"));
  return data.items ?? [];
}

export async function createProjectApiKey(
  projectId: string,
  payload: ProjectApiKeyCreateIn,
): Promise<ApiKeyCreateOut> {
  return api.post<ApiKeyCreateOut>(projectPath(projectId, "/api-keys"), payload);
}

export async function rotateProjectApiKey(
  projectId: string,
  keyId: string,
): Promise<ApiKeyCreateOut> {
  return api.post<ApiKeyCreateOut>(
    projectPath(projectId, `/api-keys/${encodeURIComponent(keyId)}/rotate`),
  );
}

export async function revokeProjectApiKey(projectId: string, keyId: string): Promise<ApiKeyOut> {
  return api.post<ApiKeyOut>(
    projectPath(projectId, `/api-keys/${encodeURIComponent(keyId)}/revoke`),
  );
}
