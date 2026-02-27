export function systemRuntimeQueryKey() {
  return ["system", "runtime"] as const;
}

export function workspacePluginsCenterQueryKey(workspaceId: string | null | undefined) {
  return ["workspace", "pluginsCenter", workspaceId ?? null] as const;
}

export function organizationPluginsCenterQueryKey() {
  return ["organization", "pluginsCenter"] as const;
}

export function organizationPluginSettingsQueryKey(extensionRef: string) {
  return ["organization", "plugins", extensionRef, "settings"] as const;
}

export function systemSettingsNamespaceQueryKey(namespace: string) {
  return ["settings", "system", namespace] as const;
}
