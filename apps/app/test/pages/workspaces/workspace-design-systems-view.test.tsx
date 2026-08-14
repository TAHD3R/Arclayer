import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  DesignSystemHeaderDescription,
  DesignSystemHeaderTitle,
  WorkspaceDesignSystemsHeaderActions,
  WorkspaceDesignSystemsView,
} from "@/pages/workspaces/settings/workspace/design-systems/workspace-design-systems-view";
import type { WorkspaceDesignSystemsController } from "@/pages/workspaces/settings/workspace/design-systems/use-workspace-design-systems-controller";

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
  createSystem: vi.fn(),
  createVersion: vi.fn(),
  notifySuccess: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => {
    const translate = (key: string, values?: { count?: number }) => {
      if (key === "errors:DESIGN_SYSTEM_RENDERER_NOT_EVALUATED") return findingTranslation;
      if (values?.count === undefined) return key;
      return `${key}:${values.count}`;
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
  createWorkspaceDesignSystem: (...args: unknown[]) => mocks.createSystem(...args),
  createWorkspaceDesignSystemVersion: (...args: unknown[]) => mocks.createVersion(...args),
}));

vi.mock("@/lib/notifications", () => ({
  notifySuccessText: (...args: unknown[]) => mocks.notifySuccess(...args),
}));

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

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

// Mirrors CustomizationPage: the view lifts its controller and the page-level
// header actions re-render from that lifted controller.
function PageHarness(props: { queryClient: QueryClient }) {
  const [controller, setController] = useState<WorkspaceDesignSystemsController | null>(null);
  const detailActive = controller?.viewMode === "detail" && Boolean(controller.draft);
  return (
    <QueryClientProvider client={props.queryClient}>
      <WorkspaceDesignSystemsView workspaceId="workspace-1" onControllerChange={setController} />
      {controller && detailActive ? (
        <>
          <DesignSystemHeaderTitle controller={controller} />
          <DesignSystemHeaderDescription controller={controller} />
        </>
      ) : null}
      {controller ? <WorkspaceDesignSystemsHeaderActions controller={controller} /> : null}
    </QueryClientProvider>
  );
}

