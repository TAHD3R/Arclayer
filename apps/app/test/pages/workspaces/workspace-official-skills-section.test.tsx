import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { OfficialSkillCatalogDetailOut, OfficialSkillCatalogItemOut } from "@arclayer/openapi";

const apiMocks = vi.hoisted(() => ({
  list: vi.fn(),
  detail: vi.fn(),
  install: vi.fn(),
  update: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => {
    const translations: Record<string, string> = {
      "settings:SETTINGS_WORKSPACE_SKILLS_OFFICIAL_SITEMAP_NAME": "Sitemap Planning",
      "settings:SETTINGS_WORKSPACE_SKILLS_OFFICIAL_SITEMAP_DESC": "Plan a site hierarchy.",
    };
    const translate = (key: string) => translations[key] ?? key;
    return {
      t: translate,
      i18n: {
        exists: (key: string) => key in translations,
        t: translate,
      },
    };
  },
}));

vi.mock("@/api/workspace-skills", () => ({
  WORKSPACE_SKILLS_QUERY_KEY: ["workspace", "skills"],
  listOfficialSkillCatalog: apiMocks.list,
  getOfficialSkillCatalogPackage: apiMocks.detail,
  createWorkspaceSkillInstallation: apiMocks.install,
  updateWorkspaceSkillInstallation: apiMocks.update,
}));

vi.mock("@/lib/notifications", () => ({
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : "error"),
  notifyError: vi.fn(),
  notifySuccessText: vi.fn(),
}));

vi.mock("@/components/ui/tags", () => ({
  BaseTag: (props: { children: React.ReactNode }) => <span>{props.children}</span>,
}));

vi.mock("@/pages/workspaces/settings/workspace/skills/workspace-skill-file-browser", () => ({
  WorkspaceSkillFileBrowser: (props: { files: ReadonlyArray<{ path: string }> }) => (
    <div data-testid="skill-file-browser">{props.files.map((file) => file.path).join(",")}</div>
  ),
}));

vi.mock("@/pages/workspaces/settings/workspace/skills/workspace-skill-install-dialog", () => ({
  WorkspaceSkillInstallDialog: (props: {
    open: boolean;
    packageScope: string;
    onSubmit: (payload: object) => Promise<void>;
  }) =>
    props.open ? (
      <button
        type="button"
        data-testid="official-install-dialog"
        data-scope={props.packageScope}
        onClick={() =>
          props.onSubmit({
            packageScope: "system",
            packageId: "package-1",
            versionId: "version-1",
            expectedPackageChecksum: `sha256:${"a".repeat(64)}`,
            validationFindingHash: `sha256:${"b".repeat(64)}`,
          })
        }
      >
        submit official install
      </button>
    ) : null,
}));

import { WorkspaceOfficialSkillsSection } from "@/pages/workspaces/settings/workspace/skills/workspace-official-skills-section";

const item: OfficialSkillCatalogItemOut = {
  packageId: "package-1",
  versionId: "version-1",
  packageScope: "system",
  slug: "sitemap-planning",
  displayName: "Sitemap Planning",
  description: "Plan a site hierarchy.",
  displayNameKey: "SETTINGS_WORKSPACE_SKILLS_OFFICIAL_SITEMAP_NAME",
  descriptionKey: "SETTINGS_WORKSPACE_SKILLS_OFFICIAL_SITEMAP_DESC",
  publisherId: "arclayer",
  publisherName: "Arclayer",
  publisherVerified: true,
  semanticVersion: "1.0.0",
  versionNumber: 1,
  packageChecksum: `sha256:${"a".repeat(64)}`,
  capabilityTags: ["site.sitemap"],
  validationStatus: "valid",
  validationFindingHash: `sha256:${"b".repeat(64)}`,
  installed: false,
  updatedAt: "2026-07-20T00:00:00Z",
};

