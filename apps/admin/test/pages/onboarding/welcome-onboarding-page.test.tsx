import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { WelcomeOnboardingPage } from "@/pages/onboarding/welcome/page";

const {
  navigateMock,
  searchState,
  listMyWorkspacesMock,
  createMyOnboardingWorkspaceMock,
  getWorkspaceDetailMock,
  patchWorkspaceDetailMock,
  patchWorkspaceRolePolicyMock,
  listWorkspaceRolesMock,
  createTeamInvitationMock,
  meMock,
  updateMyProfileMock,
  patchCoreSettingsMock,
  workspaceState,
  preferenceState,
} = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  searchState: { dryRun: "1" as "1" | undefined },
  listMyWorkspacesMock: vi.fn(),
  createMyOnboardingWorkspaceMock: vi.fn(),
  getWorkspaceDetailMock: vi.fn(),
  patchWorkspaceDetailMock: vi.fn(),
  patchWorkspaceRolePolicyMock: vi.fn(),
  listWorkspaceRolesMock: vi.fn(),
  createTeamInvitationMock: vi.fn(),
  meMock: vi.fn(),
  updateMyProfileMock: vi.fn(),
  patchCoreSettingsMock: vi.fn(),
  workspaceState: {
    setCurrentWorkspaceId: vi.fn(),
    setCurrentProjectId: vi.fn(),
  },
  preferenceState: {
    reduceMotion: true,
    locale: "en-US",
    localePreferenceMode: "workspace",
    timeZonePreference: "UTC",
    setLocale: vi.fn(),
    setBrowserLocale: vi.fn(),
    setTimeZonePreference: vi.fn(),
  },
}));

vi.mock("@tanstack/react-router", () => ({
  Link: (props: { children: React.ReactNode; to: string; "aria-label"?: string }) => (
    <a href={props.to} aria-label={props["aria-label"]}>
      {props.children}
    </a>
  ),
  useNavigate: () => navigateMock,
  useSearch: () => searchState,
}));

vi.mock("@/api/workspaces", () => ({
  listMyWorkspaces: (...args: unknown[]) => listMyWorkspacesMock(...args),
  createMyOnboardingWorkspace: (...args: unknown[]) => createMyOnboardingWorkspaceMock(...args),
  getWorkspaceDetail: (...args: unknown[]) => getWorkspaceDetailMock(...args),
  patchWorkspaceDetail: (...args: unknown[]) => patchWorkspaceDetailMock(...args),
  patchWorkspaceRolePolicy: (...args: unknown[]) => patchWorkspaceRolePolicyMock(...args),
}));

vi.mock("@/api/rbac", () => ({
  listWorkspaceRoles: (...args: unknown[]) => listWorkspaceRolesMock(...args),
}));

vi.mock("@/api/team", () => ({
  createTeamInvitation: (...args: unknown[]) => createTeamInvitationMock(...args),
}));

vi.mock("@/api/settings", () => ({
  patchCoreSettings: (...args: unknown[]) => patchCoreSettingsMock(...args),
}));

vi.mock("@/api/auth", () => ({
  me: (...args: unknown[]) => meMock(...args),
  updateMyProfile: (...args: unknown[]) => updateMyProfileMock(...args),
  logout: vi.fn(),
}));

vi.mock("@/lib/notifications", () => ({
  notifyError: vi.fn(),
  notifySuccessText: vi.fn(),
}));

vi.mock("@/pages/usercenter/profile/lib/avatar-upload", () => ({
  uploadAvatarFile: vi.fn(),
}));

vi.mock("@/stores/use-workspace-store", () => ({
  useWorkspaceStore: Object.assign(
    (selector: (state: typeof workspaceState) => unknown) => selector(workspaceState),
    {
      getState: () => workspaceState,
    },
  ),
}));

vi.mock("@/stores/use-auth-store", () => ({
  useAuthStore: (
    selector: (state: { refreshToken: string | null; clear: () => void }) => unknown,
  ) => selector({ refreshToken: null, clear: vi.fn() }),
}));

