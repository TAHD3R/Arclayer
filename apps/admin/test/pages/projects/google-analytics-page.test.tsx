import type { PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProjectGoogleAnalyticsPage } from "@/pages/projects/seo/page";

const getProjectCoreSettingsMock = vi.fn();
const patchProjectCoreSettingsMock = vi.fn();
const hasActionMock = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@/api/settings", () => ({
  getProjectCoreSettings: (...args: unknown[]) => getProjectCoreSettingsMock(...args),
  patchProjectCoreSettings: (...args: unknown[]) => patchProjectCoreSettingsMock(...args),
}));

vi.mock("@/hooks/use-workspace-permission-access", () => ({
  useProjectPermissionAccess: () => ({
    actionsQuery: { isFetched: true },
    authzQuery: { isFetched: true },
    hasAction: (...args: unknown[]) => hasActionMock(...args),
  }),
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

  return {
    queryClient,
    ...render(<QueryClientProvider client={queryClient}>{node}</QueryClientProvider>),
  };
}

describe("ProjectGoogleAnalyticsPage", () => {
  beforeEach(() => {
    getProjectCoreSettingsMock.mockReset();
    patchProjectCoreSettingsMock.mockReset();
    hasActionMock.mockReset();
    hasActionMock.mockReturnValue(true);
  });

  it("shows runtime linkage when analytics can be injected into the site source", async () => {
    getProjectCoreSettingsMock.mockResolvedValue({
      value: {
        analytics: {
          google_analytics: {
            enabled: true,
            measurement_id: "G-ABC12345",
          },
        },
      },
    });

    renderWithQuery(<ProjectGoogleAnalyticsPage projectId="project-1" />);

    const linkage = await screen.findByTestId("google-analytics-runtime-linkage");
    await waitFor(() => {
      expect(linkage).toHaveTextContent(
        "account:PROJECT_SEO_GOOGLE_ANALYTICS_RUNTIME_STATUS_READY",
      );
    });
    expect(linkage).toHaveTextContent("account:PROJECT_SEO_GOOGLE_ANALYTICS_RUNTIME_SOURCE_TITLE");
    expect(linkage).toHaveTextContent("account:PROJECT_SEO_GOOGLE_ANALYTICS_RUNTIME_SEO_TITLE");
    expect(getProjectCoreSettingsMock).toHaveBeenCalledWith("project-1");
  });

  it("keeps missing analytics visible as a launch-readiness problem", async () => {
    getProjectCoreSettingsMock.mockResolvedValue({
      value: {
        analytics: {
          google_analytics: {
            enabled: true,
            measurement_id: "not-a-ga4-id",
          },
        },
      },
    });

    renderWithQuery(<ProjectGoogleAnalyticsPage projectId="project-1" />);

    const linkage = await screen.findByTestId("google-analytics-runtime-linkage");
    await waitFor(() => {
      expect(linkage).toHaveTextContent(
        "account:PROJECT_SEO_GOOGLE_ANALYTICS_RUNTIME_STATUS_MISSING",
      );
    });
    expect(linkage).toHaveTextContent(
      "account:PROJECT_SEO_GOOGLE_ANALYTICS_RUNTIME_STATUS_MISSING_DESC",
    );
  });

  it("invalidates generated project source after saving analytics settings", async () => {
    getProjectCoreSettingsMock.mockResolvedValue({
      value: {
        analytics: {
          google_analytics: {
            enabled: true,
            measurement_id: "G-OLD12345",
          },
        },
      },
    });
    patchProjectCoreSettingsMock.mockResolvedValue({
      value: {
        analytics: {
          google_analytics: {
            enabled: true,
            measurement_id: "G-NEW12345",
          },
        },
      },
    });

    const { queryClient } = renderWithQuery(<ProjectGoogleAnalyticsPage projectId="project-1" />);
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    fireEvent.change(await screen.findByPlaceholderText("G-XXXXXXXXXX"), {
      target: { value: "G-NEW12345" },
    });
    fireEvent.click(screen.getByRole("button", { name: "settings:SETTINGS_SAVE" }));

    await waitFor(() => {
      expect(patchProjectCoreSettingsMock).toHaveBeenCalledWith("project-1", {
        analytics: {
          google_analytics: {
            enabled: true,
            measurement_id: "G-NEW12345",
          },
        },
      });
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["settings", "project", "core", "project-1"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["project", "source", "project-1"],
    });
  });
});
