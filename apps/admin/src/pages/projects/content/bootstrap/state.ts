import type { AdminContentBootstrapPresetState, AdminContentCapabilityPackId } from "@/types/api";

import { CONTENT_BOOTSTRAP_PRESET_MAP } from "./definitions";
import type { ContentBootstrapPresetKey, ContentBootstrapShapeSelection } from "./types";

function dedupePackIds(values: AdminContentCapabilityPackId[]): AdminContentCapabilityPackId[] {
  return Array.from(new Set(values));
}

function areSamePackSet(
  left: AdminContentCapabilityPackId[],
  right: AdminContentCapabilityPackId[],
): boolean {
  if (left.length !== right.length) return false;
  const leftSet = new Set(left);
  return right.every((value) => leftSet.has(value));
}

export function resolvePresetState(params: {
  presetKey: ContentBootstrapPresetKey | null;
  capabilityPackIds: AdminContentCapabilityPackId[];
}): AdminContentBootstrapPresetState {
  if (!params.presetKey) return "none";
  const preset = CONTENT_BOOTSTRAP_PRESET_MAP.get(params.presetKey);
  if (!preset) return "none";
  return areSamePackSet(dedupePackIds(params.capabilityPackIds), preset.packIds)
    ? "selected"
    : "customized";
}

export function applyPresetSelection(
  presetKey: ContentBootstrapPresetKey,
): ContentBootstrapShapeSelection {
  const preset = CONTENT_BOOTSTRAP_PRESET_MAP.get(presetKey);
  return {
    presetKey,
    presetState: "selected",
    capabilityPackIds: dedupePackIds(preset?.packIds ?? []),
  };
}

export function toggleCapabilityPack(
  selection: ContentBootstrapShapeSelection,
  packId: AdminContentCapabilityPackId,
): ContentBootstrapShapeSelection {
  const current = new Set(selection.capabilityPackIds);
  if (current.has(packId)) current.delete(packId);
  else current.add(packId);

  const capabilityPackIds = dedupePackIds(Array.from(current));
  return {
    presetKey: selection.presetKey,
    presetState: resolvePresetState({
      presetKey: selection.presetKey,
      capabilityPackIds,
    }),
    capabilityPackIds,
  };
}

export function detachPreset(
  selection: ContentBootstrapShapeSelection,
): ContentBootstrapShapeSelection {
  return {
    presetKey: null,
    presetState: "none",
    capabilityPackIds: dedupePackIds(selection.capabilityPackIds),
  };
}

export function createEmptyShapeSelection(): ContentBootstrapShapeSelection {
  return {
    presetKey: null,
    presetState: "none",
    capabilityPackIds: [],
  };
}
