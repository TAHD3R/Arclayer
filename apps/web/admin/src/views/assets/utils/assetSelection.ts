export type AssetSelectionState = {
  selectedIds: Set<string>;
  lastActiveId: string | null;
};

export function selectOnly(_state: AssetSelectionState, id: string): AssetSelectionState {
  return {
    selectedIds: new Set([id]),
    lastActiveId: id,
  };
}

export function toggleSelect(state: AssetSelectionState, id: string): AssetSelectionState {
  const next = new Set(state.selectedIds);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return {
    selectedIds: next,
    lastActiveId: id,
  };
}

export function rangeSelect(
  state: AssetSelectionState,
  targetId: string,
  orderedIds: string[],
): AssetSelectionState {
  const anchor = state.lastActiveId;
  if (!anchor) return selectOnly(state, targetId);

  const a = orderedIds.indexOf(anchor);
  const b = orderedIds.indexOf(targetId);
  if (a < 0 || b < 0) return selectOnly(state, targetId);

  const [start, end] = a <= b ? [a, b] : [b, a];
  const range = orderedIds.slice(start, end + 1);
  return {
    selectedIds: new Set(range),
    lastActiveId: targetId,
  };
}

export function clearSelection(_state: AssetSelectionState): AssetSelectionState {
  return {
    selectedIds: new Set(),
    lastActiveId: null,
  };
}
