import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { WorkspaceFirstOnboardingPage } from "@/pages/onboarding/workspace-first/page";

const {
  navigateMock,
  listMyWorkspacesMock,
  checkSlugMock,
  createMyOnboardingWorkspaceMock,
  meMock,
  patchCoreSettingsMock,
  workspaceState,
  i18nState,
} = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  listMyWorkspacesMock: vi.fn(),
  checkSlugMock: vi.fn(),
  createMyOnboardingWorkspaceMock: vi.fn(),
  meMock: vi.fn(),
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
const translations: Record<string, string> = {
  "common:NEXT": "Next",
  "common:ORG_WORKSPACES_FIELD_NAME_REQUIRED": "Workspace name is required",
  "onboarding:WORKSPACE_FIRST_WELCOME_TITLE": "Welcome to Arclayer",
  "onboarding:WORKSPACE_SETUP_STEP_TITLE": "Name your workspace",
  "onboarding:WORKSPACE_NAME_LABEL": "Workspace name",
  "onboarding:WORKSPACE_NAME_HELP": "Choose the name people see when they enter this workspace.",
  "onboarding:WORKSPACE_NAME_PLACEHOLDER": "e.g. Product studio",
  "onboarding:WORKSPACE_SLUG_LABEL": "Workspace slug",
  "onboarding:PREFERENCES_STEP_TITLE": "Set workspace preferences",
  "settings:SETTINGS_LOCALIZATION_RELATIVE_DATETIME_SWITCH_TITLE":
    "Use relative datetime by default",
  "onboarding:PERSONALIZE_TITLE": "Personalize your experience",
  "onboarding:PERSONALIZE_ROLE_FOUNDER": "Founder",
  "onboarding:PERSONALIZE_GOAL_AI_AGENTS": "Building AI agents",
  "onboarding:PERSONALIZE_SKIP": "Skip for now",
  "onboarding:PERSONALIZE_QUESTION_2": "What do you want to create?",
  "onboarding:READY_TITLE": "You're ready to go!",
  "onboarding:READY_CTA": "Start Creating",
};

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigateMock,
}));

vi.mock("@/api/workspaces", () => ({
  listMyWorkspaces: (...args: unknown[]) => listMyWorkspacesMock(...args),
  checkMyOnboardingWorkspaceSlugAvailability: (...args: unknown[]) => checkSlugMock(...args),
  createMyOnboardingWorkspace: (...args: unknown[]) => createMyOnboardingWorkspaceMock(...args),
}));

vi.mock("@/api/auth", () => ({
  me: (...args: unknown[]) => meMock(...args),
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
    t: (key: string) => translations[key] ?? key,
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
  await user.click(screen.getByRole("button", { name: "Next" }));
}

beforeEach(() => {
  navigateMock.mockReset();
  listMyWorkspacesMock.mockReset();
  checkSlugMock.mockReset();
  createMyOnboardingWorkspaceMock.mockReset();
  meMock.mockReset();
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
  createMyOnboardingWorkspaceMock.mockResolvedValue({
    workspaceId: "ws-1",
  });
  patchCoreSettingsMock.mockResolvedValue({
    namespace: "core",
    value: {},
    secrets: {},
    updatedAt: "2026-04-14T00:00:00Z",
  });
});

describe("WorkspaceFirstOnboardingPage", () => {
  it("redirects completed onboarding into the resolved workspace", async () => {
    listMyWorkspacesMock.mockResolvedValue({
      items: [
        {
          workspaceId: "ws-team",
          organizationId: "org-team",
          slug: "founder",
          name: "Founder Workspace",
          kind: "team",
          visibleOnly: false,
          isCreatorAdmin: true,
          isLegacy: false,
        },
      ],
      switcher: {
        teams: [
          {
            workspaceId: "ws-team",
            organizationId: "org-team",
            slug: "founder",
            name: "Founder Workspace",
            kind: "team",
            visibleOnly: false,
            isCreatorAdmin: true,
            isLegacy: false,
          },
        ],
      },
      instanceSetup: { status: "ready", repairReason: null },
      onboarding: { status: "completed", workspaceId: "ws-team" },
    });

    renderPage();

    await waitFor(() => {
      expect(workspaceState.setCurrentWorkspaceId).toHaveBeenCalledWith("ws-team");
      expect(navigateMock).toHaveBeenCalledWith({ to: "/w/ws-team", replace: true });
    });
  });

  it("creates the first workspace, saves defaults, and enters the workspace", async () => {
    listMyWorkspacesMock
      .mockResolvedValueOnce({
        items: [],
        switcher: {
          teams: [],
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
        },
        instanceSetup: { status: "ready", repairReason: null },
        onboarding: { status: "completed", workspaceId: "ws-1" },
      });

    renderPage();
    const user = userEvent.setup();

    await screen.findByText("Welcome to Arclayer");
    await advanceIntroToWorkspaceStep(user);
    await screen.findByText("Name your workspace");
    const nameInput = screen.getByLabelText("Workspace name");
    const slugInput = screen.getByLabelText("Workspace slug");

    await waitFor(() => expect(slugInput).toHaveValue("founder-team"));
    await waitFor(() => expect(nameInput).toHaveValue("Founder's Workspace"));

    await user.clear(nameInput);
    await user.type(nameInput, "Studio Team");
    await waitFor(() => expect(screen.getByRole("button", { name: "Next" })).toBeEnabled());

    await user.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() => {
      expect(createMyOnboardingWorkspaceMock).toHaveBeenCalledWith({
        name: "Studio Team",
        slug: "founder-team",
      });
    });

    await screen.findByText("Set workspace preferences");
    expect(screen.getByText("Use relative datetime by default")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next" }));

    await screen.findByText("Personalize your experience");
    await user.click(screen.getByRole("button", { name: "Founder" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Building AI agents" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("You're ready to go!");
    await user.click(screen.getByRole("button", { name: "Start Creating" }));

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
      },
      instanceSetup: { status: "ready", repairReason: null },
      onboarding: { status: "pending_workspace", workspaceId: null },
    });

    renderPage();
    const user = userEvent.setup();

    await screen.findByText("Welcome to Arclayer");
    await advanceIntroToWorkspaceStep(user);
    await screen.findByText("Name your workspace");
    await waitFor(() => {
      expect(screen.getByLabelText("Workspace name")).toHaveValue("Founder 的工作区");
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
      },
      instanceSetup: { status: "ready", repairReason: null },
      onboarding: { status: "pending_workspace_defaults", workspaceId: "ws-1" },
    });

    renderPage();
    const user = userEvent.setup();

    await screen.findByText("Set workspace preferences");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("Personalize your experience");
    await user.click(screen.getByRole("button", { name: "Skip for now" }));
    await screen.findByText("What do you want to create?");
    await user.click(screen.getByRole("button", { name: "Skip for now" }));
    await screen.findByText("You're ready to go!");
  });
});
