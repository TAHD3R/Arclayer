import type { PropsWithChildren, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GeneralSettingsShell } from "@/pages/projects/settings/site/components/general-settings-shell";

const getProjectCoreSettingsMock = vi.fn();
const patchProjectCoreSettingsMock = vi.fn();
const getMyProjectAuthzMock = vi.fn();
const listProjectPermissionActionsMock = vi.fn();
const navigateMock = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigateMock,
}));

vi.mock("@/api/settings", () => ({
  getProjectCoreSettings: (...args: unknown[]) => getProjectCoreSettingsMock(...args),
  patchProjectCoreSettings: (...args: unknown[]) => patchProjectCoreSettingsMock(...args),
}));

vi.mock("@/api/workspaces", () => ({
  getMyProjectAuthz: (...args: unknown[]) => getMyProjectAuthzMock(...args),
}));

vi.mock("@/api/rbac", () => ({
  listProjectPermissionActions: (...args: unknown[]) => listProjectPermissionActionsMock(...args),
}));

vi.mock("@/layouts/page-shell/default-page", () => ({
  DefaultPage: ({
    title,
    description,
    extra,
    children,
  }: PropsWithChildren<{
    title: string;
    description: string;
    extra?: ReactNode;
  }>) => (
    <div data-testid="default-page" data-title={title} data-description={description}>
      <div data-testid="default-page-extra">{extra}</div>
      {children}
    </div>
  ),
}));

vi.mock("@/layouts/page-shell/content-guard", () => ({
  ContentGuard: (props: PropsWithChildren) => <>{props.children}</>,
}));

vi.mock("@arclayer/ui/form", () => ({
  Form: (props: PropsWithChildren) => <form>{props.children}</form>,
}));

vi.mock("@arclayer/ui/chrome-tabs", () => ({
  ChromeTabs: (props: PropsWithChildren<{ value: string }>) => (
    <div data-testid="chrome-tabs" data-value={props.value}>
      {props.children}
    </div>
  ),
  ChromeTabsContent: (props: PropsWithChildren<{ value: string }>) => (
    <div data-testid={`chrome-tabs-content-${props.value}`}>{props.children}</div>
  ),
  ChromeTabsList: (props: PropsWithChildren) => <div>{props.children}</div>,
  ChromeTabsTrigger: (props: PropsWithChildren<{ value: string }>) => (
    <button type="button" data-value={props.value}>
      {props.children}
    </button>
  ),
}));

vi.mock("@/pages/projects/settings/site/components/tabs/site-settings-tab", () => ({
  SiteSettingsTab: (props: {
    disabled: boolean;
    patch: (patch: Record<string, unknown>) => Promise<void>;
  }) => (
    <div data-testid="site-settings-tab" data-disabled={String(props.disabled)}>
      <button type="button" onClick={() => void props.patch({ site: { name: "Updated site" } })}>
        save website config
      </button>
    </div>
  ),
}));

vi.mock("@/pages/projects/settings/site/components/tabs/localization-settings-tab", () => ({
  LocalizationSettingsTab: (props: { disabled: boolean }) => (
    <div data-testid="localization-settings-tab" data-disabled={String(props.disabled)} />
  ),
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

describe("GeneralSettingsShell permission consumption", () => {
  beforeEach(() => {
    getProjectCoreSettingsMock.mockReset();
    patchProjectCoreSettingsMock.mockReset();
    getMyProjectAuthzMock.mockReset();
    listProjectPermissionActionsMock.mockReset();
    navigateMock.mockReset();

    getProjectCoreSettingsMock.mockResolvedValue({
      namespace: "core",
      value: {
        site: {
          name: "Arclayer",
          subtitle: "Stories",
          description: "Project site",
          url: "https://example.com",
          contact_email: "team@example.com",
        },
        site_localization: {
          default_locale: "en-US",
          fallback_locale: "en-US",
          supported_locales: ["en-US"],
          timezone: "UTC",
          use_browser_timezone: false,
          date_format: "YYYY-MM-DD",
          use_relative_datetime: true,
        },
        seo: {
          title_policy_v1: {
            parts: [
              { kind: "token", value: "pageTitle" },
              { kind: "literal", value: " - " },
              { kind: "token", value: "siteName" },
            ],
            homeMode: "siteOnly",
            dedupe: true,
          },
        },
      },
    });
    getMyProjectAuthzMock.mockResolvedValue({
      workspaceId: "workspace-1",
      isSuperuser: false,
      permissionCodes: ["system:settings:manage"],
    });
    listProjectPermissionActionsMock.mockResolvedValue([
      {
        code: "project:settings:manage",
        description: "Manage project-level settings",
        subjectKinds: ["project_member"],
        permissionCodes: ["system:settings:manage"],
      },
    ]);
  });

  it("keeps tabs editable when site management access is granted", async () => {
    renderWithQuery(<GeneralSettingsShell projectId="project-1" embedded={false} />);

    await waitFor(() => {
      expect(screen.getByTestId("site-settings-tab")).toHaveAttribute("data-disabled", "false");
    });
    expect(screen.getByTestId("localization-settings-tab")).toHaveAttribute(
      "data-disabled",
      "false",
    );
    expect(screen.queryByTestId("general-settings-read-only-notice")).not.toBeInTheDocument();
  });

  it("invalidates generated project source after saving Website Config", async () => {
    patchProjectCoreSettingsMock.mockResolvedValueOnce({
      namespace: "core",
      value: {
        site: {
          name: "Updated site",
        },
      },
    });
    const { queryClient } = renderWithQuery(
      <GeneralSettingsShell projectId="project-1" embedded={false} />,
    );
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    fireEvent.click(await screen.findByRole("button", { name: "save website config" }));

    await waitFor(() => {
      expect(patchProjectCoreSettingsMock).toHaveBeenCalledWith("project-1", {
        site: {
          name: "Updated site",
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

  it("shows read-only guidance and disables save surfaces without site management access", async () => {
    getMyProjectAuthzMock.mockResolvedValueOnce({
      workspaceId: "workspace-1",
      isSuperuser: false,
      permissionCodes: ["system:settings:read"],
    });

    renderWithQuery(<GeneralSettingsShell projectId="project-1" embedded={false} />);

    expect(await screen.findByTestId("general-settings-read-only-notice")).toHaveTextContent(
      "settings:SETTINGS_SITE_SETTINGS_READ_ONLY_DESC",
    );
    expect(screen.getByTestId("site-settings-tab")).toHaveAttribute("data-disabled", "true");
    expect(screen.getByTestId("localization-settings-tab")).toHaveAttribute(
      "data-disabled",
      "true",
    );
  });

  it("keeps site settings controls closed while project permissions warm up", async () => {
    getMyProjectAuthzMock.mockImplementationOnce(() => new Promise(() => {}));

    renderWithQuery(<GeneralSettingsShell projectId="project-1" embedded={false} />);

    await waitFor(() => {
      expect(screen.getByTestId("site-settings-tab")).toHaveAttribute("data-disabled", "true");
    });
    expect(screen.queryByTestId("general-settings-read-only-notice")).not.toBeInTheDocument();
  });

  it("renders site identity and localization in one website config page", async () => {
    renderWithQuery(<GeneralSettingsShell projectId="project-1" embedded={false} />);

    await waitFor(() => {
      expect(screen.getByTestId("site-settings-tab")).toBeInTheDocument();
    });
    expect(screen.getByTestId("site-settings-tab")).toBeInTheDocument();
    expect(screen.getByTestId("localization-settings-tab")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("settings:SETTINGS_SITE_SEARCH_PLACEHOLDER")).toBeNull();
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
