import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { BuilderChangeSetPreviewOut, BuilderRevisionOut } from "@arclayer/openapi";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SharedSectionManagerPanel } from "@/pages/projects/editor/shared-section-manager-dialog";

const previewProjectBuilderChangeSetMock = vi.fn();
const applyProjectBuilderChangeSetMock = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/api/project-builder", () => ({
  previewProjectBuilderChangeSet: (...args: unknown[]) =>
    previewProjectBuilderChangeSetMock(...args),
  applyProjectBuilderChangeSet: (...args: unknown[]) => applyProjectBuilderChangeSetMock(...args),
}));

const revision = {
  siteRevision: {
    id: "revision-1",
    revisionNumber: 3,
    manifestHash: `sha256:${"1".repeat(64)}`,
    manifestVersion: 1,
    workspaceId: "workspace-1",
    projectId: "project-1",
    siteId: "site-1",
    environmentId: "environment-1",
    contentStructureRevisionId: "structure-1",
    contentStructureHash: `sha256:${"4".repeat(64)}`,
    designSystemId: "design-system-1",
    designSystemVersionId: "design-version-1",
    designSystemManifestChecksum: `sha256:${"2".repeat(64)}`,
    presentationSetHash: `sha256:${"6".repeat(64)}`,
    pageVersions: [],
    globalSectionVersions: [],
    projectAuthoringMode: "builder_managed",
    provenanceSource: "human",
    createdAt: "2026-07-22T00:00:00Z",
  },
  status: {
    siteRevisionId: "revision-1",
    status: "draft",
    statusRevision: 1,
    readinessFindings: [],
    validatorVersion: "builder-v1",
    etag: `sha256:${"3".repeat(64)}`,
    calculatedAt: "2026-07-22T00:00:00Z",
  },
  contentStructureRevision: {
    id: "structure-1",
    revisionNumber: 3,
    structureHash: `sha256:${"4".repeat(64)}`,
    createdAt: "2026-07-22T00:00:00Z",
    snapshot: {
      workspaceId: "workspace-1",
      projectId: "project-1",
      siteId: "site-1",
      environmentId: "environment-1",
      locales: ["en-US", "zh-CN"],
      pages: [],
    },
  },
  pages: [
    {
      itemId: "about-page",
      contentVersionId: "about-version",
      versionNumber: 2,
      title: "About",
      summary: null,
      parentItemId: null,
      sortOrder: 0,
      routes: [{ locale: "en-US", path: "/about", isActive: true }],
      purpose: "Explain the company",
      sectionIntents: [],
      wireframeTraceability: {
        status: "aligned",
        missingIntentIds: [],
        orphanedSectionIds: [],
      },
      wireframe: null,
    },
  ],
  globalSections: [
    {
      itemId: "global-header",
      contentVersionId: "header-version",
      versionNumber: 4,
      title: "Primary navigation",
      summary: "Shared navigation",
      locale: "en-US",
      slug: "primary-navigation",
      purpose: "Keep navigation consistent",
      sectionIntents: [
        {
          id: "intent.navigation",
          label: "Navigation",
          goal: "Provide the primary route",
          generationGuidance: null,
        },
      ],
      wireframeTraceability: {
        status: "aligned",
        missingIntentIds: [],
        orphanedSectionIds: [],
      },
      wireframe: {
        schemaVersion: 1,
        pageItemId: "global-header",
        designSystemVersionId: "design-version-1",
        componentCatalogVersion: "arclayer-wireframe-v1",
        sections: [],
      },
    },
    {
      itemId: "global-footer",
      contentVersionId: "footer-version",
      versionNumber: 2,
      title: "Global footer",
      summary: null,
      locale: "en-US",
      slug: "global-footer",
      purpose: null,
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
} satisfies BuilderRevisionOut;

function preview(overrides: Partial<BuilderChangeSetPreviewOut> = {}): BuilderChangeSetPreviewOut {
  return {
    changeSetId: "change-set-1",
    previewToken: "preview-token-1",
    previewRef: "/projects/project-1/builder/change-sets/change-set-1",
    baseRevisionId: revision.siteRevision.id,
    baseEtag: revision.siteRevision.manifestHash,
    status: "previewed",
    approvalClass: "none",
    approval: null,
    operationsHash: `sha256:${"5".repeat(64)}`,
    expiresAt: "2026-07-22T01:00:00Z",
    summaryKey: "BUILDER_CHANGE_SET_SUMMARY",
    summaryParams: {},
    requiredPermissions: ["project:content:site-builder:write", "project:content:items:write"],
    affectedTargets: [],
    issues: [],
    operations: [],
    ...overrides,
  };
}

function renderDialog({
  onApplied = vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  canWrite = true,
  permissionReady = true,
}: {
  onApplied?: () => Promise<void>;
  canWrite?: boolean;
  permissionReady?: boolean;
} = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const onOpenChange = vi.fn();
  const onDraftAutosave = vi.fn().mockResolvedValue({ checkpointVersion: 1 });
  const onDraftDiscard = vi.fn().mockResolvedValue(undefined);
  render(
    <QueryClientProvider client={queryClient}>
      <SharedSectionManagerPanel
        open
        anchor={document.body}
        onOpenChange={onOpenChange}
        projectId="project-1"
        revision={revision}
        canWrite={canWrite}
        permissionReady={permissionReady}
        onApplied={onApplied}
        onDraftAutosave={onDraftAutosave}
        onDraftDiscard={onDraftDiscard}
      />
    </QueryClientProvider>,
  );
  return { onApplied, onOpenChange, onDraftAutosave, onDraftDiscard };
}

describe("SharedSectionManagerDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    let key = 0;
    vi.stubGlobal("crypto", { randomUUID: () => `command-${++key}` });
    applyProjectBuilderChangeSetMock.mockResolvedValue({
      status: "applied",
      changeSetId: "change-set-1",
      baseRevisionId: "revision-1",
      appliedAt: "2026-07-22T00:00:01Z",
      approval: null,
      contentStructureRevision: revision.contentStructureRevision,
      siteRevision: revision.siteRevision,
      clientGlobalSectionIds: { "global-section-client:command-2": "global-announcement" },
    });
  });

  it("previews and applies a normalized shared section without exposing model authority", async () => {
    previewProjectBuilderChangeSetMock.mockResolvedValue(
      preview({
        affectedTargets: [
          {
            kind: "global_section",
            clientTargetId: "global-section-client:command-2",
            operationIds: ["global-section-create-operation:command-1"],
          },
        ],
        operations: [
          {
            type: "global_section.create",
            operationId: "global-section-create-operation:command-1",
            clientGlobalSectionId: "global-section-client:command-2",
            title: "Announcement bar",
            slug: "announcement-bar",
            locale: "en-US",
            fieldsSnapshot: {
              title: "Announcement bar",
              section_key: "announcement-bar",
              props_defaults: { tone: "quiet" },
            },
            purpose: "Share time-sensitive updates",
            sectionIntents: [],
          },
        ],
      }),
    );
    const user = userEvent.setup();
    const { onApplied, onOpenChange, onDraftAutosave, onDraftDiscard } = renderDialog();

    await user.click(screen.getByRole("button", { name: "CREATION_EDITOR_SHARED_SECTIONS_ADD" }));
    const dialog = screen.getByRole("dialog", {
      name: "CREATION_EDITOR_SHARED_SECTIONS_CREATE_TITLE",
    });
    await user.type(
      within(dialog).getByLabelText("CREATION_EDITOR_SHARED_SECTIONS_NAME"),
      " Announcement bar ",
    );
    await user.type(
      within(dialog).getByLabelText("CREATION_EDITOR_SHARED_SECTIONS_KEY"),
      " announcement-bar ",
    );
    await user.type(
      within(dialog).getByLabelText("CREATION_EDITOR_SHARED_SECTIONS_PURPOSE"),
      " Share time-sensitive updates ",
    );
    await user.click(
      within(dialog).getByLabelText("CREATION_EDITOR_SHARED_SECTIONS_DEFAULT_PROPS"),
    );
    await user.paste('{"tone":"quiet"}');
    expect(within(dialog).queryByLabelText(/model/i)).not.toBeInTheDocument();

    await user.click(
      within(dialog).getByRole("button", {
        name: "CREATION_EDITOR_SHARED_SECTIONS_REVIEW_CREATE",
      }),
    );

    await waitFor(() => expect(previewProjectBuilderChangeSetMock).toHaveBeenCalledTimes(1));
    const previewPayload = previewProjectBuilderChangeSetMock.mock.calls[0]?.[1];
    expect(previewPayload).toEqual({
      baseRevisionId: "revision-1",
      baseEtag: revision.siteRevision.manifestHash,
      provenanceSource: "human",
      operations: [
        {
          type: "global_section.create",
          operationId: "global-section-create-operation:command-1",
          clientGlobalSectionId: "global-section-client:command-2",
          title: "Announcement bar",
          slug: "announcement-bar",
          locale: "en-US",
          fieldsSnapshot: { props_defaults: { tone: "quiet" } },
          purpose: "Share time-sensitive updates",
          sectionIntents: [],
        },
      ],
    });
    expect(JSON.stringify(previewPayload)).not.toContain("modelKey");
    expect(onDraftAutosave).toHaveBeenCalledWith(previewPayload.operations);
    expect(onDraftAutosave.mock.invocationCallOrder[0]).toBeLessThan(
      previewProjectBuilderChangeSetMock.mock.invocationCallOrder[0]!,
    );
    expect(
      await within(dialog).findByText("CREATION_EDITOR_SHARED_SECTIONS_PREVIEW_READY"),
    ).toBeVisible();

    await user.click(
      within(dialog).getByRole("button", {
        name: "CREATION_EDITOR_SHARED_SECTIONS_APPLY_CREATE",
      }),
    );
    await waitFor(() => expect(onApplied).toHaveBeenCalledTimes(1));
    expect(applyProjectBuilderChangeSetMock).toHaveBeenCalledWith(
      "project-1",
      "change-set-1",
      { previewToken: "preview-token-1", approval: undefined },
      expect.stringContaining("global-section-apply:"),
    );
    expect(onDraftDiscard).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows every server-reported incoming host and never offers force deletion", async () => {
    previewProjectBuilderChangeSetMock.mockResolvedValue(
      preview({
        approvalClass: "destructive",
        approval: {
          approvalId: "approval-delete-1",
          approvalClass: "destructive",
          status: "pending",
          expiresAt: "2026-07-22T01:00:00Z",
        },
        globalSectionGraph: revision.globalSectionGraph,
        issues: [
          {
            severity: "blocker",
            code: "BUILDER_GLOBAL_SECTION_IN_USE",
            messageKey: "BUILDER_GLOBAL_SECTION_IN_USE",
            operationId: "global-section-delete-operation:command-1",
            meta: {
              itemId: "global-header",
              incomingReferences: revision.globalSectionGraph?.references ?? [],
            },
          },
        ],
        operations: [
          {
            type: "global_section.delete",
            operationId: "global-section-delete-operation:command-1",
            itemId: "global-header",
            expectedDraftVersion: 4,
          },
        ],
      }),
    );
    const user = userEvent.setup();
    renderDialog();

    await user.click(
      screen.getByRole("button", {
        name: "CREATION_EDITOR_SHARED_SECTIONS_RETIRE Primary navigation",
      }),
    );

    await waitFor(() => expect(previewProjectBuilderChangeSetMock).toHaveBeenCalledTimes(1));
    expect(previewProjectBuilderChangeSetMock).toHaveBeenCalledWith(
      "project-1",
      {
        baseRevisionId: "revision-1",
        baseEtag: revision.siteRevision.manifestHash,
        provenanceSource: "human",
        operations: [
          {
            type: "global_section.delete",
            operationId: "global-section-delete-operation:command-1",
            itemId: "global-header",
            expectedDraftVersion: 4,
          },
        ],
      },
      expect.stringContaining("global-section-delete-preview:"),
    );
    const dialog = screen.getByRole("dialog", {
      name: "CREATION_EDITOR_SHARED_SECTIONS_RETIRE_TITLE",
    });
    expect(within(dialog).getByText("About")).toBeVisible();
    expect(within(dialog).getByText("about-page · about-navigation")).toBeVisible();
    expect(
      within(dialog).getByRole("button", {
        name: "CREATION_EDITOR_SHARED_SECTIONS_APPLY_RETIRE",
      }),
    ).toBeDisabled();
    expect(applyProjectBuilderChangeSetMock).not.toHaveBeenCalled();
  });

  it("submits destructive approval only after an unreferenced retirement preview", async () => {
    previewProjectBuilderChangeSetMock.mockResolvedValue(
      preview({
        approvalClass: "destructive",
        approval: {
          approvalId: "approval-delete-2",
          approvalClass: "destructive",
          status: "pending",
          expiresAt: "2026-07-22T01:00:00Z",
        },
        globalSectionGraph: { ...revision.globalSectionGraph, references: [] },
        issues: [
          {
            severity: "warning",
            code: "BUILDER_GLOBAL_SECTION_DELETE_REQUIRES_APPROVAL",
            messageKey: "BUILDER_GLOBAL_SECTION_DELETE_REQUIRES_APPROVAL",
            operationId: "global-section-delete-operation:command-1",
            meta: { itemId: "global-footer", incomingReferenceCount: 0 },
          },
        ],
        operations: [
          {
            type: "global_section.delete",
            operationId: "global-section-delete-operation:command-1",
            itemId: "global-footer",
            expectedDraftVersion: 2,
          },
        ],
      }),
    );
    const user = userEvent.setup();
    const { onApplied } = renderDialog();

    await user.click(
      screen.getByRole("button", {
        name: "CREATION_EDITOR_SHARED_SECTIONS_RETIRE Global footer",
      }),
    );
    const dialog = screen.getByRole("dialog", {
      name: "CREATION_EDITOR_SHARED_SECTIONS_RETIRE_TITLE",
    });
    await user.click(
      await within(dialog).findByRole("button", {
        name: "CREATION_EDITOR_SHARED_SECTIONS_APPLY_RETIRE",
      }),
    );

    await waitFor(() => expect(onApplied).toHaveBeenCalledTimes(1));
    expect(applyProjectBuilderChangeSetMock).toHaveBeenCalledWith(
      "project-1",
      "change-set-1",
      {
        previewToken: "preview-token-1",
        approval: {
          approvalId: "approval-delete-2",
          decision: "approve",
          expectedApprovalClass: "destructive",
        },
      },
      expect.stringContaining("global-section-apply:"),
    );
  });

  it("keeps the revision inspectable while clearly exposing read-only authority", async () => {
    const user = userEvent.setup();
    renderDialog({ canWrite: false });

    const dialog = screen.getByRole("dialog", {
      name: "CREATION_EDITOR_SHARED_SECTIONS_TITLE",
    });
    expect(within(dialog).getByText("Primary navigation")).toBeInTheDocument();
    expect(
      within(dialog).getByText("CREATION_EDITOR_SHARED_SECTIONS_READ_ONLY"),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "CREATION_EDITOR_SHARED_SECTIONS_ADD" }),
    ).toBeDisabled();
    const retire = within(dialog).getByRole("button", {
      name: "CREATION_EDITOR_SHARED_SECTIONS_RETIRE Primary navigation",
    });
    expect(retire).toBeDisabled();
    await user.click(retire);
    expect(previewProjectBuilderChangeSetMock).not.toHaveBeenCalled();
  });

  it("distinguishes offline inspection from an actionable Preview flow", () => {
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    renderDialog();

    const dialog = screen.getByRole("dialog", {
      name: "CREATION_EDITOR_SHARED_SECTIONS_TITLE",
    });
    expect(within(dialog).getByText("CREATION_EDITOR_SHARED_SECTIONS_OFFLINE")).toBeInTheDocument();
    expect(within(dialog).getByText("Primary navigation")).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "CREATION_EDITOR_SHARED_SECTIONS_ADD" }),
    ).toBeDisabled();
    online.mockRestore();
  });
});
