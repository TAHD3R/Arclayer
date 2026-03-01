import type { BlockManifest, PageBlueprint, DesignNodeV1 } from "@celestial/site-block-protocol";
import { PREFAB_BLOCK_MANIFESTS } from "@celestial/site-block-protocol";

import type { PrefabDefinitionV1 } from "./prefab-registry";
import { PrefabRegistryV1 } from "./prefab-registry";

function findPrefabManifest(type: string): BlockManifest {
  const found = PREFAB_BLOCK_MANIFESTS.find((m) => m.type === type);
  if (!found) {
    // Minimal fallback to keep renderer deterministic even if manifests drift.
    return {
      type,
      label: { "en-US": type, "zh-CN": type },
      category: "custom",
      supports: { children: true, layout: true, design: true, responsive: true },
      attributes: [],
      slots: [],
      styleOverrideWhitelist: [],
    };
  }
  return found;
}

function createCardPrefabDefinition(): PrefabDefinitionV1 {
  const manifest = findPrefabManifest("prefab:card");

  // Card template: a container frame with optional image + title + description + a slot frame.
  const nodesById: Record<string, DesignNodeV1> = {
    page: {
      id: "page",
      type: "page_root",
      name: "CardTemplateRoot",
      children: ["card_root"],
      layout: { children: { mode: "absolute" } },
    },
    card_root: {
      id: "card_root",
      type: "frame",
      name: "Card",
      children: ["card_image", "card_title", "card_desc", "card_slot"],
      layout: {
        self: {
          rect: { x: 0, y: 0, width: 360, height: 240 },
          constraints: { horizontal: "leftRight", vertical: "topBottom" },
          alignX: "start",
          alignY: "start",
        },
        children: {
          mode: "auto",
          direction: "column",
          gap: 10,
          padding: 12,
          alignItems: "stretch",
          justifyContent: "start",
          wrap: "nowrap",
        },
      },
      style: {
        backgroundColor: "#ffffff",
        borderStyle: "solid",
        borderWidth: "1px",
        borderColor: "rgba(0,0,0,0.12)",
        borderRadius: "12px",
        boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
      },
    },
    card_image: {
      id: "card_image",
      type: "image",
      name: "Image",
      src: { kind: "binding", source: "prefabProps", path: "imageSrc" },
      alt: { kind: "binding", source: "prefabProps", path: "title" },
      objectFit: "cover",
      layout: {
        self: {
          rect: { x: 0, y: 0, width: 336, height: 140 },
          constraints: { horizontal: "leftRight", vertical: "top" },
          alignX: "start",
          alignY: "start",
        },
        children: { mode: "absolute" },
      },
      style: { borderRadius: "10px" },
    },
    card_title: {
      id: "card_title",
      type: "text",
      name: "Title",
      text: { kind: "binding", source: "prefabProps", path: "title" },
      tag: "h3",
      layout: {
        self: {
          rect: { x: 0, y: 0, width: 336, height: 28 },
          constraints: { horizontal: "leftRight", vertical: "top" },
          alignX: "start",
          alignY: "start",
        },
        children: { mode: "absolute" },
      },
      style: { typography: { fontSize: 18, lineHeight: 24, fontWeight: 600 } },
    },
    card_desc: {
      id: "card_desc",
      type: "text",
      name: "Description",
      text: { kind: "binding", source: "prefabProps", path: "description" },
      tag: "p",
      layout: {
        self: {
          rect: { x: 0, y: 0, width: 336, height: 52 },
          constraints: { horizontal: "leftRight", vertical: "top" },
          alignX: "start",
          alignY: "start",
        },
        children: { mode: "absolute" },
      },
      style: { opacity: 0.88, typography: { fontSize: 14, lineHeight: 20 } },
    },
    card_slot: {
      id: "card_slot",
      type: "frame",
      name: "Slot",
      children: [],
      layout: {
        self: {
          rect: { x: 0, y: 0, width: 336, height: 60 },
          constraints: { horizontal: "leftRight", vertical: "top" },
          alignX: "start",
          alignY: "start",
        },
        children: { mode: "auto", direction: "column", gap: 8, padding: 0, alignItems: "stretch" },
      },
    },
  };

  const template: Pick<PrefabDefinitionV1["template"], "rootId" | "nodesById" | "slotTargets"> = {
    rootId: "page",
    nodesById,
    slotTargets: { default: "card_slot" },
  };

  return {
    prefabId: "card",
    manifest,
    template,
  };
}

export function createDefaultPrefabRegistryV1(): PrefabRegistryV1 {
  const registry = new PrefabRegistryV1();
  registry.register(createCardPrefabDefinition());
  return registry;
}

export function createEmptyPageBlueprint(): PageBlueprint {
  return {
    version: 1,
    rootId: "page",
    nodesById: {
      page: {
        id: "page",
        type: "page_root",
        name: "Page",
        children: [],
        layout: { children: { mode: "absolute" } },
      },
    },
  };
}
