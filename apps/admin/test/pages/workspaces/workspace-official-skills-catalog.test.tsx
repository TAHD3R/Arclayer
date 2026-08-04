import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { OfficialSkillCatalogDetailOut, OfficialSkillCatalogItemOut } from "@arclayer/openapi";

const apiMocks = vi.hoisted(() => ({
  list: vi.fn(),
  detail: vi.fn(),
  install: vi.fn(),
  update: vi.fn(),
  getInstallation: vi.fn(),
  preview: vi.fn(),
  repin: vi.fn(),
  impact: vi.fn(),
  remove: vi.fn(),
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
  getWorkspaceSkillInstallation: apiMocks.getInstallation,
  createWorkspaceSkillUpdatePreview: apiMocks.preview,
  repinWorkspaceSkillInstallation: apiMocks.repin,
  getWorkspaceSkillInstallationImpact: apiMocks.impact,
  removeWorkspaceSkillInstallation: apiMocks.remove,
}));

vi.mock("@/lib/notifications", () => ({
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : "error"),
  notifyError: vi.fn(),
  notifySuccessText: vi.fn(),
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

import { WorkspaceOfficialSkillsCatalog } from "@/pages/workspaces/settings/workspace/skills/workspace-official-skills-catalog";

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
    ],
    requiredTools: [],
    permissions: [],
    dataEgress: [],
    capabilityTags: ["site.sitemap"],
    checksum: item.packageChecksum,
  },
  resources: [],
  validation: {
    policyVersion: 1,
    status: "valid",
    findings: [],
    findingHash: item.validationFindingHash,
    createdAt: "2026-07-20T00:00:00Z",
  },
};

function renderCatalog() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <WorkspaceOfficialSkillsCatalog workspaceId="workspace-1" />
    </QueryClientProvider>,
  );
}

describe("WorkspaceOfficialSkillsCatalog", () => {
  beforeEach(() => {
    apiMocks.list.mockReset().mockResolvedValue({ items: [item], nextCursor: null });
    apiMocks.detail.mockReset().mockResolvedValue(detail);
    apiMocks.install.mockReset().mockResolvedValue({ id: "installation-1" });
    apiMocks.update.mockReset();
  });

  it("keeps verification details out of the catalog while installing the exact system version", async () => {
    renderCatalog();

    expect((await screen.findAllByText("Sitemap Planning")).length).toBeGreaterThan(0);
    expect(screen.queryByText("site.sitemap")).not.toBeInTheDocument();
    expect(screen.queryByText(item.packageChecksum)).not.toBeInTheDocument();
    expect(screen.queryByText("1.0.0")).not.toBeInTheDocument();
    expect(
      screen.queryByText("settings:SETTINGS_WORKSPACE_SKILLS_OFFICIAL_VALIDATION"),
    ).not.toBeInTheDocument();
    expect(apiMocks.list).toHaveBeenCalledWith(
      "workspace-1",
      expect.objectContaining({ limit: 100 }),
    );

    expect(screen.getByText("settings:SETTINGS_WORKSPACE_SKILLS_DISABLED_BADGE")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /remove/i })).not.toBeInTheDocument();
    fireEvent.click(
      await screen.findByRole("button", {
        name: "settings:SETTINGS_WORKSPACE_SKILLS_ENABLE_ACTION",
      }),
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
});
