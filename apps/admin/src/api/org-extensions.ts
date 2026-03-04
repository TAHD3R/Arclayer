import { api } from "@/lib/http";
import { orgExtensionPath, toQueryString } from "@/lib/api";

import type { CapabilityListOut, CapabilitySummary, UIEmbedListOut } from "@/types/api";

export async function listOrganizationCapabilities(): Promise<CapabilityListOut> {
  return api.get<CapabilityListOut>(orgExtensionPath());
}

export async function enableOrganizationCapability(
  capabilityId: string,
): Promise<CapabilitySummary> {
  return api.post<CapabilitySummary>(`${orgExtensionPath(capabilityId)}/enable`);
}

export async function disableOrganizationCapability(
  capabilityId: string,
): Promise<CapabilitySummary> {
  return api.post<CapabilitySummary>(`${orgExtensionPath(capabilityId)}/disable`);
}

export async function listOrganizationUIEmbeds(
  opts: { slot?: string | null; capabilityId?: string | null; enabledOnly?: boolean | null } = {},
): Promise<UIEmbedListOut> {
  return api.get<UIEmbedListOut>(
    `${orgExtensionPath()}/ui-embeds${toQueryString({
      slot: opts.slot,
      capabilityId: opts.capabilityId,
      enabledOnly: opts.enabledOnly,
    })}`,
  );
}
