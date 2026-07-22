import { describe, expect, it } from "vitest";

import type { BuilderComponentCatalogOut, BuilderRevisionOut } from "@arclayer/openapi";

import {
  buildWireframeGenerationTargetCatalog,
  resolveWireframeGenerationTargets,
} from "@/pages/projects/editor/wireframe-generation-targets";

describe("wireframe generation targets", () => {
  it("keeps page and reusable-section catalog order with server graph evidence", () => {
    const catalog = buildWireframeGenerationTargetCatalog(buildRevision(), componentCatalog());

    expect(catalog.map((option) => option.target)).toEqual([
      { kind: "page", itemId: "home-page" },
      { kind: "global_section", itemId: "global-header" },
    ]);
    expect(catalog.map((option) => option.state)).toEqual(["ready", "ready"]);
    expect(catalog[1]).toMatchObject({
      incomingReferenceCount: 1,
      locale: "en-US",
      location: "primary-navigation",
    });
  });

  it.each([
    {
      name: "missing version pin",
      mutate: (revision: BuilderRevisionOut) => {
        revision.pages[0]!.versionNumber = 0;
      },
      state: "version_missing",
      reasonKey: "CREATION_EDITOR_WIREFRAME_GENERATION_TARGET_VERSION_REQUIRED",
    },
    {
      name: "missing canonical planning",
      mutate: (revision: BuilderRevisionOut) => {
        revision.pages[0]!.purpose = null;
      },
      state: "plan_missing",
      reasonKey: "CREATION_EDITOR_WIREFRAME_GENERATION_TARGET_PLAN_REQUIRED",
    },
    {
      name: "orphaned planning traceability",
      mutate: (revision: BuilderRevisionOut) => {
        revision.pages[0]!.wireframeTraceability = {
          status: "orphaned",
          missingIntentIds: [],
          orphanedSectionIds: ["hero"],
        };
      },
      state: "plan_orphaned",
      reasonKey: "CREATION_EDITOR_WIREFRAME_GENERATION_TARGET_PLAN_REPAIR_REQUIRED",
    },
    {
      name: "component catalog pin drift",
      mutate: (revision: BuilderRevisionOut) => {
        revision.pages[0]!.wireframe!.componentCatalogVersion = "catalog-v0";
      },
      state: "catalog_mismatch",
      reasonKey: "CREATION_EDITOR_WIREFRAME_GENERATION_TARGET_CATALOG_MISMATCH",
    },
  ])("keeps $name explicit and non-executable", ({ mutate, state, reasonKey }) => {
    const revision = buildRevision();
    mutate(revision);

    expect(buildWireframeGenerationTargetCatalog(revision, componentCatalog())[0]).toMatchObject({
      state,
      reasonKey,
      executable: false,
    });
  });

  it("uses server cycle and unknown-reference evidence to block affected hosts", () => {
    const revision = buildRevision();
    revision.globalSectionGraph = {
      references: [],
      missingWireframeReferences: [],
      cycles: [{ itemPath: ["home-page", "global-header", "home-page"] }],
      unknownReferences: [
        {
          hostItemId: "global-header",
          hostKind: "global_section",
          hostSectionId: "navigation",
          targetItemId: "missing-global",
        },
      ],
    };

    expect(
      buildWireframeGenerationTargetCatalog(revision, componentCatalog()).map((option) => ({
        itemId: option.target.itemId,
        state: option.state,
        executable: option.executable,
      })),
    ).toEqual([
      { itemId: "home-page", state: "graph_blocked", executable: false },
      { itemId: "global-header", state: "graph_blocked", executable: false },
    ]);
  });

  it("preserves requested order and unresolved URL targets without silent removal", () => {
    const catalog = buildWireframeGenerationTargetCatalog(buildRevision(), componentCatalog());
    const resolved = resolveWireframeGenerationTargets(
      [
        { kind: "global_section", itemId: "missing-global" },
        { kind: "page", itemId: "home-page" },
        { kind: "global_section", itemId: "global-header" },
      ],
      catalog,
    );

    expect(resolved.map((option) => option.target.itemId)).toEqual([
      "missing-global",
      "home-page",
      "global-header",
    ]);
    expect(resolved[0]).toMatchObject({
      title: "missing-global",
      state: "missing",
      reasonKey: "CREATION_EDITOR_WIREFRAME_GENERATION_TARGET_MISSING",
      executable: false,
    });
  });
});

function buildRevision(): BuilderRevisionOut {
  const traceability = {
    status: "aligned" as const,
    missingIntentIds: [],
    orphanedSectionIds: [],
  };
  const wireframe = (itemId: string) => ({
    schemaVersion: 1 as const,
    pageItemId: itemId,
    designSystemVersionId: "design-version-1",
    componentCatalogVersion: "catalog-v1",
    sections: [],
  });
  return {
    siteRevision: {
      id: "revision-1",
      revisionNumber: 1,
      manifestHash: `sha256:${"1".repeat(64)}`,
      designSystemId: "design-system-1",
      designSystemVersionId: "design-version-1",
      designSystemManifestChecksum: `sha256:${"2".repeat(64)}`,
    },
    pages: [
      {
        itemId: "home-page",
        contentVersionId: "home-version-1",
        versionNumber: 1,
        title: "Home",
        summary: null,
        parentItemId: null,
        sortOrder: 0,
        routes: [{ locale: "en-US", path: "/", isActive: true }],
        purpose: "Introduce the product",
        sectionIntents: [{ id: "hero", label: "Hero", goal: "Explain the value" }],
        wireframeTraceability: traceability,
        wireframe: wireframe("home-page"),
      },
    ],
    globalSections: [
      {
        itemId: "global-header",
        contentVersionId: "header-version-1",
        versionNumber: 1,
        title: "Primary navigation",
        summary: null,
        locale: "en-US",
        slug: "primary-navigation",
        purpose: "Keep navigation consistent",
        sectionIntents: [{ id: "navigation", label: "Navigation", goal: "Guide visitors" }],
        wireframeTraceability: traceability,
        wireframe: wireframe("global-header"),
      },
    ],
    globalSectionGraph: {
      references: [
        {
          hostItemId: "home-page",
          hostKind: "page",
          hostSectionId: "navigation",
          targetItemId: "global-header",
        },
      ],
      unknownReferences: [],
      missingWireframeReferences: [],
      cycles: [],
    },
  } as unknown as BuilderRevisionOut;
}

function componentCatalog(): BuilderComponentCatalogOut {
  return {
    siteRevisionId: "revision-1",
    designSystemVersionId: "design-version-1",
    designSystemManifestChecksum: `sha256:${"2".repeat(64)}`,
    catalog: {
      schemaVersion: 1,
      catalogVersion: "catalog-v1",
      components: [],
    },
  } as unknown as BuilderComponentCatalogOut;
}
