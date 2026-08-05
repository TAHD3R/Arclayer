import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  BuilderChangeSetPreviewOut,
  BuilderCompositionSagaOut,
  BuilderGenerationOut,
  BuilderRevisionOut,
  DesignSystemConceptGenerationOut,
  VisualBlueprintDocumentV1,
} from "@arclayer/openapi";

import { ProjectEditorPage, type ProjectEditorPageProps } from "@/pages/projects/editor/page";
import { siteRenderDocumentFixture } from "../../fixtures/site-render-document";

const navigateMock = vi.fn();
const getProjectDetailMock = vi.fn();
const getProjectBuilderMock = vi.fn();
const getProjectBuilderRevisionMock = vi.fn();
const getProjectBuilderPageRenderDocumentMock = vi.fn();
const getProjectBuilderComponentCatalogMock = vi.fn();
const getProjectBuilderGenerationMock = vi.fn();
const recoverProjectBuilderGenerationMock = vi.fn();
const createProjectBuilderGenerationMock = vi.fn();
const previewProjectBuilderChangeSetMock = vi.fn();
const cancelProjectBuilderGenerationMock = vi.fn();
const createProjectBuilderCompositionSagaMock = vi.fn();
const recoverProjectBuilderCompositionSagaMock = vi.fn();
const getProjectBuilderCompositionSagaMock = vi.fn();
const transitionProjectBuilderCompositionSagaPhaseMock = vi.fn();
const cancelProjectBuilderCompositionSagaMock = vi.fn();
const applyProjectBuilderChangeSetMock = vi.fn();
const listAIWorkspaceAgentsMock = vi.fn();
const createAgentThreadMock = vi.fn();
const createAgentRunMock = vi.fn();
const getProjectDesignSystemAssignmentMock = vi.fn();
const getProjectDesignSystemVersionMock = vi.fn();
const listProjectDesignSystemVersionsMock = vi.fn();
const compareProjectDesignSystemVersionsMock = vi.fn();
const previewProjectDesignSystemImpactMock = vi.fn();
const supersedeProjectDesignSystemVersionMock = vi.fn();
const getWorkspaceDesignSystemVersionMock = vi.fn();
const createProjectDesignSystemVersionMock = vi.fn();
const validateProjectDesignSystemVersionMock = vi.fn();
const setProjectDesignSystemAssignmentMock = vi.fn();
const forkProjectDesignSystemMock = vi.fn();
const createProjectDesignSystemConceptGenerationMock = vi.fn();
const recoverProjectDesignSystemConceptGenerationsMock = vi.fn();
const cancelProjectDesignSystemConceptGenerationMock = vi.fn();
const hasProjectActionMock = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: {
      language: "zh-CN",
      resolvedLanguage: "zh-CN",
    },
  }),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigateMock,
}));

vi.mock("@/stores/use-workspace-store", () => ({
  useWorkspaceStore: (selector: (state: { currentWorkspaceId: string }) => unknown) =>
    selector({ currentWorkspaceId: "workspace-1" }),
}));

vi.mock("@/hooks/use-workspace-permission-access", () => ({
  useProjectPermissionAccess: () => ({
    authzQuery: { isPending: false },
    actionsQuery: { isPending: false },
    hasPermission: () => false,
    hasAction: (...args: unknown[]) => hasProjectActionMock(...args),
  }),
}));

vi.mock("@/api/projects", () => ({
  getProjectDetail: (...args: unknown[]) => getProjectDetailMock(...args),
}));

vi.mock("@/api/project-builder", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/project-builder")>();
  return {
    ...actual,
    getProjectBuilder: (...args: unknown[]) => getProjectBuilderMock(...args),
    getProjectBuilderRevision: (...args: unknown[]) => getProjectBuilderRevisionMock(...args),
    getProjectBuilderPageRenderDocument: (...args: unknown[]) =>
      getProjectBuilderPageRenderDocumentMock(...args),
    getProjectBuilderComponentCatalog: (...args: unknown[]) =>
      getProjectBuilderComponentCatalogMock(...args),
    getProjectBuilderGeneration: (...args: unknown[]) => getProjectBuilderGenerationMock(...args),
    recoverProjectBuilderGeneration: (...args: unknown[]) =>
      recoverProjectBuilderGenerationMock(...args),
    createProjectBuilderGeneration: (...args: unknown[]) =>
      createProjectBuilderGenerationMock(...args),
    previewProjectBuilderChangeSet: (...args: unknown[]) =>
      previewProjectBuilderChangeSetMock(...args),
    cancelProjectBuilderGeneration: (...args: unknown[]) =>
      cancelProjectBuilderGenerationMock(...args),
    createProjectBuilderCompositionSaga: (...args: unknown[]) =>
      createProjectBuilderCompositionSagaMock(...args),
    recoverProjectBuilderCompositionSaga: (...args: unknown[]) =>
      recoverProjectBuilderCompositionSagaMock(...args),
    getProjectBuilderCompositionSaga: (...args: unknown[]) =>
      getProjectBuilderCompositionSagaMock(...args),
    transitionProjectBuilderCompositionSagaPhase: (...args: unknown[]) =>
      transitionProjectBuilderCompositionSagaPhaseMock(...args),
    cancelProjectBuilderCompositionSaga: (...args: unknown[]) =>
      cancelProjectBuilderCompositionSagaMock(...args),
    applyProjectBuilderChangeSet: (...args: unknown[]) => applyProjectBuilderChangeSetMock(...args),
  };
});

vi.mock("@/api/ai", () => ({
  listAIWorkspaceAgents: (...args: unknown[]) => listAIWorkspaceAgentsMock(...args),
}));

vi.mock("@/api/project-design-systems", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/project-design-systems")>();
  return {
    ...actual,
    getProjectDesignSystemAssignment: (...args: unknown[]) =>
      getProjectDesignSystemAssignmentMock(...args),
    getProjectDesignSystemVersion: (...args: unknown[]) =>
      getProjectDesignSystemVersionMock(...args),
    listProjectDesignSystemVersions: (...args: unknown[]) =>
      listProjectDesignSystemVersionsMock(...args),
    compareProjectDesignSystemVersions: (...args: unknown[]) =>
      compareProjectDesignSystemVersionsMock(...args),
    previewProjectDesignSystemImpact: (...args: unknown[]) =>
      previewProjectDesignSystemImpactMock(...args),
    supersedeProjectDesignSystemVersion: (...args: unknown[]) =>
      supersedeProjectDesignSystemVersionMock(...args),
    createProjectDesignSystemVersion: (...args: unknown[]) =>
      createProjectDesignSystemVersionMock(...args),
    validateProjectDesignSystemVersion: (...args: unknown[]) =>
      validateProjectDesignSystemVersionMock(...args),
    setProjectDesignSystemAssignment: (...args: unknown[]) =>
      setProjectDesignSystemAssignmentMock(...args),
    forkProjectDesignSystem: (...args: unknown[]) => forkProjectDesignSystemMock(...args),
    createProjectDesignSystemConceptGeneration: (...args: unknown[]) =>
      createProjectDesignSystemConceptGenerationMock(...args),
    recoverProjectDesignSystemConceptGenerations: (...args: unknown[]) =>
      recoverProjectDesignSystemConceptGenerationsMock(...args),
    cancelProjectDesignSystemConceptGeneration: (...args: unknown[]) =>
      cancelProjectDesignSystemConceptGenerationMock(...args),
  };
});

vi.mock("@/api/workspace-design-systems", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/workspace-design-systems")>();
  return {
    ...actual,
    getWorkspaceDesignSystemVersion: (...args: unknown[]) =>
      getWorkspaceDesignSystemVersionMock(...args),
  };
});

vi.mock(
  "@/pages/workspaces/settings/workspace/design-systems/workspace-design-system-dialogs",
  () => ({
    WorkspaceDesignSystemVersionDialog: (props: {
      open: boolean;
      source?: Record<string, unknown>;
      parentVersionId?: string;
      parentChecksum?: string;
      onSubmit: (payload: Record<string, unknown>, idempotencyKey: string) => void;
    }) =>
      props.open ? (
        <button
          type="button"
          onClick={() =>
            props.onSubmit(
              {
                manifest: props.source ?? {},
                parentVersionId: props.parentVersionId ?? null,
                expectedParentChecksum: props.parentChecksum ?? null,
                source: "manual",
              },
              "dialog-command",
            )
          }
        >
          settings:SETTINGS_WORKSPACE_DESIGN_SYSTEMS_VERSION_CREATE_ACTION
        </button>
      ) : null,
  }),
);

vi.mock("@/lib/ai/agent-thread-api", () => ({
  createAgentThread: (...args: unknown[]) => createAgentThreadMock(...args),
}));

vi.mock("@/lib/ai/agent-run-api", () => ({
  createAgentRun: (...args: unknown[]) => createAgentRunMock(...args),
}));

const siteRevision = {
  id: "revision-1",
  revisionNumber: 2,
  manifestHash: `sha256:${"1".repeat(64)}`,
  designSystemId: "design-system-1",
  designSystemVersionId: "design-version-1",
  designSystemManifestChecksum: `sha256:${"7".repeat(64)}`,
};

const designSystemManifest = {
  manifestVersion: 1 as const,
  name: "Northstar foundation",
  primitiveTokens: {
    "primitive.color.canvas": { type: "color" as const, value: "#FFFFFF", alias: null },
    "primitive.color.ink": { type: "color" as const, value: "#111111", alias: null },
    "primitive.color.muted": { type: "color" as const, value: "#595959", alias: null },
    "primitive.color.action": { type: "color" as const, value: "#155EEF", alias: null },
    "primitive.color.on-action": { type: "color" as const, value: "#FFFFFF", alias: null },
    "primitive.color.border": { type: "color" as const, value: "#D5D7DA", alias: null },
    "primitive.color.focus": { type: "color" as const, value: "#155EEF", alias: null },
    "primitive.font.family.body": {
      type: "font-family" as const,
      value: ["Figtree", "sans-serif"],
      alias: null,
    },
    "primitive.font.size.body": { type: "dimension" as const, value: "1rem", alias: null },
    "primitive.motion.duration.standard": {
      type: "duration" as const,
      value: "180ms",
      alias: null,
    },
  },
  semanticTokens: {},
  componentTokens: {},
  themes: [{ key: "light", name: "Light", mode: "light" as const, overrides: {} }],
  typographyRoles: [],
  componentRecipes: [],
  motionTokens: [],
  breakpoints: { tablet: "48rem", desktop: "80rem" },
  assetReferences: [],
  componentCatalogVersion: "arclayer-wireframe-v1",
  extensions: {},
  checksum: `sha256:${"7".repeat(64)}`,
};

const projectDesignSystemAssignment = {
  projectId: "project-1",
  designSystemId: "design-system-1",
  versionId: "design-version-1",
  manifestChecksum: `sha256:${"7".repeat(64)}`,
  validationFindingHash: `sha256:${"8".repeat(64)}`,
  metadataRevision: 3,
  ownerKind: "project",
  assignedAt: "2026-07-21T00:00:00Z",
};

function projectDesignSystemVersion(versionNumber = 1) {
  return {
    id: `design-version-${versionNumber}`,
    workspaceId: "workspace-1",
    designSystemId: "design-system-1",
    versionNumber,
    manifestVersion: 1,
    manifest: { ...designSystemManifest, name: `Northstar foundation v${versionNumber}` },
    manifestChecksum: `sha256:${String(versionNumber + 6).repeat(64)}`,
    tokenIndexHash: `sha256:${"9".repeat(64)}`,
    componentCatalogVersion: "arclayer-wireframe-v1",
    parentVersionId: versionNumber === 1 ? null : "design-version-1",
    source: "manual",
    provenance: {},
    createdByUserId: "user-1",
    createdAt: "2026-07-21T00:00:00Z",
    validationStatus: versionNumber === 1 ? "valid" : null,
    validationFindingHash: versionNumber === 1 ? `sha256:${"8".repeat(64)}` : null,
    lifecycleStatus: versionNumber === 1 ? ("valid" as const) : ("candidate" as const),
    statusRevision: versionNumber === 1 ? 1 : 1,
    supersededByVersionId: null,
    statusChangedAt: "2026-07-21T00:00:00Z",
    statusChangedByUserId: "user-1",
    publishReady: false,
  };
}

const readyBuilder = {
  projectId: "project-1",
  workspaceId: "workspace-1",
  authoringAuthority: { mode: "builder_managed", state: "ready", revision: 1 },
  blockers: [],
  currentSiteRevision: siteRevision,
  currentStatus: { status: "draft" },
  defaultPreviewEnvironmentId: "environment-1",
  initializationRequired: false,
  primarySiteId: "site-1",
};

const revisionProjection = {
  siteRevision,
  status: {
    siteRevisionId: "revision-1",
    status: "draft",
    statusRevision: 1,
    readinessFindings: [],
    validatorVersion: "builder-v1",
    etag: `sha256:${"2".repeat(64)}`,
    calculatedAt: "2026-07-21T00:00:00Z",
  },
  contentStructureRevision: {
    id: "structure-1",
    revisionNumber: 2,
    structureHash: `sha256:${"3".repeat(64)}`,
    createdAt: "2026-07-21T00:00:00Z",
    snapshot: {
      workspaceId: "workspace-1",
      projectId: "project-1",
      siteId: "site-1",
      environmentId: "environment-1",
      locales: ["en-US"],
      pages: [],
    },
  },
  globalSections: [
    {
      itemId: "global-header",
      contentVersionId: "global-header-version",
      versionNumber: 4,
      title: "Primary navigation",
      summary: "Shared navigation for every marketing page",
      locale: "en-US",
      slug: "primary-navigation",
      purpose: "Keep primary navigation consistent across the site",
      sectionIntents: [
        {
          id: "intent.navigation",
          label: "Navigation",
          goal: "Provide a consistent route into the product story",
          generationGuidance: "Keep the primary action visible",
        },
      ],
      wireframeTraceability: {
        status: "aligned",
        missingIntentIds: [],
        orphanedSectionIds: [],
      },
      wireframeChecksum: `sha256:${"9".repeat(64)}`,
      wireframe: {
        schemaVersion: 1,
        pageItemId: "global-header",
        designSystemVersionId: "design-version-1",
        componentCatalogVersion: "arclayer-wireframe-v1",
        sections: [
          {
            id: "navigation",
            intentId: "intent.navigation",
            componentKey: "navigation.header",
            variantKey: "default",
            label: "Navigation",
            bindings: [],
            responsiveRules: [],
            interactionRules: [],
            assetReferences: [],
          },
        ],
      },
    },
    {
      itemId: "global-footer",
      contentVersionId: "global-footer-version",
      versionNumber: 2,
      title: "Global footer",
      summary: "Shared footer awaiting composition",
      locale: "en-US",
      slug: "global-footer",
      purpose: "Close every page with trusted navigation",
      sectionIntents: [],
      wireframeTraceability: {
        status: "not_started",
        missingIntentIds: [],
        orphanedSectionIds: [],
      },
      wireframe: null,
    },
  ],
  globalSectionGraph: {
    references: [
      {
        hostItemId: "about-page",
        hostKind: "page",
        hostSectionId: "about-navigation",
        targetItemId: "global-header",
      },
    ],
    unknownReferences: [],
    missingWireframeReferences: [],
    cycles: [],
  },
  pages: [
    {
      itemId: "home-page",
      contentVersionId: "home-version",
      versionNumber: 2,
      title: "Home",
      summary: "The product entry point",
      parentItemId: null,
      sortOrder: 0,
      routes: [{ locale: "en-US", path: "/", isActive: true }],
      purpose: "Turn product interest into a clear next step",
      sectionIntents: [
        {
          id: "intent.hero",
          label: "Hero",
          goal: "Establish the primary value proposition",
          generationGuidance: "Lead with concrete proof",
        },
      ],
      wireframeTraceability: {
        status: "aligned",
        missingIntentIds: [],
        orphanedSectionIds: [],
      },
      wireframeChecksum: `sha256:${"a".repeat(64)}`,
      wireframe: {
        schemaVersion: 1,
        pageItemId: "home-page",
        designSystemVersionId: "design-version-1",
        componentCatalogVersion: "arclayer-wireframe-v1",
        sections: [
          {
            id: "hero",
            intentId: "intent.hero",
            componentKey: "landing.hero",
            variantKey: "default",
            label: "Hero",
            bindings: [
              { kind: "field", slotKey: "heading", fieldKey: "heroHeadline" },
              { kind: "missing", slotKey: "media.primary", reason: "media" },
            ],
            responsiveRules: [
              { breakpoint: "desktop", layout: "split", columns: 2, visible: true },
              { breakpoint: "mobile", layout: "stack", columns: 1, visible: true },
            ],
            interactionRules: [],
            assetReferences: [],
          },
        ],
      },
    },
    {
      itemId: "about-page",
      contentVersionId: "about-version",
      versionNumber: 1,
      title: "About",
      summary: "Our company story",
      parentItemId: "home-page",
      sortOrder: 0,
      routes: [{ locale: "en-US", path: "/about", isActive: true }],
      purpose: null,
      sectionIntents: [],
      wireframeTraceability: {
        status: "unplanned",
        missingIntentIds: [],
        orphanedSectionIds: [],
      },
    },
  ],
};

