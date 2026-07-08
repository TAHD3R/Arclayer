import type { PropsWithChildren, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProjectDomainSettingsPage } from "@/pages/projects/settings/domain/page";

const listProjectDomainsMock = vi.fn();
const createProjectDomainMock = vi.fn();
const verifyProjectDomainMock = vi.fn();
const updateProjectDomainMock = vi.fn();
const deleteProjectDomainMock = vi.fn();
const getProjectCoreSettingsMock = vi.fn();
const listProjectReleasesMock = vi.fn();
const getProjectReleaseDryRunMock = vi.fn();
const publishProjectReleaseMock = vi.fn();
const notifyErrorMock = vi.fn();
const notifySuccessTextMock = vi.fn();
const navigateMock = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values?.count !== undefined ? `${key}:${values.count}` : key,
  }),
}));

vi.mock("@/api/project-settings", () => ({
  listProjectDomains: (...args: unknown[]) => listProjectDomainsMock(...args),
  createProjectDomain: (...args: unknown[]) => createProjectDomainMock(...args),
  verifyProjectDomain: (...args: unknown[]) => verifyProjectDomainMock(...args),
  updateProjectDomain: (...args: unknown[]) => updateProjectDomainMock(...args),
  deleteProjectDomain: (...args: unknown[]) => deleteProjectDomainMock(...args),
}));

vi.mock("@/api/settings", () => ({
  getProjectCoreSettings: (...args: unknown[]) => getProjectCoreSettingsMock(...args),
}));

vi.mock("@/api/project-releases", () => ({
  buildProjectReleasesQueryKey: (projectId: string) => ["project", "releases", projectId],
  getProjectReleaseDryRun: (...args: unknown[]) => getProjectReleaseDryRunMock(...args),
  listProjectReleases: (...args: unknown[]) => listProjectReleasesMock(...args),
  publishProjectRelease: (...args: unknown[]) => publishProjectReleaseMock(...args),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigateMock,
}));

vi.mock("@/hooks/use-workspace-permission-access", () => ({
  useProjectPermissionAccess: () => ({
    authzQuery: { isFetched: true },
    hasAction: (code: string) =>
      code === "project:domains:manage" || code === "project:release:publish",
  }),
}));

vi.mock("@/lib/notifications", () => ({
  notifyError: (...args: unknown[]) => notifyErrorMock(...args),
  notifySuccessText: (...args: unknown[]) => notifySuccessTextMock(...args),
}));

vi.mock("@/layouts/page-shell/default-page", () => ({
  DefaultPage: ({
    title,
    description,
    children,
  }: PropsWithChildren<{ title: string; description: string }>) => (
    <div data-testid="default-page" data-title={title} data-description={description}>
      {children}
    </div>
  ),
}));

vi.mock("@/layouts/page-shell/content-guard", () => ({
  ContentGuard: (props: PropsWithChildren<{ loading?: boolean; error?: unknown }>) => {
    if (props.loading) return <div data-testid="content-guard-loading" />;
    if (props.error) return <div data-testid="content-guard-error" />;
    return <>{props.children}</>;
  },
}));

vi.mock("@/components/common/access-notice-alert", () => ({
  AccessNoticeAlert: ({
    description,
    "data-testid": testId,
  }: {
    description: ReactNode;
    "data-testid"?: string;
  }) => <div data-testid={testId}>{description}</div>,
}));

function renderWithQuery(node: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return {
    queryClient,
    ...render(<QueryClientProvider client={queryClient}>{node}</QueryClientProvider>),
  };
}

const PLATFORM_ROW = {
  bindingId: "platform-binding",
  hostname: "launch-1234abcd.arclayer.app",
  source: "platform",
  targetType: "project_runtime",
  workspaceId: "workspace-1",
  projectId: "project-1",
  runtimeId: "runtime-1",
  runtimeName: "Primary",
  siteId: "site-1",
  environmentId: null,
  isPrimary: true,
  isVerified: true,
  isActive: true,
  verificationToken: null,
  verifiedAtMs: null,
  certificateStatus: "platform_managed",
  createdByUserId: null,
  dns: null,
};

