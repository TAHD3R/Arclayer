import { useCallback, useEffect, useRef, useState } from "react";

import type {
  BuilderGenerationTargetV1,
  BuilderRevisionOut,
  BuilderRevisionPageOut,
} from "@arclayer/openapi";

import { wireframeGenerationTargetKey } from "@/pages/projects/editor/wireframe-generation-targets";

export function useWireframeGenerationTargetScope({
  revision,
  page,
  initialTargets,
  onTargetsChange,
}: {
  revision: BuilderRevisionOut | null;
  page: BuilderRevisionPageOut | null;
  initialTargets: readonly BuilderGenerationTargetV1[];
  onTargetsChange: (targets: readonly BuilderGenerationTargetV1[]) => void;
}) {
  const [selectedTargets, setSelectedTargets] = useState<readonly BuilderGenerationTargetV1[]>([]);
  const selectedTargetsRef = useRef<readonly BuilderGenerationTargetV1[]>([]);
  const targetAnchorRef = useRef<string | null>(null);
  const emittedScopeKeyRef = useRef<string | null>(null);
  const initialScopeKey = targetScopeKey(initialTargets);

  const commitTargets = useCallback((targets: readonly BuilderGenerationTargetV1[]) => {
    selectedTargetsRef.current = targets;
    setSelectedTargets(targets);
  }, []);

  useEffect(() => {
    if (!revision || !page) return;
    const anchor = `${revision.siteRevision.id}:${page.itemId}`;
    const anchorChanged = targetAnchorRef.current !== anchor;
    const firstHydration = targetAnchorRef.current === null;
    const pageScope = [{ kind: "page" as const, itemId: page.itemId }];

    if (anchorChanged) {
      targetAnchorRef.current = anchor;
      emittedScopeKeyRef.current = null;
      const nextTargets = firstHydration && initialTargets.length > 0 ? initialTargets : pageScope;
      commitTargets(nextTargets);
      if (!(firstHydration && initialTargets.length > 0)) {
        emittedScopeKeyRef.current = targetScopeKey(nextTargets);
        onTargetsChange(nextTargets);
      }
      return;
    }

    const externalTargets = initialTargets.length > 0 ? initialTargets : pageScope;
    const externalScopeKey = targetScopeKey(externalTargets);
    if (emittedScopeKeyRef.current === externalScopeKey) {
      emittedScopeKeyRef.current = null;
      return;
    }
    if (targetScopeKey(selectedTargetsRef.current) !== externalScopeKey) {
      commitTargets(externalTargets);
    }
  }, [commitTargets, initialScopeKey, initialTargets, onTargetsChange, page, revision]);

  const updateTargets = useCallback(
    (
      update: (
        current: readonly BuilderGenerationTargetV1[],
      ) => readonly BuilderGenerationTargetV1[],
    ) => {
      const nextTargets = update(selectedTargetsRef.current);
      const nextScopeKey = targetScopeKey(nextTargets);
      if (nextScopeKey === targetScopeKey(selectedTargetsRef.current)) return;
      emittedScopeKeyRef.current = nextScopeKey;
      commitTargets(nextTargets);
      onTargetsChange(nextTargets);
    },
    [commitTargets, onTargetsChange],
  );

  return { selectedTargets, updateTargets };
}

function targetScopeKey(targets: readonly BuilderGenerationTargetV1[]): string {
  return targets.map(wireframeGenerationTargetKey).join("|");
}
