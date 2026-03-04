export function systemRuntimeQueryKey() {
  return ["system", "runtime"] as const;
}

export function workspaceCapabilitiesQueryKey(workspaceId: string | null | undefined) {
  return ["workspace", "capabilities", workspaceId ?? null] as const;
}

export function organizationCapabilitiesQueryKey() {
  return ["organization", "capabilities"] as const;
}

export function workspaceUIEmbedsQueryKey(
  workspaceId: string | null | undefined,
  opts: { slot?: string | null; capabilityId?: string | null; enabledOnly?: boolean | null } = {},
) {
  return [
    "workspace",
    "uiEmbeds",
    workspaceId ?? null,
    opts.slot ?? null,
    opts.capabilityId ?? null,
    opts.enabledOnly ?? null,
  ] as const;
}

export function organizationUIEmbedsQueryKey(
  opts: {
    slot?: string | null;
    capabilityId?: string | null;
    enabledOnly?: boolean | null;
  } = {},
) {
  return [
    "organization",
    "uiEmbeds",
    opts.slot ?? null,
    opts.capabilityId ?? null,
    opts.enabledOnly ?? null,
  ] as const;
}

export function systemSettingsNamespaceQueryKey(namespace: string) {
  return ["settings", "system", namespace] as const;
}
