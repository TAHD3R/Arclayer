import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AnchorHTMLAttributes } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LoginPage } from "@/pages/login/page";

type RuntimeState = {
  runtime: Record<string, unknown> | null;
  publicRegisterEnabled: boolean | null;
  instanceSetupStatus: "uninitialized" | "ready" | "repair_required" | null;
  instanceSetupRepairReason: string | null;
};

const {
  navigateMock,
  emailCheckMock,
  loginMock,
  usernameCheckMock,
  bootstrapInstanceMock,
  previewInvitationMock,
  acceptInvitationMock,
  acceptExistingInvitationMock,
  resolvePostAuthRouteMock,
  queryClientClearMock,
  queryClientCancelQueriesMock,
  runtimeState,
  authState,
  workspaceState,
} = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  emailCheckMock: vi.fn(),
  loginMock: vi.fn(),
  usernameCheckMock: vi.fn(),
  bootstrapInstanceMock: vi.fn(),
  previewInvitationMock: vi.fn(),
  acceptInvitationMock: vi.fn(),
  acceptExistingInvitationMock: vi.fn(),
  resolvePostAuthRouteMock: vi.fn(),
  queryClientClearMock: vi.fn(),
  queryClientCancelQueriesMock: vi.fn(),
  runtimeState: {
    runtime: {} as RuntimeState["runtime"],
    publicRegisterEnabled: true as RuntimeState["publicRegisterEnabled"],
    instanceSetupStatus: "uninitialized" as RuntimeState["instanceSetupStatus"],
    instanceSetupRepairReason: null as RuntimeState["instanceSetupRepairReason"],
  },
  authState: {
    applyLogin: vi.fn(),
    keepSession: true,
    refreshToken: null,
    setTokens: vi.fn(),
  },
  workspaceState: {
    lastWorkspaceId: null,
    setCurrentWorkspaceId: vi.fn(),
    setCurrentProjectId: vi.fn(),
  },
}));
let currentSearch: Record<string, unknown> = { mode: "login" };

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigateMock,
  getRouteApi: () => ({ useSearch: () => currentSearch }),
  Link: ({ children, to, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/api/auth", () => ({
  emailCheck: (...args: unknown[]) => emailCheckMock(...args),
  usernameCheck: (...args: unknown[]) => usernameCheckMock(...args),
  login: (...args: unknown[]) => loginMock(...args),
  requestLoginEmailCode: vi.fn(),
  verifyLoginEmailCode: vi.fn(),
  register: vi.fn(),
  resendRegistrationEmailVerification: vi.fn(),
  forgotPassword: vi.fn(),
  refresh: vi.fn(),
  refreshCookie: vi.fn(),
  loginTwoFactor: vi.fn(),
}));

vi.mock("@/api/invitations", () => ({
  previewInvitation: (...args: unknown[]) => previewInvitationMock(...args),
  acceptInvitation: (...args: unknown[]) => acceptInvitationMock(...args),
  acceptExistingInvitation: (...args: unknown[]) => acceptExistingInvitationMock(...args),
}));

vi.mock("@/api/auth-sso", () => ({
  exchangeSSOCode: vi.fn(),
}));

vi.mock("@/api/system", () => ({
  bootstrapInstance: (...args: unknown[]) => bootstrapInstanceMock(...args),
  getSystemRuntime: vi.fn(),
}));

vi.mock("@/components/ui/oauth-buttons", () => ({
  AuthOauthButtons: () => null,
}));

vi.mock("@/hooks/use-system-runtime", () => ({
  useSystemRuntime: () => runtimeState,
}));

vi.mock("@/layouts/auth-layout", () => ({
  useAuthLegalKey: () => ({ setLegalKey: vi.fn() }),
}));

vi.mock("@/lib/routing/post-auth-routing", () => ({
  resolvePostAuthRoute: (...args: unknown[]) => resolvePostAuthRouteMock(...args),
}));

vi.mock("@/lib/notifications", () => ({
  notifyError: vi.fn(),
  notifyErrorText: vi.fn(),
  notifyInfoText: vi.fn(),
  notifySuccessText: vi.fn(),
}));

vi.mock("@/lib/query/query-client-instance", () => ({
  queryClient: {
    clear: queryClientClearMock,
    cancelQueries: queryClientCancelQueriesMock,
  },
}));

vi.mock("@/stores/use-auth-store", () => {
  const useAuthStore = Object.assign(
    (selector: (state: typeof authState) => unknown) => selector(authState),
    {
      getState: () => authState,
    },
  );
  return { useAuthStore };
});

