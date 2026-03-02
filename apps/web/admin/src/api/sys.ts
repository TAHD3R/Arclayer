import { api } from "@/lib/http";
import { sysApi } from "@/lib/http/sys-client";
import type {
  ListSysConfigNamespacesOut,
  ListSysConfigRevisionsOut,
  SysConfigActivatePayload,
  SysConfigDetail,
  SysConfigPatchPayload,
  SysConfigRevisionDetail,
  SysConfigTestResult,
  SysStepUpResult,
} from "@/types/api";

export async function sysStepUp(payload: { password: string }): Promise<SysStepUpResult> {
  return api.post<SysStepUpResult>("/sys/auth/step-up", payload);
}

export async function listSysConfigNamespaces(params?: {
  page?: number;
  size?: number;
}): Promise<ListSysConfigNamespacesOut> {
  const page = params?.page ?? 1;
  const size = params?.size ?? 20;
  return sysApi.get<ListSysConfigNamespacesOut>(`/sys/settings?page=${page}&size=${size}`);
}

export async function getSysConfigNamespace(namespace: string): Promise<SysConfigDetail> {
  return sysApi.get<SysConfigDetail>(`/sys/settings/${encodeURIComponent(namespace)}`);
}

export async function patchSysConfigNamespace(
  namespace: string,
  payload: SysConfigPatchPayload,
): Promise<SysConfigDetail> {
  return sysApi.patch<SysConfigDetail>(`/sys/settings/${encodeURIComponent(namespace)}`, payload);
}

export async function listSysConfigRevisions(
  namespace: string,
  params?: { page?: number; size?: number },
): Promise<ListSysConfigRevisionsOut> {
  const page = params?.page ?? 1;
  const size = params?.size ?? 20;
  return sysApi.get<ListSysConfigRevisionsOut>(
    `/sys/settings/${encodeURIComponent(namespace)}/revisions?page=${page}&size=${size}`,
  );
}

export async function getSysConfigRevision(
  namespace: string,
  revisionId: string,
): Promise<SysConfigRevisionDetail> {
  return sysApi.get<SysConfigRevisionDetail>(
    `/sys/settings/${encodeURIComponent(namespace)}/revisions/${encodeURIComponent(revisionId)}`,
  );
}

export async function testSysConfigRevision(
  namespace: string,
  payload: SysConfigActivatePayload,
): Promise<SysConfigTestResult> {
  return sysApi.post<SysConfigTestResult>(
    `/sys/settings/${encodeURIComponent(namespace)}/test`,
    payload,
  );
}

export async function activateSysConfigRevision(
  namespace: string,
  payload: SysConfigActivatePayload,
): Promise<SysConfigDetail> {
  return sysApi.post<SysConfigDetail>(
    `/sys/settings/${encodeURIComponent(namespace)}/activate`,
    payload,
  );
}