vi.mock("@/stores/use-preference-store", () => ({
  usePreferencesStore: (selector: (state: typeof preferenceState) => unknown) =>
    selector(preferenceState),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const normalized = key.includes(":") ? key.split(":")[1] : key;
      return (
        {
          WELCOME_FOOTER_COPYRIGHT: "Copyright © 2026 Arclayer. All rights reserved.",
          WELCOME_PRIVACY_POLICY: "Privacy Policy",
          WELCOME_TERMS_OF_SERVICE: "Terms of Service",
          WELCOME_SIGN_OUT: "Sign Out",
          WELCOME_IMAGE_ALT: "Arclayer onboarding preview",
          WELCOME_STEP_PROFILE_TITLE: "Let's get to know you!",
          WELCOME_STEP_WORKSPACE_TITLE: "Create your workspace",
          WELCOME_STEP_TEAM_TITLE: "Collaborate with your team",
          WELCOME_STEP_TEAM_DESC: "Invite teammates.",
          WELCOME_STEP_CUSTOMIZE_TITLE: "Help us customize your workspace",
          WELCOME_STEP_CUSTOMIZE_DESC: "Tune your starting workspace.",
          WELCOME_CONTINUE: "Continue",
          WELCOME_FINAL_CTA: "Start building",
          WELCOME_PROFILE_DISPLAY_NAME_LABEL: "Display name",
          WELCOME_PROFILE_DISPLAY_NAME_PLACEHOLDER: "Your name",
          WELCOME_PROFILE_DISPLAY_NAME_REQUIRED: "Enter a display name.",
          WELCOME_PROFILE_DISPLAY_NAME_INVALID: "Invalid display name",
          WELCOME_PROFILE_SAVED: "Profile saved.",
          WELCOME_PROFILE_LANGUAGE_LABEL: "Language",
          WELCOME_PROFILE_BROWSER_LANGUAGE_LABEL: "Use browser language",
          WELCOME_PROFILE_TIMEZONE_LABEL: "Timezone",
          WELCOME_PROFILE_AUTO_TIMEZONE_LABEL: "Use browser timezone",
          WELCOME_WORKSPACE_ICON_LABEL: "Workspace icon",
          WELCOME_WORKSPACE_ICON_PLACEHOLDER: "Emoji or initials",
          WELCOME_WORKSPACE_NAME_LABEL: "Workspace name",
          WELCOME_WORKSPACE_NAME_PLACEHOLDER: "Acme Content",
          WELCOME_WORKSPACE_DESCRIPTION_LABEL: "Workspace description",
          WELCOME_WORKSPACE_DESCRIPTION_PLACEHOLDER: "Description",
          WELCOME_WORKSPACE_DEFAULT_ROLE_LABEL: "Default member role",
          WELCOME_WORKSPACE_SAVED: "Workspace created.",
          WELCOME_WORKSPACE_LANGUAGE_LABEL: "Workspace language",
          WELCOME_WORKSPACE_TIMEZONE_LABEL: "Workspace timezone",
          WELCOME_WORKSPACE_DATE_TIME_LABEL: "Date and time display",
          WELCOME_ROLE_ADMIN: "Admin",
          WELCOME_ROLE_EDITOR: "Editor",
          WELCOME_ROLE_VIEWER: "Viewer",
          WELCOME_INVITE_EMAIL_PLACEHOLDER: "example@email.com",
          WELCOME_INVITE_ROLE_PLACEHOLDER: "Role",
          WELCOME_INVITE_MEMBERS: "Invite members",
          WELCOME_INVITE_SKIP: "Skip for now",
          WELCOME_INVITE_INVALID_EMAIL: "Enter a valid email address.",
          WELCOME_INVITE_VALIDATION_ERROR: "Check the invite rows before continuing.",
          WELCOME_INVITE_SAVED: "Team invites saved.",
          WELCOME_CUSTOMIZE_TEAM_TYPE_QUESTION: "What best describes your team?",
          WELCOME_CUSTOMIZE_GOAL_QUESTION: "What do you want to set up first?",
          WELCOME_CUSTOMIZE_PROGRESS_1: "Question 1 of 2",
          WELCOME_CUSTOMIZE_PROGRESS_2: "Question 2 of 2",
          WELCOME_CUSTOMIZE_BACK_TO_TEAM_TYPE: "Back to question 1",
          WELCOME_CUSTOMIZE_SKIP: "Skip for now",
          WELCOME_CUSTOMIZE_TEAM_TYPE_CONTENT: "Content team",
          WELCOME_CUSTOMIZE_TEAM_TYPE_MARKETING: "Marketing team",
          WELCOME_CUSTOMIZE_TEAM_TYPE_AGENCY: "Agency / studio",
          WELCOME_CUSTOMIZE_TEAM_TYPE_DEVELOPER: "Developer team",
          WELCOME_CUSTOMIZE_TEAM_TYPE_FOUNDER: "Founder / operator",
          WELCOME_CUSTOMIZE_TEAM_TYPE_OTHER: "Other",
          WELCOME_CUSTOMIZE_GOAL_CONTENT: "Manage structured content",
          WELCOME_CUSTOMIZE_GOAL_WEBSITES: "Build and launch websites",
          WELCOME_CUSTOMIZE_GOAL_ASSETS: "Centralize assets",
          WELCOME_CUSTOMIZE_GOAL_LOCALIZATION: "Localize content",
          WELCOME_CUSTOMIZE_GOAL_AUTOMATION: "Automate publishing",
          WELCOME_CUSTOMIZE_GOAL_EVALUATE: "Evaluate Arclayer",
          BACK: "Back",
          RETRY: "Retry",
          ORG_WORKSPACES_FIELD_NAME_REQUIRED: "Workspace name is required",
          SETTINGS_LOCALIZATION_RELATIVE_DATETIME_SWITCH_TITLE: "Use relative datetime",
          SETTINGS_LOCALIZATION_FULL_DATE_TIME_LABEL: "Full date and time",
          SETTINGS_WORKSPACE_NAME_LABEL: "Workspace name",
          SETTINGS_WORKSPACE_NAME_PLACEHOLDER: "Acme Content",
          SETTINGS_WORKSPACE_DEFAULT_ROLE_TITLE: "Default member role",
          ME_PROFILE_DISPLAY_NAME_TITLE: "Display name",
          ME_PROFILE_DISPLAY_NAME_PLACEHOLDER: "Your name",
          ME_PROFILE_AVATAR_CHANGE: "Change avatar",
          ME_PROFILE_AVATAR_REMOVE: "Remove avatar",
          ACCOUNT_SETTINGS_LANGUAGE_LABEL: "Language",
          ME_PREF_LANGUAGE_DESC: "Choose the interface language.",
          ME_PREF_TIMEZONE_TITLE: "Time zone",
          ME_PREF_TIMEZONE_DESC: "Choose the time zone.",
        }[normalized] ?? normalized
      );
    },
    i18n: { resolvedLanguage: "en-US", language: "en-US" },
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
      <WelcomeOnboardingPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  searchState.dryRun = "1";
  navigateMock.mockReset();
  listMyWorkspacesMock.mockReset();
  createMyOnboardingWorkspaceMock.mockReset();
  getWorkspaceDetailMock.mockReset();
  patchWorkspaceDetailMock.mockReset();
  patchWorkspaceRolePolicyMock.mockReset();
  listWorkspaceRolesMock.mockReset();
  createTeamInvitationMock.mockReset();
  meMock.mockReset();
  updateMyProfileMock.mockReset();
  patchCoreSettingsMock.mockReset();
  workspaceState.setCurrentWorkspaceId.mockReset();
  workspaceState.setCurrentProjectId.mockReset();
  preferenceState.setLocale.mockReset();
  preferenceState.setBrowserLocale.mockReset();
  preferenceState.setTimeZonePreference.mockReset();
});