async function openEditor() {
  const queryClient = makeQueryClient();
  const utilities = render(<PageHarness queryClient={queryClient} />);
  const user = userEvent.setup();
  await user.click((await screen.findAllByText("Editorial Contrast"))[0]!);
  return { ...utilities, user, queryClient };
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
    mocks.listComponentCatalogs.mockResolvedValue([
      {
        catalogVersion: "catalog-v1",
        checksum: `sha256:${"d".repeat(64)}`,
        compilerVersion: "1.0.0",
        components: [],
        descriptionByLocale: { "en-US": "Foundation components" },
        nameByLocale: { "en-US": "Foundation components" },
        rendererProfile: "html",
        rendererVersion: "1.0.0",
        schemaVersion: 1 as const,
        source: "official" as const,
        sourceVersion: "1.0.0",
      },
    ]);
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

  it("opens a system card into the editor with live sections and no revision evidence", async () => {
    await openEditor();

    expect(await screen.findByRole("button", { name: "Editorial Contrast" })).toBeInTheDocument();
    expect(
      (await screen.findAllByText("SETTINGS_WORKSPACE_DESIGN_SYSTEMS_PREVIEW_HEADING")).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText("SETTINGS_WORKSPACE_DESIGN_SYSTEMS_COLORS_TITLE")).toBeInTheDocument();
    expect(
      screen.getByText("SETTINGS_WORKSPACE_DESIGN_SYSTEMS_TYPOGRAPHY_TITLE"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("SETTINGS_WORKSPACE_DESIGN_SYSTEMS_COMPONENTS_TITLE"),
    ).toBeInTheDocument();
    expect(screen.getByText("SETTINGS_WORKSPACE_DESIGN_SYSTEMS_MOTION_TITLE")).toBeInTheDocument();
    expect(screen.queryByText(validation.findings[0].message)).not.toBeInTheDocument();
    expect(screen.queryByText(checksum)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /publish/i })).not.toBeInTheDocument();
  });

  it("marks the draft dirty through inline title editing and saves a new version", async () => {
    const { user } = await openEditor();
    await screen.findByRole("button", { name: "Editorial Contrast" });

    const save = screen.getByRole("button", {
      name: "settings:SETTINGS_WORKSPACE_DESIGN_SYSTEMS_SAVE_ACTION",
    });
    expect(save).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Editorial Contrast" }));
    const titleInput = screen.getByRole("textbox", {
      name: "settings:SETTINGS_WORKSPACE_DESIGN_SYSTEMS_TITLE_EDIT_LABEL",
    });
    await user.clear(titleInput);
    await user.type(titleInput, "Editorial Contrast v2");
    await user.tab();

    await waitFor(() => expect(save).toBeEnabled());
    const version2 = { ...version, id: "version-2", versionNumber: 2 };
    mocks.createVersion.mockResolvedValue(version2);
    await user.click(save);
    await waitFor(() => expect(mocks.createVersion).toHaveBeenCalled());
    expect(mocks.createVersion.mock.calls[0]?.[0]).toBe("workspace-1");
    expect(mocks.createVersion.mock.calls[0]?.[1]).toBe("system-1");
    await waitFor(() => expect(mocks.validate).toHaveBeenCalled());
    expect(mocks.validate.mock.calls[0]?.slice(0, 3)).toEqual([
      "workspace-1",
      "system-1",
      "version-2",
    ]);
  });

  it("starts an untitled draft editor from the header create action without a dialog", async () => {
    const user = userEvent.setup();
    render(<PageHarness queryClient={makeQueryClient()} />);
    await screen.findAllByText("Editorial Contrast");

    await user.click(
      screen.getByRole("button", {
        name: "settings:SETTINGS_WORKSPACE_DESIGN_SYSTEMS_CREATE_ACTION",
      }),
    );

    expect(
      await screen.findByRole("button", {
        name: "settings:SETTINGS_WORKSPACE_DESIGN_SYSTEMS_UNTITLED",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "settings:SETTINGS_WORKSPACE_DESIGN_SYSTEMS_SAVE_ACTION",
      }),
    ).toBeDisabled();
  });

  it("creates the system and its first version when saving an untitled draft", async () => {
    const user = userEvent.setup();
    render(<PageHarness queryClient={makeQueryClient()} />);
    await screen.findAllByText("Editorial Contrast");

    await user.click(
      screen.getByRole("button", {
        name: "settings:SETTINGS_WORKSPACE_DESIGN_SYSTEMS_CREATE_ACTION",
      }),
    );
    await screen.findByRole("button", {
      name: "settings:SETTINGS_WORKSPACE_DESIGN_SYSTEMS_UNTITLED",
    });

    await user.click(
      screen.getByRole("button", {
        name: "settings:SETTINGS_WORKSPACE_DESIGN_SYSTEMS_UNTITLED",
      }),
    );
    const titleInput = screen.getByRole("textbox", {
      name: "settings:SETTINGS_WORKSPACE_DESIGN_SYSTEMS_TITLE_EDIT_LABEL",
    });
    await user.type(titleInput, "Fresh Foundation");
    await user.tab();

    const save = screen.getByRole("button", {
      name: "settings:SETTINGS_WORKSPACE_DESIGN_SYSTEMS_SAVE_ACTION",
    });
    await waitFor(() => expect(save).toBeEnabled());

    const createdSystem = { ...system, id: "system-2", name: "Fresh Foundation" };
    mocks.createSystem.mockResolvedValue(createdSystem);
    mocks.createVersion.mockResolvedValue({
      ...version,
      id: "version-3",
      designSystemId: "system-2",
    });
    await user.click(save);

    await waitFor(() => expect(mocks.createSystem).toHaveBeenCalled());
    expect(mocks.createSystem.mock.calls[0]?.[1]).toEqual({
      name: "Fresh Foundation",
      description: null,
    });
    await waitFor(() => expect(mocks.createVersion).toHaveBeenCalled());
    expect(mocks.createVersion.mock.calls[0]?.[1]).toBe("system-2");
  });

  it("surfaces invalid updates as a status banner with localized findings", async () => {
    mocks.listVersions.mockResolvedValue({
      items: [{ ...version, validationStatus: "invalid" }],
      nextCursor: null,
    });
    await openEditor();

    expect(
      await screen.findByText("SETTINGS_WORKSPACE_DESIGN_SYSTEMS_INVALID_ALERT_TITLE"),
    ).toBeInTheDocument();
    expect(await screen.findByText(findingTranslation)).toBeInTheDocument();
  });

  it("sends the exact-default command from the save menu", async () => {
    const { user } = await openEditor();
    await screen.findByRole("button", { name: "Editorial Contrast" });

    await user.click(
      screen.getByRole("button", {
        name: "settings:SETTINGS_WORKSPACE_DESIGN_SYSTEMS_SAVE_OPTIONS",
      }),
    );
    await user.click(
      await screen.findByRole("menuitem", {
        name: "settings:SETTINGS_WORKSPACE_DESIGN_SYSTEMS_SET_DEFAULT_ACTION",
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