const componentCatalog = {
  siteRevisionId: "revision-1",
  designSystemVersionId: "design-version-1",
  designSystemManifestChecksum: `sha256:${"7".repeat(64)}`,
  defaultThemeKey: "light",
  breakpoints: {
    desktop: "1280px",
    tablet: "768px",
    mobile: "375px",
  },
  designTokens: [
    {
      path: "semantic.color.surface.canvas",
      type: "color",
      resolvedValue: "#FFFFFF",
      deprecated: false,
      replacement: null,
    },
    {
      path: "semantic.color.action.primary",
      type: "color",
      resolvedValue: "#155EEF",
      deprecated: false,
      replacement: null,
    },
  ],
  catalog: {
    schemaVersion: 1,
    catalogVersion: "arclayer-wireframe-v1",
    nameByLocale: { "zh-CN": "Arclayer 官方站点组件", "en-US": "Arclayer Site Components" },
    descriptionByLocale: { "zh-CN": "官方组件目录", "en-US": "Official component catalog" },
    source: "official",
    sourceVersion: "1.0.0",
    rendererProfile: "arclayer-site-v1",
    rendererVersion: "1.0.0",
    compilerVersion: "1.0.0",
    checksum: `sha256:${"8".repeat(64)}`,
    components: [
      {
        key: "landing.hero",
        labelByLocale: { "zh-CN": "首屏主视觉", "en-US": "Hero" },
        descriptionByLocale: { "zh-CN": "首屏", "en-US": "Hero section" },
        category: "hero",
        variants: [
          {
            key: "default",
            labelByLocale: { "zh-CN": "聚焦", "en-US": "Focused" },
            descriptionByLocale: { "zh-CN": "聚焦", "en-US": "Focused layout" },
            requiredSlotKeys: ["heading"],
            supportedResponsiveLayouts: ["stack", "grid"],
            maxColumns: 2,
          },
          {
            key: "split",
            labelByLocale: { "zh-CN": "图文分栏", "en-US": "Split" },
            descriptionByLocale: { "zh-CN": "分栏", "en-US": "Split layout" },
            requiredSlotKeys: ["heading", "media.primary"],
            supportedResponsiveLayouts: ["stack", "split"],
            maxColumns: 2,
          },
        ],
        slots: [
          {
            key: "heading",
            labelByLocale: { "zh-CN": "主标题", "en-US": "Heading" },
            descriptionByLocale: { "zh-CN": "核心主张", "en-US": "Primary proposition" },
            valueKind: "text",
            required: true,
            repeatable: false,
            acceptedBindingKinds: ["field", "literal"],
          },
          {
            key: "media.primary",
            labelByLocale: { "zh-CN": "主媒体", "en-US": "Primary media" },
            descriptionByLocale: { "zh-CN": "产品媒体", "en-US": "Primary product media" },
            valueKind: "image",
            required: false,
            repeatable: false,
            acceptedBindingKinds: ["field", "literal"],
          },
        ],
        interactions: [],
        styleSlots: [
          {
            key: "surface.background",
            valueType: "color",
            requiredStates: ["default"],
          },
          {
            key: "action.background",
            valueType: "color",
            requiredStates: ["default", "hover", "focus"],
          },
        ],
      },
      {
        key: "landing.feature-grid",
        labelByLocale: { "zh-CN": "能力网格", "en-US": "Feature grid" },
        descriptionByLocale: { "zh-CN": "能力列表", "en-US": "Feature list" },
        category: "content",
        variants: [
          {
            key: "default",
            labelByLocale: { "zh-CN": "标准网格", "en-US": "Standard grid" },
            descriptionByLocale: { "zh-CN": "网格", "en-US": "Grid layout" },
            requiredSlotKeys: ["heading", "items"],
            supportedResponsiveLayouts: ["stack", "grid"],
            maxColumns: 4,
          },
          {
            key: "split",
            labelByLocale: { "zh-CN": "引导分栏", "en-US": "Guided split" },
            descriptionByLocale: { "zh-CN": "分栏", "en-US": "Guided split layout" },
            requiredSlotKeys: ["heading", "items"],
            supportedResponsiveLayouts: ["stack", "split", "grid"],
            maxColumns: 3,
          },
        ],
        slots: [
          {
            key: "heading",
            labelByLocale: { "zh-CN": "区块标题", "en-US": "Section heading" },
            descriptionByLocale: { "zh-CN": "能力主题", "en-US": "Feature theme" },
            valueKind: "text",
            required: true,
            repeatable: false,
            acceptedBindingKinds: ["field", "literal"],
          },
          {
            key: "items",
            labelByLocale: { "zh-CN": "能力项", "en-US": "Feature items" },
            descriptionByLocale: { "zh-CN": "能力列表", "en-US": "Feature list" },
            valueKind: "list",
            required: true,
            repeatable: true,
            acceptedBindingKinds: ["field", "literal"],
          },
        ],
        interactions: [],
        styleSlots: [],
      },
    ],
  },
};

const homeVisualBlueprint = {
  schemaVersion: 1,
  itemId: "home-page",
  designSystemVersionId: "design-version-1",
  designSystemManifestChecksum: `sha256:${"7".repeat(64)}`,
  componentCatalogVersion: "arclayer-wireframe-v1",
  componentCatalogChecksum: `sha256:${"8".repeat(64)}`,
  sourceWireframeChecksum: `sha256:${"a".repeat(64)}`,
  sections: [
    {
      sectionId: "hero",
      componentKey: "landing.hero",
      variantKey: "default",
      states: [
        {
          stateKey: "default",
          styleTokens: {
            "surface.background": "semantic.color.surface.canvas",
          },
        },
      ],
      responsiveOverrides: [],
    },
  ],
} satisfies VisualBlueprintDocumentV1;

function revisionWithVisualBlueprint() {
  return {
    ...revisionProjection,
    pages: revisionProjection.pages.map((page) =>
      page.itemId === "home-page" ? { ...page, visualBlueprint: homeVisualBlueprint } : page,
    ),
  };
}

function designPreview(
  operation: BuilderChangeSetPreviewOut["operations"][number],
): BuilderChangeSetPreviewOut {
  return {
    changeSetId: "design-change-set-1",
    previewToken: "signed-design-preview-token",
    previewRef: "/projects/project-1/builder/change-sets/design-change-set-1",
    baseRevisionId: "revision-1",
    baseEtag: siteRevision.manifestHash,
    status: "previewed",
    approvalClass: "none",
    approval: null,
    operationsHash: `sha256:${"d".repeat(64)}`,
    expiresAt: "2026-07-22T00:00:00Z",
    summaryKey: "BUILDER_DESIGN_CHANGE_SET_PREVIEW_SUMMARY",
    summaryParams: { operationCount: 1 },
    requiredPermissions: ["project:content:items:write", "project:content:site-builder:write"],
    affectedTargets: [],
    issues: [],
    operations: [operation],
    designCandidates: [
      {
        itemId: "home-page",
        hostKind: "page",
        baseContentVersionId: "home-version",
        baseVersionNumber: 2,
        visualBlueprint: homeVisualBlueprint,
      },
    ],
  };
}

const builderAgent = {
  agentId: "agent-1",
  versionId: "agent-version-1",
  assignmentId: "assignment-1",
  versionNumber: 1,
  slug: "site-builder",
  name: "Site Architect",
  role: "Website planning",
  description: "Plans website structure",
  scope: "system",
  provenance: "arclayer_official",
  supportedExecutionModes: ["build"],
  collaborationAgentIds: [],
  toolGrants: [
    "builder.sitemap.generate",
    "builder.sitemap.apply",
    "builder.wireframe.generate",
    "builder.wireframe.apply",
  ],
  available: true,
  isDefault: true,
  isPinned: true,
};

const visualDesignerAgent = {
  ...builderAgent,
  agentId: "agent-visual",
  versionId: "agent-version-visual-2",
  assignmentId: "assignment-visual",
  versionNumber: 2,
  slug: "visual-designer",
  name: "Visual Designer",
  role: "Visual design",
  description: "Creates Style Guide directions",
  toolGrants: ["builder.style_guide.generate", "builder.design.generate"],
  isDefault: false,
};

function styleGuideConceptGeneration(
  status: "queued" | "succeeded" = "succeeded",
): DesignSystemConceptGenerationOut {
  const version = {
    ...projectDesignSystemVersion(3),
    source: "agent",
    validationStatus: "valid",
    validationFindingHash: `sha256:${"d".repeat(64)}`,
    lifecycleStatus: "valid" as const,
  };
  return {
    generationId: "style-generation-1",
    jobId: "style-job-1",
    designSystemId: "design-system-1",
    baseVersionId: "design-version-1",
    baseRevisionId: "revision-1",
    agentRunId: null,
    agentId: "agent-visual",
    agentVersionId: "agent-version-visual",
    agentAssignmentId: "assignment-visual",
    status,
    jobStatus: status === "succeeded" ? "succeeded" : "queued",
    phase: status === "succeeded" ? "finalizing" : "preparing",
    statusKey: `DESIGN_SYSTEM_CONCEPT_GENERATION_STATUS_${status === "succeeded" ? "FINALIZING" : "QUEUED"}`,
    progressCompleted: status === "succeeded" ? 1 : 0,
    progressTotal: 1,
    candidates:
      status === "succeeded"
        ? [
            {
              candidateIndex: 0,
              summary: "Editorial restraint with a high-contrast reading hierarchy.",
              version,
              validation: {
                id: "style-validation-3",
                workspaceId: "workspace-1",
                designSystemVersionId: version.id,
                profile: "foundation",
                validatorVersion: 2,
                status: "valid",
                findings: [],
                findingHash: `sha256:${"d".repeat(64)}`,
                tokenIndexHash: version.tokenIndexHash,
                publishReady: false,
                compatibility: { componentCatalog: "compatible" },
                actorUserId: "user-1",
                createdAt: "2026-07-21T00:00:01Z",
              },
            },
          ]
        : [],
    failures: [],
    cancelRequestedAt: null,
    cancellationAcknowledgedAt: null,
    createdAt: "2026-07-21T00:00:00Z",
    updatedAt: "2026-07-21T00:00:01Z",
  } as DesignSystemConceptGenerationOut;
}

function generationWithCandidate() {
  return {
    generationId: "generation-1",
    jobId: "job-1",
    targetStage: "sitemap",
    baseRevisionId: "revision-1",
    baseEtag: siteRevision.manifestHash,
    status: "succeeded",
    jobStatus: "succeeded",
    phase: "completed",
    statusKey: "BUILDER_GENERATION_STATUS_SUCCEEDED",
    progressCompleted: 1,
    progressTotal: 1,
    candidates: [
      {
        candidateIndex: 0,
        changeSet: {
          changeSetId: "change-set-1",
          previewToken: "signed-preview-token",
          previewRef: "/projects/project-1/builder/change-sets/change-set-1",
          baseRevisionId: "revision-1",
          baseEtag: siteRevision.manifestHash,
          status: "previewed",
          approvalClass: "review",
          approval: {
            approvalId: "approval-1",
            approvalClass: "review",
            status: "pending",
            expiresAt: "2026-07-22T00:00:00Z",
          },
          operationsHash: `sha256:${"4".repeat(64)}`,
          expiresAt: "2026-07-22T00:00:00Z",
          summaryKey: "BUILDER_CHANGE_SET_SUMMARY",
          summaryParams: {},
          requiredPermissions: ["project:content:site-builder:write"],
          affectedTargets: [],
          issues: [],
          operations: [
            {
              type: "page.create",
              operationId: "create-pricing",
              clientPageId: "pricing-page",
              modelKey: "page",
              title: "Pricing",
              slug: "pricing",
              path: "/pricing",
              fieldsSnapshot: { title: "Pricing", path: "/pricing" },
            },
          ],
        },
      },
    ],
    failures: [],
    cancelRequestedAt: null,
    cancellationAcknowledgedAt: null,
    createdAt: "2026-07-21T00:00:00Z",
    updatedAt: "2026-07-21T00:00:01Z",
  };
}

function wireframeGenerationWithCandidate(
  status: BuilderGenerationOut["status"] = "succeeded",
): BuilderGenerationOut {
  const page = structuredClone(revisionProjection.pages[0]) as
    | BuilderRevisionOut["pages"][number]
    | undefined;
  const sourceWireframe = page?.wireframe;
  const sourceSection = sourceWireframe?.sections?.[0];
  if (!page || !sourceWireframe || !sourceSection) {
    throw new Error("Wireframe generation fixture is incomplete");
  }
  const candidateWireframe = {
    ...sourceWireframe,
    sections: [
      {
        ...sourceSection,
        componentKey: "landing.feature-grid",
        variantKey: "split",
      },
    ],
  };
  return {
    generationId: "wireframe-generation-1",
    jobId: "wireframe-job-1",
    targetStage: "wireframe",
    targets: [{ kind: "page", itemId: "home-page" }],
    baseRevisionId: "revision-1",
    baseEtag: siteRevision.manifestHash,
    agentRunId: null,
    agentId: "agent-1",
    agentVersionId: "agent-version-1",
    agentAssignmentId: "assignment-1",
    status,
    jobStatus:
      status === "queued"
        ? "queued"
        : status === "running"
          ? "running"
          : status === "cancelled"
            ? "cancelled"
            : status === "failed"
              ? "failed"
              : "succeeded",
    phase: status === "succeeded" ? "completed" : "generating",
    statusKey: `BUILDER_WIREFRAME_GENERATION_STATUS_${status.toUpperCase()}`,
    progressCompleted: status === "succeeded" ? 1 : 0,
    progressTotal: 1,
    candidates:
      status === "succeeded"
        ? [
            {
              candidateIndex: 0,
              changeSet: {
                changeSetId: "wireframe-agent-change-set-1",
                previewToken: "wireframe-agent-preview-token",
                previewRef: "/projects/project-1/builder/change-sets/wireframe-agent-change-set-1",
                baseRevisionId: "revision-1",
                baseEtag: siteRevision.manifestHash,
                status: "previewed",
                approvalClass: "none",
                approval: null,
                operationsHash: `sha256:${"6".repeat(64)}`,
                expiresAt: "2026-07-22T00:00:00Z",
                summaryKey: "BUILDER_WIREFRAME_GENERATION_SUMMARY",
                summaryParams: { pageCount: 1, sectionCount: 1 },
                requiredPermissions: [
                  "project:content:items:write",
                  "project:content:site-builder:write",
                ],
                affectedTargets: [],
                issues: [],
                operations: [
                  {
                    type: "wireframe.section.configure",
                    operationId: "agent-configure-hero",
                    itemId: page.itemId,
                    expectedDraftVersion: page.versionNumber,
                    sectionId: sourceSection.id,
                    componentKey: "landing.feature-grid",
                    variantKey: "split",
                    bindings: sourceSection.bindings,
                    responsiveRules: sourceSection.responsiveRules,
                    interactionRules: sourceSection.interactionRules,
                  },
                ],
                wireframeCandidates: [
                  {
                    itemId: page.itemId,
                    baseContentVersionId: page.contentVersionId,
                    baseVersionNumber: page.versionNumber,
                    wireframe: candidateWireframe,
                  },
                ],
              },
            },
          ]
        : [],
    failures: [],
    cancelRequestedAt: null,
    cancellationAcknowledgedAt: null,
    createdAt: "2026-07-21T00:00:00Z",
    updatedAt: "2026-07-21T00:00:01Z",
  };
}

function designGenerationWithCandidate(
  status: BuilderGenerationOut["status"] = "succeeded",
): BuilderGenerationOut {
  const changeSet = designPreview({
    type: "design.initialize",
    operationId: "agent-design-initialize",
    itemId: "home-page",
    expectedDraftVersion: 2,
    sourceWireframeChecksum: `sha256:${"a".repeat(64)}`,
  });
  return {
    generationId: "design-generation-1",
    jobId: "design-job-1",
    targetStage: "design",
    targets: [{ kind: "page", itemId: "home-page" }],
    baseRevisionId: "revision-1",
    baseEtag: siteRevision.manifestHash,
    agentRunId: null,
    agentId: "agent-visual",
    agentVersionId: "agent-version-visual-2",
    agentAssignmentId: "assignment-visual",
    status,
    jobStatus:
      status === "queued"
        ? "queued"
        : status === "running"
          ? "running"
          : status === "cancelled"
            ? "cancelled"
            : status === "failed"
              ? "failed"
              : "succeeded",
    phase: status === "succeeded" ? "completed" : "generating",
    statusKey: `BUILDER_GENERATION_STATUS_${status.toUpperCase()}`,
    progressCompleted: status === "succeeded" ? 1 : 0,
    progressTotal: 1,
    candidates:
      status === "succeeded" || status === "partial" ? [{ candidateIndex: 0, changeSet }] : [],
    failures:
      status === "failed"
        ? [
            {
              candidateIndex: 0,
              code: "BUILDER_GENERATION_PROVIDER_FAILED",
              messageKey: "BUILDER_GENERATION_PROVIDER_FAILED",
            },
          ]
        : [],
    cancelRequestedAt: status === "cancelled" ? "2026-07-22T01:00:00Z" : null,
    cancellationAcknowledgedAt: status === "cancelled" ? "2026-07-22T01:00:01Z" : null,
    createdAt: "2026-07-22T00:00:00Z",
    updatedAt: "2026-07-22T00:00:01Z",
  };
}