describe("WelcomeOnboardingPage", () => {
  it("walks the dry-run flow without backend mutations", async () => {
    renderPage();
    const user = userEvent.setup();

    expect(screen.getByText("Let's get to know you!")).toBeInTheDocument();
    expect(screen.getByText("Copyright © 2026 Arclayer. All rights reserved.")).toBeInTheDocument();

    await user.type(await screen.findByLabelText("Display name"), "Philip Cole");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByText("Create your workspace");
    await user.clear(await screen.findByLabelText("Workspace name"));
    await user.type(await screen.findByLabelText("Workspace name"), "Studio Team");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    await screen.findByText("Collaborate with your team");
    await user.type(
      (await screen.findAllByPlaceholderText("example@email.com"))[0],
      "editor@example.com",
    );
    await user.click(screen.getByRole("button", { name: "Invite members" }));

    await screen.findByText("Help us customize your workspace");
    await user.click(await screen.findByRole("button", { name: "Content team" }));
    await user.click(await screen.findByRole("button", { name: "Manage structured content" }));
    await user.click(screen.getByRole("button", { name: "Start building" }));

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith({ to: "/", replace: true });
    });
    expect(createMyOnboardingWorkspaceMock).not.toHaveBeenCalled();
    expect(patchCoreSettingsMock).not.toHaveBeenCalled();
    expect(createTeamInvitationMock).not.toHaveBeenCalled();
  });

  it("blocks invalid invite email before advancing", async () => {
    renderPage();
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText("Display name"), "Philip Cole");
    await user.click(await screen.findByRole("button", { name: "Continue" }));
    await screen.findByText("Create your workspace");
    await user.type(await screen.findByLabelText("Workspace name"), "Studio Team");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByText("Collaborate with your team");

    await user.type((await screen.findAllByPlaceholderText("example@email.com"))[0], "invalid");
    await user.click(screen.getByRole("button", { name: "Invite members" }));

    expect(await screen.findByText("Enter a valid email address.")).toBeInTheDocument();
    expect(screen.getByText("Collaborate with your team")).toBeInTheDocument();
  });
});
