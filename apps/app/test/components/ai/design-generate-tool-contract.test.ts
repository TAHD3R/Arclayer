import { describe, expect, it } from "vitest";

import {
  readDesignGenerateArgs,
  readDesignGenerationReference,
} from "@/components/ai/design-generate-tool-contract";

describe("Design generation Tool contract", () => {
  it("accepts only a bounded page-scoped Design request", () => {
    expect(
      readDesignGenerateArgs({
        pageItemId: "home-page",
        objective: "Create a restrained editorial direction.",
        locale: "en-US",
        candidateCount: 3,
      }),
    ).toEqual({
      pageItemId: "home-page",
      objective: "Create a restrained editorial direction.",
      locale: "en-US",
      candidateCount: 3,
    });
    expect(
      readDesignGenerateArgs({
        pageItemId: "home-page",
        objective: "Create a restrained editorial direction.",
        locale: "en-US",
        candidateCount: 4,
      }),
    ).toBeNull();
  });

  it("accepts only the exact durable Design reference", () => {
    const reference = {
      generationId: "generation-1",
      jobId: "job-1",
      projectId: "project-1",
      baseRevisionId: "revision-1",
      targetStage: "design",
      selectedPageId: "home-page",
      status: "running",
    };

    expect(readDesignGenerationReference(reference)).toEqual(reference);
    expect(readDesignGenerationReference({ ...reference, targetStage: "wireframe" })).toBeNull();
    expect(readDesignGenerationReference({ ...reference, selectedPageId: "" })).toBeNull();
    expect(readDesignGenerationReference({ ...reference, status: "unknown" })).toBeNull();
  });
});
