import { api } from "@/lib/http";
import { workspacePath, toQueryString } from "@/lib/api";

import type { CapabilityListOut, CapabilitySummary, UIEmbedListOut } from "@/types/api";

export async function listWorkspaceCapabilities(workspaceId: string): Promise<CapabilityListOut> {
  return api.get<CapabilityListOut>(workspacePath(workspaceId, "/extensions/capabilities"));
}

export async function enableWorkspaceCapability(
  workspaceId: string,
  capabilityId: string,
): Promise<CapabilitySummary> {
  return api.post<CapabilitySummary>(
    workspacePath(
      workspaceId,
      `/extensions/capabilities/${encodeURIComponent(capabilityId)}/enable`,
    ),
  );
}

export async function disableWorkspaceCapability(
  workspaceId: string,
  capabilityId: string,
): Promise<CapabilitySummary> {
  return api.post<CapabilitySummary>(
    workspacePath(
      workspaceId,
      `/extensions/capabilities/${encodeURIComponent(capabilityId)}/disable`,
    ),
  );
}

export async function listWorkspaceUIEmbeds(
  workspaceId: string,
  opts: { slot?: string | null; capabilityId?: string | null; enabledOnly?: boolean | null } = {},
): Promise<UIEmbedListOut> {
  return api.get<UIEmbedListOut>(
    workspacePath(
      workspaceId,
      `/extensions/ui-embeds${toQueryString({
        slot: opts.slot,
        capabilityId: opts.capabilityId,
        enabledOnly: opts.enabledOnly,
      })}`,
    ),
  );
}
