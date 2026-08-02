import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { WorkspaceDesignSystemsView } from "@/pages/workspaces/settings/workspace/design-systems/workspace-design-systems-view";

const findingTranslation =
  "Renderer, asset rights, compilation, and publication compatibility have not been evaluated.";

const mocks = vi.hoisted(() => ({
  capabilities: vi.fn(),
  listSystems: vi.fn(),
  getSystem: vi.fn(),
  listVersions: vi.fn(),
  getVersion: vi.fn(),
  listValidations: vi.fn(),
  getDefault: vi.fn(),
  listComponentCatalogs: vi.fn(),
  validate: vi.fn(),
  setDefault: vi.fn(),
  notifySuccess: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => {
    const translate = (key: string, values?: { count?: number }) => {
      if (key === "errors:DESIGN_SYSTEM_RENDERER_NOT_EVALUATED") return findingTranslation;
      return values?.count === undefined ? key : `${key}:${values.count}`;
    };
    return {
      t: translate,
      i18n: {
        language: "en-US",
        resolvedLanguage: "en-US",
        exists: (key: string) => key === "errors:DESIGN_SYSTEM_RENDERER_NOT_EVALUATED",
        t: translate,
      },
    };
  },
}));

vi.mock("@/api/workspace-design-systems", () => ({
  WORKSPACE_DESIGN_SYSTEMS_QUERY_KEY: ["workspace", "design-systems"],
  getWorkspaceDesignSystemsCapabilities: (...args: unknown[]) => mocks.capabilities(...args),
  listWorkspaceDesignSystems: (...args: unknown[]) => mocks.listSystems(...args),
  getWorkspaceDesignSystem: (...args: unknown[]) => mocks.getSystem(...args),
  listWorkspaceDesignSystemVersions: (...args: unknown[]) => mocks.listVersions(...args),
  getWorkspaceDesignSystemVersion: (...args: unknown[]) => mocks.getVersion(...args),
  listWorkspaceDesignSystemValidationResults: (...args: unknown[]) =>
    mocks.listValidations(...args),
  getWorkspaceDesignSystemDefault: (...args: unknown[]) => mocks.getDefault(...args),
  listWorkspaceDesignSystemComponentCatalogs: (...args: unknown[]) =>
    mocks.listComponentCatalogs(...args),
  validateWorkspaceDesignSystemVersion: (...args: unknown[]) => mocks.validate(...args),
  setWorkspaceDesignSystemDefault: (...args: unknown[]) => mocks.setDefault(...args),
  createWorkspaceDesignSystem: vi.fn(),
  createWorkspaceDesignSystemVersion: vi.fn(),
}));

vi.mock("@/lib/notifications", () => ({
  notifySuccessText: (...args: unknown[]) => mocks.notifySuccess(...args),
}));

vi.mock(
  "@/pages/workspaces/settings/workspace/design-systems/workspace-design-system-dialogs",
  () => ({
    WorkspaceDesignSystemCreateDialog: () => null,
    WorkspaceDesignSystemVersionDialog: () => null,
  }),
);

const checksum = `sha256:${"a".repeat(64)}`;
const findingHash = `sha256:${"b".repeat(64)}`;
const system = {
  id: "system-1",
  workspaceId: "workspace-1",
  ownerKind: "workspace" as const,
  owningProjectId: null,
  name: "Editorial Contrast",
  description: "Accessible visitor foundation.",
  status: "active" as const,
  isDefault: false,
  defaultVersionId: null,
  latestValidVersionId: "version-1",
  metadataRevision: 2,
  versionCount: 1,
  createdByUserId: "user-1",
  updatedByUserId: "user-1",
  createdAt: "2026-07-20T00:00:00Z",
  updatedAt: "2026-07-20T00:00:00Z",
};
const version = {
  id: "version-1",
  designSystemId: "system-1",
  workspaceId: "workspace-1",
  versionNumber: 1,
  manifestChecksum: checksum,
  tokenIndexHash: `sha256:${"c".repeat(64)}`,
  componentCatalogVersion: null,
  parentVersionId: null,
  source: "manual",
  validationStatus: "valid",
  validationFindingHash: findingHash,
  publishReady: false as const,
  createdByUserId: "user-1",
  createdAt: "2026-07-20T00:00:00Z",
};
const manifest = {
  manifestVersion: 1 as const,
  name: "Editorial Contrast",
  primitiveTokens: {
    "primitive.color.canvas": { type: "color" as const, value: "#FFFFFF" },
    "primitive.color.ink": { type: "color" as const, value: "#111111" },
    "primitive.color.action": { type: "color" as const, value: "#155EEF" },
    "primitive.color.border": { type: "color" as const, value: "#D5D7DA" },
  },
  semanticTokens: {},
  componentTokens: {},
  themes: [{ key: "light", name: "Light", mode: "light" as const }],
  checksum,
};
const validation = {
  id: "validation-1",
  designSystemVersionId: "version-1",
  workspaceId: "workspace-1",
  profile: "foundation" as const,
  validatorVersion: 2,
  status: "valid" as const,
  findings: [
    {
      code: "DESIGN_SYSTEM_RENDERER_NOT_EVALUATED",
      severity: "warning" as const,
      path: null,
      relatedPath: null,
      messageKey: "DESIGN_SYSTEM_RENDERER_NOT_EVALUATED",
      message: "Renderer compatibility has not been evaluated.",
    },
  ],
  findingHash,
  tokenIndexHash: version.tokenIndexHash,
  publishReady: false as const,
  compatibility: { renderer: "not_evaluated" },
  actorUserId: "user-1",
  createdAt: "2026-07-20T00:01:00Z",
};

