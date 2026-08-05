import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import type { DesignSystemVersionSummaryOut } from "@arclayer/openapi";
import {
  PROJECT_DESIGN_SYSTEM_QUERY_KEY,
  supersedeProjectDesignSystemVersion,
} from "@/api/project-design-systems";

interface ProjectStyleGuideSupersessionInput {
  projectId: string;
  systemId: string | null;
  systemMetadataRevision: number | null;
  replacementVersion: DesignSystemVersionSummaryOut | null;
  enabled: boolean;
}

export function useProjectStyleGuideSupersession(input: ProjectStyleGuideSupersessionInput) {
  const queryClient = useQueryClient();
  const [targetVersion, setTargetVersion] = useState<DesignSystemVersionSummaryOut | null>(null);
  const mutation = useMutation({
    mutationFn: (target: DesignSystemVersionSummaryOut) => {
      if (
        !input.enabled ||
        !input.systemId ||
        !input.replacementVersion ||
        input.systemMetadataRevision === null
      ) {
        throw new Error("CREATION_EDITOR_STYLE_SUPERSEDE_NOT_AVAILABLE");
      }
      return supersedeProjectDesignSystemVersion(
        input.projectId,
        input.systemId,
        target.id,
        {
          replacementVersionId: input.replacementVersion.id,
          expectedReplacementChecksum: input.replacementVersion.manifestChecksum,
          expectedTargetStatus: target.lifecycleStatus,
          expectedTargetStatusRevision: target.statusRevision,
          expectedSystemRevision: input.systemMetadataRevision,
        },
        `style-guide-supersede:${target.id}:${input.replacementVersion.id}`,
      );
    },
    onSuccess: () => {
      setTargetVersion(null);
      void queryClient.invalidateQueries({
        queryKey: [...PROJECT_DESIGN_SYSTEM_QUERY_KEY, input.projectId],
      });
    },
  });

  return {
    targetVersion,
    replacementVersion: input.replacementVersion,
    mutation,
    open: (target: DesignSystemVersionSummaryOut) => {
      mutation.reset();
      setTargetVersion(target);
    },
    close: () => {
      if (mutation.isPending) return;
      mutation.reset();
      setTargetVersion(null);
    },
    confirm: () => {
      if (!targetVersion) return;
      mutation.mutate(targetVersion);
    },
  };
}

export type ProjectStyleGuideSupersession = ReturnType<typeof useProjectStyleGuideSupersession>;
