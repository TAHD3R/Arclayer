import type { PropsWithChildren, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProjectSettingsPage } from "@/pages/projects/settings/project/page";

const getProjectDetailMock = vi.fn();
const patchProjectMock = vi.fn();
const checkProjectSlugAvailabilityMock = vi.fn();
const getMyProjectAuthzMock = vi.fn();
const listProjectPermissionActionsMock = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock("@/api/projects", () => ({
  getProjectDetail: (...args: unknown[]) => getProjectDetailMock(...args),
  patchProject: (...args: unknown[]) => patchProjectMock(...args),
  checkProjectSlugAvailability: (...args: unknown[]) => checkProjectSlugAvailabilityMock(...args),
}));

vi.mock("@/api/workspaces", () => ({
  getMyProjectAuthz: (...args: unknown[]) => getMyProjectAuthzMock(...args),
}));

vi.mock("@/api/rbac", () => ({
  listProjectPermissionActions: (...args: unknown[]) => listProjectPermissionActionsMock(...args),
}));

vi.mock("@/lib/notifications", () => ({
  notifyError: vi.fn(),
  notifySuccessText: vi.fn(),
}));

vi.mock("@arclayer/hooks/use-saving-key", () => ({
  useSavingKey: () => ({
    savingKey: null,
    withSavingKey: async (_key: string, action: () => Promise<unknown>) => action(),
  }),
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

vi.mock("@arclayer/ui/accordion", () => ({
  Accordion: (props: PropsWithChildren) => <div>{props.children}</div>,
}));

vi.mock("@arclayer/ui/setting-panel", () => ({
  SettingPanel: (props: PropsWithChildren<{ title: string; description: string }>) => (
    <section
      data-testid="setting-panel"
      data-title={props.title}
      data-description={props.description}
    >
      {props.children}
    </section>
  ),
}));

vi.mock("@arclayer/ui/setting-action-group", () => ({
  SettingActionGroup: (props: PropsWithChildren) => <div>{props.children}</div>,
}));

vi.mock("@arclayer/ui/setting-action-item", () => ({
  SettingActionItem: ({
    title,
    disabled,
  }: PropsWithChildren<{
    title: string;
    disabled?: boolean;
  }>) => (
    <button type="button" data-testid="project-icon-action" disabled={disabled}>
      {title}
    </button>
  ),
}));

vi.mock("@arclayer/ui/setting-accordion-item", () => ({
  SettingAccordionItem: ({
    value,
    disabled,
    children,
  }: PropsWithChildren<{
    value: string;
    disabled?: boolean;
  }>) => (
    <div data-testid={`accordion-${value}`} data-disabled={String(Boolean(disabled))}>
      {children}
    </div>
  ),
}));

vi.mock("@/components/common/project-avatar", () => ({
  ProjectAvatar: () => <div data-testid="project-avatar" />,
  projectAvatarPropsFromIdentity: () => ({}),
}));

vi.mock("@/pages/usercenter/projects/components/project-icon-dialog", () => ({
  ProjectIconDialog: () => <div data-testid="project-icon-dialog" />,
}));

vi.mock("@/pages/projects/settings/api-keys/page", () => ({
  ProjectApiKeysSettingsPage: () => <div data-testid="project-api-keys-settings-page" />,
}));

vi.mock("@arclayer/ui/input", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

function renderWithQuery(node: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(<QueryClientProvider client={queryClient}>{node}</QueryClientProvider>);
}

describe("ProjectSettingsPage permission consumption", () => {
  beforeEach(() => {
    getProjectDetailMock.mockReset();
    patchProjectMock.mockReset();
    checkProjectSlugAvailabilityMock.mockReset();
    getMyProjectAuthzMock.mockReset();
    listProjectPermissionActionsMock.mockReset();

    getProjectDetailMock.mockResolvedValue({
      project: {
        id: "project-1",
        workspaceId: "workspace-1",
        slug: "launch-site",
        name: "Launch site",
        description: "Primary project",
        iconMode: "initials",
        iconColor: "#337ea9",
        iconGlyph: null,
        iconEmoji: null,
        iconUrl: null,
        isActive: true,
      },
      primaryRuntime: {
        runtimeId: "runtime-1",
        hostname: "launch.example.com",
      },
    });
    patchProjectMock.mockResolvedValue({});
    checkProjectSlugAvailabilityMock.mockResolvedValue({
      available: true,
      normalizedSlug: "launch-site",
      reason: null,
    });
    getMyProjectAuthzMock.mockResolvedValue({
      projectId: "project-1",
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

  it("shows project read-only guidance and disables settings controls without manage access", async () => {
    getMyProjectAuthzMock.mockResolvedValueOnce({
      projectId: "project-1",
      workspaceId: "workspace-1",
      isSuperuser: false,
      permissionCodes: ["system:settings:read"],
    });

    renderWithQuery(<ProjectSettingsPage activeTab="general" projectId="project-1" />);

    expect(await screen.findAllByText("account:SETTINGS_PROJECT_READ_ONLY_DESC")).not.toHaveLength(
      0,
    );
    expect(screen.getByTestId("project-icon-action")).toBeDisabled();
    expect(screen.getByTestId("accordion-project_name")).toHaveAttribute("data-disabled", "true");
    expect(screen.getByTestId("accordion-project_slug")).toHaveAttribute("data-disabled", "true");
    expect(screen.getByTestId("accordion-project_description")).toHaveAttribute(
      "data-disabled",
      "true",
    );
  });

  it("keeps project settings controls closed while permissions warm up", async () => {
    getMyProjectAuthzMock.mockImplementationOnce(() => new Promise(() => {}));

    renderWithQuery(<ProjectSettingsPage activeTab="general" projectId="project-1" />);

    await waitFor(() => {
      expect(screen.getByTestId("project-icon-action")).toBeDisabled();
      expect(screen.getByTestId("accordion-project_name")).toHaveAttribute("data-disabled", "true");
      expect(screen.getByTestId("accordion-project_slug")).toHaveAttribute("data-disabled", "true");
      expect(screen.getByTestId("accordion-project_description")).toHaveAttribute(
        "data-disabled",
        "true",
      );
    });
    expect(screen.queryByText("account:SETTINGS_PROJECT_READ_ONLY_DESC")).not.toBeInTheDocument();
  });
});
