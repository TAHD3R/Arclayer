import { type ComponentType, type LazyExoticComponent, Suspense } from "react";
import { pluginSlotRegistry, type PluginSlotProps } from "@celestial/web-core/plugin-slots";

type LazyPluginComponent = LazyExoticComponent<ComponentType<PluginSlotProps>>;

interface PluginSlotRendererProps {
  slot: string;
  context?: Record<string, unknown>;
  fallback?: React.ReactNode;
}

export function PluginSlotRenderer({ slot, context = {}, fallback }: PluginSlotRendererProps) {
  const extensions = pluginSlotRegistry.getExtensions(slot);

  if (!extensions.length) return fallback ?? null;

  return (
    <>
      {extensions.map((ext) => {
        if (!ext.component) return null;
        const Comp = ext.component as LazyPluginComponent;
        const props: PluginSlotProps = { extension: ext, context };
        return (
          <Suspense key={ext.id} fallback={null}>
            <Comp {...props} />
          </Suspense>
        );
      })}
    </>
  );
}
