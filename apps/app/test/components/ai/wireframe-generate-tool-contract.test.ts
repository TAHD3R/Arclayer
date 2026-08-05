import { describe, expect, it } from "vitest";

import {
  readWireframeGenerateArgs,
  readWireframeGenerationReference,
} from "@/components/ai/wireframe-generate-tool-contract";

describe("wireframe generate Tool contract", () => {
  it("accepts the exact page-scoped generation request", () => {
    expect(
      readWireframeGenerateArgs({
        pageItemId: "home-page",
        objective: "Compose the page from its ordered section intents.",
        locale: "en-US",
        candidateCount: 2,
      }),
    ).toEqual({
      pageItemId: "home-page",
      objective: "Compose the page from its ordered section intents.",
      locale: "en-US",
      candidateCount: 2,
    });
  });

  it("rejects incomplete requests and candidate counts outside the backend contract", () => {
    expect(readWireframeGenerateArgs({ objective: "Compose it", candidateCount: 2 })).toBeNull();
    expect(
      readWireframeGenerateArgs({
        pageItemId: "home-page",
        objective: "Compose it",
        locale: "en-US",
        candidateCount: 4,
      }),
    ).toBeNull();
  });

  it("accepts only durable Wireframe generation references", () => {
    const reference = {
      generationId: "generation-1",
      jobId: "job-1",
      projectId: "project-1",
      baseRevisionId: "revision-1",
      targetStage: "wireframe",
      selectedPageId: "home-page",
      status: "queued",
    };

    expect(readWireframeGenerationReference(reference)).toEqual(reference);
    expect(readWireframeGenerationReference({ ...reference, targetStage: "sitemap" })).toBeNull();
    expect(readWireframeGenerationReference({ ...reference, status: "unknown" })).toBeNull();
  });
});