const CUSTOM_ROW = {
  bindingId: "custom-binding",
  hostname: "www.example.com",
  source: "custom",
  targetType: "project_runtime",
  workspaceId: "workspace-1",
  projectId: "project-1",
  runtimeId: "runtime-1",
  runtimeName: "Primary",
  siteId: "site-1",
  environmentId: null,
  isPrimary: false,
  isVerified: false,
  isActive: true,
  verificationToken: "token-123",
  verifiedAtMs: null,
  certificateStatus: "pending",
  createdByUserId: null,
  dns: {
    txtRecordName: "_arclayer-site-verification.www.example.com",
    txtRecordValue: "arclayer-site-verification=token-123",
  },
};

const ACTIVE_RELEASE = {
  activatedAt: "2026-07-05T10:10:00.000Z",
  createdAt: "2026-07-05T10:00:00.000Z",
  createdByUserId: null,
  id: "release-1",
  isActive: true,
  lineage: {
    parentReleaseId: null,
    parentReleaseNumber: null,
  },
  releaseNumber: 7,
  scheduledAt: null,
  selectionCount: 4,
  siteId: "site-1",
  status: "active",
  updatedAt: "2026-07-05T10:10:00.000Z",
  workspaceId: "workspace-1",
};

describe("ProjectDomainSettingsPage", () => {
  beforeEach(() => {
    listProjectDomainsMock.mockReset();
    createProjectDomainMock.mockReset();
    verifyProjectDomainMock.mockReset();
    updateProjectDomainMock.mockReset();
    deleteProjectDomainMock.mockReset();
    getProjectCoreSettingsMock.mockReset();
    listProjectReleasesMock.mockReset();
    getProjectReleaseDryRunMock.mockReset();
    publishProjectReleaseMock.mockReset();
    notifyErrorMock.mockReset();
    notifySuccessTextMock.mockReset();
    navigateMock.mockReset();

    listProjectDomainsMock.mockResolvedValue([PLATFORM_ROW, CUSTOM_ROW]);
    createProjectDomainMock.mockResolvedValue({ binding: CUSTOM_ROW });
    verifyProjectDomainMock.mockResolvedValue({ binding: { ...CUSTOM_ROW, isVerified: true } });
    updateProjectDomainMock.mockResolvedValue({ ...CUSTOM_ROW, isActive: false });
    deleteProjectDomainMock.mockResolvedValue({ bindingId: CUSTOM_ROW.bindingId });
    getProjectCoreSettingsMock.mockResolvedValue({
      value: {
        site: {
          favicon_url: "https://cdn.example.com/favicon.ico",
          logo_url: "https://cdn.example.com/logo.svg",
          name: "Launch Brand",
        },
      },
    });
    listProjectReleasesMock.mockResolvedValue([ACTIVE_RELEASE]);
    getProjectReleaseDryRunMock.mockResolvedValue({
      impact: {
        blockedItems: [],
        missingRoutes: [],
        readinessSummary: {
          blockedItemCount: 0,
          blockerCodes: [],
          ready: true,
          selectedItemCount: 4,
        },
        unpublishedDependencies: [],
        unresolvedRelations: [],
      },
      readinessSummary: {
        blockedItemCount: 0,
        blockerCodes: [],
        ready: true,
        selectedItemCount: 4,
      },
    });
    publishProjectReleaseMock.mockResolvedValue({
      graphNodes: 4,
      impact: {
        blockedItems: [],
        missingRoutes: [],
        readinessSummary: {
          blockedItemCount: 0,
          blockerCodes: [],
          ready: true,
          selectedItemCount: 4,
        },
        unpublishedDependencies: [],
        unresolvedRelations: [],
      },
      job: null,
      release: { ...ACTIVE_RELEASE, releaseNumber: 8 },
      selectionCount: 4,
    });
  });

  it("renders website control cards for domain, brand, and release state", async () => {
    const user = userEvent.setup();
    renderWithQuery(<ProjectDomainSettingsPage projectId="project-1" />);

    expect(await screen.findByTestId("website-control-domain-card")).toHaveTextContent(
      "launch-1234abcd.arclayer.app",
    );
    expect(screen.getByTestId("website-control-readiness-strip")).toHaveTextContent(
      "WEBSITE_CONTROL_READINESS_TITLE",
    );
    expect(screen.getByTestId("website-control-readiness-strip")).toHaveTextContent(
      "WEBSITE_CONTROL_DOMAIN_ROUTE_READY",
    );
    expect(screen.getByTestId("website-control-readiness-strip")).toHaveTextContent(
      "WEBSITE_CONTROL_RELEASE_ACTIVE",
    );
    expect(screen.getByTestId("website-control-readiness-strip")).toHaveTextContent(
      "WEBSITE_CONTROL_RELEASE_CHECK_NOT_RUN",
    );
    expect(screen.getByTestId("website-control-brand-card")).toHaveTextContent("Launch Brand");
    expect(screen.getByTestId("website-control-brand-card")).toHaveTextContent(
      "WEBSITE_CONTROL_BRAND_ASSETS_READY",
    );
    expect(screen.getByTestId("website-control-brand-checklist")).toHaveTextContent(
      "WEBSITE_CONTROL_BRAND_SITE_NAME",
    );
    expect(screen.getByTestId("website-control-brand-checklist")).toHaveTextContent(
      "WEBSITE_CONTROL_BRAND_LOGO",
    );
    expect(screen.getByTestId("website-control-brand-checklist")).toHaveTextContent(
      "WEBSITE_CONTROL_BRAND_FAVICON",
    );
    expect(screen.getByTestId("website-control-release-card")).toHaveTextContent("#7");
    expect(screen.getByTestId("website-control-release-card")).toHaveTextContent(
      "WEBSITE_CONTROL_RELEASE_SELECTION_COUNT:4",
    );
    expect(screen.getByTestId("website-control-workflow-panel")).toHaveTextContent(
      "WEBSITE_CONTROL_WORKFLOW_TITLE",
    );
    expect(screen.getByText("WEBSITE_CONTROL_WORKFLOW_LINK_EDITOR")).toBeInTheDocument();
    expect(screen.getByText("WEBSITE_CONTROL_WORKFLOW_LINK_CONTENT")).toBeInTheDocument();
    expect(screen.getByText("WEBSITE_CONTROL_WORKFLOW_LINK_CONFIG")).toBeInTheDocument();
    expect(screen.getByText("WEBSITE_CONTROL_WORKFLOW_LINK_RELEASES")).toBeInTheDocument();
    expect(
      Array.from(screen.getByTestId("website-control-workflow-links").querySelectorAll("a")).map(
        (link) => link.getAttribute("href"),
      ),
    ).toEqual([
      "/projects/project-1/editor",
      "/projects/project-1/content/library",
      "/projects/project-1/website/config",
      "/projects/project-1/website/releases",
    ]);

    await user.click(screen.getByRole("button", { name: /WEBSITE_CONTROL_OPEN_WEBSITE_CONFIG/ }));
    expect(navigateMock).toHaveBeenCalledWith({
      to: "/projects/$projectId/website/config",
      params: { projectId: "project-1" },
    });

    await user.click(screen.getByRole("button", { name: /WEBSITE_CONTROL_OPEN_RELEASES/ }));
    expect(navigateMock).toHaveBeenCalledWith({
      to: "/projects/$projectId/website/releases",
      params: { projectId: "project-1" },
    });
  });

  it("requires both logo and favicon before brand readiness is marked ready", async () => {
    getProjectCoreSettingsMock.mockResolvedValueOnce({
      value: {
        site: {
          logo_url: "https://cdn.example.com/logo.svg",
          name: "Launch Brand",
        },
      },
    });

    renderWithQuery(<ProjectDomainSettingsPage projectId="project-1" />);

    expect(await screen.findByTestId("website-control-brand-card")).toHaveTextContent(
      "WEBSITE_CONTROL_BRAND_ASSETS_MISSING",
    );
    expect(screen.getByTestId("website-control-readiness-strip")).toHaveTextContent(
      "WEBSITE_CONTROL_BRAND_ASSETS_MISSING",
    );
  });

  it("checks release readiness and publishes from the website control card", async () => {
    const user = userEvent.setup();
    renderWithQuery(<ProjectDomainSettingsPage projectId="project-1" />);

    await user.click(await screen.findByTestId("website-control-release-check"));
    await waitFor(() => {
      expect(getProjectReleaseDryRunMock).toHaveBeenCalledWith("project-1");
    });
    expect(
      await within(screen.getByTestId("website-control-release-card")).findByText(
        "WEBSITE_CONTROL_RELEASE_READY",
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("website-control-release-card")).getByText(
        "WEBSITE_CONTROL_RELEASE_SELECTED_COUNT:4",
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByTestId("website-control-release-publish"));
    await waitFor(() => {
      expect(publishProjectReleaseMock).toHaveBeenCalledWith("project-1");
    });
    expect(notifySuccessTextMock).toHaveBeenCalledWith(
      "account:WEBSITE_CONTROL_RELEASE_PUBLISHED:8",
    );
  });

  it("does not treat non-active releases as the published website state", async () => {
    listProjectReleasesMock.mockResolvedValueOnce([
      {
        ...ACTIVE_RELEASE,
        id: "release-scheduled",
        isActive: false,
        status: "scheduled",
      },
    ]);

    renderWithQuery(<ProjectDomainSettingsPage projectId="project-1" />);

    expect(await screen.findByTestId("website-control-release-card")).toHaveTextContent(
      "WEBSITE_CONTROL_RELEASE_EMPTY_TITLE",
    );
    expect(screen.getByTestId("website-control-release-card")).not.toHaveTextContent("#7");
    expect(screen.getByTestId("website-control-readiness-strip")).toHaveTextContent(
      "WEBSITE_CONTROL_RELEASE_MISSING",
    );
  });

  it("renders platform row and custom DNS instructions", async () => {
    renderWithQuery(<ProjectDomainSettingsPage projectId="project-1" />);

    expect(await screen.findByTestId("project-domain-row-platform-binding")).toBeInTheDocument();
    expect(screen.getByText("SETTINGS_PROJECT_DOMAINS_SOURCE_PLATFORM")).toBeInTheDocument();
    expect(screen.getByTestId("project-domain-dns-custom-binding")).toHaveTextContent(
      "_arclayer-site-verification.www.example.com",
    );
    expect(screen.queryByTestId("project-domain-delete-platform-binding")).not.toBeInTheDocument();
  });

  it("triggers verify action for custom domains", async () => {
    const user = userEvent.setup();
    const { queryClient } = renderWithQuery(<ProjectDomainSettingsPage projectId="project-1" />);
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    await user.click(await screen.findByTestId("project-domain-verify-custom-binding"));

    await waitFor(() => {
      expect(verifyProjectDomainMock).toHaveBeenCalledWith("project-1", "custom-binding");
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["project", "domains", "project-1"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["project", "source", "project-1"],
    });
  });

  it("triggers active toggle for bindings", async () => {
    const user = userEvent.setup();
    renderWithQuery(<ProjectDomainSettingsPage projectId="project-1" />);

    await user.click(await screen.findByTestId("project-domain-toggle-custom-binding"));

    await waitFor(() => {
      expect(updateProjectDomainMock).toHaveBeenCalledWith("project-1", "custom-binding", {
        isActive: false,
      });
    });
  });

  it("keeps delete action scoped to custom bindings", async () => {
    const user = userEvent.setup();
    renderWithQuery(<ProjectDomainSettingsPage projectId="project-1" />);

    await user.click(await screen.findByTestId("project-domain-delete-custom-binding"));

    await waitFor(() => {
      expect(deleteProjectDomainMock).toHaveBeenCalledWith("project-1", "custom-binding");
    });
    expect(screen.queryByTestId("project-domain-delete-platform-binding")).not.toBeInTheDocument();
  });
});
