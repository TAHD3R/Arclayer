import type { PropsWithChildren, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProjectDomainSettingsPage } from "@/pages/projects/settings/domain/page";

const listProjectDomainsMock = vi.fn();
const createProjectDomainMock = vi.fn();
const verifyProjectDomainMock = vi.fn();
const updateProjectDomainMock = vi.fn();
const deleteProjectDomainMock = vi.fn();
const notifyErrorMock = vi.fn();
const notifySuccessTextMock = vi.fn();

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

vi.mock("@/hooks/use-workspace-permission-access", () => ({
  useProjectPermissionAccess: () => ({
    authzQuery: { isFetched: true },
    hasAction: (code: string) => code === "project:domains:manage",
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

describe("ProjectDomainSettingsPage", () => {
  beforeEach(() => {
    listProjectDomainsMock.mockReset();
    createProjectDomainMock.mockReset();
    verifyProjectDomainMock.mockReset();
    updateProjectDomainMock.mockReset();
    deleteProjectDomainMock.mockReset();
    notifyErrorMock.mockReset();
    notifySuccessTextMock.mockReset();

    listProjectDomainsMock.mockResolvedValue([PLATFORM_ROW, CUSTOM_ROW]);
    createProjectDomainMock.mockResolvedValue({ binding: CUSTOM_ROW });
    verifyProjectDomainMock.mockResolvedValue({ binding: { ...CUSTOM_ROW, isVerified: true } });
    updateProjectDomainMock.mockResolvedValue({ ...CUSTOM_ROW, isActive: false });
    deleteProjectDomainMock.mockResolvedValue({ bindingId: CUSTOM_ROW.bindingId });
  });

  it("renders a domain-focused management surface", async () => {
    renderWithQuery(<ProjectDomainSettingsPage projectId="project-1" />);

    expect(await screen.findByTestId("project-domain-settings-list")).toHaveTextContent(
      "launch-1234abcd.arclayer.app",
    );
    expect(
      screen.getByRole("columnheader", { name: "SETTINGS_PROJECT_DOMAINS_ROUTING" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "SETTINGS_PROJECT_DOMAINS_TLS" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("WEBSITE_CONTROL_READINESS_TITLE")).not.toBeInTheDocument();
    expect(screen.queryByText("WEBSITE_CONTROL_BRAND_ASSETS_READY")).not.toBeInTheDocument();
  });

  it("creates a custom domain through the add dialog", async () => {
    const user = userEvent.setup();
    renderWithQuery(<ProjectDomainSettingsPage projectId="project-1" />);

    await user.click(await screen.findByTestId("project-domain-add-trigger"));
    await user.type(screen.getByTestId("project-domain-create-input"), "docs.example.com");
    await user.click(screen.getByTestId("project-domain-create-submit"));
    await waitFor(() => {
      expect(createProjectDomainMock).toHaveBeenCalledWith("project-1", "docs.example.com");
    });
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
    expect(deleteProjectDomainMock).not.toHaveBeenCalled();
    await user.click(screen.getByTestId("project-domain-delete-confirm"));

    await waitFor(() => {
      expect(deleteProjectDomainMock).toHaveBeenCalledWith("project-1", "custom-binding");
    });
    expect(screen.queryByTestId("project-domain-delete-platform-binding")).not.toBeInTheDocument();
  });
});
