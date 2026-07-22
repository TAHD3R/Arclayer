import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/http", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

import {
  cancelProjectBuilderCompositionSaga,
  cancelProjectBuilderGeneration,
  createProjectBuilderCompositionSaga,
  createProjectBuilderGeneration,
  getProjectBuilderPageRenderDocument,
  getProjectBuilderCompositionSaga,
  getProjectBuilderGeneration,
  recoverProjectBuilderCompositionSaga,
  recoverProjectBuilderGeneration,
  transitionProjectBuilderCompositionSagaPhase,
} from "@/api/project-builder";
import { api } from "@/lib/http";

describe("api/project Builder generation contracts", () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset().mockResolvedValue({});
    vi.mocked(api.post).mockReset().mockResolvedValue({});
  });

  it("starts a direct-Agent Wireframe generation against the exact revision", async () => {
    const payload = {
      targetStage: "wireframe" as const,
      baseRevisionId: "revision/one",
      baseEtag: `sha256:${"a".repeat(64)}`,
      agentId: "agent/one",
      objective: "Compose a clear product page Wireframe.",
      locale: "en-US",
      candidateCount: 2,
      targets: [{ kind: "page" as const, itemId: "page/one" }],
    };

    await createProjectBuilderGeneration("project/alpha", payload, "wireframe-generation-command");

    expect(api.post).toHaveBeenCalledWith(
      "/projects/project%2Falpha/builder/generations",
      payload,
      { headers: { "Idempotency-Key": "wireframe-generation-command" } },
    );
  });

  it("recovers, reads, and cancels the exact durable Wireframe generation", async () => {
    const controller = new AbortController();

    await recoverProjectBuilderGeneration(
      "project/alpha",
      {
        targetStage: "wireframe",
        targets: [
          { kind: "page", itemId: "page/one" },
          { kind: "global_section", itemId: "global-section/navigation" },
        ],
      },
      controller.signal,
    );
    await getProjectBuilderGeneration("project/alpha", "generation/one", controller.signal);
    await cancelProjectBuilderGeneration("project/alpha", "generation/one", {
      reason: "User stopped this Wireframe generation.",
    });

    expect(api.get).toHaveBeenNthCalledWith(
      1,
      "/projects/project%2Falpha/builder/generations/recovery?target_stage=wireframe&target=page%3Apage%2Fone&target=global_section%3Aglobal-section%2Fnavigation",
      { signal: controller.signal },
    );
    expect(api.get).toHaveBeenNthCalledWith(
      2,
      "/projects/project%2Falpha/builder/generations/generation%2Fone",
      { signal: controller.signal },
    );
    expect(api.post).toHaveBeenCalledWith(
      "/projects/project%2Falpha/builder/generations/generation%2Fone/cancel",
      { reason: "User stopped this Wireframe generation." },
    );
  });

  it("recovers the exact page-scoped durable Design generation", async () => {
    const controller = new AbortController();

    await recoverProjectBuilderGeneration(
      "project/alpha",
      {
        targetStage: "design",
        targets: [{ kind: "page", itemId: "page/one" }],
      },
      controller.signal,
    );

    expect(api.get).toHaveBeenCalledWith(
      "/projects/project%2Falpha/builder/generations/recovery?target_stage=design&target=page%3Apage%2Fone",
      { signal: controller.signal },
    );
  });

  it("creates and recovers one composition Saga for the exact ordered target tuple", async () => {
    const controller = new AbortController();
    const targets = [
      { kind: "global_section" as const, itemId: "global-section/navigation" },
      { kind: "page" as const, itemId: "page/home" },
    ];
    const payload = {
      baseRevisionId: "revision/one",
      baseEtag: `sha256:${"a".repeat(64)}`,
      agentId: "agent/one",
      objective: "Plan the missing targets, then compose their Wireframes.",
      locale: "en-US",
      candidateCount: 2,
      targets,
    };

    await createProjectBuilderCompositionSaga("project/alpha", payload, "composition-saga-command");
    await recoverProjectBuilderCompositionSaga("project/alpha", { targets }, controller.signal);

    expect(api.post).toHaveBeenCalledWith(
      "/projects/project%2Falpha/builder/composition-sagas",
      payload,
      { headers: { "Idempotency-Key": "composition-saga-command" } },
    );
    expect(api.get).toHaveBeenCalledWith(
      "/projects/project%2Falpha/builder/composition-sagas/recovery?target=global_section%3Aglobal-section%2Fnavigation&target=page%3Apage%2Fhome",
      { signal: controller.signal },
    );
  });

  it("reads, advances, and cancels the persisted composition Saga", async () => {
    const controller = new AbortController();
    const transition = {
      expectedPhase: "planning" as const,
      appliedChangeSetId: "change-set/planning",
      appliedSiteRevisionId: "revision/planned",
    };

    await getProjectBuilderCompositionSaga("project/alpha", "saga/one", controller.signal);
    await transitionProjectBuilderCompositionSagaPhase("project/alpha", "saga/one", transition);
    await cancelProjectBuilderCompositionSaga("project/alpha", "saga/one", {
      reason: "User stopped coordinated composition.",
    });

    expect(api.get).toHaveBeenCalledWith(
      "/projects/project%2Falpha/builder/composition-sagas/saga%2Fone",
      { signal: controller.signal },
    );
    expect(api.post).toHaveBeenNthCalledWith(
      1,
      "/projects/project%2Falpha/builder/composition-sagas/saga%2Fone/phase-transitions",
      transition,
    );
    expect(api.post).toHaveBeenNthCalledWith(
      2,
      "/projects/project%2Falpha/builder/composition-sagas/saga%2Fone/cancel",
      { reason: "User stopped coordinated composition." },
    );
  });

  it("reads one exact locale and theme renderer document from a pinned revision", async () => {
    const controller = new AbortController();

    await getProjectBuilderPageRenderDocument(
      "project/alpha",
      "revision/one",
      "page/home",
      "zh-CN",
      "dark",
      controller.signal,
    );

    expect(api.get).toHaveBeenCalledWith(
      "/projects/project%2Falpha/builder/revisions/revision%2Fone/pages/page%2Fhome/render-document?locale=zh-CN&theme=dark",
      { signal: controller.signal },
    );
  });
});
