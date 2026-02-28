import { lazy } from "react";
import { pluginSlotRegistry, type PluginUIExtension } from "@celestial/web-runtime/plugin-slots";

// Raw shape returned by the backend extensions endpoint
interface RawExtension {
  id: string;
  plugin_id: string;
  slot: string;
  title: string;
  kind: "action" | "panel" | "widget";
  icon?: string;
  permission_code?: string;
  component_url?: string;
  meta?: Record<string, unknown>;
}

interface ExtensionsResponse {
  data: RawExtension[];
}

/**
 * Fetch installed plugin UI extensions from the API and register them.
 * Silently degrades when the endpoint is unavailable.
 */
export async function loadPluginExtensions(apiBase: string): Promise<void> {
  try {
    const res = await fetch(`${apiBase}/api/v1/plugins/extensions`);
    if (!res.ok) return;

    const json = (await res.json()) as ExtensionsResponse;
    const items = Array.isArray(json.data) ? json.data : [];

    for (const raw of items) {
      const ext: PluginUIExtension = {
        id: raw.id,
        pluginId: raw.plugin_id,
        slot: raw.slot,
        title: raw.title,
        kind: raw.kind,
        icon: raw.icon,
        permissionCode: raw.permission_code,
        meta: raw.meta,
      };

      if (raw.component_url) {
        const url = raw.component_url;
        ext.component = lazy(() => import(/* @vite-ignore */ url));
      }

      pluginSlotRegistry.register(ext);
    }
  } catch {
    // Endpoint not ready or network error — silent degradation
  }
}
