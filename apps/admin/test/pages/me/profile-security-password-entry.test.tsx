import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

import { changePassword, getMySecurityCapabilities, setMyPassword } from "@/api/auth";
import { DEFAULT_LOCALE, i18n, initI18n } from "@/lib/i18n";
import { MeProfilePasswordSection } from "@/pages/me/profile/components/profile-password-section";
import { MeSecurityView } from "@/pages/me/security/components/me-security-view";

vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<object>("@tanstack/react-router");
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  };
});

vi.mock("@/api/auth", () => ({
  getMySecurityCapabilities: vi.fn(),
  changePassword: vi.fn(),
  setMyPassword: vi.fn(),
}));

vi.mock("@/stores/use-auth-store", () => ({
  useAuthStore: (selector: (state: { sessionVersion: number }) => unknown) =>
    selector({ sessionVersion: 1 }),
}));

vi.mock("@/lib/notifications", () => ({
  notifyError: vi.fn(),
  notifySuccessText: vi.fn(),
}));

vi.mock("@/pages/me/security/components/security-two-factor-section", () => ({
  MeSecurityTwoFactorSection: () => <div data-testid="security-2fa" />,
}));

vi.mock("@/pages/me/security/components/security-sessions-section", () => ({
  MeSecuritySessionsSection: () => <div data-testid="security-sessions" />,
}));

vi.mock("@celestial/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactElement | ReactElement[] }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactElement }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactElement | string }) => <>{children}</>,
}));

const getMySecurityCapabilitiesMock = vi.mocked(getMySecurityCapabilities);
const changePasswordMock = vi.mocked(changePassword);
const setMyPasswordMock = vi.mocked(setMyPassword);

function renderWithQuery(node: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{node}</QueryClientProvider>);
}

beforeAll(async () => {
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
  getMySecurityCapabilitiesMock.mockResolvedValue({
    hasPassword: true,
    twoFactorEnabled: false,
    setPasswordRequiredReauthMethods: [],
    emailChangeRequiredReauthMethods: ["password"],
  });
  changePasswordMock.mockResolvedValue(null);
  setMyPasswordMock.mockResolvedValue(null);
});

describe("Profile password entry migration", () => {
  it("security tab should no longer render change-password card", () => {
    renderWithQuery(<MeSecurityView mode="dialog" />);
    expect(
      screen.queryByText(i18n.t("account:ME_SECURITY_CHANGE_PASSWORD_TITLE")),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("security-2fa")).toBeInTheDocument();
  });

  it("profile password card shows change-password action for password accounts", async () => {
    renderWithQuery(<MeProfilePasswordSection redirect="/me/profile" />);
    expect(
      await screen.findByRole("button", {
        name: i18n.t("account:ME_SECURITY_CHANGE_PASSWORD_ACTION"),
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: i18n.t("account:ME_SECURITY_CHANGE_PASSWORD_ACTION") }),
    ).toBeInTheDocument();
  });

  it("profile password card submits set-password for oauth-only account with 2fa", async () => {
    const user = userEvent.setup();
    getMySecurityCapabilitiesMock.mockResolvedValue({
      hasPassword: false,
      twoFactorEnabled: true,
      setPasswordRequiredReauthMethods: ["2fa"],
      emailChangeRequiredReauthMethods: ["2fa"],
    });

    renderWithQuery(<MeProfilePasswordSection redirect="/me/profile" />);

    await user.click(
      await screen.findByRole("button", { name: i18n.t("account:ME_PROFILE_SET_PASSWORD_ACTION") }),
    );
    await user.type(screen.getByLabelText(i18n.t("account:ME_SECURITY_NEW_PASSWORD")), "newpass1");
    await user.type(
      screen.getByLabelText(i18n.t("account:ME_SECURITY_CONFIRM_PASSWORD")),
      "newpass1",
    );
    await user.type(
      screen.getByLabelText(i18n.t("account:ME_PROFILE_PASSWORD_2FA_CODE")),
      "123456",
    );
    await user.click(screen.getByRole("button", { name: i18n.t("settings:SETTINGS_SAVE") }));

    await waitFor(() => {
      expect(setMyPasswordMock).toHaveBeenCalledWith({ new_password: "newpass1", code: "123456" });
    });
    expect(changePasswordMock).not.toHaveBeenCalled();
  });
});
