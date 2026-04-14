import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { WorkspaceFirstOnboardingPage } from "@/pages/onboarding/workspace-first/page";

const {
  navigateMock,
  listMyWorkspacesMock,
  checkSlugMock,
  meMock,
  listMyOrganizationsMock,
  createMyOrganizationMock,
  createOrganizationWorkspaceMock,
  patchCoreSettingsMock,
  workspaceState,
  i18nState,
} = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  listMyWorkspacesMock: vi.fn(),
  checkSlugMock: vi.fn(),
  meMock: vi.fn(),
  listMyOrganizationsMock: vi.fn(),
  createMyOrganizationMock: vi.fn(),
  createOrganizationWorkspaceMock: vi.fn(),
  patchCoreSettingsMock: vi.fn(),
  workspaceState: {
    currentWorkspaceId: null as string | null,
    lastWorkspaceId: null as string | null,
    setCurrentWorkspaceId: vi.fn(),
  },
  i18nState: {
    resolvedLanguage: "en-US",
    language: "en-US",
  },
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigateMock,
}));

vi.mock("@/api/workspaces", () => ({
  listMyWorkspaces: (...args: unknown[]) => listMyWorkspacesMock(...args),
  checkMyOnboardingWorkspaceSlugAvailability: (...args: unknown[]) => checkSlugMock(...args),
}));

vi.mock("@/api/auth", () => ({
  me: (...args: unknown[]) => meMock(...args),
}));

vi.mock("@/api/me", () => ({
  listMyOrganizations: (...args: unknown[]) => listMyOrganizationsMock(...args),
  createMyOrganization: (...args: unknown[]) => createMyOrganizationMock(...args),
}));

vi.mock("@/api/organization-workspaces", () => ({
  createOrganizationWorkspace: (...args: unknown[]) => createOrganizationWorkspaceMock(...args),
}));

vi.mock("@/api/settings", () => ({
  patchCoreSettings: (...args: unknown[]) => patchCoreSettingsMock(...args),
}));

vi.mock("@/lib/notifications", () => ({
  notifyError: vi.fn(),
}));

vi.mock("@/lib/routing/post-auth-routing", () => ({
  resolvePostAuthRoute: vi.fn(async () => ({ path: "/", workspaceId: null })),
}));

vi.mock("@/stores/use-workspace-store", () => ({
  useWorkspaceStore: (selector: (state: typeof workspaceState) => unknown) =>
    selector(workspaceState),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: i18nState,
  }),
}));

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <WorkspaceFirstOnboardingPage />
    </QueryClientProvider>,
  );
}

async function advanceIntroToWorkspaceStep(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "common:NEXT" }));
}

beforeEach(() => {
  navigateMock.mockReset();
  listMyWorkspacesMock.mockReset();
  checkSlugMock.mockReset();
  meMock.mockReset();
  listMyOrganizationsMock.mockReset();
  createMyOrganizationMock.mockReset();
  createOrganizationWorkspaceMock.mockReset();
  patchCoreSettingsMock.mockReset();
  workspaceState.setCurrentWorkspaceId.mockReset();
  workspaceState.lastWorkspaceId = null;
  i18nState.resolvedLanguage = "en-US";
  i18nState.language = "en-US";

  checkSlugMock.mockImplementation(async (slug: string) => ({
    normalizedSlug: slug,
    available: true,
    reason: null,
  }));
  meMock.mockResolvedValue({
    id: "user-1",
    username: "founder-team",
    email: "founder@example.com",
    displayName: "Founder",
    avatarUrl: null,
    avatarAssetId: null,
    isSuperAdmin: false,
  });
  listMyOrganizationsMock.mockResolvedValue({ items: [], total: 0 });
  createMyOrganizationMock.mockResolvedValue({
    organization: { id: "org-1", name: "Studio Team", slug: "studio-team", logoUrl: null },
    membership: {
      id: "orgm-1",
      organizationId: "org-1",
      role: "owner",
      status: "active",
    },
    memberCount: 1,
    membersPreview: [],
  });
  createOrganizationWorkspaceMock.mockResolvedValue({
    id: "ws-row-1",
    workspaceId: "ws-1",
    organizationId: "org-1",
    slug: "founder-team",
    name: "Studio Team",
    description: null,
    iconUrl: null,
    isArchived: false,
    archivedAt: null,
    archivedByUserId: null,
    memberCount: 1,
    membersPreview: [],
    createdAt: "2026-04-14T00:00:00Z",
    enterable: true,
  });
  patchCoreSettingsMock.mockResolvedValue({
    namespace: "core",
    value: {},
    secrets: {},
    updatedAt: "2026-04-14T00:00:00Z",
  });
});

