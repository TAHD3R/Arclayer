import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";

import { ViewportCanvas } from "@/components/viewport/viewport-canvas";
import {
  createDefaultPrefabRegistryV1,
  createEmptyDesignDocumentV1,
  DesignDocumentRenderer,
} from "@celestial/site-renderer-core";
import type { DesignDocumentV1, ViewerContext } from "@celestial/site-block-protocol";
import { resolveBreakpointNameByWidth } from "@celestial/site-block-protocol";
import { usePreferencesStore } from "@/stores/use-preferences-store";
import { useViewportStore } from "@/stores/use-viewport-store";

export const Route = createFileRoute("/w/$workspaceId/")({
  component: EditorWorkspaceHome,
});

function buildExampleDocument(): DesignDocumentV1 {
  const doc = createEmptyDesignDocumentV1();
  doc.nodesById["card_1"] = {
    id: "card_1",
    type: "prefab_instance",
    prefabId: "card",
    props: {
      title: { kind: "literal", value: "Celestial" },
      description: { kind: "literal", value: "Viewport-first 编辑器骨架已就绪。" },
      imageSrc: { kind: "literal", value: "https://picsum.photos/800/400" },
      href: { kind: "literal", value: "https://example.com" },
    },
    layout: {
      self: { rect: { x: 40, y: 40, width: 360, height: 260 }, alignX: "start", alignY: "start" },
      children: { mode: "absolute" },
    },
  };
  const root = doc.nodesById[doc.rootId];
  if (root && root.type === "page_root") {
    root.children = ["card_1"];
  }
  return doc;
}

function EditorWorkspaceHome() {
  const locale = usePreferencesStore((s) => s.locale);
  const viewportWidth = useViewportStore((s) => s.width);
  const viewportHeight = useViewportStore((s) => s.height);

  const doc = useMemo(() => buildExampleDocument(), []);
  const prefabRegistry = useMemo(() => createDefaultPrefabRegistryV1(), []);

  const ctx: ViewerContext = useMemo(
    () => ({
      locale,
      breakpoint: resolveBreakpointNameByWidth(viewportWidth),
    }),
    [locale, viewportWidth],
  );

  return (
    <ViewportCanvas>
      <div className="relative w-full">
        <DesignDocumentRenderer
          document={doc}
          ctx={ctx}
          viewport={{ width: viewportWidth, height: viewportHeight }}
          prefabRegistry={prefabRegistry}
        />
      </div>
    </ViewportCanvas>
  );
}