vi.mock("@/stores/use-workspace-store", () => ({
  useWorkspaceStore: (selector: (state: typeof workspaceState) => unknown) =>
    selector(workspaceState),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
  Trans: ({ i18nKey }: { i18nKey: string }) => <span>{i18nKey}</span>,
}));

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <LoginPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });

  currentSearch = { mode: "login" };
  bootstrapInstanceMock.mockReset();
  emailCheckMock.mockReset();
  loginMock.mockReset();
  usernameCheckMock.mockReset();
  previewInvitationMock.mockReset();
  acceptInvitationMock.mockReset();
  acceptExistingInvitationMock.mockReset();
  resolvePostAuthRouteMock.mockReset();
  navigateMock.mockReset();
  authState.applyLogin.mockReset();
  queryClientClearMock.mockReset();
  queryClientCancelQueriesMock.mockReset();
  workspaceState.setCurrentWorkspaceId.mockReset();
  workspaceState.setCurrentProjectId.mockReset();
  runtimeState.runtime = {};
  runtimeState.publicRegisterEnabled = true;
  runtimeState.instanceSetupStatus = "uninitialized";
  runtimeState.instanceSetupRepairReason = null;
  usernameCheckMock.mockResolvedValue({ available: true });
  resolvePostAuthRouteMock.mockResolvedValue({
    path: "/",
    workspaceId: null,
    projectId: null,
    onboardingRequired: false,
  });
});

describe("LoginPage instance entry flow", () => {
  it("shows bootstrap pane when instance is uninitialized", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("auth:INSTANCE_BOOTSTRAP_TITLE")).toBeInTheDocument();
    });
    expect(screen.queryByText("auth:LOGIN_PAGE_TITLE")).not.toBeInTheDocument();
    expect(screen.getByText("auth:LEGAL_CONTINUE")).toBeInTheDocument();
  });

  it("submits bootstrap form and continues with the issued session", async () => {
    emailCheckMock.mockResolvedValueOnce({ exists: false });
    bootstrapInstanceMock.mockResolvedValueOnce({
      access_token: "access-token",
      refresh_token: "refresh-token",
      token_type: "bearer",
      expires_in: 3600,
      refresh_expires_in: 86400,
    });

    renderPage();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("auth:FIELD_EMAIL_LABEL"), "founder@example.com");
    await user.click(screen.getByRole("button", { name: "auth:INSTANCE_BOOTSTRAP_NEXT_BUTTON" }));
    expect(emailCheckMock).toHaveBeenCalledWith({ email: "founder@example.com" });

    await user.type(await screen.findByLabelText("auth:FIELD_DISPLAY_NAME_LABEL"), "Founder");
    await user.type(screen.getByLabelText("auth:FIELD_USERNAME_LABEL"), "founder01");
    await user.type(screen.getByLabelText("auth:FIELD_PASSWORD_LABEL"), "Bootstrap123");
    await waitFor(() => {
      expect(screen.getByText("auth:USERNAME_AVAILABILITY_AVAILABLE")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: "auth:INSTANCE_BOOTSTRAP_BUTTON" }));

    await waitFor(() => {
      expect(bootstrapInstanceMock).toHaveBeenCalledWith({
        username: "founder01",
        email: "founder@example.com",
        password: "Bootstrap123",
        display_name: "Founder",
      });
    });
    expect(authState.applyLogin).toHaveBeenCalledWith(
      expect.objectContaining({ access_token: "access-token" }),
      { keepSession: true },
    );
    expect(queryClientCancelQueriesMock).toHaveBeenCalled();
    expect(queryClientClearMock).toHaveBeenCalled();
    expect(navigateMock).toHaveBeenCalledWith({ to: "/", replace: true });
  });

  it("shows repair pane when instance requires repair", async () => {
    runtimeState.instanceSetupStatus = "repair_required";
    runtimeState.instanceSetupRepairReason = "missing_super_admin";

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("auth:INSTANCE_REPAIR_REQUIRED_TITLE")).toBeInTheDocument();
    });
    expect(screen.getByText("missing_super_admin")).toBeInTheDocument();
    expect(screen.queryByText("auth:LOGIN_PAGE_TITLE")).not.toBeInTheDocument();
    expect(screen.queryByText("auth:LEGAL_CONTINUE")).not.toBeInTheDocument();
  });
});

