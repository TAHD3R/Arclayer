import { projectPath, toQueryString } from "@/lib/api";
import { api } from "@/lib/http";
import type {
  ApiKeyCreateOut,
  ApiKeyListOut,
  ApiKeyOut,
  ProjectApiKeyCreateIn,
  SiteDomainCreateOut,
  SiteDomainDeleteOut,
  SiteDomainOut,
  SiteDomainVerifyOut,
} from "@arclayer/openapi";

export async function listProjectDomains(projectId: string): Promise<SiteDomainOut[]> {
  const query = toQueryString({ page: 1, size: 100 });
  const page = await api.get<{ items?: SiteDomainOut[] }>(
    projectPath(projectId, `/domains${query}`),
  );
  return page.items ?? [];
}

export async function createProjectDomain(
  projectId: string,
  hostname: string,
): Promise<SiteDomainCreateOut> {
  return api.post<SiteDomainCreateOut>(projectPath(projectId, "/domains"), { hostname });
}

export async function verifyProjectDomain(
  projectId: string,
  domainId: string,
): Promise<SiteDomainVerifyOut> {
  return api.post<SiteDomainVerifyOut>(
    projectPath(projectId, `/domains/${encodeURIComponent(domainId)}/verify`),
  );
}

export async function updateProjectDomain(
  projectId: string,
  domainId: string,
  payload: { isActive: boolean },
): Promise<SiteDomainOut> {
  return api.patch<SiteDomainOut>(
    projectPath(projectId, `/domains/${encodeURIComponent(domainId)}`),
    payload,
  );
}

export async function deleteProjectDomain(
  projectId: string,
  domainId: string,
): Promise<SiteDomainDeleteOut> {
  return api.delete<SiteDomainDeleteOut>(
    projectPath(projectId, `/domains/${encodeURIComponent(domainId)}`),
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
