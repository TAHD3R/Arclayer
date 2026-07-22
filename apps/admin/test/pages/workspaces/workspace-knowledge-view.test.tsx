import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { WorkspaceKnowledgeView } from "@/pages/workspaces/settings/workspace/knowledge/workspace-knowledge-view";

const mocks = vi.hoisted(() => ({
  capabilities: vi.fn(),
  listBases: vi.fn(),
  listSources: vi.fn(),
  listVersions: vi.fn(),
  notify: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: { count?: number; version?: number }) =>
      values?.count !== undefined
        ? `${key}:${values.count}`
        : values?.version !== undefined
          ? `${key}:${values.version}`
          : key,
    i18n: { language: "en-US", resolvedLanguage: "en-US" },
  }),
}));

vi.mock("@/api/workspace-knowledge", () => ({
  WORKSPACE_KNOWLEDGE_QUERY_KEY: ["workspace", "knowledge"],
  getWorkspaceKnowledgeCapabilities: (...args: unknown[]) => mocks.capabilities(...args),
  listKnowledgeBases: (...args: unknown[]) => mocks.listBases(...args),
  listKnowledgeSources: (...args: unknown[]) => mocks.listSources(...args),
  listKnowledgeSourceVersions: (...args: unknown[]) => mocks.listVersions(...args),
  createKnowledgeBase: vi.fn(),
  createKnowledgeSource: vi.fn(),
  createManualKnowledgeSourceVersion: vi.fn(),
}));

vi.mock("@/lib/notifications", () => ({
  notifySuccessText: (...args: unknown[]) => mocks.notify(...args),
}));

vi.mock("@arclayer/ui/setting-dialog", () => ({
  SettingDialog: ({ open, children }: { open: boolean; children?: React.ReactNode }) =>
    open ? <div role="dialog">{children}</div> : null,
}));

const base = {
  id: "base-1",
  workspaceId: "workspace-1",
  name: "Product truth",
  description: "Approved product evidence.",
  defaultLocale: "en-US",
  status: "active",
  policyRevision: 1,
  metadataRevision: 1,
  sourceCount: 1,
  readySourceCount: 0,
  createdByUserId: "user-1",
  updatedByUserId: "user-1",
  createdAt: "2026-07-20T00:00:00Z",
  updatedAt: "2026-07-20T00:00:00Z",
};

const source = {
  id: "source-1",
  knowledgeBaseId: "base-1",
  workspaceId: "workspace-1",
  sourceKind: "manual",
  displayName: "Core positioning",
  locale: "en-US",
  status: "pending",
  locator: { kind: "manual", documentKey: "core-positioning" },
  activeReadyVersionId: null,
  latestCandidateVersionId: "version-1",
  servingFreshness: "current",
  safeErrorCode: null,
  metadataRevision: 1,
  createdByUserId: "user-1",
  updatedByUserId: "user-1",
  createdAt: "2026-07-20T00:00:00Z",
  updatedAt: "2026-07-20T00:00:00Z",
};

const version = {
  id: "version-1",
  sourceId: "source-1",
  workspaceId: "workspace-1",
  versionNumber: 1,
  status: "pending",
  contentHash: `sha256:${"a".repeat(64)}`,
  normalizedContentHash: `sha256:${"b".repeat(64)}`,
  parserName: "manual-markdown",
  parserVersion: "1",
  ingestionMode: "initial",
  locale: "en-US",
  title: "Product truth",
  documentMetadata: {},
  chunkerName: "knowledge-default",
  chunkerVersion: "1",
  indexSchemaVersion: 1,
  tokenCount: null,
  characterCount: 100,
  chunkCount: null,
  provenanceActorUserId: "user-1",
  provenanceJobId: null,
  correlationId: null,
  createdAt: "2026-07-20T00:00:00Z",
};

function renderView() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <WorkspaceKnowledgeView workspaceId="workspace-1" />
    </QueryClientProvider>,
  );
}

describe("WorkspaceKnowledgeView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.capabilities.mockResolvedValue({
      manualSourcesAvailable: true,
      externalIngestionAvailable: false,
      indexingAvailable: false,
      retrievalAvailable: false,
      immutableSourceVersions: true,
      supportedSourceKinds: ["manual", "file", "url", "connector", "structured_content"],
    });
    mocks.listBases.mockResolvedValue({ items: [base], nextCursor: null });
    mocks.listSources.mockResolvedValue({ items: [source], nextCursor: null });
    mocks.listVersions.mockResolvedValue({ items: [version], nextCursor: null });
  });

  it("renders the Knowledge Base to Source to immutable Version relationship", async () => {
    renderView();

    expect(
      await screen.findByRole("heading", { level: 2, name: "Product truth" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Core positioning")).toHaveLength(2);
    expect(screen.getByText("SETTINGS_WORKSPACE_KNOWLEDGE_RELATION_BASE")).toBeInTheDocument();
    expect(screen.getByText("SETTINGS_WORKSPACE_KNOWLEDGE_RELATION_SOURCE")).toBeInTheDocument();
    expect(screen.getByText("SETTINGS_WORKSPACE_KNOWLEDGE_RELATION_VERSION")).toBeInTheDocument();
    expect(
      screen.getByText("settings:SETTINGS_WORKSPACE_KNOWLEDGE_AUTHORITY_MANUAL"),
    ).toBeInTheDocument();
  });

  it("explains when durable indexing is available before retrieval", async () => {
    mocks.capabilities.mockResolvedValue({
      manualSourcesAvailable: true,
      externalIngestionAvailable: false,
      indexingAvailable: true,
      retrievalAvailable: false,
      immutableSourceVersions: true,
      supportedSourceKinds: ["manual", "file", "url", "connector", "structured_content"],
    });

    renderView();

    expect(
      await screen.findByText("settings:SETTINGS_WORKSPACE_KNOWLEDGE_AUTHORITY_INDEXING"),
    ).toBeInTheDocument();
  });

  it("shows capability failures explicitly and retries in place", async () => {
    mocks.capabilities.mockRejectedValueOnce(new Error("capability request failed"));

    renderView();

    expect(
      await screen.findByText("settings:SETTINGS_WORKSPACE_KNOWLEDGE_AUTHORITY_ERROR"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("settings:SETTINGS_WORKSPACE_KNOWLEDGE_AUTHORITY_MANUAL"),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "common:RETRY" }));

    expect(
      await screen.findByText("settings:SETTINGS_WORKSPACE_KNOWLEDGE_AUTHORITY_MANUAL"),
    ).toBeInTheDocument();
    expect(mocks.capabilities).toHaveBeenCalledTimes(2);
  });

  it("sends search text to the backend query contract", async () => {
    renderView();
    fireEvent.change(
      await screen.findByLabelText("settings:SETTINGS_WORKSPACE_KNOWLEDGE_SEARCH_LABEL"),
      { target: { value: "product" } },
    );

    await waitFor(() => {
      expect(mocks.listBases).toHaveBeenCalledWith(
        "workspace-1",
        expect.objectContaining({ q: "product", limit: 100 }),
      );
    });
  });

  it("renders an actionable first-run empty state", async () => {
    mocks.listBases.mockResolvedValue({ items: [], nextCursor: null });
    renderView();

    expect(
      await screen.findByText("settings:SETTINGS_WORKSPACE_KNOWLEDGE_EMPTY_TITLE"),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", {
        name: "settings:SETTINGS_WORKSPACE_KNOWLEDGE_CREATE_ACTION",
      }),
    ).not.toHaveLength(0);
  });
});