const detail: OfficialSkillCatalogDetailOut = {
  ...item,
  manifest: {
    manifestVersion: 1,
    skillId: "arclayer.sitemap-planning",
    name: item.displayName,
    description: item.description,
    publisher: { id: "arclayer", name: "Arclayer", verified: true },
    compatibility: { agentProtocol: 1, arclayerRange: ">=1" },
    instructionsEntrypoint: "SKILL.md",
    resources: [
      {
        path: "SKILL.md",
        role: "instructions",
        mimeType: "text/markdown",
        byteSize: 10,
        digest: `sha256:${"c".repeat(64)}`,
      },
      {
        path: "guides/usage.md",
        role: "reference",
        mimeType: "text/markdown",
        byteSize: 12,
        digest: `sha256:${"d".repeat(64)}`,
      },
    ],
    requiredTools: [],
    permissions: [],
    dataEgress: [],
    capabilityTags: ["site.sitemap"],
    checksum: item.packageChecksum,
  },
  resources: [
    {
      path: "SKILL.md",
      role: "instructions",
      mimeType: "text/markdown",
      byteSize: 10,
      digest: `sha256:${"c".repeat(64)}`,
      content: "# Sitemap planning\nPlan the hierarchy.",
    },
    {
      path: "guides/usage.md",
      role: "reference",
      mimeType: "text/markdown",
      byteSize: 12,
      digest: `sha256:${"d".repeat(64)}`,
      content: "Usage guide",
    },
  ],
  validation: {
    policyVersion: 1,
    status: "valid",
    findings: [],
    findingHash: item.validationFindingHash,
    createdAt: "2026-07-20T00:00:00Z",
  },
};

function renderSection() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <WorkspaceOfficialSkillsSection
        onSearchChange={vi.fn()}
        search=""
        workspaceId="workspace-1"
      />
    </QueryClientProvider>,
  );
}

describe("WorkspaceOfficialSkillsSection", () => {
  beforeEach(() => {
    apiMocks.list.mockReset().mockResolvedValue({ items: [item], nextCursor: null });
    apiMocks.detail.mockReset().mockResolvedValue(detail);
    apiMocks.install.mockReset().mockResolvedValue({ id: "installation-1" });
    apiMocks.update.mockReset();
  });

  it("installs the exact system version from the card add action", async () => {
    renderSection();

    expect((await screen.findAllByText("Sitemap Planning")).length).toBeGreaterThan(0);
    expect(screen.queryByText("site.sitemap")).not.toBeInTheDocument();
    expect(screen.queryByText(item.packageChecksum)).not.toBeInTheDocument();
    expect(apiMocks.list).toHaveBeenCalledWith(
      "workspace-1",
      expect.objectContaining({ limit: 100 }),
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "SETTINGS_WORKSPACE_SKILLS_CARD_ADD" }),
    );
    const dialog = await screen.findByTestId("official-install-dialog");
    expect(dialog).toHaveAttribute("data-scope", "system");
    fireEvent.click(dialog);

    await waitFor(() =>
      expect(apiMocks.install).toHaveBeenCalledWith(
        "workspace-1",
        expect.objectContaining({
          packageScope: "system",
          packageId: item.packageId,
          versionId: item.versionId,
          expectedPackageChecksum: item.packageChecksum,
          validationFindingHash: item.validationFindingHash,
        }),
        expect.any(String),
      ),
    );
  });

  it("opens a detail dialog with the full skill files on card select", async () => {
    renderSection();

    fireEvent.click(await screen.findByRole("button", { name: /Sitemap Planning/ }));

    const detailDialog = await screen.findByTestId("skill-file-browser");
    expect(detailDialog).toHaveTextContent("SKILL.md");
    expect(detailDialog).toHaveTextContent("guides/usage.md");
    expect(
      screen.getAllByText(/SETTINGS_WORKSPACE_SKILLS_PUBLISHER_ARCLAYER/).length,
    ).toBeGreaterThan(0);
  });

  it("marks installed official skills as added and toggles them from the detail dialog", async () => {
    const installedItem = {
      ...item,
      installed: true,
      installationStatus: "enabled",
      installationId: "installation-1",
      installationMetadataRevision: 3,
    };
    apiMocks.list.mockResolvedValue({ items: [installedItem], nextCursor: null });
    apiMocks.detail.mockResolvedValue({ ...detail, ...installedItem });
    renderSection();

    expect(await screen.findByText("SETTINGS_WORKSPACE_SKILLS_CARD_ADDED")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "SETTINGS_WORKSPACE_SKILLS_CARD_ADD" }),
    ).not.toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: /Sitemap Planning/ }));
    await screen.findByRole("dialog");
    const toggle = await screen.findByRole("switch");
    fireEvent.click(toggle);
    await waitFor(() =>
      expect(apiMocks.update).toHaveBeenCalledWith("workspace-1", "installation-1", {
        enabled: false,
        expectedRevision: 3,
      }),
    );
  });
});
