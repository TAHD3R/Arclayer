import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

import {
  changePassword,
  confirmRemoveMyPassword,
  getMySecurityCapabilities,
  getTwoFactorStatus,
  requestRemoveMyPassword,
  setMyPassword,
  verifySecurityActionTotp,
} from "@/api/auth";
import { DEFAULT_LOCALE, i18n, initI18n } from "@/lib/i18n";
import { UserProfileAccountSecuritySection } from "@/pages/usercenter/profile/components/profile-account-security-section";
import { UserPasswordSection } from "@/pages/usercenter/profile/components/profile-password-section";

const navigateMock = vi.fn();
const clearAuthMock = vi.fn();
const clearWorkspaceMock = vi.fn();

vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<object>("@tanstack/react-router");
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock("@/api/auth", () => ({
  getMySecurityCapabilities: vi.fn(),
  getTwoFactorStatus: vi.fn(),
  changePassword: vi.fn(),
  setMyPassword: vi.fn(),
  requestRemoveMyPassword: vi.fn(),
  confirmRemoveMyPassword: vi.fn(),
  verifySecurityActionTotp: vi.fn(),
}));

vi.mock("@/stores/use-auth-store", () => ({
  useAuthStore: (selector: (state: { sessionVersion: number; clear: () => void }) => unknown) =>
    selector({ sessionVersion: 1, clear: clearAuthMock }),
}));

vi.mock("@/stores/use-workspace-store", () => ({
  useWorkspaceStore: (selector: (state: { clearWorkspace: () => void }) => unknown) =>
    selector({ clearWorkspace: clearWorkspaceMock }),
}));

vi.mock("@/lib/notifications", () => ({
  notifyError: vi.fn(),
  notifySuccessText: vi.fn(),
}));

vi.mock("@/pages/usercenter/security/components/security-two-factor-section", () => ({
  UserTwoFactorSection: () => <div data-testid="security-2fa" />,
}));

vi.mock("@/pages/usercenter/security/components/security-sessions-section", () => ({
  UserSessionsSection: () => <div data-testid="security-sessions" />,
}));

vi.mock("@arclayer/ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children: ReactElement | ReactElement[] }) => <>{children}</>,
  Tooltip: ({ children }: { children: ReactElement | ReactElement[] }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactElement }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactElement | string }) => <>{children}</>,
}));

const getMySecurityCapabilitiesMock = vi.mocked(getMySecurityCapabilities);
const changePasswordMock = vi.mocked(changePassword);
const setMyPasswordMock = vi.mocked(setMyPassword);
const requestRemoveMyPasswordMock = vi.mocked(requestRemoveMyPassword);
const confirmRemoveMyPasswordMock = vi.mocked(confirmRemoveMyPassword);
const getTwoFactorStatusMock = vi.mocked(getTwoFactorStatus);
const verifySecurityActionTotpMock = vi.mocked(verifySecurityActionTotp);

function renderWithQuery(node: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{node}</QueryClientProvider>);
}

beforeAll(async () => {
  Object.defineProperty(document, "elementFromPoint", {
    writable: true,
    value: vi.fn(() => null),
  });
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
  await initI18n(DEFAULT_LOCALE);
});

beforeEach(() => {
  vi.clearAllMocks();
  navigateMock.mockResolvedValue(undefined);
  getMySecurityCapabilitiesMock.mockResolvedValue({
    hasPassword: true,
    twoFactorEnabled: false,
    hasLinkedOauthIdentities: false,
    setPasswordRequiredReauthMethods: [],
    emailChangeRequiredReauthMethods: ["password"],
  });
  changePasswordMock.mockResolvedValue(null);
  setMyPasswordMock.mockResolvedValue(null);
  requestRemoveMyPasswordMock.mockResolvedValue({ expiresIn: 600, retryAfter: 60 });
  confirmRemoveMyPasswordMock.mockResolvedValue(null);
  getTwoFactorStatusMock.mockResolvedValue({
    enabled: false,
    methods: [],
    backupCodesRemaining: 0,
  });
  verifySecurityActionTotpMock.mockResolvedValue({ proof: "action-proof", expiresIn: 300 });
});