function coordinatedWireframeGeneration(): BuilderGenerationOut {
  const generation = wireframeGenerationWithCandidate();
  const candidate = generation.candidates[0];
  const globalSection = (revisionProjection as unknown as BuilderRevisionOut).globalSections?.[0];
  const globalWireframe = globalSection?.wireframe;
  const globalSectionFrame = globalWireframe?.sections?.[0];
  if (!candidate || !globalSection || !globalWireframe || !globalSectionFrame) {
    throw new Error("Coordinated Wireframe generation fixture is incomplete");
  }
  return {
    ...generation,
    targets: [
      { kind: "global_section", itemId: globalSection.itemId },
      { kind: "page", itemId: "home-page" },
    ],
    progressCompleted: 2,
    progressTotal: 2,
    candidates: [
      {
        ...candidate,
        changeSet: {
          ...candidate.changeSet,
          summaryParams: { pageCount: 1, globalSectionCount: 1, sectionCount: 2 },
          operations: [
            {
              type: "wireframe.section.configure",
              operationId: "agent-configure-navigation",
              itemId: globalSection.itemId,
              expectedDraftVersion: globalSection.versionNumber,
              sectionId: globalSectionFrame.id,
              componentKey: globalSectionFrame.componentKey,
              variantKey: globalSectionFrame.variantKey,
              bindings: globalSectionFrame.bindings,
              responsiveRules: globalSectionFrame.responsiveRules,
              interactionRules: globalSectionFrame.interactionRules,
            },
            ...candidate.changeSet.operations,
          ],
          wireframeCandidates: [
            {
              hostKind: "global_section",
              itemId: globalSection.itemId,
              baseContentVersionId: globalSection.contentVersionId,
              baseVersionNumber: globalSection.versionNumber,
              wireframe: globalWireframe,
            },
            ...(candidate.changeSet.wireframeCandidates ?? []),
          ],
        },
      },
    ],
  };
}

function planningGenerationForAbout(): BuilderGenerationOut {
  const generation = wireframeGenerationWithCandidate();
  const candidate = generation.candidates[0];
  if (!candidate) throw new Error("Planning generation fixture is incomplete");
  return {
    ...generation,
    generationId: "planning-generation-1",
    jobId: "planning-job-1",
    targetStage: "planning",
    targets: [{ kind: "page", itemId: "about-page" }],
    candidates: [
      {
        ...candidate,
        changeSet: {
          ...candidate.changeSet,
          changeSetId: "planning-change-set-1",
          previewToken: "planning-preview-token",
          operations: [
            {
              type: "page.intent.replace",
              operationId: "plan-about-page",
              itemId: "about-page",
              purpose: "Explain why teams choose Northstar.",
              sectionIntents: [
                {
                  id: "intent.about-proof",
                  label: "Proof",
                  goal: "Connect the product story to credible outcomes.",
                  generationGuidance: "Lead with customer evidence.",
                },
              ],
            },
          ],
          wireframeCandidates: [],
        },
      },
    ],
  };
}

function compositionGenerationForAbout(
  status: BuilderGenerationOut["status"] = "succeeded",
): BuilderGenerationOut {
  const generation = wireframeGenerationWithCandidate(status);
  const candidate = generation.candidates[0];
  return {
    ...generation,
    generationId: "composition-generation-1",
    jobId: "composition-job-1",
    baseRevisionId: "revision-2",
    targets: [{ kind: "page", itemId: "about-page" }],
    candidates: candidate
      ? [
          {
            ...candidate,
            changeSet: {
              ...candidate.changeSet,
              changeSetId: "composition-change-set-1",
              previewToken: "composition-preview-token",
              baseRevisionId: "revision-2",
              operations: candidate.changeSet.operations.map((operation) =>
                "itemId" in operation ? { ...operation, itemId: "about-page" } : operation,
              ),
              wireframeCandidates: (candidate.changeSet.wireframeCandidates ?? []).map(
                (wireframeCandidate) => ({
                  ...wireframeCandidate,
                  itemId: "about-page",
                  wireframe: { ...wireframeCandidate.wireframe, pageItemId: "about-page" },
                }),
              ),
            },
          },
        ]
      : [],
  };
}

function compositionSaga(
  status: BuilderCompositionSagaOut["status"] = "planning_review_pending",
): BuilderCompositionSagaOut {
  const compositionStarted = status.startsWith("composition_") || status === "completed";
  const compositionStatus: BuilderGenerationOut["status"] =
    status === "composition_queued"
      ? "queued"
      : status === "composition_running"
        ? "running"
        : "succeeded";
  return {
    sagaId: "composition-saga-1",
    status,
    currentPhase:
      status === "completed" ? "completed" : compositionStarted ? "composition" : "planning",
    initialBaseRevisionId: "revision-1",
    initialBaseEtag: siteRevision.manifestHash,
    targets: [{ kind: "page", itemId: "about-page" }],
    planningTargets: [{ kind: "page", itemId: "about-page" }],
    agentRunId: null,
    agentId: "agent-1",
    agentVersionId: "agent-version-1",
    agentAssignmentId: "assignment-1",
    waitingReason:
      status === "planning_review_pending"
        ? "planning_review"
        : status === "composition_review_pending"
          ? "composition_review"
          : null,
    planningGeneration: planningGenerationForAbout(),
    planningChangeSetId: "planning-change-set-1",
    planningResultRevisionId: compositionStarted ? "revision-2" : null,
    compositionGeneration: compositionStarted
      ? compositionGenerationForAbout(compositionStatus)
      : null,
    compositionChangeSetId: compositionStarted ? "composition-change-set-1" : null,
    compositionResultRevisionId: status === "completed" ? "revision-3" : null,
    failure: null,
    cancelRequestedAt: null,
    createdAt: "2026-07-22T04:00:00Z",
    updatedAt: "2026-07-22T04:00:01Z",
  };
}

function renderPage(props: Omit<ProjectEditorPageProps, "projectId"> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <ProjectEditorPage projectId="project-1" {...props} />
    </QueryClientProvider>,
  );
  return {
    ...view,
    rerenderPage: (nextProps: Omit<ProjectEditorPageProps, "projectId"> = {}) =>
      view.rerender(
        <QueryClientProvider client={queryClient}>
          <ProjectEditorPage projectId="project-1" {...nextProps} />
        </QueryClientProvider>,
      ),
  };
}

