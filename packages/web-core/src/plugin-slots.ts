// Mirrors backend AdminUIExtensionDecl.
// `component` is typed as `unknown` to keep this package React-agnostic;
// consumers cast it to `React.LazyExoticComponent<React.ComponentType<PluginSlotProps>>`.
export interface PluginUIExtension {
  id: string;
  pluginId: string;
  slot: string;
  title: string;
  kind: "action" | "panel" | "widget";
  icon?: string;
  permissionCode?: string;
  meta?: Record<string, unknown>;
  component?: unknown;
}

export interface PluginSlotProps {
  extension: PluginUIExtension;
  context: Record<string, unknown>;
}

class PluginSlotRegistry {
  private extensions = new Map<string, PluginUIExtension[]>();

  register(ext: PluginUIExtension): void {
    const list = this.extensions.get(ext.slot) ?? [];
    if (!list.some((e) => e.id === ext.id)) {
      list.push(ext);
      this.extensions.set(ext.slot, list);
    }
  }

  unregister(id: string): void {
    for (const [slot, list] of this.extensions) {
      const filtered = list.filter((e) => e.id !== id);
      if (filtered.length) this.extensions.set(slot, filtered);
      else this.extensions.delete(slot);
    }
  }

  getExtensions(slot: string): PluginUIExtension[] {
    return this.extensions.get(slot) ?? [];
  }

  clear(): void {
    this.extensions.clear();
  }
}

export const pluginSlotRegistry = new PluginSlotRegistry();
