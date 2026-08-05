import type { PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProjectSeoAnalysisPage } from "@/pages/projects/seo/analysis-page";

const getProjectCoreSettingsMock = vi.fn();
const listProjectDomainsMock = vi.fn();
const getProjectReleaseDryRunMock = vi.fn();
const listProjectReleasesMock = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@/api/settings", () => ({
  getProjectCoreSettings: (...args: unknown[]) => getProjectCoreSettingsMock(...args),
}));

vi.mock("@/api/project-settings", () => ({
  listProjectDomains: (...args: unknown[]) => listProjectDomainsMock(...args),
}));

vi.mock("@/api/project-releases", () => ({
  getProjectReleaseDryRun: (...args: unknown[]) => getProjectReleaseDryRunMock(...args),
  listProjectReleases: (...args: unknown[]) => listProjectReleasesMock(...args),
}));

vi.mock("@/layouts/page-shell/default-page", () => ({
  DefaultPage: ({
    title,
    description,
    children,
  }: PropsWithChildren<{ title: string; description: string }>) => (
    <div data-testid="default-page" data-description={description} data-title={title}>
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

function renderWithQuery(node: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  });

  return render(<QueryClientProvider client={queryClient}>{node}</QueryClientProvider>);
}

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

const READY_DRY_RUN = {
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
};

describe("ProjectSeoAnalysisPage", () => {
  beforeEach(() => {
    getProjectCoreSettingsMock.mockReset();
    listProjectDomainsMock.mockReset();
    getProjectReleaseDryRunMock.mockReset();
    listProjectReleasesMock.mockReset();

    getProjectCoreSettingsMock.mockResolvedValue({
      value: {
        analytics: {
          google_analytics: {
            enabled: true,
            measurement_id: "G-ABC12345",
          },
        },
        seo: {
          og_image_url: "https://cdn.example.com/social.jpg",
          robots_directive: "index,follow",
          sitemap_enabled: true,
          title_policy_v1: {
            dedupe: true,
            home_mode: "siteOnly",
            parts: [
              { kind: "token", value: "pageTitle" },
              { kind: "literal", value: " - " },
              { kind: "token", value: "siteName" },
            ],
          },
        },
        site: {
          description: "Enterprise landing site.",
          favicon_url: "https://cdn.example.com/favicon.ico",
          logo_url: "https://cdn.example.com/logo.svg",
          name: "Launch Brand",
          url: "https://launch.example.com",
        },
      },
    });
    listProjectDomainsMock.mockResolvedValue([
      {
        bindingId: "domain-1",
        certificateStatus: "platform_managed",
        hostname: "launch.example.com",
        isActive: true,
        isPrimary: true,
        isVerified: true,
        projectId: "project-1",
        runtimeId: "runtime-1",
        siteId: "site-1",
        source: "platform",
        targetType: "project_runtime",
        workspaceId: "workspace-1",
      },
    ]);
    listProjectReleasesMock.mockResolvedValue([ACTIVE_RELEASE]);
    getProjectReleaseDryRunMock.mockResolvedValue(READY_DRY_RUN);
  });

  it("renders actionable SEO checks from domain and project settings", async () => {
    renderWithQuery(<ProjectSeoAnalysisPage projectId="project-1" />);

    expect(await screen.findByTestId("seo-analysis-check-domain")).toHaveTextContent(
      "launch.example.com",
    );
    expect(screen.getByTestId("seo-analysis-check-site-url")).toHaveTextContent(
      "https://launch.example.com",
    );
    expect(screen.getByTestId("seo-analysis-check-metadata")).toHaveTextContent("Launch Brand");
    expect(screen.getByTestId("seo-analysis-check-social-preview")).toHaveTextContent(
      "https://cdn.example.com/social.jpg",
    );
    expect(screen.getByTestId("seo-analysis-check-indexing")).toHaveTextContent("index,follow");
    expect(screen.getByTestId("seo-analysis-check-sitemap")).toHaveTextContent(
      "PROJECT_SEO_ANALYSIS_SITEMAP_READY_DESC",
    );
    expect(screen.getByTestId("seo-analysis-check-active-release")).toHaveTextContent("#7");
    expect(screen.getByTestId("seo-analysis-check-release-readiness")).toHaveTextContent("4/0");
    expect(screen.getByTestId("seo-analysis-check-analytics")).toHaveTextContent("G-ABC12345");
    expect(screen.getByText("11/11")).toBeInTheDocument();
    expect(getProjectCoreSettingsMock).toHaveBeenCalledWith("project-1");
    expect(listProjectDomainsMock).toHaveBeenCalledWith("project-1");
    expect(listProjectReleasesMock).toHaveBeenCalledWith("project-1");
    expect(getProjectReleaseDryRunMock).toHaveBeenCalledWith("project-1");
  });

  it("surfaces missing launch-readiness items without hiding them", async () => {
    getProjectCoreSettingsMock.mockResolvedValueOnce({
      value: {
        site: {
          name: "Draft Site",
        },
      },
    });
    listProjectDomainsMock.mockResolvedValueOnce([]);
    listProjectReleasesMock.mockResolvedValueOnce([]);
    getProjectReleaseDryRunMock.mockResolvedValueOnce({
      impact: {
        blockedItems: [],
        missingRoutes: ["/"],
        readinessSummary: {
          blockedItemCount: 1,
          blockerCodes: ["missing_route"],
          ready: false,
          selectedItemCount: 0,
        },
        unpublishedDependencies: [],
        unresolvedRelations: [],
      },
      readinessSummary: {
        blockedItemCount: 1,
        blockerCodes: ["missing_route"],
        ready: false,
        selectedItemCount: 0,
      },
    });

    renderWithQuery(<ProjectSeoAnalysisPage projectId="project-1" />);

    expect(await screen.findByTestId("seo-analysis-check-domain")).toHaveTextContent(
      "PROJECT_SEO_ANALYSIS_DOMAIN_WARNING_DESC",
    );
    expect(screen.getByTestId("seo-analysis-check-analytics")).toHaveTextContent(
      "PROJECT_SEO_ANALYSIS_ANALYTICS_MISSING_DESC",
    );
    expect(screen.getByTestId("seo-analysis-check-social-preview")).toHaveTextContent(
      "PROJECT_SEO_ANALYSIS_SOCIAL_PREVIEW_WARNING_DESC",
    );
    expect(screen.getByTestId("seo-analysis-check-active-release")).toHaveTextContent(
      "PROJECT_SEO_ANALYSIS_RELEASE_WARNING_DESC",
    );
    expect(screen.getByTestId("seo-analysis-check-release-readiness")).toHaveTextContent(
      "PROJECT_SEO_ANALYSIS_RELEASE_READINESS_BLOCKED_DESC",
    );
    expect(screen.getByText("3/11")).toBeInTheDocument();
  });

  it("warns when website-level search discovery is blocked", async () => {
    getProjectCoreSettingsMock.mockResolvedValueOnce({
      value: {
        seo: {
          robots_directive: "noindex,nofollow",
          sitemap_enabled: false,
        },
        site: {
          description: "Enterprise landing site.",
          name: "Launch Brand",
          url: "https://launch.example.com",
        },
      },
    });

    renderWithQuery(<ProjectSeoAnalysisPage projectId="project-1" />);

    expect(await screen.findByTestId("seo-analysis-check-indexing")).toHaveTextContent(
      "PROJECT_SEO_ANALYSIS_INDEXING_WARNING_DESC",
    );
    expect(screen.getByTestId("seo-analysis-check-sitemap")).toHaveTextContent(
      "PROJECT_SEO_ANALYSIS_SITEMAP_WARNING_DESC",
    );
  });
});