describe("ProjectEditorPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasProjectActionMock.mockReturnValue(true);
    previewProjectBuilderChangeSetMock.mockReset();
    applyProjectBuilderChangeSetMock.mockReset();
    createProjectBuilderGenerationMock.mockReset();
    getProjectBuilderGenerationMock.mockReset();
    recoverProjectBuilderGenerationMock.mockReset();
    cancelProjectBuilderGenerationMock.mockReset();
    createProjectBuilderCompositionSagaMock.mockReset();
    recoverProjectBuilderCompositionSagaMock.mockReset();
    getProjectBuilderCompositionSagaMock.mockReset();
    transitionProjectBuilderCompositionSagaPhaseMock.mockReset();
    cancelProjectBuilderCompositionSagaMock.mockReset();
    let key = 0;
    vi.stubGlobal("crypto", { randomUUID: () => `command-${++key}` });
    getProjectDetailMock.mockResolvedValue({ project: { id: "project-1", name: "Northstar" } });
    getProjectBuilderMock.mockResolvedValue(readyBuilder);
    getProjectBuilderRevisionMock.mockResolvedValue(revisionProjection);
    getProjectBuilderPageRenderDocumentMock.mockResolvedValue(siteRenderDocumentFixture());
    getProjectBuilderComponentCatalogMock.mockResolvedValue(componentCatalog);
    listAIWorkspaceAgentsMock.mockResolvedValue({
      agents: [builderAgent, visualDesignerAgent],
      defaultAgentId: "agent-1",
    });
    createAgentThreadMock.mockResolvedValue({ threadId: "thread-1" });
    createAgentRunMock.mockResolvedValue({ runId: "run-1" });
    createProjectBuilderGenerationMock.mockResolvedValue(generationWithCandidate());
    getProjectBuilderGenerationMock.mockResolvedValue(generationWithCandidate());
    recoverProjectBuilderGenerationMock.mockResolvedValue({
      active: null,
      latestTerminal: null,
    });
    recoverProjectBuilderCompositionSagaMock.mockResolvedValue({
      active: null,
      latestTerminal: null,
    });
    createProjectBuilderCompositionSagaMock.mockResolvedValue(compositionSaga("planning_queued"));
    getProjectBuilderCompositionSagaMock.mockResolvedValue(compositionSaga("planning_queued"));
    transitionProjectBuilderCompositionSagaPhaseMock.mockResolvedValue(
      compositionSaga("composition_queued"),
    );
    cancelProjectBuilderCompositionSagaMock.mockResolvedValue(compositionSaga("cancelled"));
    createProjectDesignSystemConceptGenerationMock.mockResolvedValue(styleGuideConceptGeneration());
    recoverProjectDesignSystemConceptGenerationsMock.mockResolvedValue({
      active: null,
      latestTerminal: null,
    });
    cancelProjectDesignSystemConceptGenerationMock.mockResolvedValue({
      ...styleGuideConceptGeneration("queued"),
      status: "cancelled",
      jobStatus: "cancelled",
      cancellationAcknowledgedAt: "2026-07-21T00:00:02Z",
    });
    previewProjectBuilderChangeSetMock.mockResolvedValue({
      changeSetId: "manual-change-set-1",
      previewToken: "manual-preview-token",
      previewRef: "/projects/project-1/builder/change-sets/manual-change-set-1",
      baseRevisionId: "revision-1",
      baseEtag: siteRevision.manifestHash,
      status: "previewed",
      approvalClass: "none",
      approval: null,
      operationsHash: `sha256:${"5".repeat(64)}`,
      expiresAt: "2026-07-22T00:00:00Z",
      summaryKey: "BUILDER_CHANGE_SET_SUMMARY",
      summaryParams: {},
      requiredPermissions: ["project:content:site-builder:write"],
      affectedTargets: [{ targetType: "page", targetId: "pricing-page" }],
      issues: [],
      operations: [],
    });
    applyProjectBuilderChangeSetMock.mockResolvedValue({
      status: "applied",
      changeSetId: "change-set-1",
    });
    getProjectDesignSystemAssignmentMock.mockResolvedValue(projectDesignSystemAssignment);
    getProjectDesignSystemVersionMock.mockResolvedValue(projectDesignSystemVersion());
    listProjectDesignSystemVersionsMock.mockResolvedValue({
      items: [projectDesignSystemVersion()],
      nextCursor: null,
      systemMetadataRevision: 1,
    });
    compareProjectDesignSystemVersionsMock.mockResolvedValue({
      fromVersion: projectDesignSystemVersion(),
      toVersion: projectDesignSystemVersion(),
      comparisonHash: `sha256:${"f".repeat(64)}`,
      diff: { hasChanges: false, addedCount: 0, changedCount: 0, removedCount: 0, entries: [] },
    });
    previewProjectDesignSystemImpactMock.mockResolvedValue({
      fromVersion: projectDesignSystemVersion(),
      toVersion: projectDesignSystemVersion(),
      impactHash: `sha256:${"e".repeat(64)}`,
      diff: { hasChanges: false, addedCount: 0, changedCount: 0, removedCount: 0, entries: [] },
      coverage: {
        assignment: "evaluated",
        siteRevisions: "evaluated",
        wireframes: "evaluated",
        assetAuthorization: "manifest_only",
        activeRelease: "not_evaluated",
        renderer: "not_evaluated",
        compilerArtifacts: "not_evaluated",
      },
      summary: {
        hasImpact: false,
        assignmentUsesFromVersion: false,
        referencedSiteRevisionCount: 0,
        historicalSiteRevisionCount: 0,
        currentSiteRevisionCount: 0,
        affectedPageCount: 0,
        affectedSectionCount: 0,
        blockerCount: 0,
        warningCount: 0,
        mappedDiffCount: 0,
        unmappedDiffCount: 0,
      },
      impacts: [],
    });
    supersedeProjectDesignSystemVersionMock.mockResolvedValue({
      targetVersion: {
        ...projectDesignSystemVersion(),
        lifecycleStatus: "superseded",
        statusRevision: 2,
        supersededByVersionId: "design-version-2",
      },
      replacementVersion: {
        ...projectDesignSystemVersion(2),
        validationStatus: "valid",
        lifecycleStatus: "valid",
        statusRevision: 2,
      },
      previousLatestValidVersionId: "design-version-2",
      currentLatestValidVersionId: "design-version-2",
      systemMetadataRevision: 3,
      assignmentChanged: false,
      siteRevisionChanged: false,
      activeReleaseChanged: false,
    });
    getWorkspaceDesignSystemVersionMock.mockResolvedValue(projectDesignSystemVersion());
    createProjectDesignSystemVersionMock.mockResolvedValue(projectDesignSystemVersion(2));
    validateProjectDesignSystemVersionMock.mockResolvedValue({
      id: "validation-2",
      workspaceId: "workspace-1",
      designSystemVersionId: "design-version-2",
      profile: "foundation",
      validatorVersion: 2,
      status: "valid",
      findings: [],
      findingHash: `sha256:${"a".repeat(64)}`,
      tokenIndexHash: `sha256:${"9".repeat(64)}`,
      publishReady: false,
      compatibility: { componentCatalog: "compatible" },
      actorUserId: "user-1",
      createdAt: "2026-07-21T00:00:00Z",
    });
    setProjectDesignSystemAssignmentMock.mockResolvedValue({
      previous: projectDesignSystemAssignment,
      current: {
        ...projectDesignSystemAssignment,
        versionId: "design-version-2",
        manifestChecksum: `sha256:${"8".repeat(64)}`,
        validationFindingHash: `sha256:${"a".repeat(64)}`,
        metadataRevision: 4,
      },
      activeReleaseChanged: false,
      siteRevisionChanged: false,
    });
  });

  it("renders the immutable Sitemap revision on a fullscreen creation canvas", async () => {
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByTestId("creation-editor")).toBeInTheDocument();
    const stageNavigation = screen.getByRole("navigation", {
      name: "CREATION_EDITOR_STAGE_NAV",
    });
    expect(stageNavigation.closest("header")).toHaveClass("grid", "lg:flex", "lg:h-14");
    expect(stageNavigation).toHaveClass(
      "col-span-2",
      "overflow-x-auto",
      "lg:absolute",
      "lg:overflow-visible",
    );
    expect(screen.getByRole("application", { name: "CREATION_EDITOR_CANVAS_LABEL" })).toBeVisible();
    expect(screen.getByRole("button", { name: /^Home/ })).toBeVisible();
    expect(screen.getByRole("button", { name: /^About/ })).toBeVisible();
    expect(screen.getByRole("button", { name: "CREATION_EDITOR_STAGE_WIREFRAME" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "CREATION_EDITOR_STAGE_STYLE_GUIDE" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "CREATION_EDITOR_STAGE_DESIGN" })).toBeEnabled();
    expect(screen.queryByRole("iframe")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^About/ }));
    const inspector = screen.getByRole("complementary", {
      name: "CREATION_EDITOR_INSPECTOR_LABEL",
    });
    expect(within(inspector).getByRole("heading", { name: "About" })).toBeVisible();
    expect(within(inspector).getByText("/about")).toBeVisible();
    expect(getProjectBuilderRevisionMock).toHaveBeenCalledWith(
      "project-1",
      "revision-1",
      expect.any(AbortSignal),
    );
  });

  it("initializes, reviews, and applies a revision-pinned Design candidate", async () => {
    const user = userEvent.setup();
    previewProjectBuilderChangeSetMock.mockResolvedValueOnce(
      designPreview({
        type: "design.initialize",
        operationId: "server-design-initialize",
        itemId: "home-page",
        expectedDraftVersion: 2,
        sourceWireframeChecksum: `sha256:${"a".repeat(64)}`,
      }),
    );
    applyProjectBuilderChangeSetMock.mockResolvedValueOnce({
      status: "applied",
      changeSetId: "design-change-set-1",
    });

    renderPage();
    await screen.findByTestId("creation-editor");
    const designTab = screen.getByRole("button", { name: "CREATION_EDITOR_STAGE_DESIGN" });
    expect(designTab).toBeEnabled();
    await user.click(designTab);

    const workbench = await screen.findByRole("region", {
      name: "CREATION_EDITOR_DESIGN_STAGE_LABEL",
    });
    expect(within(workbench).getByText("CREATION_EDITOR_DESIGN_LAYERS_TITLE")).toBeVisible();
    expect(within(workbench).getByText("CREATION_EDITOR_DESIGN_INSPECTOR_TITLE")).toBeVisible();
    expect(
      await within(workbench).findByText("CREATION_EDITOR_DESIGN_SOURCE_WIREFRAME"),
    ).toBeVisible();
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(
      "Build the next Northstar",
    );
    expect(screen.getByText("CREATION_EDITOR_DESIGN_INITIALIZE_TITLE")).toBeVisible();

    await user.click(
      screen.getByRole("button", { name: "CREATION_EDITOR_DESIGN_INITIALIZE_PREVIEW" }),
    );

    await waitFor(() => expect(previewProjectBuilderChangeSetMock).toHaveBeenCalledTimes(1));
    expect(previewProjectBuilderChangeSetMock).toHaveBeenCalledWith(
      "project-1",
      {
        baseRevisionId: "revision-1",
        baseEtag: siteRevision.manifestHash,
        provenanceSource: "human",
        operations: [
          expect.objectContaining({
            type: "design.initialize",
            itemId: "home-page",
            expectedDraftVersion: 2,
            sourceWireframeChecksum: `sha256:${"a".repeat(64)}`,
          }),
        ],
      },
      expect.stringContaining("design-preview:"),
    );
    const review = await screen.findByRole("region", {
      name: "CREATION_EDITOR_DESIGN_REVIEW_LABEL",
    });
    expect(
      within(review).getByText("CREATION_EDITOR_DESIGN_REVIEW_CANVAS_CANONICAL"),
    ).toBeVisible();
    expect(within(review).getByText("CREATION_EDITOR_DESIGN_SERVER_CANDIDATE")).toBeVisible();

    await user.click(within(review).getByRole("button", { name: "CREATION_EDITOR_DESIGN_APPLY" }));
    await waitFor(() => expect(applyProjectBuilderChangeSetMock).toHaveBeenCalledTimes(1));
    expect(applyProjectBuilderChangeSetMock).toHaveBeenCalledWith(
      "project-1",
      "design-change-set-1",
      { previewToken: "signed-design-preview-token", approval: undefined },
      expect.stringContaining("design-apply:"),
    );
    await waitFor(() => expect(getProjectBuilderRevisionMock.mock.calls.length).toBeGreaterThan(1));
  });

  it("builds typed base, responsive, and clear Design operations from catalog slots", async () => {
    const user = userEvent.setup();
    getProjectBuilderRevisionMock.mockResolvedValueOnce(revisionWithVisualBlueprint());
    getProjectBuilderPageRenderDocumentMock.mockResolvedValueOnce({
      ...siteRenderDocumentFixture(),
      renderSource: "visual_blueprint",
    });
    previewProjectBuilderChangeSetMock.mockResolvedValue(
      designPreview({
        type: "design.style.clear",
        operationId: "server-design-clear",
        itemId: "home-page",
        expectedDraftVersion: 2,
        sourceWireframeChecksum: `sha256:${"a".repeat(64)}`,
        sectionId: "hero",
        stateKey: "default",
        styleSlotKey: "surface.background",
      }),
    );

    renderPage({ initialStage: "design" });
    await screen.findByRole("region", { name: "CREATION_EDITOR_DESIGN_STAGE_LABEL" });
    expect(screen.getByText("CREATION_EDITOR_DESIGN_BLUEPRINT_ACTIVE")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "CREATION_EDITOR_DESIGN_CLEAR_STYLE" }));
    await waitFor(() => expect(previewProjectBuilderChangeSetMock).toHaveBeenCalledTimes(1));
    expect(previewProjectBuilderChangeSetMock.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        operations: [
          expect.objectContaining({
            type: "design.style.clear",
            itemId: "home-page",
            expectedDraftVersion: 2,
            sourceWireframeChecksum: `sha256:${"a".repeat(64)}`,
            sectionId: "hero",
            stateKey: "default",
            styleSlotKey: "surface.background",
          }),
        ],
      }),
    );
    await user.click(screen.getByRole("button", { name: "CREATION_EDITOR_DESIGN_DISCARD" }));

    await user.click(
      screen.getAllByRole("button", { name: "CREATION_EDITOR_DESIGN_PREVIEW_STYLE" })[0]!,
    );
    await waitFor(() => expect(previewProjectBuilderChangeSetMock).toHaveBeenCalledTimes(2));
    expect(previewProjectBuilderChangeSetMock.mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({
        operations: [
          expect.objectContaining({
            type: "design.style.set",
            styleSlotKey: "surface.background",
            tokenPath: "semantic.color.surface.canvas",
          }),
        ],
      }),
    );
    await user.click(screen.getByRole("button", { name: "CREATION_EDITOR_DESIGN_DISCARD" }));

    await user.click(screen.getByLabelText("CREATION_EDITOR_DESIGN_SCOPE_LABEL"));
    await user.click(screen.getByRole("option", { name: "tablet · 768px" }));
    await user.click(
      screen.getAllByRole("button", { name: "CREATION_EDITOR_DESIGN_PREVIEW_STYLE" })[0]!,
    );
    await waitFor(() => expect(previewProjectBuilderChangeSetMock).toHaveBeenCalledTimes(3));
    expect(previewProjectBuilderChangeSetMock.mock.calls[2]?.[1]).toEqual(
      expect.objectContaining({
        operations: [
          expect.objectContaining({
            type: "design.responsive_style.set",
            breakpoint: "tablet",
            styleSlotKey: "surface.background",
            tokenPath: "semantic.color.surface.canvas",
          }),
        ],
      }),
    );
  });

  it("exposes the Design Wireframe boundary when the selected page is not ready", async () => {
    renderPage({ initialStage: "design", initialPageId: "about-page" });

    expect(
      await screen.findByRole("heading", {
        name: "CREATION_EDITOR_DESIGN_WIREFRAME_REQUIRED_TITLE",
      }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "CREATION_EDITOR_STAGE_DESIGN" })).toBeDisabled();
    expect(getProjectBuilderPageRenderDocumentMock).not.toHaveBeenCalled();
  });

  it("keeps Design inspection available but blocks writes without permission", async () => {
    hasProjectActionMock.mockReturnValue(false);
    renderPage({ initialStage: "design" });

    expect(
      (await screen.findAllByText("CREATION_EDITOR_DESIGN_PERMISSION_REQUIRED"))[0],
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "CREATION_EDITOR_DESIGN_INITIALIZE_PREVIEW" }),
    ).toBeDisabled();
    expect(await screen.findByRole("heading", { level: 1 })).toBeVisible();
    expect(previewProjectBuilderChangeSetMock).not.toHaveBeenCalled();
  });

  it("keeps Design canonical and blocks candidate writes while offline", async () => {
    const onlineSpy = vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    try {
      renderPage({ initialStage: "design" });

      expect(
        await screen.findByRole("heading", { name: "CREATION_EDITOR_DESIGN_OFFLINE_TITLE" }),
      ).toBeVisible();
      expect(screen.getAllByText("CREATION_EDITOR_DESIGN_OFFLINE_MUTATION")[0]).toBeVisible();
      expect(
        screen.getByRole("button", { name: "CREATION_EDITOR_DESIGN_INITIALIZE_PREVIEW" }),
      ).toBeDisabled();
      expect(previewProjectBuilderChangeSetMock).not.toHaveBeenCalled();
    } finally {
      onlineSpy.mockRestore();
    }
  });

  it("shows the exact Design contract failure and offers a real retry", async () => {
    const user = userEvent.setup();
    getProjectBuilderComponentCatalogMock.mockRejectedValueOnce(
      new Error("Pinned component catalog failed"),
    );
    renderPage({ initialStage: "design" });

    expect(
      await screen.findByRole("heading", {
        name: "CREATION_EDITOR_DESIGN_CONTRACT_ERROR_TITLE",
      }),
    ).toBeVisible();
    expect(screen.getByText("Pinned component catalog failed")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "CREATION_EDITOR_RETRY" }));
    await waitFor(() => expect(getProjectBuilderComponentCatalogMock).toHaveBeenCalledTimes(2));
  });

  it("starts Design generation, previews only the selected direction, and reconciles signed Apply", async () => {
    const user = userEvent.setup();
    const generation = designGenerationWithCandidate();
    const nextSiteRevision = {
      ...siteRevision,
      id: "revision-2",
      revisionNumber: 3,
      manifestHash: `sha256:${"9".repeat(64)}`,
    };
    const nextRevision = { ...revisionProjection, siteRevision: nextSiteRevision };
    createProjectBuilderGenerationMock.mockResolvedValueOnce(generation);
    getProjectBuilderGenerationMock.mockResolvedValueOnce(generation);
    applyProjectBuilderChangeSetMock.mockResolvedValueOnce({
      status: "applied",
      changeSetId: "design-change-set-1",
      baseRevisionId: "revision-1",
      siteRevision: nextSiteRevision,
      contentStructureRevision: revisionProjection.contentStructureRevision,
      approval: null,
      appliedAt: "2026-07-22T00:01:00Z",
    });
    getProjectBuilderRevisionMock.mockImplementation((_projectId: string, revisionId: string) =>
      Promise.resolve(revisionId === "revision-2" ? nextRevision : revisionProjection),
    );

    renderPage({ initialStage: "design" });
    const inspector = await screen.findByRole("complementary", {
      name: "CREATION_EDITOR_DESIGN_INSPECTOR_LABEL",
    });
    await waitFor(() =>
      expect(within(inspector).getByRole("button", { name: /Visual Designer/ })).toHaveAttribute(
        "aria-pressed",
        "true",
      ),
    );
    await user.type(
      within(inspector).getByLabelText("CREATION_EDITOR_DESIGN_GENERATION_OBJECTIVE_LABEL"),
      "Create a calm editorial direction.",
    );
    await user.click(within(inspector).getByRole("button", { name: "3" }));
    await user.click(
      within(inspector).getByRole("button", { name: "CREATION_EDITOR_DESIGN_GENERATION_START" }),
    );

    await waitFor(() => expect(createProjectBuilderGenerationMock).toHaveBeenCalledTimes(1));
    expect(createProjectBuilderGenerationMock).toHaveBeenCalledWith(
      "project-1",
      {
        targetStage: "design",
        baseRevisionId: "revision-1",
        baseEtag: siteRevision.manifestHash,
        agentId: "agent-visual",
        objective: "Create a calm editorial direction.",
        locale: "en-US",
        candidateCount: 3,
        targets: [{ kind: "page", itemId: "home-page" }],
      },
      expect.stringContaining("design-generation:"),
    );
    expect(
      screen.queryByRole("region", { name: "CREATION_EDITOR_DESIGN_REVIEW_LABEL" }),
    ).not.toBeInTheDocument();

    await user.click(
      within(inspector).getByRole("button", {
        name: /CREATION_EDITOR_DESIGN_GENERATION_DIRECTION/,
      }),
    );
    const review = await screen.findByRole("region", {
      name: "CREATION_EDITOR_DESIGN_REVIEW_LABEL",
    });
    expect(
      within(inspector).getAllByRole("button", {
        name: "CREATION_EDITOR_DESIGN_PREVIEW_STYLE",
      })[0],
    ).toBeDisabled();
    await user.click(within(review).getByRole("button", { name: "CREATION_EDITOR_DESIGN_APPLY" }));

    await waitFor(() => expect(applyProjectBuilderChangeSetMock).toHaveBeenCalledTimes(1));
    expect(applyProjectBuilderChangeSetMock).toHaveBeenCalledWith(
      "project-1",
      "design-change-set-1",
      { previewToken: "signed-design-preview-token", approval: undefined },
      expect.stringContaining("design-generation-apply:"),
    );
    expect(getProjectBuilderRevisionMock).toHaveBeenCalledWith("project-1", "revision-2");
    await waitFor(() =>
      expect(
        screen.queryByRole("region", { name: "CREATION_EDITOR_DESIGN_REVIEW_LABEL" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("recovers the exact Design generation and requires explicit candidate selection", async () => {
    const user = userEvent.setup();
    const generation = designGenerationWithCandidate("partial");
    recoverProjectBuilderGenerationMock.mockResolvedValueOnce({
      active: null,
      latestTerminal: generation,
    });
    getProjectBuilderGenerationMock.mockResolvedValueOnce(generation);

    renderPage({ initialStage: "design" });
    const inspector = await screen.findByRole("complementary", {
      name: "CREATION_EDITOR_DESIGN_INSPECTOR_LABEL",
    });

    await waitFor(() =>
      expect(recoverProjectBuilderGenerationMock).toHaveBeenCalledWith(
        "project-1",
        { targetStage: "design", targets: [{ kind: "page", itemId: "home-page" }] },
        expect.any(AbortSignal),
      ),
    );
    expect(
      screen.queryByRole("region", { name: "CREATION_EDITOR_DESIGN_REVIEW_LABEL" }),
    ).not.toBeInTheDocument();
    await user.click(
      within(inspector).getByRole("button", {
        name: /CREATION_EDITOR_DESIGN_GENERATION_DIRECTION/,
      }),
    );
    expect(
      await screen.findByRole("region", { name: "CREATION_EDITOR_DESIGN_REVIEW_LABEL" }),
    ).toBeVisible();
  });

  it("surfaces Design generation failure and cooperatively cancels an active generation", async () => {
    const user = userEvent.setup();
    const queued = designGenerationWithCandidate("queued");
    const cancelled = designGenerationWithCandidate("cancelled");
    recoverProjectBuilderGenerationMock.mockResolvedValueOnce({
      active: queued,
      latestTerminal: null,
    });
    getProjectBuilderGenerationMock.mockResolvedValueOnce(queued);
    cancelProjectBuilderGenerationMock.mockResolvedValueOnce(cancelled);

    const view = renderPage({ initialStage: "design" });
    const inspector = await screen.findByRole("complementary", {
      name: "CREATION_EDITOR_DESIGN_INSPECTOR_LABEL",
    });
    await user.click(
      await within(inspector).findByRole("button", {
        name: "CREATION_EDITOR_DESIGN_GENERATION_CANCEL",
      }),
    );
    await waitFor(() =>
      expect(cancelProjectBuilderGenerationMock).toHaveBeenCalledWith(
        "project-1",
        "design-generation-1",
        { reason: "CREATION_EDITOR_DESIGN_GENERATION_CANCEL_REASON" },
      ),
    );

    recoverProjectBuilderGenerationMock.mockResolvedValueOnce({
      active: null,
      latestTerminal: designGenerationWithCandidate("failed"),
    });
    getProjectBuilderGenerationMock.mockResolvedValueOnce(designGenerationWithCandidate("failed"));
    view.unmount();
    renderPage({ initialStage: "design" });
    expect(await screen.findByText("BUILDER_GENERATION_PROVIDER_FAILED")).toBeVisible();
  });

  it("keeps the Design review when applied revision reconciliation is stale", async () => {
    const user = userEvent.setup();
    const generation = designGenerationWithCandidate();
    const appliedSiteRevision = {
      ...siteRevision,
      id: "revision-2",
      revisionNumber: 3,
      manifestHash: `sha256:${"9".repeat(64)}`,
    };
    createProjectBuilderGenerationMock.mockResolvedValueOnce(generation);
    getProjectBuilderGenerationMock.mockResolvedValueOnce(generation);
    applyProjectBuilderChangeSetMock.mockResolvedValueOnce({
      status: "applied",
      changeSetId: "design-change-set-1",
      baseRevisionId: "revision-1",
      siteRevision: appliedSiteRevision,
      contentStructureRevision: revisionProjection.contentStructureRevision,
      approval: null,
      appliedAt: "2026-07-22T00:01:00Z",
    });
    getProjectBuilderRevisionMock.mockImplementation((_projectId: string, revisionId: string) =>
      Promise.resolve(
        revisionId === "revision-2"
          ? {
              ...revisionProjection,
              siteRevision: { ...appliedSiteRevision, manifestHash: `sha256:${"0".repeat(64)}` },
            }
          : revisionProjection,
      ),
    );

    renderPage({ initialStage: "design" });
    const inspector = await screen.findByRole("complementary", {
      name: "CREATION_EDITOR_DESIGN_INSPECTOR_LABEL",
    });
    await user.type(
      within(inspector).getByLabelText("CREATION_EDITOR_DESIGN_GENERATION_OBJECTIVE_LABEL"),
      "Create a calm editorial direction.",
    );
    await user.click(
      within(inspector).getByRole("button", { name: "CREATION_EDITOR_DESIGN_GENERATION_START" }),
    );
    await user.click(
      await within(inspector).findByRole("button", {
        name: /CREATION_EDITOR_DESIGN_GENERATION_DIRECTION/,
      }),
    );
    const review = await screen.findByRole("region", {
      name: "CREATION_EDITOR_DESIGN_REVIEW_LABEL",
    });
    await user.click(within(review).getByRole("button", { name: "CREATION_EDITOR_DESIGN_APPLY" }));

    expect(
      await within(inspector).findByText("CREATION_EDITOR_DESIGN_GENERATION_RECONCILIATION_FAILED"),
    ).toBeVisible();
    expect(review).toBeVisible();
  });

  it("opens the exact revision-pinned visitor preview from the editor toolbar", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: /^Home/ }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "CREATION_EDITOR_PREVIEW" })).toBeEnabled(),
    );
    await user.click(screen.getByRole("button", { name: "CREATION_EDITOR_PREVIEW" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Build the next Northstar" })).toBeVisible();
    });
    expect(getProjectBuilderPageRenderDocumentMock).toHaveBeenCalledWith(
      "project-1",
      "revision-1",
      "home-page",
      "en-US",
      null,
      expect.any(AbortSignal),
    );
  });

  it("previews and applies an exact page planning ChangeSet from the Sitemap inspector", async () => {
    const user = userEvent.setup();
    previewProjectBuilderChangeSetMock.mockResolvedValueOnce({
      changeSetId: "planning-change-set-1",
      previewToken: "planning-preview-token",
      previewRef: "/projects/project-1/builder/change-sets/planning-change-set-1",
      baseRevisionId: "revision-1",
      baseEtag: siteRevision.manifestHash,
      status: "previewed",
      approvalClass: "destructive",
      approval: {
        approvalId: "planning-approval-1",
        approvalClass: "destructive",
        status: "pending",
        expiresAt: "2026-07-22T00:00:00Z",
      },
      operationsHash: `sha256:${"6".repeat(64)}`,
      expiresAt: "2026-07-22T00:00:00Z",
      summaryKey: "BUILDER_CHANGE_SET_SUMMARY",
      summaryParams: {},
      requiredPermissions: ["project:content:site-builder:write"],
      affectedTargets: [
        { kind: "planning", targetId: "home-page", operationIds: ["plan-home-page"] },
      ],
      issues: [
        {
          severity: "warning",
          code: "BUILDER_SECTION_INTENT_REMOVE_REQUIRES_APPROVAL",
          messageKey: "BUILDER_SECTION_INTENT_REMOVE_REQUIRES_APPROVAL",
          operationId: "plan-home-page",
          meta: { itemId: "home-page", intentId: "intent.hero" },
        },
      ],
      operations: [],
      wireframeCandidates: [],
    });
    renderPage();
    await screen.findByTestId("creation-editor");

    const purpose = screen.getByLabelText("CREATION_EDITOR_SITEMAP_PURPOSE_LABEL");
    expect(purpose).toHaveValue("Turn product interest into a clear next step");
    expect(screen.getByLabelText("CREATION_EDITOR_SITEMAP_INTENT_LABEL")).toHaveValue("Hero");
    expect(screen.getByLabelText("CREATION_EDITOR_SITEMAP_INTENT_GOAL")).toHaveValue(
      "Establish the primary value proposition",
    );
    expect(screen.getByText("intent.hero")).toHaveClass("min-w-0", "flex-1", "truncate");
    await user.clear(purpose);
    await user.type(purpose, "Help operations leaders choose the product");
    await user.clear(screen.getByLabelText("CREATION_EDITOR_SITEMAP_INTENT_GOAL"));
    await user.type(
      screen.getByLabelText("CREATION_EDITOR_SITEMAP_INTENT_GOAL"),
      "Make the value and audience immediately clear",
    );
    await user.click(screen.getByRole("button", { name: "CREATION_EDITOR_SITEMAP_PREVIEW" }));

    await waitFor(() => expect(previewProjectBuilderChangeSetMock).toHaveBeenCalledTimes(1));
    expect(previewProjectBuilderChangeSetMock).toHaveBeenCalledWith(
      "project-1",
      {
        baseRevisionId: "revision-1",
        baseEtag: siteRevision.manifestHash,
        provenanceSource: "human",
        operations: [
          {
            type: "page.intent.replace",
            operationId: "plan-home-page",
            itemId: "home-page",
            purpose: "Help operations leaders choose the product",
            sectionIntents: [
              {
                id: "intent.hero",
                label: "Hero",
                goal: "Make the value and audience immediately clear",
                generationGuidance: "Lead with concrete proof",
              },
            ],
          },
        ],
      },
      expect.stringContaining("sitemap-planning-preview:"),
    );
    expect(
      await screen.findByText("BUILDER_SECTION_INTENT_REMOVE_REQUIRES_APPROVAL"),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "CREATION_EDITOR_SITEMAP_APPLY" }));
    await waitFor(() => expect(applyProjectBuilderChangeSetMock).toHaveBeenCalledTimes(1));
    expect(applyProjectBuilderChangeSetMock).toHaveBeenCalledWith(
      "project-1",
      "planning-change-set-1",
      {
        previewToken: "planning-preview-token",
        approval: {
          approvalId: "planning-approval-1",
          decision: "approve",
          expectedApprovalClass: "destructive",
        },
      },
      expect.stringContaining("sitemap-planning-apply:"),
    );
  });

  it("requires explicit planning details before adopting a historical Wireframe structure", async () => {
    const user = userEvent.setup();
    const historical = structuredClone(revisionProjection) as unknown as BuilderRevisionOut;
    historical.pages[0] = {
      ...historical.pages[0],
      purpose: null,
      sectionIntents: [],
      wireframeTraceability: {
        status: "orphaned",
        missingIntentIds: [],
        orphanedSectionIds: ["hero"],
      },
    };
    getProjectBuilderRevisionMock.mockResolvedValueOnce(historical);
    renderPage();
    await screen.findByTestId("creation-editor");

    await user.click(
      screen.getByRole("button", { name: "CREATION_EDITOR_SITEMAP_ADOPT_WIREFRAME" }),
    );
    expect(screen.getByText("intent.hero")).toBeVisible();
    expect(screen.getByLabelText("CREATION_EDITOR_SITEMAP_INTENT_LABEL")).toHaveValue("Hero");
    expect(screen.getByLabelText("CREATION_EDITOR_SITEMAP_INTENT_GOAL")).toHaveValue("");
    await user.click(screen.getByRole("button", { name: "CREATION_EDITOR_SITEMAP_PREVIEW" }));
    expect(previewProjectBuilderChangeSetMock).not.toHaveBeenCalled();
    expect(screen.getByText("CREATION_EDITOR_SITEMAP_REQUIRED_FIELDS")).toBeVisible();
  });

  it("keeps page planning read-only without the Builder write action", async () => {
    hasProjectActionMock.mockReturnValue(false);
    renderPage();
    await screen.findByTestId("creation-editor");

    expect(screen.getByLabelText("CREATION_EDITOR_SITEMAP_PURPOSE_LABEL")).toBeDisabled();
    expect(screen.getByRole("button", { name: "CREATION_EDITOR_SITEMAP_PREVIEW" })).toBeDisabled();
    expect(previewProjectBuilderChangeSetMock).not.toHaveBeenCalled();
  });

  it("renders the exact Wireframe document and keeps missing bindings explicit", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId("creation-editor");

    await user.click(screen.getByRole("button", { name: "CREATION_EDITOR_STAGE_WIREFRAME" }));

    expect(
      screen.getByRole("region", { name: "CREATION_EDITOR_WIREFRAME_CANVAS_LABEL" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: /Hero/ })).toBeVisible();
    expect(screen.getAllByText("CREATION_EDITOR_WIREFRAME_MISSING_MEDIA")).toHaveLength(2);
    const inspector = screen.getByRole("complementary", {
      name: "CREATION_EDITOR_WIREFRAME_INSPECTOR_LABEL",
    });
    expect(inspector).toBeVisible();
    expect(inspector.querySelector('[data-slot="scroll-area"]')).toHaveClass(
      "min-w-0",
      "[&_[data-slot=scroll-area-viewport]>div]:!block",
    );
    expect(screen.getByText("CREATION_EDITOR_WIREFRAME_TRACEABILITY_ALIGNED")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "CREATION_EDITOR_WIREFRAME_VIEWPORT_MOBILE" }),
    ).toBeEnabled();

    await user.click(screen.getByRole("button", { name: /About/ }));
    expect(
      screen.getByRole("heading", { name: "CREATION_EDITOR_WIREFRAME_EMPTY_TITLE" }),
    ).toBeVisible();
  });

  it("previews an exact shared section reference without applying it", async () => {
    const user = userEvent.setup();
    renderPage({ initialStage: "wireframe" });
    await screen.findByTestId("creation-editor");

    await user.click(
      screen.getByRole("combobox", { name: "CREATION_EDITOR_WIREFRAME_SHARED_SECTION_SELECT" }),
    );
    await user.type(
      screen.getByPlaceholderText("CREATION_EDITOR_WIREFRAME_SHARED_SECTION_SEARCH"),
      "Primary navigation",
    );
    await user.click(screen.getByRole("option", { name: /Primary navigation/ }));

    await waitFor(() => expect(previewProjectBuilderChangeSetMock).toHaveBeenCalledTimes(1));
    expect(previewProjectBuilderChangeSetMock).toHaveBeenCalledWith(
      "project-1",
      {
        baseRevisionId: "revision-1",
        baseEtag: siteRevision.manifestHash,
        provenanceSource: "human",
        operations: [
          {
            type: "wireframe.set_global_reference",
            operationId: expect.any(String),
            itemId: "home-page",
            expectedDraftVersion: 2,
            sectionId: "hero",
            globalSectionItemId: "global-header",
          },
        ],
      },
      expect.stringContaining("wireframe-preview:"),
    );
    expect(applyProjectBuilderChangeSetMock).not.toHaveBeenCalled();
  });

  it("shows exact shared section evidence and previews clearing its authority", async () => {
    const user = userEvent.setup();
    const referencedRevision = structuredClone(revisionProjection) as unknown as BuilderRevisionOut;
    const referencedSection = referencedRevision.pages[0]?.wireframe?.sections?.[0];
    if (!referencedSection) throw new Error("Shared section reference fixture is incomplete");
    referencedSection.globalReferenceId = "global-header";
    referencedRevision.globalSectionGraph = {
      ...referencedRevision.globalSectionGraph,
      references: [
        ...(referencedRevision.globalSectionGraph?.references ?? []),
        {
          hostItemId: "home-page",
          hostKind: "page",
          hostSectionId: "hero",
          targetItemId: "global-header",
        },
      ],
    };
    getProjectBuilderRevisionMock.mockResolvedValueOnce(referencedRevision);
    renderPage({ initialStage: "wireframe" });
    await screen.findByTestId("creation-editor");

    expect(await screen.findByText("en-US · /primary-navigation · v4")).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "CREATION_EDITOR_WIREFRAME_SHARED_SECTION_CLEAR" }),
    );

    await waitFor(() => expect(previewProjectBuilderChangeSetMock).toHaveBeenCalledTimes(1));
    expect(previewProjectBuilderChangeSetMock).toHaveBeenCalledWith(
      "project-1",
      expect.objectContaining({
        operations: [
          {
            type: "wireframe.clear_global_reference",
            operationId: expect.any(String),
            itemId: "home-page",
            expectedDraftVersion: 2,
            sectionId: "hero",
          },
        ],
      }),
      expect.stringContaining("wireframe-preview:"),
    );
    expect(applyProjectBuilderChangeSetMock).not.toHaveBeenCalled();
  });

  it("keeps shared sections without Wireframes visible but unavailable", async () => {
    const user = userEvent.setup();
    renderPage({ initialStage: "wireframe" });
    await screen.findByTestId("creation-editor");

    await user.click(
      screen.getByRole("combobox", { name: "CREATION_EDITOR_WIREFRAME_SHARED_SECTION_SELECT" }),
    );
    const unavailableTarget = screen.getByRole("option", { name: /Global footer/ });
    expect(unavailableTarget).toHaveAttribute("aria-disabled", "true");
    expect(unavailableTarget).toHaveTextContent(
      "CREATION_EDITOR_WIREFRAME_SHARED_SECTION_WIREFRAME_REQUIRED",
    );
    await user.click(unavailableTarget);
    expect(previewProjectBuilderChangeSetMock).not.toHaveBeenCalled();
  });

  it("explains an empty shared section catalog and keeps the selector disabled", async () => {
    const emptyCatalogRevision = structuredClone(
      revisionProjection,
    ) as unknown as BuilderRevisionOut;
    emptyCatalogRevision.globalSections = [];
    getProjectBuilderRevisionMock.mockResolvedValueOnce(emptyCatalogRevision);
    renderPage({ initialStage: "wireframe" });
    await screen.findByTestId("creation-editor");

    expect(
      screen.getByRole("combobox", { name: "CREATION_EDITOR_WIREFRAME_SHARED_SECTION_SELECT" }),
    ).toBeDisabled();
    expect(screen.getByText("CREATION_EDITOR_WIREFRAME_SHARED_SECTION_EMPTY")).toBeVisible();
  });

  it("keeps shared section authority read-only without both Builder and Content access", async () => {
    hasProjectActionMock.mockReturnValue(false);
    renderPage({ initialStage: "wireframe" });
    await screen.findByTestId("creation-editor");

    const selector = screen.getByRole("combobox", {
      name: "CREATION_EDITOR_WIREFRAME_SHARED_SECTION_SELECT",
    });
    expect(selector).toBeDisabled();
    expect(selector).toHaveClass("min-h-11", "w-full");
    expect(screen.getByText("CREATION_EDITOR_WIREFRAME_PERMISSION_REQUIRED")).toBeVisible();
    expect(previewProjectBuilderChangeSetMock).not.toHaveBeenCalled();
  });

  it("surfaces server graph blockers and never enables Apply for the candidate", async () => {
    const user = userEvent.setup();
    previewProjectBuilderChangeSetMock.mockResolvedValueOnce({
      changeSetId: "global-reference-change-set-1",
      previewToken: "global-reference-preview-token",
      previewRef: "/projects/project-1/builder/change-sets/global-reference-change-set-1",
      baseRevisionId: "revision-1",
      baseEtag: siteRevision.manifestHash,
      status: "previewed",
      approvalClass: "review",
      approval: null,
      operationsHash: `sha256:${"4".repeat(64)}`,
      expiresAt: "2026-07-22T00:00:00Z",
      summaryKey: "BUILDER_CHANGE_SET_PREVIEW_SUMMARY",
      summaryParams: { operationCount: 1 },
      requiredPermissions: ["project:content:items:write"],
      affectedTargets: [{ targetType: "page", targetId: "home-page" }],
      issues: [
        {
          code: "BUILDER_GLOBAL_SECTION_REFERENCE_CYCLE",
          messageKey: "BUILDER_GLOBAL_SECTION_REFERENCE_CYCLE",
          operationId: "set-global-reference",
          severity: "blocker",
          meta: {},
        },
      ],
      operations: [],
      globalSectionGraph: {
        references: [],
        unknownReferences: [],
        missingWireframeReferences: [],
        cycles: [{ itemPath: ["global-header", "global-header"] }],
      },
      wireframeCandidates: [],
    });
    renderPage({ initialStage: "wireframe" });
    await screen.findByTestId("creation-editor");

    await user.click(
      screen.getByRole("combobox", { name: "CREATION_EDITOR_WIREFRAME_SHARED_SECTION_SELECT" }),
    );
    await user.click(screen.getByRole("option", { name: /Primary navigation/ }));

    expect(await screen.findByText("BUILDER_GLOBAL_SECTION_REFERENCE_CYCLE")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "CREATION_EDITOR_WIREFRAME_APPLY_PREVIEW" }),
    ).toBeDisabled();
    expect(applyProjectBuilderChangeSetMock).not.toHaveBeenCalled();
  });

  it("opens the exact Wireframe page from a durable generation deep link", async () => {
    renderPage({ initialStage: "wireframe", initialPageId: "about-page" });
    await screen.findByTestId("creation-editor");

    expect(
      await screen.findByRole("region", {
        name: "CREATION_EDITOR_WIREFRAME_GENERATION_LABEL",
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "CREATION_EDITOR_WIREFRAME_EMPTY_TITLE" }),
    ).toBeVisible();
    await waitFor(() =>
      expect(recoverProjectBuilderGenerationMock).toHaveBeenCalledWith(
        "project-1",
        {
          targetStage: "wireframe",
          targets: [{ kind: "page", itemId: "about-page" }],
        },
        expect.any(AbortSignal),
      ),
    );
  });

  it("starts direct-Agent Wireframe generation and applies only the selected server candidate", async () => {
    const user = userEvent.setup();
    createProjectBuilderGenerationMock.mockResolvedValueOnce(wireframeGenerationWithCandidate());
    getProjectBuilderGenerationMock.mockResolvedValueOnce(wireframeGenerationWithCandidate());
    renderPage();
    await screen.findByTestId("creation-editor");

    await user.click(screen.getByRole("button", { name: "CREATION_EDITOR_STAGE_WIREFRAME" }));
    expect(
      await screen.findByRole("region", {
        name: "CREATION_EDITOR_WIREFRAME_GENERATION_LABEL",
      }),
    ).toBeVisible();
    await user.type(
      screen.getByLabelText("CREATION_EDITOR_WIREFRAME_GENERATION_OBJECTIVE_LABEL"),
      "Compose the Home page around its exact section intent.",
    );
    await user.click(
      screen.getByRole("button", { name: "CREATION_EDITOR_WIREFRAME_GENERATION_START" }),
    );

    await waitFor(() => expect(createProjectBuilderGenerationMock).toHaveBeenCalledTimes(1));
    expect(createAgentThreadMock).not.toHaveBeenCalled();
    expect(createAgentRunMock).not.toHaveBeenCalled();
    expect(createProjectBuilderGenerationMock).toHaveBeenCalledWith(
      "project-1",
      {
        targetStage: "wireframe",
        baseRevisionId: "revision-1",
        baseEtag: siteRevision.manifestHash,
        agentId: "agent-1",
        objective: "Compose the Home page around its exact section intent.",
        locale: "en-US",
        candidateCount: 2,
        targets: [{ kind: "page", itemId: "home-page" }],
      },
      expect.stringContaining("wireframe-generation:"),
    );
    expect(screen.getByText("landing.feature-grid · split")).toBeVisible();
    expect(screen.getByText("CREATION_EDITOR_WIREFRAME_CANDIDATE_ACTIVE")).toBeVisible();

    await user.click(
      screen.getByRole("button", { name: "CREATION_EDITOR_WIREFRAME_APPLY_PREVIEW" }),
    );
    await waitFor(() => expect(applyProjectBuilderChangeSetMock).toHaveBeenCalledTimes(1));
    expect(applyProjectBuilderChangeSetMock).toHaveBeenCalledWith(
      "project-1",
      "wireframe-agent-change-set-1",
      { previewToken: "wireframe-agent-preview-token", approval: undefined },
      expect.stringContaining("wireframe-generation-apply:"),
    );
  });

  it("coordinates an ordered page and reusable-section scope through one generation and Apply", async () => {
    const user = userEvent.setup();
    const generation = coordinatedWireframeGeneration();
    createProjectBuilderGenerationMock.mockResolvedValueOnce(generation);
    getProjectBuilderGenerationMock.mockResolvedValueOnce(generation);
    renderPage({ initialStage: "wireframe" });
    await screen.findByTestId("creation-editor");

    const generationPanel = await screen.findByRole("region", {
      name: "CREATION_EDITOR_WIREFRAME_GENERATION_LABEL",
    });
    expect(
      within(generationPanel).getByRole("list", {
        name: "CREATION_EDITOR_WIREFRAME_GENERATION_TARGETS_SELECTED",
      }),
    ).toHaveTextContent("Home");

    await user.click(
      within(generationPanel).getByRole("combobox", {
        name: "CREATION_EDITOR_WIREFRAME_GENERATION_TARGET_ADD",
      }),
    );
    expect(screen.getByRole("option", { name: /About/ })).toHaveAttribute("data-disabled", "true");
    await user.click(screen.getByRole("option", { name: /Primary navigation/ }));
    await user.click(
      within(generationPanel).getByRole("button", {
        name: "CREATION_EDITOR_WIREFRAME_GENERATION_TARGET_MOVE_EARLIER",
      }),
    );

    await waitFor(() =>
      expect(recoverProjectBuilderGenerationMock).toHaveBeenLastCalledWith(
        "project-1",
        {
          targetStage: "wireframe",
          targets: [
            { kind: "global_section", itemId: "global-header" },
            { kind: "page", itemId: "home-page" },
          ],
        },
        expect.any(AbortSignal),
      ),
    );
    await user.type(
      within(generationPanel).getByLabelText(
        "CREATION_EDITOR_WIREFRAME_GENERATION_OBJECTIVE_LABEL",
      ),
      "Compose the shared navigation before the Home page.",
    );
    await user.click(
      within(generationPanel).getByRole("button", {
        name: "CREATION_EDITOR_WIREFRAME_GENERATION_START",
      }),
    );

    await waitFor(() => expect(createProjectBuilderGenerationMock).toHaveBeenCalledTimes(1));
    expect(createProjectBuilderGenerationMock).toHaveBeenCalledWith(
      "project-1",
      expect.objectContaining({
        targetStage: "wireframe",
        targets: [
          { kind: "global_section", itemId: "global-header" },
          { kind: "page", itemId: "home-page" },
        ],
      }),
      expect.stringContaining("wireframe-generation:"),
    );
    const review = await screen.findByRole("region", {
      name: "CREATION_EDITOR_WIREFRAME_REVIEW_LABEL",
    });
    expect(within(review).getByText("Primary navigation")).toBeVisible();
    expect(within(review).getByText("Home")).toBeVisible();
    expect(
      within(review).getAllByRole("button", {
        name: "CREATION_EDITOR_WIREFRAME_APPLY_PREVIEW",
      }),
    ).toHaveLength(1);

    await user.click(
      within(review).getByRole("button", {
        name: "CREATION_EDITOR_WIREFRAME_APPLY_PREVIEW",
      }),
    );
    await waitFor(() => expect(applyProjectBuilderChangeSetMock).toHaveBeenCalledTimes(1));
  });

  it("re-hydrates the ordered recovery scope from same-page URL navigation", async () => {
    const { rerenderPage } = renderPage({
      initialStage: "wireframe",
      initialTargets: [{ kind: "page", itemId: "home-page" }],
    });
    await screen.findByTestId("creation-editor");
    await waitFor(() =>
      expect(recoverProjectBuilderGenerationMock).toHaveBeenLastCalledWith(
        "project-1",
        {
          targetStage: "wireframe",
          targets: [{ kind: "page", itemId: "home-page" }],
        },
        expect.any(AbortSignal),
      ),
    );
    navigateMock.mockClear();

    rerenderPage({
      initialStage: "wireframe",
      initialTargets: [
        { kind: "global_section", itemId: "global-header" },
        { kind: "page", itemId: "home-page" },
      ],
    });

    await waitFor(() =>
      expect(recoverProjectBuilderGenerationMock).toHaveBeenLastCalledWith(
        "project-1",
        {
          targetStage: "wireframe",
          targets: [
            { kind: "global_section", itemId: "global-header" },
            { kind: "page", itemId: "home-page" },
          ],
        },
        expect.any(AbortSignal),
      ),
    );
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("starts one planning-to-composition Saga for the exact unplanned target scope", async () => {
    const user = userEvent.setup();
    const targets = [
      { kind: "global_section" as const, itemId: "global-header" },
      { kind: "page" as const, itemId: "about-page" },
    ];
    renderPage({
      initialStage: "wireframe",
      initialPageId: "about-page",
      initialTargets: targets,
    });
    await screen.findByTestId("creation-editor");

    const generationPanel = await screen.findByRole("region", {
      name: "CREATION_EDITOR_WIREFRAME_GENERATION_LABEL",
    });
    await waitFor(() =>
      expect(recoverProjectBuilderCompositionSagaMock).toHaveBeenCalledWith(
        "project-1",
        {
          targets,
        },
        expect.any(AbortSignal),
      ),
    );
    expect(
      within(generationPanel).getByText(
        "CREATION_EDITOR_WIREFRAME_GENERATION_TARGET_PLAN_REQUIRED",
      ),
    ).toBeVisible();
    await user.type(
      within(generationPanel).getByLabelText(
        "CREATION_EDITOR_WIREFRAME_GENERATION_OBJECTIVE_LABEL",
      ),
      "Plan the About story, then compose its Wireframe.",
    );
    await user.click(
      within(generationPanel).getByRole("button", {
        name: "CREATION_EDITOR_COMPOSITION_SAGA_PLAN_FIRST",
      }),
    );

    await waitFor(() => expect(createProjectBuilderCompositionSagaMock).toHaveBeenCalledTimes(1));
    expect(createProjectBuilderCompositionSagaMock).toHaveBeenCalledWith(
      "project-1",
      {
        baseRevisionId: "revision-1",
        baseEtag: siteRevision.manifestHash,
        agentId: "agent-1",
        objective: "Plan the About story, then compose its Wireframe.",
        locale: "en-US",
        candidateCount: 2,
        targets,
      },
      expect.stringContaining("composition-saga:"),
    );
    expect(createProjectBuilderGenerationMock).not.toHaveBeenCalled();
    expect(createAgentThreadMock).not.toHaveBeenCalled();
    expect(createAgentRunMock).not.toHaveBeenCalled();
  });

  it("recovers the same Saga and projects its durable composition phase after reload", async () => {
    const runningSaga = compositionSaga("composition_running");
    recoverProjectBuilderCompositionSagaMock.mockResolvedValueOnce({
      active: runningSaga,
      latestTerminal: null,
    });
    getProjectBuilderCompositionSagaMock.mockResolvedValue(runningSaga);

    renderPage({ initialStage: "wireframe", initialPageId: "about-page" });
    await screen.findByTestId("creation-editor");

    await waitFor(() =>
      expect(recoverProjectBuilderCompositionSagaMock).toHaveBeenCalledWith(
        "project-1",
        { targets: [{ kind: "page", itemId: "about-page" }] },
        expect.any(AbortSignal),
      ),
    );
    await waitFor(() =>
      expect(getProjectBuilderCompositionSagaMock).toHaveBeenCalledWith(
        "project-1",
        "composition-saga-1",
        expect.any(AbortSignal),
      ),
    );
    const phaseRail = await screen.findByRole("status", {
      name: "CREATION_EDITOR_COMPOSITION_SAGA_PHASE_RAIL",
    });
    expect(phaseRail).toHaveTextContent(
      "CREATION_EDITOR_COMPOSITION_SAGA_STATUS_COMPOSITION_RUNNING",
    );
    expect(phaseRail).toHaveTextContent("composition-job-1");
  });

  it("applies planning and composition candidates through two persisted Saga transitions", async () => {
    const user = userEvent.setup();
    const planningReview = compositionSaga("planning_review_pending");
    const compositionReview = compositionSaga("composition_review_pending");
    const completed = compositionSaga("completed");
    recoverProjectBuilderCompositionSagaMock.mockResolvedValueOnce({
      active: planningReview,
      latestTerminal: null,
    });
    getProjectBuilderCompositionSagaMock.mockResolvedValue(planningReview);
    transitionProjectBuilderCompositionSagaPhaseMock
      .mockResolvedValueOnce(compositionReview)
      .mockResolvedValueOnce(completed);
    applyProjectBuilderChangeSetMock
      .mockResolvedValueOnce({ siteRevision: { id: "revision-2" } })
      .mockResolvedValueOnce({ siteRevision: { id: "revision-3" } });

    renderPage({ initialStage: "wireframe", initialPageId: "about-page" });
    await screen.findByTestId("creation-editor");

    await user.click(
      await screen.findByRole("button", {
        name: "CREATION_EDITOR_COMPOSITION_SAGA_APPLY_PLANNING",
      }),
    );
    await waitFor(() =>
      expect(transitionProjectBuilderCompositionSagaPhaseMock).toHaveBeenNthCalledWith(
        1,
        "project-1",
        "composition-saga-1",
        {
          expectedPhase: "planning",
          appliedChangeSetId: "planning-change-set-1",
          appliedSiteRevisionId: "revision-2",
        },
      ),
    );
    expect(applyProjectBuilderChangeSetMock).toHaveBeenNthCalledWith(
      1,
      "project-1",
      "planning-change-set-1",
      { previewToken: "planning-preview-token", approval: undefined },
      "composition-saga:composition-saga-1:planning:planning-change-set-1:apply",
    );

    await user.click(
      await screen.findByRole("button", {
        name: "CREATION_EDITOR_COMPOSITION_SAGA_APPLY_COMPOSITION",
      }),
    );
    await waitFor(() =>
      expect(transitionProjectBuilderCompositionSagaPhaseMock).toHaveBeenNthCalledWith(
        2,
        "project-1",
        "composition-saga-1",
        {
          expectedPhase: "composition",
          appliedChangeSetId: "composition-change-set-1",
          appliedSiteRevisionId: "revision-3",
        },
      ),
    );
    expect(
      await screen.findByText("CREATION_EDITOR_COMPOSITION_SAGA_STATUS_COMPLETED"),
    ).toBeVisible();
    expect(createAgentThreadMock).not.toHaveBeenCalled();
    expect(createAgentRunMock).not.toHaveBeenCalled();
  });

  it("cancels the parent Saga instead of cancelling a child generation directly", async () => {
    const user = userEvent.setup();
    const runningSaga = compositionSaga("planning_running");
    recoverProjectBuilderCompositionSagaMock.mockResolvedValueOnce({
      active: runningSaga,
      latestTerminal: null,
    });
    getProjectBuilderCompositionSagaMock.mockResolvedValue(runningSaga);

    renderPage({ initialStage: "wireframe", initialPageId: "about-page" });
    await screen.findByTestId("creation-editor");

    await user.click(
      await screen.findByRole("button", {
        name: "CREATION_EDITOR_COMPOSITION_SAGA_CANCEL",
      }),
    );
    await waitFor(() => expect(cancelProjectBuilderCompositionSagaMock).toHaveBeenCalledTimes(1));
    expect(cancelProjectBuilderCompositionSagaMock).toHaveBeenCalledWith(
      "project-1",
      "composition-saga-1",
      { reason: "CREATION_EDITOR_COMPOSITION_SAGA_CANCEL_REASON" },
    );
    expect(cancelProjectBuilderGenerationMock).not.toHaveBeenCalled();
  });

  it("recovers and cancels the exact active Wireframe generation resource", async () => {
    const user = userEvent.setup();
    const queuedGeneration = wireframeGenerationWithCandidate("queued");
    const cancelledGeneration = wireframeGenerationWithCandidate("cancelled");
    recoverProjectBuilderGenerationMock.mockResolvedValueOnce({
      active: queuedGeneration,
      latestTerminal: null,
    });
    getProjectBuilderGenerationMock.mockResolvedValue(queuedGeneration);
    cancelProjectBuilderGenerationMock.mockResolvedValueOnce(cancelledGeneration);
    renderPage();
    await screen.findByTestId("creation-editor");

    await user.click(screen.getByRole("button", { name: "CREATION_EDITOR_STAGE_WIREFRAME" }));
    const generationPanel = await screen.findByRole("region", {
      name: "CREATION_EDITOR_WIREFRAME_GENERATION_LABEL",
    });

    await waitFor(() =>
      expect(getProjectBuilderGenerationMock).toHaveBeenCalledWith(
        "project-1",
        "wireframe-generation-1",
        expect.any(AbortSignal),
      ),
    );
    expect(
      within(generationPanel).getByLabelText(
        "CREATION_EDITOR_WIREFRAME_GENERATION_OBJECTIVE_LABEL",
      ),
    ).toBeDisabled();
    expect(
      within(generationPanel).getByLabelText("CREATION_EDITOR_WIREFRAME_GENERATION_COUNT_LABEL"),
    ).toBeDisabled();

    await user.click(
      within(generationPanel).getByRole("button", {
        name: "CREATION_EDITOR_WIREFRAME_GENERATION_CANCEL",
      }),
    );
    await waitFor(() => expect(cancelProjectBuilderGenerationMock).toHaveBeenCalledTimes(1));
    expect(cancelProjectBuilderGenerationMock).toHaveBeenCalledWith(
      "project-1",
      "wireframe-generation-1",
      { reason: "CREATION_EDITOR_WIREFRAME_GENERATION_CANCEL_REASON" },
    );
    expect(createProjectBuilderGenerationMock).not.toHaveBeenCalled();
  });

  it("reviews and applies an immutable Style Guide candidate through the server revision", async () => {
    const user = userEvent.setup();
    previewProjectBuilderChangeSetMock.mockResolvedValueOnce({
      changeSetId: "style-refresh-1",
      previewToken: "style-refresh-token",
      previewRef: "/projects/project-1/builder/change-sets/style-refresh-1",
      baseRevisionId: "revision-1",
      baseEtag: siteRevision.manifestHash,
      status: "previewed",
      approvalClass: "review",
      approval: {
        approvalId: "style-approval-1",
        approvalClass: "review",
        status: "pending",
        expiresAt: "2026-07-22T00:00:00Z",
      },
      operationsHash: `sha256:${"b".repeat(64)}`,
      expiresAt: "2026-07-22T00:00:00Z",
      summaryKey: "BUILDER_CHANGE_SET_PREVIEW_SUMMARY",
      summaryParams: {
        fromVersionId: "design-version-1",
        toVersionId: "design-version-2",
      },
      requiredPermissions: ["project:content:site-builder:write"],
      affectedTargets: [
        {
          kind: "design_system",
          targetId: "design-version-2",
          operationIds: ["refresh-design-system"],
        },
      ],
      issues: [],
      operations: [],
      wireframeCandidates: [],
    });
    renderPage();
    await screen.findByTestId("creation-editor");

    await user.click(screen.getByRole("button", { name: "CREATION_EDITOR_STAGE_STYLE_GUIDE" }));
    expect(
      await screen.findByRole("region", { name: "CREATION_EDITOR_STYLE_GUIDE_LABEL" }),
    ).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "CREATION_EDITOR_STYLE_CREATE_MANUAL_VERSION" }),
    );
    await user.click(
      screen.getByRole("button", {
        name: "settings:SETTINGS_WORKSPACE_DESIGN_SYSTEMS_VERSION_CREATE_ACTION",
      }),
    );

    await waitFor(() => expect(createProjectDesignSystemVersionMock).toHaveBeenCalledTimes(1));
    expect(createProjectDesignSystemVersionMock).toHaveBeenCalledWith(
      "project-1",
      "design-system-1",
      expect.objectContaining({
        parentVersionId: "design-version-1",
        expectedParentChecksum: `sha256:${"7".repeat(64)}`,
      }),
      "style-guide-version:design-version-1",
    );
    await user.click(await screen.findByRole("button", { name: "CREATION_EDITOR_STYLE_VALIDATE" }));
    await user.click(await screen.findByRole("button", { name: "CREATION_EDITOR_STYLE_ASSIGN" }));
    await user.click(
      await screen.findByRole("button", { name: "CREATION_EDITOR_STYLE_PREVIEW_REFRESH" }),
    );

    await waitFor(() => expect(previewProjectBuilderChangeSetMock).toHaveBeenCalledTimes(1));
    expect(previewProjectBuilderChangeSetMock).toHaveBeenCalledWith(
      "project-1",
      expect.objectContaining({
        baseRevisionId: "revision-1",
        baseEtag: siteRevision.manifestHash,
        provenanceSource: "human",
        operations: [
          {
            type: "design-system.refresh",
            operationId: "refresh-design-system",
            expectedAssignmentRevision: 4,
            designSystemId: "design-system-1",
            versionId: "design-version-2",
            expectedManifestChecksum: `sha256:${"8".repeat(64)}`,
            validationFindingHash: `sha256:${"a".repeat(64)}`,
          },
        ],
      }),
      "style-guide-refresh-preview:4",
    );
    expect(
      await screen.findByRole("region", { name: "CREATION_EDITOR_STYLE_REVIEW_LABEL" }),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "CREATION_EDITOR_STYLE_APPLY_REFRESH" }));
    expect(applyProjectBuilderChangeSetMock).toHaveBeenCalledWith(
      "project-1",
      "style-refresh-1",
      {
        previewToken: "style-refresh-token",
        approval: {
          approvalId: "style-approval-1",
          decision: "approve",
          expectedApprovalClass: "review",
        },
      },
      "style-guide-refresh-apply:style-refresh-1",
    );
  });

  it("starts one Agent-snapshotted Style Guide command and reviews its durable concept", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId("creation-editor");

    await user.click(screen.getByRole("button", { name: "CREATION_EDITOR_STAGE_STYLE_GUIDE" }));
    expect(
      await screen.findByRole("heading", { name: "account:CREATION_EDITOR_STYLE_AI_TITLE" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: /Visual Designer/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await user.type(
      screen.getByLabelText("account:CREATION_EDITOR_STYLE_AI_OBJECTIVE_LABEL"),
      "Create a calm editorial system for an independent research studio.",
    );
    await user.click(
      screen.getByRole("button", { name: "account:CREATION_EDITOR_STYLE_AI_GENERATE" }),
    );

    await waitFor(() =>
      expect(createProjectDesignSystemConceptGenerationMock).toHaveBeenCalledTimes(1),
    );
    expect(createAgentThreadMock).not.toHaveBeenCalled();
    expect(createAgentRunMock).not.toHaveBeenCalled();
    expect(createProjectDesignSystemConceptGenerationMock).toHaveBeenCalledWith(
      "project-1",
      "design-system-1",
      expect.objectContaining({
        agentId: "agent-visual",
        baseRevisionId: "revision-1",
        baseEtag: siteRevision.manifestHash,
        baseVersionId: "design-version-1",
        expectedBaseChecksum: `sha256:${"7".repeat(64)}`,
        candidateCount: 2,
        locale: "zh-CN",
      }),
      expect.stringContaining("style-guide-generation:"),
    );

    const candidate = await screen.findByRole("button", {
      name: /account:CREATION_EDITOR_STYLE_AI_CANDIDATE/,
    });
    expect(screen.getByText("ai:AI_CHAT_STYLE_GUIDE_TOOL_STATUS_SUCCEEDED")).toBeVisible();
    expect(
      screen.queryByText("DESIGN_SYSTEM_CONCEPT_GENERATION_STATUS_FINALIZING"),
    ).not.toBeInTheDocument();
    expect(setProjectDesignSystemAssignmentMock).not.toHaveBeenCalled();
    await user.click(candidate);

    expect(await screen.findByText("Northstar foundation v3")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "CREATION_EDITOR_STYLE_VALIDATE" }),
    ).not.toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "CREATION_EDITOR_STYLE_ASSIGN" }));
    expect(setProjectDesignSystemAssignmentMock).toHaveBeenCalledWith(
      "project-1",
      expect.objectContaining({
        designSystemId: "design-system-1",
        versionId: "design-version-3",
        validationFindingHash: `sha256:${"d".repeat(64)}`,
      }),
      "style-guide-assign:design-version-3",
    );
    expect(previewProjectBuilderChangeSetMock).not.toHaveBeenCalled();
  });

  it("restores the latest terminal Style Guide concept after a hard refresh", async () => {
    recoverProjectDesignSystemConceptGenerationsMock.mockResolvedValueOnce({
      active: null,
      latestTerminal: styleGuideConceptGeneration(),
    });

    renderPage();
    await screen.findByTestId("creation-editor");
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "CREATION_EDITOR_STAGE_STYLE_GUIDE" }));

    expect(await screen.findByRole("button", { name: /Editorial restraint/ })).toBeVisible();
    expect(createProjectDesignSystemConceptGenerationMock).not.toHaveBeenCalled();
    expect(recoverProjectDesignSystemConceptGenerationsMock).toHaveBeenCalledWith(
      "project-1",
      "design-system-1",
      expect.any(AbortSignal),
    );
  });

  it("restores an active Style Guide command before the latest terminal result", async () => {
    recoverProjectDesignSystemConceptGenerationsMock.mockResolvedValueOnce({
      active: styleGuideConceptGeneration("queued"),
      latestTerminal: styleGuideConceptGeneration(),
    });

    renderPage();
    await screen.findByTestId("creation-editor");
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "CREATION_EDITOR_STAGE_STYLE_GUIDE" }));

    expect(
      await screen.findByRole("button", { name: "account:CREATION_EDITOR_STYLE_AI_CANCEL" }),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: /Editorial restraint/ })).not.toBeInTheDocument();
  });

  it("keeps an invalid Agent Style Guide concept inspectable but impossible to accept", async () => {
    const user = userEvent.setup();
    const invalid = styleGuideConceptGeneration();
    invalid.candidates[0]!.validation.status = "invalid";
    invalid.candidates[0]!.validation.findings = [
      {
        code: "TOKEN_ALIAS_TARGET_MISSING",
        message: "The action token points to a missing primitive token.",
        messageKey: "DESIGN_SYSTEM_TOKEN_ALIAS_TARGET_MISSING",
        path: "semanticTokens.color.action",
        relatedPath: "primitiveTokens.color.action",
        severity: "blocker",
      },
    ];
    invalid.candidates[0]!.version.validationStatus = "invalid";
    invalid.candidates[0]!.version.lifecycleStatus = "invalid";
    createProjectDesignSystemConceptGenerationMock.mockResolvedValueOnce(invalid);

    renderPage();
    await screen.findByTestId("creation-editor");
    await user.click(screen.getByRole("button", { name: "CREATION_EDITOR_STAGE_STYLE_GUIDE" }));
    await user.type(
      screen.getByLabelText("account:CREATION_EDITOR_STYLE_AI_OBJECTIVE_LABEL"),
      "Create an invalid test direction.",
    );
    await user.click(
      screen.getByRole("button", { name: "account:CREATION_EDITOR_STYLE_AI_GENERATE" }),
    );
    await user.click(
      await screen.findByRole("button", {
        name: /account:CREATION_EDITOR_STYLE_AI_CANDIDATE/,
      }),
    );

    expect(
      await screen.findByText("The action token points to a missing primitive token."),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "CREATION_EDITOR_STYLE_VALIDATE" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "CREATION_EDITOR_STYLE_ASSIGN" }),
    ).not.toBeInTheDocument();
    expect(setProjectDesignSystemAssignmentMock).not.toHaveBeenCalled();
  });

  it("requests cooperative cancellation for the active durable Style Guide generation", async () => {
    const user = userEvent.setup();
    const queued = styleGuideConceptGeneration("queued");
    createProjectDesignSystemConceptGenerationMock.mockResolvedValueOnce(queued);

    renderPage();
    await screen.findByTestId("creation-editor");
    await user.click(screen.getByRole("button", { name: "CREATION_EDITOR_STAGE_STYLE_GUIDE" }));
    await user.type(
      screen.getByLabelText("account:CREATION_EDITOR_STYLE_AI_OBJECTIVE_LABEL"),
      "Create one restrained visual direction.",
    );
    await user.click(
      screen.getByRole("button", { name: "account:CREATION_EDITOR_STYLE_AI_GENERATE" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "account:CREATION_EDITOR_STYLE_AI_CANCEL" }),
    );

    expect(cancelProjectDesignSystemConceptGenerationMock).toHaveBeenCalledWith(
      "project-1",
      "design-system-1",
      "style-generation-1",
      { reason: "CREATION_EDITOR_STYLE_AI_CANCEL_REASON" },
    );
    expect(await screen.findByText("ai:AI_CHAT_STYLE_GUIDE_TOOL_STATUS_CANCELLED")).toBeVisible();
  });

  it("loads Project Style Guide lineage and reviews an exact server comparison", async () => {
    const user = userEvent.setup();
    const currentAssignment = {
      ...projectDesignSystemAssignment,
      versionId: "design-version-2",
      manifestChecksum: `sha256:${"8".repeat(64)}`,
      metadataRevision: 4,
    };
    const currentVersion = {
      ...projectDesignSystemVersion(2),
      validationStatus: "valid",
      validationFindingHash: `sha256:${"a".repeat(64)}`,
      lifecycleStatus: "valid" as const,
      statusRevision: 2,
    };
    const forkVersion = {
      ...projectDesignSystemVersion(1),
      source: "fork",
      parentVersionId: "workspace-design-version-1",
    };
    getProjectDesignSystemAssignmentMock.mockResolvedValueOnce(currentAssignment);
    getProjectDesignSystemVersionMock.mockResolvedValueOnce(currentVersion);
    listProjectDesignSystemVersionsMock
      .mockResolvedValueOnce({
        items: [currentVersion],
        nextCursor: currentVersion.id,
        systemMetadataRevision: 2,
      })
      .mockResolvedValueOnce({
        items: [forkVersion],
        nextCursor: null,
        systemMetadataRevision: 2,
      });
    compareProjectDesignSystemVersionsMock.mockResolvedValueOnce({
      fromVersion: forkVersion,
      toVersion: currentVersion,
      comparisonHash: `sha256:${"f".repeat(64)}`,
      diff: {
        hasChanges: true,
        addedCount: 0,
        changedCount: 1,
        removedCount: 0,
        entries: [
          {
            kind: "metadata",
            operation: "changed",
            path: "name",
            before: "Northstar foundation v1",
            after: "Northstar foundation v2",
          },
        ],
      },
    });
    previewProjectDesignSystemImpactMock.mockResolvedValueOnce({
      fromVersion: forkVersion,
      toVersion: currentVersion,
      impactHash: `sha256:${"e".repeat(64)}`,
      diff: {
        hasChanges: true,
        addedCount: 0,
        changedCount: 1,
        removedCount: 0,
        entries: [
          {
            kind: "primitive_token",
            operation: "changed",
            path: "primitive.color.action",
            before: { type: "color", value: "#155EEF" },
            after: { type: "color", value: "#0F4CCC" },
          },
        ],
      },
      coverage: {
        assignment: "evaluated",
        siteRevisions: "evaluated",
        wireframes: "evaluated",
        assetAuthorization: "manifest_only",
        activeRelease: "not_evaluated",
        renderer: "not_evaluated",
        compilerArtifacts: "not_evaluated",
      },
      summary: {
        hasImpact: true,
        assignmentUsesFromVersion: false,
        referencedSiteRevisionCount: 2,
        historicalSiteRevisionCount: 1,
        currentSiteRevisionCount: 1,
        affectedPageCount: 1,
        affectedSectionCount: 1,
        blockerCount: 0,
        warningCount: 1,
        mappedDiffCount: 1,
        unmappedDiffCount: 0,
      },
      impacts: [
        {
          severity: "warning",
          reasonCode: "DESIGN_SYSTEM_TOKEN_CHANGE_REACHES_COMPONENT_RECIPE",
          siteRevisionId: "revision-1",
          revisionNumber: 2,
          pageItemId: "home-page",
          sectionId: "hero",
          componentKey: "landing.hero",
          variantKey: "default",
          recipeKey: "landing.hero.default",
          diffPaths: ["primitive.color.action"],
        },
      ],
    });

    renderPage();
    await screen.findByTestId("creation-editor");
    await user.click(screen.getByRole("button", { name: "CREATION_EDITOR_STAGE_STYLE_GUIDE" }));

    await user.click(
      await screen.findByRole("button", { name: "CREATION_EDITOR_STYLE_HISTORY_LOAD_MORE" }),
    );
    expect(
      await screen.findByText("CREATION_EDITOR_STYLE_HISTORY_WORKSPACE_BASELINE"),
    ).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "CREATION_EDITOR_STYLE_HISTORY_COMPARE_ACTION" }),
    );

    expect(compareProjectDesignSystemVersionsMock).toHaveBeenCalledWith(
      "project-1",
      "design-system-1",
      { fromVersionId: "design-version-1", toVersionId: "design-version-2" },
      expect.any(AbortSignal),
    );
    expect(previewProjectDesignSystemImpactMock).toHaveBeenCalledWith(
      "project-1",
      "design-system-1",
      { fromVersionId: "design-version-1", toVersionId: "design-version-2" },
      expect.any(AbortSignal),
    );
    expect(
      await screen.findByRole("region", { name: "CREATION_EDITOR_STYLE_COMPARISON_LABEL" }),
    ).toBeVisible();
    expect(screen.getByText("name")).toBeVisible();
    expect(
      await screen.findByRole("region", { name: "CREATION_EDITOR_STYLE_IMPACT_LABEL" }),
    ).toBeVisible();
    expect(screen.getByText("CREATION_EDITOR_STYLE_IMPACT_TITLE")).toBeVisible();
    expect(screen.getByText("CREATION_EDITOR_STYLE_IMPACT_REASON_TOKEN_CHANGE")).toBeVisible();
    expect(screen.getByText("CREATION_EDITOR_STYLE_IMPACT_ASSET_MANIFEST_ONLY")).toBeVisible();
    expect(screen.getByText("CREATION_EDITOR_STYLE_IMPACT_NOT_EVALUATED")).toBeVisible();
    expect(listProjectDesignSystemVersionsMock).toHaveBeenNthCalledWith(
      2,
      "project-1",
      "design-system-1",
      expect.objectContaining({ cursor: "design-version-2", limit: 20 }),
    );
  });

  it("confirms superseding an unassigned historical Style Guide version", async () => {
    const user = userEvent.setup();
    const currentAssignment = {
      ...projectDesignSystemAssignment,
      versionId: "design-version-2",
      manifestChecksum: `sha256:${"8".repeat(64)}`,
      metadataRevision: 4,
    };
    const currentVersion = {
      ...projectDesignSystemVersion(2),
      validationStatus: "valid",
      validationFindingHash: `sha256:${"a".repeat(64)}`,
      lifecycleStatus: "valid" as const,
      statusRevision: 2,
    };
    const forkVersion = {
      ...projectDesignSystemVersion(1),
      source: "fork",
      parentVersionId: "workspace-design-version-1",
    };
    getProjectDesignSystemAssignmentMock.mockResolvedValueOnce(currentAssignment);
    getProjectDesignSystemVersionMock.mockResolvedValueOnce(currentVersion);
    getProjectBuilderRevisionMock.mockResolvedValueOnce({
      ...revisionProjection,
      siteRevision: {
        ...revisionProjection.siteRevision,
        designSystemVersionId: currentVersion.id,
        designSystemManifestChecksum: currentVersion.manifestChecksum,
      },
    });
    listProjectDesignSystemVersionsMock.mockResolvedValueOnce({
      items: [currentVersion, forkVersion],
      nextCursor: null,
      systemMetadataRevision: 2,
    });

    renderPage();
    await screen.findByTestId("creation-editor");
    await user.click(screen.getByRole("button", { name: "CREATION_EDITOR_STAGE_STYLE_GUIDE" }));
    await user.click(
      await screen.findByRole("button", {
        name: "CREATION_EDITOR_STYLE_HISTORY_SUPERSEDE_ACTION",
      }),
    );

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "CREATION_EDITOR_STYLE_SUPERSEDE_TITLE" }),
      ).toBeVisible();
      expect(screen.getByText("CREATION_EDITOR_STYLE_SUPERSEDE_HISTORY_PRESERVED")).toBeVisible();
    });
    await user.click(
      screen.getByRole("button", { name: "CREATION_EDITOR_STYLE_SUPERSEDE_CONFIRM" }),
    );

    await waitFor(() => {
      expect(supersedeProjectDesignSystemVersionMock).toHaveBeenCalledWith(
        "project-1",
        "design-system-1",
        "design-version-1",
        {
          replacementVersionId: "design-version-2",
          expectedReplacementChecksum: currentVersion.manifestChecksum,
          expectedTargetStatus: "valid",
          expectedTargetStatusRevision: 1,
          expectedSystemRevision: 2,
        },
        "style-guide-supersede:design-version-1:design-version-2",
      );
    });
  });

  it("forks a Workspace Style Guide before assigning the project-owned version", async () => {
    const user = userEvent.setup();
    const workspaceAssignment = {
      ...projectDesignSystemAssignment,
      designSystemId: "workspace-design-system-1",
      versionId: "workspace-design-version-1",
      ownerKind: "workspace",
    };
    const workspaceVersion = {
      ...projectDesignSystemVersion(),
      id: "workspace-design-version-1",
      designSystemId: "workspace-design-system-1",
    };
    const forkedVersion = {
      ...projectDesignSystemVersion(),
      id: "project-design-version-1",
      designSystemId: "project-design-system-1",
    };
    getProjectDesignSystemAssignmentMock.mockResolvedValueOnce(workspaceAssignment);
    getWorkspaceDesignSystemVersionMock.mockResolvedValueOnce(workspaceVersion);
    forkProjectDesignSystemMock.mockResolvedValueOnce({
      projectId: "project-1",
      designSystemId: "project-design-system-1",
      versionId: "project-design-version-1",
      manifestChecksum: forkedVersion.manifestChecksum,
      validationFindingHash: `sha256:${"8".repeat(64)}`,
      sourceDesignSystemId: "workspace-design-system-1",
      sourceVersionId: "workspace-design-version-1",
      sourceManifestChecksum: workspaceAssignment.manifestChecksum,
    });
    setProjectDesignSystemAssignmentMock.mockResolvedValueOnce({
      previous: workspaceAssignment,
      current: {
        ...workspaceAssignment,
        designSystemId: "project-design-system-1",
        versionId: "project-design-version-1",
        ownerKind: "project",
        metadataRevision: 4,
      },
      activeReleaseChanged: false,
      siteRevisionChanged: false,
    });
    getProjectDesignSystemVersionMock.mockResolvedValueOnce(forkedVersion);

    renderPage();
    await screen.findByTestId("creation-editor");
    await user.click(screen.getByRole("button", { name: "CREATION_EDITOR_STAGE_STYLE_GUIDE" }));
    await user.click(
      await screen.findByRole("button", { name: "CREATION_EDITOR_STYLE_FORK_ACTION" }),
    );
    const dialog = await screen.findByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", {
        name: "account:CREATION_EDITOR_STYLE_FORK_ACTION",
      }),
    );

    await waitFor(() => expect(setProjectDesignSystemAssignmentMock).toHaveBeenCalledTimes(1));
    expect(forkProjectDesignSystemMock).toHaveBeenCalledWith(
      "project-1",
      expect.objectContaining({
        sourceDesignSystemId: "workspace-design-system-1",
        sourceVersionId: "workspace-design-version-1",
        expectedSourceChecksum: workspaceAssignment.manifestChecksum,
        validationFindingHash: workspaceAssignment.validationFindingHash,
      }),
      "style-guide-fork:workspace-design-version-1",
    );
    expect(setProjectDesignSystemAssignmentMock).toHaveBeenCalledWith(
      "project-1",
      expect.objectContaining({
        designSystemId: "project-design-system-1",
        versionId: "project-design-version-1",
        expectedRevision: 3,
      }),
      "style-guide-assign:project-design-version-1",
    );
  });

  it("shows invalid Style Guide findings without exposing assign or refresh actions", async () => {
    const user = userEvent.setup();
    createProjectDesignSystemVersionMock.mockResolvedValueOnce({
      ...projectDesignSystemVersion(2),
      manifest: {
        ...projectDesignSystemVersion(2).manifest,
        primitiveTokens: {},
      },
    });
    validateProjectDesignSystemVersionMock.mockResolvedValueOnce({
      id: "validation-2",
      workspaceId: "workspace-1",
      designSystemVersionId: "design-version-2",
      profile: "foundation",
      validatorVersion: 2,
      status: "invalid",
      findings: [
        {
          code: "TOKEN_ALIAS_TARGET_MISSING",
          message: "The action token points to a missing primitive token.",
          messageKey: "DESIGN_SYSTEM_TOKEN_ALIAS_TARGET_MISSING",
          path: "semanticTokens.color.action",
          relatedPath: "primitiveTokens.color.action",
          severity: "blocker",
        },
      ],
      findingHash: `sha256:${"c".repeat(64)}`,
      tokenIndexHash: `sha256:${"9".repeat(64)}`,
      publishReady: false,
      compatibility: { componentCatalog: "compatible" },
      actorUserId: "user-1",
      createdAt: "2026-07-21T00:00:00Z",
    });

    renderPage();
    await screen.findByTestId("creation-editor");
    await user.click(screen.getByRole("button", { name: "CREATION_EDITOR_STAGE_STYLE_GUIDE" }));
    await user.click(
      screen.getByRole("button", { name: "CREATION_EDITOR_STYLE_CREATE_MANUAL_VERSION" }),
    );
    await user.click(
      screen.getByRole("button", {
        name: "settings:SETTINGS_WORKSPACE_DESIGN_SYSTEMS_VERSION_CREATE_ACTION",
      }),
    );
    expect(await screen.findByText("CREATION_EDITOR_STYLE_PALETTE_EMPTY")).toBeVisible();
    await user.click(await screen.findByRole("button", { name: "CREATION_EDITOR_STYLE_VALIDATE" }));

    expect(
      await screen.findByText("The action token points to a missing primitive token."),
    ).toBeVisible();
    expect(screen.getByText("semanticTokens.color.action")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "CREATION_EDITOR_STYLE_ASSIGN" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "CREATION_EDITOR_STYLE_PREVIEW_REFRESH" }),
    ).not.toBeInTheDocument();
    expect(setProjectDesignSystemAssignmentMock).not.toHaveBeenCalled();
    expect(previewProjectBuilderChangeSetMock).not.toHaveBeenCalled();
  });

  it("previews a typed Wireframe candidate before creating a new Content Version", async () => {
    const user = userEvent.setup();
    const sourceWireframe = revisionProjection.pages[0]?.wireframe;
    const sourceSection = sourceWireframe?.sections[0];
    if (!sourceWireframe || !sourceSection) throw new Error("Wireframe test fixture is incomplete");
    const candidateWireframe = {
      ...sourceWireframe,
      sections: [
        {
          ...sourceSection,
          componentKey: "landing.feature-grid",
          variantKey: "split",
          bindings: [
            { kind: "field" as const, slotKey: "heading", fieldKey: "heroHeadline" },
            { kind: "literal" as const, slotKey: "items", value: [{ title: "Fast" }] },
          ],
        },
      ],
    };
    previewProjectBuilderChangeSetMock.mockResolvedValueOnce({
      changeSetId: "wireframe-change-set-1",
      previewToken: "wireframe-preview-token",
      previewRef: "/projects/project-1/builder/change-sets/wireframe-change-set-1",
      baseRevisionId: "revision-1",
      baseEtag: siteRevision.manifestHash,
      status: "previewed",
      approvalClass: "none",
      approval: null,
      operationsHash: `sha256:${"6".repeat(64)}`,
      expiresAt: "2026-07-22T00:00:00Z",
      summaryKey: "BUILDER_CHANGE_SET_PREVIEW_SUMMARY",
      summaryParams: { operationCount: 1 },
      requiredPermissions: ["project:content:items:write", "project:content:site-builder:write"],
      affectedTargets: [],
      issues: [],
      operations: [
        {
          type: "wireframe.section.configure",
          operationId: "configure-op",
          itemId: "home-page",
          expectedDraftVersion: 2,
          sectionId: "hero",
          componentKey: "landing.feature-grid",
          variantKey: "split",
          bindings: candidateWireframe.sections[0]?.bindings ?? [],
          responsiveRules: sourceSection.responsiveRules,
          interactionRules: sourceSection.interactionRules,
        },
      ],
      wireframeCandidates: [
        {
          itemId: "home-page",
          baseContentVersionId: "home-version",
          baseVersionNumber: 2,
          wireframe: candidateWireframe,
        },
      ],
    });
    renderPage();
    await screen.findByTestId("creation-editor");
    await user.click(screen.getByRole("button", { name: "CREATION_EDITOR_STAGE_WIREFRAME" }));

    const componentPicker = await screen.findByLabelText("CREATION_EDITOR_WIREFRAME_COMPONENT");
    await user.click(componentPicker);
    await user.click(screen.getByRole("option", { name: "Feature grid" }));
    const variantPicker = screen.getByLabelText("CREATION_EDITOR_WIREFRAME_VARIANT");
    await user.click(variantPicker);
    await user.click(screen.getByRole("option", { name: "Guided split" }));
    await user.click(screen.getByLabelText("Feature items CREATION_EDITOR_WIREFRAME_BINDING_KIND"));
    await user.click(
      screen.getByRole("option", { name: "CREATION_EDITOR_WIREFRAME_BINDING_LITERAL" }),
    );
    const itemsInput = screen.getByLabelText(
      "Feature items CREATION_EDITOR_WIREFRAME_BINDING_VALUE",
    );
    await user.click(itemsInput);
    await user.paste('[{"title":"Fast"}]');
    await user.click(
      screen.getByRole("button", { name: "CREATION_EDITOR_WIREFRAME_PREVIEW_COMPOSITION" }),
    );

    await waitFor(() => expect(previewProjectBuilderChangeSetMock).toHaveBeenCalledTimes(1));
    expect(previewProjectBuilderChangeSetMock).toHaveBeenCalledWith(
      "project-1",
      expect.objectContaining({
        baseRevisionId: "revision-1",
        baseEtag: siteRevision.manifestHash,
        provenanceSource: "human",
        operations: [
          expect.objectContaining({
            type: "wireframe.section.configure",
            itemId: "home-page",
            expectedDraftVersion: 2,
            sectionId: "hero",
            componentKey: "landing.feature-grid",
            variantKey: "split",
            bindings: [
              { kind: "field", slotKey: "heading", fieldKey: "heroHeadline" },
              { kind: "literal", slotKey: "items", value: [{ title: "Fast" }] },
            ],
            responsiveRules: sourceSection.responsiveRules,
            interactionRules: [],
          }),
        ],
      }),
      expect.stringContaining("wireframe-preview:"),
    );
    expect(
      await screen.findByRole("region", { name: "CREATION_EDITOR_WIREFRAME_REVIEW_LABEL" }),
    ).toBeVisible();
    expect(screen.getByText("landing.feature-grid · split")).toBeVisible();
    expect(screen.getByText("CREATION_EDITOR_WIREFRAME_CANDIDATE_ACTIVE")).toBeVisible();

    await user.click(
      screen.getByRole("button", { name: "CREATION_EDITOR_WIREFRAME_APPLY_PREVIEW" }),
    );
    await waitFor(() => expect(applyProjectBuilderChangeSetMock).toHaveBeenCalledTimes(1));
    expect(applyProjectBuilderChangeSetMock).toHaveBeenCalledWith(
      "project-1",
      "wireframe-change-set-1",
      { previewToken: "wireframe-preview-token", approval: undefined },
      expect.stringContaining("wireframe-apply:"),
    );
  });

  it("keeps an invalid structured slot draft local and explains why preview cannot start", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId("creation-editor");
    await user.click(screen.getByRole("button", { name: "CREATION_EDITOR_STAGE_WIREFRAME" }));

    await user.click(await screen.findByLabelText("CREATION_EDITOR_WIREFRAME_COMPONENT"));
    await user.click(screen.getByRole("option", { name: "Feature grid" }));
    await user.click(screen.getByLabelText("Feature items CREATION_EDITOR_WIREFRAME_BINDING_KIND"));
    await user.click(
      screen.getByRole("option", { name: "CREATION_EDITOR_WIREFRAME_BINDING_LITERAL" }),
    );
    const itemsInput = screen.getByLabelText(
      "Feature items CREATION_EDITOR_WIREFRAME_BINDING_VALUE",
    );
    await user.click(itemsInput);
    await user.paste("not-json");
    await user.click(
      screen.getByRole("button", { name: "CREATION_EDITOR_WIREFRAME_PREVIEW_COMPOSITION" }),
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "CREATION_EDITOR_WIREFRAME_LITERAL_INVALID",
    );
    expect(itemsInput).toHaveAttribute("aria-invalid", "true");
    expect(previewProjectBuilderChangeSetMock).not.toHaveBeenCalled();
  });

  it("shows an explicit initialization boundary instead of fabricating an empty revision", async () => {
    const user = userEvent.setup();
    getProjectBuilderMock.mockResolvedValue({
      ...readyBuilder,
      currentSiteRevision: null,
      currentStatus: null,
      initializationRequired: true,
      blockers: ["BUILDER_INITIALIZATION_REQUIRED"],
    });
    renderPage();

    expect(
      await screen.findByRole("heading", { name: "CREATION_EDITOR_INITIALIZE_TITLE" }),
    ).toBeVisible();
    expect(getProjectBuilderRevisionMock).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "CREATION_EDITOR_OPEN_MANAGEMENT" }));
    expect(navigateMock).toHaveBeenCalledWith({
      to: "/projects/project-1/content/site-builder",
    });
  });

  it("creates a revision-bound Agent Run before durable Sitemap generation", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId("creation-editor");

    await user.click(screen.getByRole("button", { name: "CREATION_EDITOR_INSPECTOR_AI" }));
    await user.type(
      screen.getByLabelText("CREATION_EDITOR_AI_OBJECTIVE_LABEL"),
      "Plan a focused product website",
    );
    await user.click(screen.getByRole("button", { name: "CREATION_EDITOR_AI_GENERATE" }));

    await waitFor(() => expect(createProjectBuilderGenerationMock).toHaveBeenCalledTimes(1));
    expect(createAgentThreadMock).toHaveBeenCalledWith(
      "workspace-1",
      expect.objectContaining({ projectId: "project-1", leadAgentId: "agent-1" }),
    );
    expect(createAgentRunMock).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        projectId: "project-1",
        threadId: "thread-1",
        leadAgentId: "agent-1",
        executionMode: "build",
        siteRevisionId: "revision-1",
        message: "Plan a focused product website",
      }),
    );
    expect(createProjectBuilderGenerationMock).toHaveBeenCalledWith(
      "project-1",
      expect.objectContaining({
        agentRunId: "run-1",
        baseRevisionId: "revision-1",
        baseEtag: siteRevision.manifestHash,
        targetStage: "sitemap",
      }),
      expect.stringContaining("builder-generation:"),
    );
    expect(
      await screen.findByRole("button", { name: "CREATION_EDITOR_AI_APPROVE_APPLY" }),
    ).toBeEnabled();
  });

  it("previews a manual page ChangeSet before creating the page", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId("creation-editor");

    await user.click(screen.getByRole("button", { name: "CREATION_EDITOR_TOOL_ADD_PAGE" }));
    const dialog = screen.getByRole("dialog", { name: "CREATION_EDITOR_ADD_PAGE_TITLE" });
    await user.type(within(dialog).getByLabelText("CREATION_EDITOR_ADD_PAGE_NAME"), "Pricing");
    await user.type(within(dialog).getByLabelText("CREATION_EDITOR_ADD_PAGE_PATH"), "/pricing");
    await user.click(
      within(dialog).getByRole("button", { name: "CREATION_EDITOR_ADD_PAGE_PREVIEW" }),
    );

    await waitFor(() => expect(previewProjectBuilderChangeSetMock).toHaveBeenCalledTimes(1));
    expect(previewProjectBuilderChangeSetMock).toHaveBeenCalledWith(
      "project-1",
      expect.objectContaining({
        baseRevisionId: "revision-1",
        baseEtag: siteRevision.manifestHash,
        provenanceSource: "human",
        operations: [
          expect.objectContaining({
            type: "page.create",
            title: "Pricing",
            slug: "pricing",
            path: "/pricing",
          }),
        ],
      }),
      expect.stringContaining("page-create-preview:"),
    );
    await user.click(
      await within(dialog).findByRole("button", { name: "CREATION_EDITOR_ADD_PAGE_APPLY" }),
    );
    await waitFor(() =>
      expect(applyProjectBuilderChangeSetMock).toHaveBeenCalledWith(
        "project-1",
        "manual-change-set-1",
        { previewToken: "manual-preview-token", approval: undefined },
        expect.stringContaining("page-create-apply:"),
      ),
    );
  });

  it("opens the revision-pinned shared section workbench from the Sitemap canvas", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId("creation-editor");

    await user.click(screen.getByRole("button", { name: "CREATION_EDITOR_TOOL_SHARED_SECTIONS" }));

    const dialog = screen.getByRole("dialog", {
      name: "CREATION_EDITOR_SHARED_SECTIONS_TITLE",
    });
    expect(within(dialog).getByText("Primary navigation")).toBeInTheDocument();
    expect(within(dialog).getByText("primary-navigation")).toBeInTheDocument();
    expect(within(dialog).getByText("Global footer")).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", {
        name: "CREATION_EDITOR_SHARED_SECTIONS_ADD",
      }),
    ).toBeEnabled();
  });

  it("submits the exact candidate preview and approval evidence when applying", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId("creation-editor");
    await user.click(screen.getByRole("button", { name: "CREATION_EDITOR_INSPECTOR_AI" }));
    await user.type(screen.getByLabelText("CREATION_EDITOR_AI_OBJECTIVE_LABEL"), "Add pricing");
    await user.click(screen.getByRole("button", { name: "CREATION_EDITOR_AI_GENERATE" }));
    await user.click(
      await screen.findByRole("button", { name: "CREATION_EDITOR_AI_APPROVE_APPLY" }),
    );

    await waitFor(() => expect(applyProjectBuilderChangeSetMock).toHaveBeenCalledTimes(1));
    expect(applyProjectBuilderChangeSetMock).toHaveBeenCalledWith(
      "project-1",
      "change-set-1",
      {
        previewToken: "signed-preview-token",
        approval: {
          approvalId: "approval-1",
          decision: "approve",
          expectedApprovalClass: "review",
        },
      },
      expect.stringContaining("builder-apply:"),
    );
  });
});