describe("Profile password entry migration", () => {
  it("profile account security section renders email, password, and 2fa without sessions", () => {
    renderWithQuery(
      <UserProfileAccountSecuritySection
        email="tester@example.com"
        redirect="/settings/personal/profile"
      />,
    );

    expect(
      screen.getByRole("button", { name: i18n.t("account:ME_PROFILE_EMAIL_CHANGE") }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("security-2fa")).toBeInTheDocument();
    expect(screen.queryByTestId("security-sessions")).toBeNull();
  });

  it("profile password card shows change-password action for password accounts", async () => {
    renderWithQuery(<UserPasswordSection redirect="/settings/personal/profile" />);
    expect(
      await screen.findByText(i18n.t("account:ME_PROFILE_PASSWORD_DESC_CHANGE")),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("button", {
        name: i18n.t("account:ME_SECURITY_CHANGE_PASSWORD_ACTION"),
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: i18n.t("account:ME_SECURITY_CHANGE_PASSWORD_ACTION") }),
    ).toBeInTheDocument();
  });

  it("disables email change for oauth-linked passwordless accounts", async () => {
    getMySecurityCapabilitiesMock.mockResolvedValue({
      hasPassword: false,
      twoFactorEnabled: false,
      hasLinkedOauthIdentities: true,
      setPasswordRequiredReauthMethods: ["relogin"],
      emailChangeRequiredReauthMethods: ["relogin"],
    });
    getTwoFactorStatusMock.mockResolvedValue({
      enabled: true,
      methods: ["totp", "backup_code"],
      backupCodesRemaining: 8,
    });

    renderWithQuery(
      <UserProfileAccountSecuritySection
        email="tester@example.com"
        redirect="/settings/personal/profile"
      />,
    );

    expect(
      await screen.findByRole("button", {
        name: i18n.t("account:ME_PROFILE_EMAIL_CHANGE"),
      }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: i18n.t("account:ME_PROFILE_EMAIL_CHANGE"),
        }),
      ).toBeDisabled();
    });
    expect(
      screen.getByText(i18n.t("account:ME_PROFILE_EMAIL_CHANGE_DISABLED_OAUTH")),
    ).toBeInTheDocument();
  });

  it("profile password card submits set-password for oauth-only account with 2fa", async () => {
    const user = userEvent.setup();
    getTwoFactorStatusMock.mockResolvedValue({
      enabled: true,
      methods: ["totp", "backup_code"],
      backupCodesRemaining: 8,
    });
    getMySecurityCapabilitiesMock.mockResolvedValue({
      hasPassword: false,
      twoFactorEnabled: true,
      hasLinkedOauthIdentities: true,
      setPasswordRequiredReauthMethods: ["2fa"],
      emailChangeRequiredReauthMethods: ["2fa"],
    });

    renderWithQuery(<UserPasswordSection redirect="/settings/personal/profile" />);
    expect(
      await screen.findByText(i18n.t("account:ME_PROFILE_PASSWORD_DESC_SET_2FA")),
    ).toBeInTheDocument();

    await user.click(
      await screen.findByRole("button", { name: i18n.t("account:ME_PROFILE_SET_PASSWORD_ACTION") }),
    );
    await user.type(screen.getByLabelText(i18n.t("account:ME_SECURITY_NEW_PASSWORD")), "Newpass1");
    await user.type(
      screen.getByLabelText(i18n.t("account:ME_SECURITY_CONFIRM_PASSWORD")),
      "Newpass1",
    );
    await user.click(screen.getByRole("button", { name: i18n.t("settings:SETTINGS_SAVE") }));

    const verifyDialog = await screen.findByRole("dialog", {
      name: i18n.t("account:ME_SECURITY_ACTION_VERIFY_TITLE"),
    });
    await user.type(
      within(verifyDialog).getByLabelText(i18n.t("auth:TWO_FACTOR_CODE_LABEL")),
      "123456",
    );
    await user.click(
      within(verifyDialog).getByRole("button", {
        name: i18n.t("account:ME_SECURITY_ACTION_VERIFY_SUBMIT"),
      }),
    );

    await waitFor(() => {
      expect(verifySecurityActionTotpMock).toHaveBeenCalledWith({
        action: "set_password",
        code: "123456",
      });
      expect(setMyPasswordMock).toHaveBeenCalledWith({
        newPassword: "Newpass1",
        mfaProof: "action-proof",
      });
    });
    expect(changePasswordMock).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(clearAuthMock).toHaveBeenCalled();
      expect(clearWorkspaceMock).toHaveBeenCalled();
      expect(navigateMock).toHaveBeenCalledWith({
        to: "/login",
        search: { redirect: "/settings/personal/profile" },
        replace: true,
      });
    });
  });

  it("password accounts can switch to remove-password verification flow", async () => {
    const user = userEvent.setup();
    renderWithQuery(<UserPasswordSection redirect="/settings/personal/profile" />);

    await user.click(
      await screen.findByRole("button", {
        name: i18n.t("account:ME_SECURITY_CHANGE_PASSWORD_ACTION"),
      }),
    );
    await user.click(
      screen.getByRole("button", { name: i18n.t("account:ME_PROFILE_REMOVE_PASSWORD_ACTION") }),
    );
    await user.type(screen.getByLabelText(i18n.t("account:ME_SECURITY_OLD_PASSWORD")), "oldpass1");
    await user.click(
      screen.getByRole("button", { name: i18n.t("account:ME_PROFILE_REMOVE_PASSWORD_SEND_CODE") }),
    );

    await waitFor(() => {
      expect(requestRemoveMyPasswordMock).toHaveBeenCalledWith({ currentPassword: "oldpass1" });
    });

    await user.type(
      screen.getByLabelText(i18n.t("account:ME_PROFILE_REMOVE_PASSWORD_CODE")),
      "123456",
    );
    await user.click(
      screen.getByRole("button", { name: i18n.t("account:ME_PROFILE_REMOVE_PASSWORD_CONFIRM") }),
    );

    await waitFor(() => {
      expect(confirmRemoveMyPasswordMock).toHaveBeenCalledWith({
        code: "123456",
        mfaProof: undefined,
      });
    });
    await waitFor(() => {
      expect(clearAuthMock).toHaveBeenCalled();
      expect(clearWorkspaceMock).toHaveBeenCalled();
      expect(navigateMock).toHaveBeenCalledWith({
        to: "/login",
        search: { redirect: "/settings/personal/profile" },
        replace: true,
      });
    });
  });
});