describe("LoginPage invitation auth flow", () => {
  const invitationPreview = {
    invitation: {
      email: "invited@example.com",
      roleCode: "editor",
      expiresAt: null,
    },
    workspace: { id: "workspace-invite", name: "Invite workspace" },
    role: null,
    inviter: null,
    userExists: false,
  };
  const issuedTokens = {
    access_token: "access-token",
    refresh_token: "refresh-token",
    token_type: "bearer",
    expires_in: 3600,
    refresh_expires_in: 86400,
  };

  beforeEach(() => {
    runtimeState.instanceSetupStatus = "ready";
    runtimeState.publicRegisterEnabled = false;
    previewInvitationMock.mockResolvedValue(invitationPreview);
  });

  it("keeps invitation registration available, locks the bound email, and continues to invitation onboarding", async () => {
    currentSearch = {
      mode: "register",
      invite: "invite-token",
      redirect: "/invitations?token=invite-token",
    };
    emailCheckMock.mockResolvedValue({ exists: false });
    acceptInvitationMock.mockResolvedValue(issuedTokens);
    resolvePostAuthRouteMock.mockResolvedValue({
      path: "/",
      workspaceId: "workspace-invite",
      projectId: "project-invite",
      onboardingRequired: false,
    });

    renderPage();
    const user = userEvent.setup();

    const emailInput = await screen.findByLabelText("auth:FIELD_EMAIL_LABEL");
    await waitFor(() => {
      expect(emailInput).toHaveValue("invited@example.com");
      expect(emailInput).toBeDisabled();
    });
    expect(screen.getByLabelText("auth:FIELD_USERNAME_LABEL")).toBeInTheDocument();

    await user.type(screen.getByLabelText("auth:FIELD_USERNAME_LABEL"), "member01");
    await user.type(screen.getByLabelText("auth:FIELD_PASSWORD_LABEL"), "Invite123");
    await user.click(screen.getByRole("button", { name: "auth:REGISTER_BUTTON" }));

    await waitFor(() => {
      expect(acceptInvitationMock).toHaveBeenCalledWith({
        token: "invite-token",
        email: "invited@example.com",
        username: "member01",
        password: "Invite123",
        confirmPassword: "Invite123",
      });
    });
    expect(authState.applyLogin).toHaveBeenCalledWith(issuedTokens, { keepSession: true });
    expect(navigateMock).toHaveBeenCalledWith({
      to: "/welcome",
      search: {
        mode: "invitation",
        redirect: "/projects/project-invite",
      },
      replace: true,
    });
  });

  it("accepts an existing user's invitation after password login and enters its project", async () => {
    currentSearch = {
      mode: "login",
      invite: "invite-token",
      redirect: "/invitations?token=invite-token",
    };
    previewInvitationMock.mockResolvedValue({ ...invitationPreview, userExists: true });
    emailCheckMock.mockResolvedValue({ exists: true, passwordLoginAvailable: true });
    loginMock.mockResolvedValue(issuedTokens);
    acceptExistingInvitationMock.mockResolvedValue({
      workspaceId: "workspace-invite",
      projectId: "project-invite",
      roleCode: "editor",
    });
    resolvePostAuthRouteMock
      .mockResolvedValueOnce({
        path: "/projects",
        workspaceId: null,
        projectId: null,
        onboardingRequired: false,
      })
      .mockResolvedValueOnce({
        path: "/",
        workspaceId: "workspace-invite",
        projectId: "project-invite",
        onboardingRequired: false,
      });

    renderPage();
    const user = userEvent.setup();

    const emailInput = await screen.findByLabelText("auth:FIELD_EMAIL_LABEL");
    await waitFor(() => {
      expect(emailInput).toHaveValue("invited@example.com");
      expect(emailInput).toBeDisabled();
    });
    await user.type(screen.getByLabelText("auth:FIELD_PASSWORD_LABEL"), "Invite123");
    await user.click(screen.getByRole("button", { name: "auth:LOGIN_BUTTON" }));

    await waitFor(() => {
      expect(acceptExistingInvitationMock).toHaveBeenCalledWith("invite-token");
    });
    expect(workspaceState.setCurrentWorkspaceId).toHaveBeenCalledWith("workspace-invite");
    expect(workspaceState.setCurrentProjectId).toHaveBeenCalledWith("project-invite");
    expect(navigateMock).toHaveBeenCalledWith({
      to: "/projects/project-invite",
      replace: true,
    });
  });
});
