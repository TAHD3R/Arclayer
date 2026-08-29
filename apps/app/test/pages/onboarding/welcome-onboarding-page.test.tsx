import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  AssetUploadCompletionRequiredError,
  createAssetUploadCompletionCheckpoint,
} from "@/lib/assets/upload-completion";
import { WelcomeOnboardingPage } from "@/pages/onboarding/welcome/page";
import { uploadAvatarFile } from "@/pages/usercenter/profile/lib/avatar-upload";

const {
  navigateMock,
  searchState,
  listMyWorkspacesMock,
  createWorkspaceMock,
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
  searchState: {
    dryRun: "1" as "1" | undefined,
    mode: undefined as "create-workspace" | "invitation" | undefined,
    redirect: undefined as string | undefined,
  },
  listMyWorkspacesMock: vi.fn(),
  createWorkspaceMock: vi.fn(),
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
    setCurrentContext: vi.fn(),
  },
  preferenceState: {
    reduceMotion: true,
    locale: "en-US",
    localePreference: null,
    localePreferenceMode: "workspace",
    themeMode: "light",
    themePreference: "light",
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

vi.mock("@/api/workspace-management", () => ({
  createWorkspace: (...args: unknown[]) => createWorkspaceMock(...args),
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
  notifyErrorText: vi.fn(),
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

const translate = (key: string) => {
  const normalized = key.includes(":") ? key.split(":")[1] : key;
  return (
    {
      WELCOME_SIGN_OUT: "Sign Out",
      ACCOUNT_LANGUAGE_SYSTEM_DEFAULT: "System default",
      ACCOUNT_THEME_SYSTEM: "System",
      ACCOUNT_THEME_LIGHT: "Light",
      ACCOUNT_THEME_DARK: "Dark",
      WELCOME_STEP_PROFILE_TITLE: "Let's get to know you!",
      WELCOME_STEP_WORKSPACE_TITLE: "Create your workspace",
      WELCOME_STEP_TEAM_TITLE: "Collaborate with your team",
      WELCOME_STEP_TEAM_DESC: "Invite teammates.",
      WELCOME_STEP_CUSTOMIZE_TITLE: "Help us customize your workspace",
      WELCOME_CONTINUE: "Continue",
      WELCOME_FINAL_CTA: "Start building",
      WELCOME_INVITATION_FINAL_CTA: "Enter workspace",
      WELCOME_PROFILE_DISPLAY_NAME_LABEL: "Display name",
      WELCOME_PROFILE_DISPLAY_NAME_PLACEHOLDER: "Your name",
      WELCOME_PROFILE_DISPLAY_NAME_REQUIRED: "Enter a display name.",
      WELCOME_PROFILE_DISPLAY_NAME_INVALID: "Invalid display name",
      WELCOME_GENERIC_SAVE_ERROR: "We couldn't save this step. Please try again.",
      WELCOME_PROFILE_IDENTITY_TITLE: "Profile identity",
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
      WELCOME_WORKSPACE_IDENTITY_TITLE: "Workspace identity",
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
      WELCOME_CUSTOMIZE_HEARD_ABOUT_US_QUESTION: "How did you hear about us?",
      WELCOME_CUSTOMIZE_PROGRESS_1: "Question 1 of 3",
      WELCOME_CUSTOMIZE_PROGRESS_1_OF_2: "Question 1 of 2",
      WELCOME_CUSTOMIZE_PROGRESS_2: "Question 2 of 3",
      WELCOME_CUSTOMIZE_PROGRESS_2_OF_2: "Question 2 of 2",
      WELCOME_CUSTOMIZE_PROGRESS_3: "Question 3 of 3",
      WELCOME_CUSTOMIZE_SKIP: "Skip for now",
      WELCOME_CUSTOMIZE_TEAM_TYPE_CONTENT: "Content team",
      WELCOME_CUSTOMIZE_TEAM_TYPE_MARKETING: "Marketing team",
      WELCOME_CUSTOMIZE_TEAM_TYPE_AGENCY: "Agency / studio",
      WELCOME_CUSTOMIZE_TEAM_TYPE_DEVELOPER: "Developer team",
      WELCOME_CUSTOMIZE_TEAM_TYPE_FOUNDER: "Founder / operator",
      WELCOME_CUSTOMIZE_TEAM_TYPE_OTHER: "Other",
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
      ME_PROFILE_AVATAR_COMPLETION_ACTION: "Finish upload",
      ME_PROFILE_AVATAR_COMPLETION_PENDING:
        "The avatar file is uploaded and waiting to be added to your account.",
      ME_PROFILE_AVATAR_REMOVE: "Remove avatar",
      ACCOUNT_SETTINGS_LANGUAGE_LABEL: "Language",
      ACCOUNT_SETTINGS_THEME_LABEL: "Theme",
      ME_PREF_LANGUAGE_DESC: "Choose the interface language.",
      ME_PREF_TIMEZONE_TITLE: "Time zone",
      ME_PREF_TIMEZONE_DESC: "Choose the time zone.",
    }[normalized] ?? normalized
  );
};

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: translate,
    i18n: { resolvedLanguage: "en-US", language: "en-US", t: translate },
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
  searchState.mode = undefined;
  searchState.redirect = undefined;
  navigateMock.mockReset();
  listMyWorkspacesMock.mockReset();
  createWorkspaceMock.mockReset();
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
  vi.mocked(uploadAvatarFile).mockReset();
  workspaceState.setCurrentWorkspaceId.mockReset();
  workspaceState.setCurrentProjectId.mockReset();
  workspaceState.setCurrentContext.mockReset();
  preferenceState.setLocale.mockReset();
  preferenceState.setBrowserLocale.mockReset();
  preferenceState.setTimeZonePreference.mockReset();
});

describe("WelcomeOnboardingPage", () => {
  it("walks the dry-run flow without backend mutations", async () => {
    renderPage();
    const user = userEvent.setup();

    expect(screen.getByText("Let's get to know you!")).toBeInTheDocument();
    expect(
      screen.queryByText("Copyright © 2026 Arclayer. All rights reserved."),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Privacy Policy")).not.toBeInTheDocument();
    expect(screen.queryByText("Terms of Service")).not.toBeInTheDocument();
    expect(screen.getByTestId("auth-preferences-bar")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Language" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Theme" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign Out" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Arclayer" })).not.toBeInTheDocument();
    expect(screen.getByTestId("auth-scene-header-after-logo")).toContainElement(
      screen.getByTestId("onboarding-progress-step-1"),
    );
    expect(screen.getByTestId("auth-scene-content").firstElementChild).toHaveClass("max-w-xl");
    expect(screen.getByTestId("auth-scene-content").firstElementChild).not.toHaveClass("max-w-120");
    expect(screen.getByTestId("onboarding-step-copy")).toHaveClass("text-center");
    expect(screen.getByText("Profile identity")).toBeInTheDocument();
    expect(screen.getByText("Job role (optional)")).toBeInTheDocument();
    expect(screen.getByText("Company size (optional)")).toBeInTheDocument();
    expect(screen.getByText("Subscribe to product update emails")).toBeInTheDocument();
    expect(screen.getByTestId("product-updates-title")).toHaveClass(
      "text-headline",
      "text-label-primary",
    );
    expect(screen.getByTestId("product-updates-field").firstElementChild).toBe(
      screen.getByRole("checkbox", { name: "Subscribe to product update emails" }),
    );
    expect(
      screen.getByRole("checkbox", { name: "Subscribe to product update emails" }),
    ).not.toBeChecked();
    expect(screen.queryByText("Language")).not.toBeInTheDocument();
    expect(screen.queryByText("Time zone")).not.toBeInTheDocument();
    expect(screen.getByTestId("onboarding-actions")).toHaveClass("justify-start");
    expect(screen.getByRole("button", { name: "Continue" })).not.toHaveClass("w-full");
    expect(screen.getByTestId("onboarding-progress-step-1")).toHaveAttribute(
      "data-state",
      "active",
    );
    expect(screen.getByTestId("onboarding-progress-step-1")).toHaveClass("h-2", "w-8");
    expect(screen.getByTestId("onboarding-progress-step-1")).toHaveClass("bg-secondary");
    expect(screen.getByTestId("onboarding-progress-step-1")).not.toHaveClass("bg-primary");
    expect(screen.getByTestId("onboarding-progress-step-2")).toHaveAttribute(
      "data-state",
      "inactive",
    );
    expect(screen.getByTestId("onboarding-progress-step-2")).toHaveClass("size-2");
    expect(screen.getByTestId("onboarding-progress-step-2")).toHaveClass("bg-muted-foreground/30");
    expect(screen.getByTestId("onboarding-progress-step-5")).toHaveAttribute(
      "data-step-id",
      "heardAboutUs",
    );
    expect(screen.getByTestId("onboarding-step-transition")).toBeInTheDocument();

    await user.type(await screen.findByLabelText("Display name"), "Philip Cole");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByText("Create your workspace");
    expect(screen.getByText("Workspace identity")).toBeInTheDocument();
    expect(
      within(screen.getByTestId("onboarding-actions")).getByRole("button", { name: "Back" }),
    ).toBeInTheDocument();
    const workspaceNameInput = await screen.findByLabelText("Workspace name");
    expect(workspaceNameInput).toHaveClass("w-full");
    expect(workspaceNameInput).not.toHaveClass("max-w-sm");
    await user.clear(workspaceNameInput);
    await user.type(workspaceNameInput, "Studio Team");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    await screen.findByText("Collaborate with your team");
    expect(screen.getByRole("button", { name: "Invite members" })).not.toHaveClass("w-full");
    await user.type(
      (await screen.findAllByPlaceholderText("example@email.com"))[0],
      "editor@example.com",
    );
    await user.click(screen.getByRole("button", { name: "Invite members" }));

    await screen.findByText("What best describes your team?");
    expect(screen.getByTestId("auth-scene-content").firstElementChild).toHaveClass("max-w-4xl");
    expect(screen.getByTestId("workspace-customization-options")).toHaveClass(
      "sm:grid-cols-2",
      "lg:grid-cols-3",
    );
    expect(screen.getByTestId("team-type-option-content-icon")).toBeInTheDocument();
    expect(screen.getByTestId("team-type-option-marketing-icon")).toBeInTheDocument();
    expect(screen.getByTestId("team-type-option-agency-icon")).toBeInTheDocument();
    expect(screen.getByTestId("team-type-option-developer-icon")).toBeInTheDocument();
    expect(screen.getByTestId("team-type-option-founder-icon")).toBeInTheDocument();
    expect(screen.getByTestId("team-type-option-other-icon")).toBeInTheDocument();
    expect(screen.getByText("Question 1 of 2")).toBeInTheDocument();
    expect(screen.queryByText("Help us customize your workspace")).not.toBeInTheDocument();
    expect(screen.queryByText("What do you want to set up first?")).not.toBeInTheDocument();
    expect(screen.queryByText("Back to question 1")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Skip for now" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Skip for now" })).not.toHaveClass("w-full");
    await user.click(await screen.findByRole("button", { name: "Content team" }));
    expect(screen.getByText("What best describes your team?")).toBeInTheDocument();
    expect(screen.queryByText("Manage structured content")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toHaveClass("hover:bg-accent");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("button", { name: "Skip for now" })).toBeInTheDocument();
    await screen.findByText("How did you hear about us?");
    expect(screen.getByTestId("workspace-customization-options")).toHaveClass(
      "sm:grid-cols-2",
      "lg:grid-cols-4",
    );
    expect(screen.getByText("Question 2 of 2")).toBeInTheDocument();
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
  }, 10000);

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
      subscribedProductUpdates: false,
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
    const patchDeferred: { resolve?: (value: unknown) => void } = {};
    patchMyOnboardingProfileMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          patchDeferred.resolve = resolve;
        }),
    );

    renderPage();
    const user = userEvent.setup();

    await screen.findByDisplayValue("Philip Cole");
    const continueButton = screen.getByRole("button", { name: "Continue" });
    await user.click(continueButton);

    await waitFor(() => {
      expect(continueButton).toHaveAttribute("aria-busy", "true");
    });
    expect(continueButton).toHaveClass("relative");
    expect(continueButton.querySelector(".invisible")).toHaveTextContent("Continue");
    expect(continueButton.querySelector('[role="status"]')).toBeInTheDocument();
    patchDeferred.resolve?.({
      jobRole: "content_manager",
      companySize: "11_50",
      subscribedProductUpdates: false,
      heardAboutUs: null,
    });

    await waitFor(() => {
      expect(patchMyOnboardingProfileMock).toHaveBeenCalledWith({
        jobRole: "content_manager",
        companySize: "11_50",
        subscribedProductUpdates: false,
      });
    });
    expect(preferenceState.setLocale).not.toHaveBeenCalled();
    expect(preferenceState.setTimeZonePreference).not.toHaveBeenCalled();
  });

  it("does not expose backend errors when a step cannot be saved", async () => {
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
      jobRole: null,
      companySize: null,
      subscribedProductUpdates: false,
      heardAboutUs: null,
    });
    updateMyProfileMock.mockRejectedValue(new Error("database connection reset by peer"));

    renderPage();
    const user = userEvent.setup();
    await screen.findByDisplayValue("Philip Cole");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(
      await screen.findByText("We couldn't save this step. Please try again."),
    ).toBeInTheDocument();
    expect(screen.queryByText("database connection reset by peer")).not.toBeInTheDocument();
  });

  it("keeps the avatar completion checkpoint on the profile step until the user finishes it", async () => {
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
      jobRole: null,
      companySize: null,
      subscribedProductUpdates: false,
      heardAboutUs: null,
    });
    const complete = vi.fn().mockResolvedValue("avatar-asset");
    const checkpoint = createAssetUploadCompletionCheckpoint({
      uploadId: "upload-onboarding",
      complete,
    });
    vi.mocked(uploadAvatarFile).mockRejectedValue(
      new AssetUploadCompletionRequiredError(checkpoint, new Error("commit failed")),
    );
    updateMyProfileMock.mockResolvedValue({
      id: "user-1",
      username: "philip",
      email: "philip@example.com",
      displayName: "Philip Cole",
      avatarUrl: "/assets/avatar-asset",
      avatarAssetId: "avatar-asset",
      isSuperAdmin: false,
    });

    renderPage();
    const user = userEvent.setup();
    await screen.findByDisplayValue("Philip Cole");

    await user.upload(
      screen.getByLabelText("Change avatar", { selector: "input" }),
      new File(["avatar"], "avatar.png", { type: "image/png" }),
    );

    const completionStatus = await screen.findByText(
      "The avatar file is uploaded and waiting to be added to your account.",
    );
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();

    const statusRegion = completionStatus.closest<HTMLElement>('[role="status"]');
    expect.assert(statusRegion);
    await user.click(
      within(statusRegion).getByRole("button", {
        name: "Finish upload",
      }),
    );

    await waitFor(() => {
      expect(complete).toHaveBeenCalledTimes(1);
      expect(updateMyProfileMock).toHaveBeenCalledWith({ avatar_asset_id: "avatar-asset" });
      expect(
        screen.queryByText("The avatar file is uploaded and waiting to be added to your account."),
      ).not.toBeInTheDocument();
    });
    expect(uploadAvatarFile).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
  });

  it("preserves an existing product update subscription from the backend", async () => {
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

    expect(
      await screen.findByRole("checkbox", { name: "Subscribe to product update emails" }),
    ).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(patchMyOnboardingProfileMock).toHaveBeenCalledWith({
        jobRole: "content_manager",
        companySize: "11_50",
        subscribedProductUpdates: true,
      });
    });
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

  it("runs the create-workspace flow without the profile step and switches context on completion", async () => {
    searchState.dryRun = undefined;
    searchState.mode = "create-workspace";
    meMock.mockResolvedValue({
      id: "user-1",
      username: "philip",
      email: "philip@example.com",
      displayName: "Philip Cole",
      avatarUrl: null,
      avatarAssetId: null,
      isSuperAdmin: false,
    });
    createWorkspaceMock.mockResolvedValue({
      workspaceId: "ws-created",
      name: "Studio Team",
    });
    patchWorkspaceDetailMock.mockResolvedValue({ id: "ws-created", name: "Studio Team" });
    patchWorkspaceRolePolicyMock.mockResolvedValue({ defaultRoleCode: "editor" });
    patchCoreSettingsMock.mockResolvedValue({});
    listWorkspaceRolesMock.mockResolvedValue({
      items: [
        { code: "admin", name: "Admin" },
        { code: "editor", name: "Editor" },
      ],
    });
    patchMyOnboardingProfileMock.mockResolvedValue({
      heardAboutUs: "referral",
    });

    renderPage();
    const user = userEvent.setup();

    expect(await screen.findByText("Create your workspace")).toBeInTheDocument();
    expect(screen.queryByText("Let's get to know you!")).not.toBeInTheDocument();
    expect(screen.getByTestId("auth-scene-header-leading")).toContainElement(
      screen.getByRole("button", { name: "Back" }),
    );
    expect(screen.getByTestId("onboarding-progress-step-1")).toHaveAttribute(
      "data-step-id",
      "workspace",
    );
    expect(screen.getByTestId("onboarding-progress-step-4")).toHaveAttribute(
      "data-step-id",
      "heardAboutUs",
    );
    expect(await screen.findByLabelText("Workspace name")).toHaveValue("");

    await user.type(await screen.findByLabelText("Workspace name"), "Studio Team");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(createWorkspaceMock).toHaveBeenCalledTimes(1);
    });
    expect(createMyOnboardingWorkspaceMock).not.toHaveBeenCalled();

    await screen.findByText("Collaborate with your team");
    await user.click(screen.getByRole("button", { name: "Skip for now" }));
    await screen.findByText("What best describes your team?");
    await user.click(screen.getByRole("button", { name: "Content team" }));
    expect(screen.getByText("What best describes your team?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByText("How did you hear about us?");
    await user.click(screen.getByRole("button", { name: "Friend or colleague" }));
    await user.click(screen.getByRole("button", { name: "Start building" }));

    await waitFor(() => {
      expect(workspaceState.setCurrentContext).toHaveBeenCalledWith({
        workspaceId: "ws-created",
        projectId: null,
      });
      expect(navigateMock).toHaveBeenCalledWith({
        to: "/projects",
        replace: true,
        viewTransition: true,
      });
    });
    expect(createWorkspaceMock).toHaveBeenCalledTimes(1);
    expect(patchMyOnboardingProfileMock).toHaveBeenCalledWith({ heardAboutUs: "referral" });
  });

  it("runs the invitation profile and survey flow before entering the invited project", async () => {
    searchState.dryRun = undefined;
    searchState.mode = "invitation";
    searchState.redirect = "/projects/project-invite";
    listMyWorkspacesMock.mockResolvedValue({
      items: [
        {
          workspaceId: "workspace-invite",
          projectId: "project-invite",
          name: "Invite workspace",
        },
      ],
      onboarding: { status: "completed", workspaceId: "workspace-invite" },
    });
    meMock.mockResolvedValue({
      id: "user-1",
      username: "member01",
      email: "invited@example.com",
      displayName: "Invited member",
      avatarUrl: null,
      avatarAssetId: null,
      isSuperAdmin: false,
    });
    getMyOnboardingProfileMock.mockResolvedValue({
      jobRole: null,
      companySize: null,
      subscribedProductUpdates: false,
      heardAboutUs: null,
    });
    updateMyProfileMock.mockResolvedValue({
      id: "user-1",
      username: "member01",
      email: "invited@example.com",
      displayName: "Invited member",
      avatarUrl: null,
      avatarAssetId: null,
      isSuperAdmin: false,
    });
    patchMyOnboardingProfileMock.mockResolvedValue({});

    renderPage();
    const user = userEvent.setup();

    expect(await screen.findByDisplayValue("Invited member")).toBeInTheDocument();
    expect(screen.getByTestId("onboarding-progress-step-1")).toHaveAttribute(
      "data-step-id",
      "profile",
    );
    expect(screen.getByTestId("onboarding-progress-step-2")).toHaveAttribute(
      "data-step-id",
      "teamType",
    );
    expect(screen.getByTestId("onboarding-progress-step-3")).toHaveAttribute(
      "data-step-id",
      "heardAboutUs",
    );
    expect(screen.queryByText("Create your workspace")).not.toBeInTheDocument();
    expect(screen.queryByText("Collaborate with your team")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByText("What best describes your team?");
    await user.click(screen.getByRole("button", { name: "Content team" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByText("How did you hear about us?");
    await user.click(screen.getByRole("button", { name: "Friend or colleague" }));
    await user.click(screen.getByRole("button", { name: "Enter workspace" }));

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith({
        to: "/projects/project-invite",
        replace: true,
        viewTransition: true,
      });
    });
    expect(createWorkspaceMock).not.toHaveBeenCalled();
    expect(createMyOnboardingWorkspaceMock).not.toHaveBeenCalled();
    expect(createTeamInvitationMock).not.toHaveBeenCalled();
    expect(patchMyOnboardingProfileMock).toHaveBeenLastCalledWith({
      heardAboutUs: "referral",
    });
  });

  it("goes back in browser history from the first create-workspace step", async () => {
    searchState.dryRun = undefined;
    searchState.mode = "create-workspace";
    meMock.mockResolvedValue({
      id: "user-1",
      username: "philip",
      email: "philip@example.com",
      displayName: "Philip Cole",
      avatarUrl: null,
      avatarAssetId: null,
      isSuperAdmin: false,
    });
    listWorkspaceRolesMock.mockResolvedValue({ items: [] });
    const historyBackSpy = vi.spyOn(window.history, "back").mockImplementation(() => undefined);

    renderPage();
    const user = userEvent.setup();

    expect(await screen.findByText("Create your workspace")).toBeInTheDocument();
    const backButton = screen.getByRole("button", { name: "Back" });
    expect(screen.getByTestId("auth-scene-header-leading")).toContainElement(backButton);
    expect(backButton.parentElement).not.toHaveClass("-left-12");
    await user.click(backButton);

    expect(historyBackSpy).toHaveBeenCalledTimes(1);
    expect(navigateMock).not.toHaveBeenCalled();
    historyBackSpy.mockRestore();
  });
});