describe("WorkspaceFirstOnboardingPage", () => {
  it("creates the first workspace, saves defaults, and enters the workspace", async () => {
    listMyWorkspacesMock
      .mockResolvedValueOnce({
        items: [],
        switcher: {
          teams: [],
          personalSpace: {
            status: "pending",
            workspace: null,
            retryAvailable: false,
            lastError: null,
          },
        },
        instanceSetup: { status: "ready", repairReason: null },
        onboarding: { status: "pending_workspace", workspaceId: null },
      })
      .mockResolvedValueOnce({
        items: [
          {
            workspaceId: "ws-1",
            organizationId: "org-1",
            slug: "founder-team",
            name: "Studio Team",
            kind: "team",
            visibleOnly: false,
            isCreatorAdmin: true,
            isLegacy: false,
          },
        ],
        switcher: {
          teams: [
            {
              workspaceId: "ws-1",
              organizationId: "org-1",
              slug: "founder-team",
              name: "Studio Team",
              kind: "team",
              visibleOnly: false,
              isCreatorAdmin: true,
              isLegacy: false,
            },
          ],
          personalSpace: {
            status: "pending",
            workspace: null,
            retryAvailable: false,
            lastError: null,
          },
        },
        instanceSetup: { status: "ready", repairReason: null },
        onboarding: { status: "pending_workspace_defaults", workspaceId: "ws-1" },
      })
      .mockResolvedValueOnce({
        items: [
          {
            workspaceId: "ws-1",
            organizationId: "org-1",
            slug: "founder-team",
            name: "Studio Team",
            kind: "team",
            visibleOnly: false,
            isCreatorAdmin: true,
            isLegacy: false,
          },
        ],
        switcher: {
          teams: [
            {
              workspaceId: "ws-1",
              organizationId: "org-1",
              slug: "founder-team",
              name: "Studio Team",
              kind: "team",
              visibleOnly: false,
              isCreatorAdmin: true,
              isLegacy: false,
            },
          ],
          personalSpace: {
            status: "pending",
            workspace: null,
            retryAvailable: false,
            lastError: null,
          },
        },
        instanceSetup: { status: "ready", repairReason: null },
        onboarding: { status: "completed", workspaceId: "ws-1" },
      });

    renderPage();
    const user = userEvent.setup();

    await screen.findByText("onboarding:WORKSPACE_FIRST_WELCOME_TITLE");
    await advanceIntroToWorkspaceStep(user);
    await screen.findByText("onboarding:WORKSPACE_STEP_TITLE");
    const nameInput = screen.getByLabelText("common:ORG_WORKSPACES_FIELD_NAME");
    const slugInput = screen.getByLabelText("onboarding:WORKSPACE_SLUG_LABEL");

    await waitFor(() => expect(slugInput).toHaveValue("founder-team"));
    await waitFor(() => expect(nameInput).toHaveValue("Founder's Workspace"));

    await user.clear(nameInput);
    await user.type(nameInput, "Studio Team");
    await waitFor(() => expect(screen.getByRole("button", { name: "common:NEXT" })).toBeEnabled());

    await user.click(screen.getByRole("button", { name: "common:NEXT" }));

    await waitFor(() => {
      expect(createMyOrganizationMock).toHaveBeenCalledWith({ name: "Studio Team" });
      expect(createOrganizationWorkspaceMock).toHaveBeenCalledWith("org-1", {
        name: "Studio Team",
        slug: "founder-team",
        template: "blank",
      });
    });

    await screen.findByText("onboarding:PREFERENCES_STEP_TITLE");
    expect(
      screen.getByText("settings:SETTINGS_LOCALIZATION_RELATIVE_DATETIME_SWITCH_TITLE"),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "common:NEXT" }));

    await screen.findByText("onboarding:PERSONALIZE_TITLE");
    await user.click(screen.getByRole("button", { name: "onboarding:PERSONALIZE_ROLE_FOUNDER" }));
    await user.click(screen.getByRole("button", { name: "common:NEXT" }));
    await user.click(screen.getByRole("button", { name: "onboarding:PERSONALIZE_GOAL_AI_AGENTS" }));
    await user.click(screen.getByRole("button", { name: "common:NEXT" }));
    await screen.findByText("onboarding:READY_TITLE");
    await user.click(screen.getByRole("button", { name: "onboarding:READY_CTA" }));

    await waitFor(() => {
      expect(patchCoreSettingsMock).toHaveBeenCalledWith(
        "ws-1",
        expect.objectContaining({
          workspace_localization: expect.objectContaining({
            locale: "en-US",
            date_format: "MM/DD/YYYY",
            use_browser_timezone: false,
            use_relative_datetime: true,
          }),
        }),
      );
    });

    await waitFor(() => {
      expect(workspaceState.setCurrentWorkspaceId).toHaveBeenCalledWith("ws-1");
      expect(navigateMock).toHaveBeenCalledWith({ to: "/w/ws-1", replace: true });
    });
  });

  it("uses a Chinese default workspace name when the current language is zh-CN", async () => {
    i18nState.resolvedLanguage = "zh-CN";
    i18nState.language = "zh-CN";

    listMyWorkspacesMock.mockResolvedValue({
      items: [],
      switcher: {
        teams: [],
        personalSpace: {
          status: "pending",
          workspace: null,
          retryAvailable: false,
          lastError: null,
        },
      },
      instanceSetup: { status: "ready", repairReason: null },
      onboarding: { status: "pending_workspace", workspaceId: null },
    });

    renderPage();
    const user = userEvent.setup();

    await screen.findByText("onboarding:WORKSPACE_FIRST_WELCOME_TITLE");
    await advanceIntroToWorkspaceStep(user);
    await screen.findByText("onboarding:WORKSPACE_STEP_TITLE");
    await waitFor(() => {
      expect(screen.getByLabelText("common:ORG_WORKSPACES_FIELD_NAME")).toHaveValue(
        "Founder 的工作区",
      );
    });
  });

  it("allows skipping each personalization question independently", async () => {
    listMyWorkspacesMock.mockResolvedValue({
      items: [
        {
          workspaceId: "ws-1",
          organizationId: "org-1",
          slug: "founder-team",
          name: "Studio Team",
          kind: "team",
          visibleOnly: false,
          isCreatorAdmin: true,
          isLegacy: false,
        },
      ],
      switcher: {
        teams: [
          {
            workspaceId: "ws-1",
            organizationId: "org-1",
            slug: "founder-team",
            name: "Studio Team",
            kind: "team",
            visibleOnly: false,
            isCreatorAdmin: true,
            isLegacy: false,
          },
        ],
        personalSpace: {
          status: "pending",
          workspace: null,
          retryAvailable: false,
          lastError: null,
        },
      },
      instanceSetup: { status: "ready", repairReason: null },
      onboarding: { status: "pending_workspace_defaults", workspaceId: "ws-1" },
    });

    renderPage();
    const user = userEvent.setup();

    await screen.findByText("onboarding:PREFERENCES_STEP_TITLE");
    await user.click(screen.getByRole("button", { name: "common:NEXT" }));
    await screen.findByText("onboarding:PERSONALIZE_TITLE");
    await user.click(screen.getByRole("button", { name: "onboarding:PERSONALIZE_SKIP" }));
    await screen.findByText("onboarding:PERSONALIZE_QUESTION_2");
    await user.click(screen.getByRole("button", { name: "onboarding:PERSONALIZE_SKIP" }));
    await screen.findByText("onboarding:READY_TITLE");
  });
});
