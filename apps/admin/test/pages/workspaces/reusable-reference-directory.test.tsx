import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ReusableReferenceDirectory } from "@/pages/workspaces/settings/workspace/knowledge/reusable-reference-directory";
import { makeQueryClient } from "@/lib/query/query-client";

const mocks = vi.hoisted(() => ({
  capabilities: vi.fn(),
  listBases: vi.fn(),
  listSources: vi.fn(),
  listVersions: vi.fn(),
  createBase: vi.fn(),
  createSource: vi.fn(),
  createVersion: vi.fn(),
  createIngestion: vi.fn(),
  notify: vi.fn(),
  notifyError: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) => {
      const localizedKey = key.replace(/^[^:]+:/, "");
      return values?.count === undefined ? localizedKey : `${localizedKey}:${values.count}`;
    },
    i18n: { language: "en-US", resolvedLanguage: "en-US" },
  }),
}));

vi.mock("@/api/workspace-knowledge", () => ({
  WORKSPACE_KNOWLEDGE_QUERY_KEY: ["workspace", "knowledge"],
  getWorkspaceKnowledgeCapabilities: (...args: unknown[]) => mocks.capabilities(...args),
  listKnowledgeBases: (...args: unknown[]) => mocks.listBases(...args),
  listKnowledgeSources: (...args: unknown[]) => mocks.listSources(...args),
  listKnowledgeSourceVersions: (...args: unknown[]) => mocks.listVersions(...args),
  createKnowledgeBase: (...args: unknown[]) => mocks.createBase(...args),
  createKnowledgeSource: (...args: unknown[]) => mocks.createSource(...args),
  createManualKnowledgeSourceVersion: (...args: unknown[]) => mocks.createVersion(...args),
  createKnowledgeSourceIngestion: (...args: unknown[]) => mocks.createIngestion(...args),
}));

vi.mock("@/lib/notifications", () => ({
  notifySuccessText: (...args: unknown[]) => mocks.notify(...args),
  notifyError: (...args: unknown[]) => mocks.notifyError(...args),
}));

vi.mock("@/pages/workspaces/settings/workspace/knowledge/reusable-reference-dialogs", () => ({
  ReferenceBaseCreateDialog: () => null,
  ReferenceSourceCreateDialog: () => null,
  ReferenceVersionCreateDialog: () => null,
}));

const base = {
  id: "base-1",
  workspaceId: "workspace-1",
  name: "Product positioning",
  description: "Approved product context.",
  defaultLocale: "en-US",
  status: "active",
  policyRevision: 1,
  metadataRevision: 1,
  sourceCount: 1,
  readySourceCount: 0,
  createdByUserId: "user-1",
  updatedByUserId: "user-1",
  createdAt: "2026-08-01T00:00:00Z",
  updatedAt: "2026-08-01T00:00:00Z",
};

const retryableUrlSource = {
  id: "source-1",
  knowledgeBaseId: base.id,
  workspaceId: "workspace-1",
  sourceKind: "url",
  displayName: "Product website",
  locale: "en-US",
  status: "failed",
  locator: { kind: "url", url: "https://example.com" },
  activeReadyVersionId: null,
  latestCandidateVersionId: null,
  servingFreshness: "stale",
  safeErrorCode: "KNOWLEDGE_SOURCE_FETCH_FAILED",
  metadataRevision: 1,
  createdByUserId: "user-1",
  updatedByUserId: "user-1",
  createdAt: "2026-08-01T00:00:00Z",
  updatedAt: "2026-08-01T00:00:00Z",
};

const readyUrlSource = {
  ...retryableUrlSource,
  status: "ready",
  activeReadyVersionId: "version-1",
  servingFreshness: "current",
  safeErrorCode: null,
};

function renderDirectory() {
  const queryClient = makeQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <ReusableReferenceDirectory workspaceId="workspace-1" />
    </QueryClientProvider>,
  );
}

describe("ReusableReferenceDirectory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("crypto", { randomUUID: () => "command-key" });
    mocks.capabilities.mockResolvedValue({
      manualSourcesAvailable: true,
      externalIngestionAvailable: true,
      indexingAvailable: true,
      retrievalAvailable: false,
      immutableSourceVersions: true,
      supportedSourceKinds: ["manual", "url"],
    });
    mocks.listBases.mockResolvedValue({ items: [base], nextCursor: null });
    mocks.listSources.mockResolvedValue({ items: [retryableUrlSource], nextCursor: null });
    mocks.listVersions.mockResolvedValue({ items: [], nextCursor: null });
    mocks.createIngestion.mockResolvedValue({
      sourceId: retryableUrlSource.id,
      jobId: "job-1",
      ingestionMode: "initial",
      status: "queued",
    });
  });

  it("uses the real ingestion command to retry an unready URL source", async () => {
    const user = userEvent.setup();
    renderDirectory();

    expect(await screen.findByText("REFERENCE_RETRIEVAL_UNAVAILABLE_TITLE")).toBeInTheDocument();
    expect(await screen.findByText("REFERENCE_PROCESSING_FAILED_DESCRIPTION")).toBeInTheDocument();
    expect(
      screen.getByText("REFERENCE_PROCESSING_ERROR_CODE_LABEL: KNOWLEDGE_SOURCE_FETCH_FAILED"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "REFERENCE_RETRY_ACTION" }));

    await waitFor(() => {
      expect(mocks.createIngestion).toHaveBeenCalledWith(
        "workspace-1",
        "base-1",
        "source-1",
        { ingestionMode: "initial" },
        "command-key",
      );
    });
  });

  it("uses refresh only when an existing ready version is serving", async () => {
    const user = userEvent.setup();
    mocks.listSources.mockResolvedValue({ items: [readyUrlSource], nextCursor: null });
    mocks.createIngestion.mockResolvedValue({
      sourceId: readyUrlSource.id,
      jobId: "job-2",
      ingestionMode: "refresh",
      status: "queued",
    });
    renderDirectory();

    await user.click(await screen.findByRole("button", { name: "REFERENCE_REFRESH_ACTION" }));

    await waitFor(() => {
      expect(mocks.createIngestion).toHaveBeenCalledWith(
        "workspace-1",
        "base-1",
        "source-1",
        { ingestionMode: "refresh" },
        "command-key",
      );
    });
  });

  it("reports command failures through the global toast without a page alert", async () => {
    const error = new Error("ingestion failed");
    const user = userEvent.setup();
    mocks.createIngestion.mockRejectedValue(error);
    renderDirectory();

    await user.click(await screen.findByRole("button", { name: "REFERENCE_RETRY_ACTION" }));

    await waitFor(() => expect(mocks.notifyError).toHaveBeenCalledWith(error));
    expect(screen.queryByText("OPERATION_FAILED_TITLE")).not.toBeInTheDocument();
  });

  it("does not present unavailable processing as an executable action", async () => {
    mocks.capabilities.mockResolvedValue({
      manualSourcesAvailable: true,
      externalIngestionAvailable: false,
      indexingAvailable: false,
      retrievalAvailable: false,
      immutableSourceVersions: true,
      supportedSourceKinds: ["manual"],
    });
    renderDirectory();

    expect(await screen.findByText("REFERENCE_PROCESSING_UNAVAILABLE")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "REFERENCE_RETRY_ACTION" })).toBeDisabled();
  });
});