function renderView() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <WorkspaceDesignSystemsView workspaceId="workspace-1" />
    </QueryClientProvider>,
  );
}

describe("WorkspaceDesignSystemsView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.capabilities.mockResolvedValue({
      workspaceFoundation: true,
      immutableVersions: true,
      foundationValidation: true,
      exactDefaultAssignment: true,
      projectAssignment: false,
      projectFork: false,
      rendererPreview: false,
      compilation: false,
      publication: false,
      importAvailable: false,
      derivationAvailable: false,
    });
    mocks.listSystems.mockResolvedValue({ items: [system], nextCursor: null });
    mocks.getDefault.mockResolvedValue(null);
    mocks.listComponentCatalogs.mockResolvedValue([]);
    mocks.getSystem.mockResolvedValue({ ...system, latestVersion: version });
    mocks.listVersions.mockResolvedValue({ items: [version], nextCursor: null });
    mocks.getVersion.mockResolvedValue({ ...version, manifest, provenance: { source: "manual" } });
    mocks.listValidations.mockResolvedValue([validation]);
    mocks.validate.mockResolvedValue(validation);
    mocks.setDefault.mockResolvedValue({
      workspaceId: "workspace-1",
      designSystemId: "system-1",
      versionId: "version-1",
      manifestChecksum: checksum,
      validationFindingHash: findingHash,
      metadataRevision: 1,
      assignedByUserId: "user-1",
      updatedAt: "2026-07-20T00:02:00Z",
    });
  });

  it("shows a real visual preview without exposing internal revision evidence", async () => {
    renderView();

    expect(await screen.findByRole("heading", { name: "Editorial Contrast" })).toBeInTheDocument();
    expect(
      await screen.findByText("SETTINGS_WORKSPACE_DESIGN_SYSTEMS_PREVIEW_HEADING"),
    ).toBeInTheDocument();
    expect(await screen.findByText(findingTranslation)).toBeInTheDocument();
    expect(screen.queryByText(validation.findings[0].message)).not.toBeInTheDocument();
    expect(screen.queryByText(checksum)).not.toBeInTheDocument();
    expect(screen.queryByText(checksum.slice(7, 19))).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /publish/i })).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "SETTINGS_WORKSPACE_DESIGN_SYSTEMS_SET_DEFAULT_ACTION" }),
    ).toBeEnabled();
  });

  it("sends validation and exact-default commands from accessible actions", async () => {
    const user = userEvent.setup();
    renderView();

    await user.click(
      await screen.findByRole("button", {
        name: "SETTINGS_WORKSPACE_DESIGN_SYSTEMS_VALIDATE_ACTION",
      }),
    );
    await waitFor(() => expect(mocks.validate).toHaveBeenCalled());
    expect(mocks.validate.mock.calls[0]?.slice(0, 3)).toEqual([
      "workspace-1",
      "system-1",
      "version-1",
    ]);

    await user.click(
      screen.getByRole("button", {
        name: "SETTINGS_WORKSPACE_DESIGN_SYSTEMS_SET_DEFAULT_ACTION",
      }),
    );
    await waitFor(() => expect(mocks.setDefault).toHaveBeenCalled());
    expect(mocks.setDefault.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        versionId: "version-1",
        expectedManifestChecksum: checksum,
        validationFindingHash: findingHash,
        expectedRevision: 0,
      }),
    );
  });
});
