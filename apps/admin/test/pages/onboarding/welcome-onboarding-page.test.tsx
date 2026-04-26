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
  getMyOnboardingProfileMock,
  patchMyOnboardingProfileMock,
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
  getMyOnboardingProfileMock: vi.fn(),
  patchMyOnboardingProfileMock: vi.fn(),
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
  getMyOnboardingProfile: (...args: unknown[]) => getMyOnboardingProfileMock(...args),
  patchMyOnboardingProfile: (...args: unknown[]) => patchMyOnboardingProfileMock(...args),
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
          WELCOME_CONTINUE: "Continue",
          WELCOME_FINAL_CTA: "Start building",
          WELCOME_PROFILE_DISPLAY_NAME_LABEL: "Display name",
          WELCOME_PROFILE_DISPLAY_NAME_PLACEHOLDER: "Your name",
          WELCOME_PROFILE_DISPLAY_NAME_REQUIRED: "Enter a display name.",
          WELCOME_PROFILE_DISPLAY_NAME_INVALID: "Invalid display name",
          WELCOME_PROFILE_SAVED: "Profile saved.",
          WELCOME_PROFILE_JOB_ROLE_TITLE: "Job role (optional)",
          WELCOME_PROFILE_JOB_ROLE_PLACEHOLDER: "Select your role",
          WELCOME_PROFILE_JOB_ROLE_CONTENT_MANAGER: "Content manager",
          WELCOME_PROFILE_JOB_ROLE_WEBSITE_MANAGER: "Website manager",
          WELCOME_PROFILE_JOB_ROLE_MARKETING_LEAD: "Marketing lead",
          WELCOME_PROFILE_JOB_ROLE_FOUNDER_OWNER: "Founder / business owner",
          WELCOME_PROFILE_JOB_ROLE_DEVELOPER_BUILDER: "Developer / technical builder",
          WELCOME_PROFILE_JOB_ROLE_PRODUCT_MANAGER: "Product manager",
          WELCOME_PROFILE_JOB_ROLE_AI_OPERATIONS: "AI operations lead",
          WELCOME_PROFILE_JOB_ROLE_AGENCY_PARTNER: "Agency / implementation partner",
          WELCOME_PROFILE_JOB_ROLE_OTHER: "Other",
          WELCOME_PROFILE_COMPANY_SIZE_TITLE: "Company size (optional)",
          WELCOME_PROFILE_COMPANY_SIZE_PLACEHOLDER: "Select company size",
          WELCOME_PROFILE_COMPANY_SIZE_SOLO: "Just me",
          WELCOME_PROFILE_COMPANY_SIZE_2_10: "2-10",
          WELCOME_PROFILE_COMPANY_SIZE_11_50: "11-50",
          WELCOME_PROFILE_COMPANY_SIZE_51_200: "51-200",
          WELCOME_PROFILE_COMPANY_SIZE_201_1000: "201-1,000",
          WELCOME_PROFILE_COMPANY_SIZE_1001_PLUS: "1,001+",
          WELCOME_PROFILE_PRODUCT_UPDATES_TITLE: "Subscribe to product update emails",
          WELCOME_PROFILE_PRODUCT_UPDATES_DESC: "Get the latest updates.",
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
          WELCOME_CUSTOMIZE_HEARD_ABOUT_US_QUESTION: "How did you hear about us?",
          WELCOME_CUSTOMIZE_PROGRESS_1: "Question 1 of 3",
          WELCOME_CUSTOMIZE_PROGRESS_2: "Question 2 of 3",
          WELCOME_CUSTOMIZE_PROGRESS_3: "Question 3 of 3",
          WELCOME_CUSTOMIZE_BACK_TO_TEAM_TYPE: "Back to question 1",
          WELCOME_CUSTOMIZE_BACK_TO_GOAL: "Back to question 2",
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
          WELCOME_CUSTOMIZE_HEARD_SEARCH: "Search engine",
          WELCOME_CUSTOMIZE_HEARD_SOCIAL: "Social media",
          WELCOME_CUSTOMIZE_HEARD_REFERRAL: "Friend or colleague",
          WELCOME_CUSTOMIZE_HEARD_COMMUNITY_EVENT: "Community or event",
          WELCOME_CUSTOMIZE_HEARD_ARTICLE_NEWSLETTER: "Article or newsletter",
          WELCOME_CUSTOMIZE_HEARD_AI_DIRECTORY: "AI tool directory",
          WELCOME_CUSTOMIZE_HEARD_AGENCY_CONSULTANT: "Agency or consultant",
          WELCOME_CUSTOMIZE_HEARD_OTHER: "Other",
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
  getMyOnboardingProfileMock.mockReset();
  patchMyOnboardingProfileMock.mockReset();
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
    expect(screen.getByText("Job role (optional)")).toBeInTheDocument();
    expect(screen.getByText("Company size (optional)")).toBeInTheDocument();
    expect(screen.getByText("Subscribe to product update emails")).toBeInTheDocument();
    expect(
      screen.getByRole("switch", { name: "Subscribe to product update emails" }),
    ).toBeChecked();
    expect(screen.queryByText("Language")).not.toBeInTheDocument();
    expect(screen.queryByText("Time zone")).not.toBeInTheDocument();

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
    expect(screen.getByRole("button", { name: "Skip for now" })).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Content team" }));
    expect(screen.getByRole("button", { name: "Skip for now" })).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Manage structured content" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByText("How did you hear about us?");
    expect(screen.getByRole("button", { name: "Skip for now" })).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Friend or colleague" }));
    await user.click(screen.getByRole("button", { name: "Start building" }));

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith({ to: "/", replace: true });
    });
    expect(createMyOnboardingWorkspaceMock).not.toHaveBeenCalled();
    expect(patchCoreSettingsMock).not.toHaveBeenCalled();
    expect(createTeamInvitationMock).not.toHaveBeenCalled();
    expect(patchMyOnboardingProfileMock).not.toHaveBeenCalled();
  });

  it("saves onboarding profile signals on the first real step", async () => {
    searchState.dryRun = undefined;
    listMyWorkspacesMock.mockResolvedValue({
      items: [],
      onboarding: { status: "pending_workspace", workspaceId: null },
    });
    meMock.mockResolvedValue({
      id: "user-1",
      username: "philip",
      email: "philip@example.com",
      displayName: "Philip Cole",
      avatarUrl: null,
      avatarAssetId: null,
      isSuperAdmin: false,
    });
    getMyOnboardingProfileMock.mockResolvedValue({
      jobRole: "content_manager",
      companySize: "11_50",
      subscribedProductUpdates: true,
      heardAboutUs: null,
    });
    updateMyProfileMock.mockResolvedValue({
      id: "user-1",
      username: "philip",
      email: "philip@example.com",
      displayName: "Philip Cole",
      avatarUrl: null,
      avatarAssetId: null,
      isSuperAdmin: false,
    });
    patchMyOnboardingProfileMock.mockResolvedValue({
      jobRole: "content_manager",
      companySize: "11_50",
      subscribedProductUpdates: true,
      heardAboutUs: null,
    });

    renderPage();
    const user = userEvent.setup();

    await screen.findByDisplayValue("Philip Cole");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(patchMyOnboardingProfileMock).toHaveBeenCalledWith({
        job_role: "content_manager",
        company_size: "11_50",
        subscribed_product_updates: true,
      });
    });
    expect(preferenceState.setLocale).not.toHaveBeenCalled();
    expect(preferenceState.setTimeZonePreference).not.toHaveBeenCalled();
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
