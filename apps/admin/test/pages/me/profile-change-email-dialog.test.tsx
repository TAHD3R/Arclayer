import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

import { confirmMyEmailChange, getMySecurityCapabilities, requestMyEmailChange } from "@/api/auth";
import { DEFAULT_LOCALE, i18n, initI18n } from "@/lib/i18n";
import { MeProfileChangeEmailDialog } from "@/pages/me/profile/components/profile-change-email-dialog";

const navigateMock = vi.fn();

vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<object>("@tanstack/react-router");
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock("@/api/auth", () => ({
  getMySecurityCapabilities: vi.fn(),
  requestMyEmailChange: vi.fn(),
  confirmMyEmailChange: vi.fn(),
}));

vi.mock("@/stores/use-auth-store", () => ({
  useAuthStore: (selector: (state: { sessionVersion: number }) => unknown) =>
    selector({ sessionVersion: 1 }),
}));

vi.mock("@/lib/notifications", () => ({
  notifyError: vi.fn(),
  notifySuccessText: vi.fn(),
}));

const getMySecurityCapabilitiesMock = vi.mocked(getMySecurityCapabilities);
const requestMyEmailChangeMock = vi.mocked(requestMyEmailChange);
const confirmMyEmailChangeMock = vi.mocked(confirmMyEmailChange);

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
  requestMyEmailChangeMock.mockResolvedValue({ expires_in: 600 });
  confirmMyEmailChangeMock.mockResolvedValue({
    id: "u-1",
    username: "demo",
    email: "new@example.com",
    displayName: "Demo",
    avatarUrl: null,
    avatarAssetId: null,
    isSuperAdmin: false,
  });
});

describe("MeProfileChangeEmailDialog", () => {
  function renderDialog() {
    return renderWithQuery(
      <MeProfileChangeEmailDialog
        open
        onOpenChange={vi.fn()}
        nextEmail="old@example.com"
        redirect="/me/profile"
      />,
    );
  }

  it("password account should submit password reauth", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.clear(screen.getByLabelText(i18n.t("account:ME_PROFILE_EMAIL_NEW_EMAIL")));
    await user.type(
      screen.getByLabelText(i18n.t("account:ME_PROFILE_EMAIL_NEW_EMAIL")),
      "new@example.com",
    );
    await user.type(screen.getByLabelText(i18n.t("account:ME_PROFILE_EMAIL_CODE")), "654321");
    await user.type(screen.getByLabelText(i18n.t("account:ME_PROFILE_EMAIL_PASSWORD")), "oldpass1");
    await user.click(screen.getByRole("button", { name: i18n.t("settings:SETTINGS_SAVE") }));

    await waitFor(() => {
      expect(confirmMyEmailChangeMock).toHaveBeenCalledWith({
        new_email: "new@example.com",
        code: "654321",
        password: "oldpass1",
      });
    });
    expect(
      screen.getByText(i18n.t("account:ME_PROFILE_EMAIL_FORGOT_PASSWORD")),
    ).toBeInTheDocument();
  });

  it("oauth+2fa account should submit 2fa reauth payload", async () => {
    const user = userEvent.setup();
    getMySecurityCapabilitiesMock.mockResolvedValue({
      hasPassword: false,
      twoFactorEnabled: true,
      setPasswordRequiredReauthMethods: ["2fa"],
      emailChangeRequiredReauthMethods: ["2fa"],
    });
    renderDialog();

    await user.clear(screen.getByLabelText(i18n.t("account:ME_PROFILE_EMAIL_NEW_EMAIL")));
    await user.type(
      screen.getByLabelText(i18n.t("account:ME_PROFILE_EMAIL_NEW_EMAIL")),
      "new@example.com",
    );
    await user.type(screen.getByLabelText(i18n.t("account:ME_PROFILE_EMAIL_CODE")), "654321");
    await user.type(screen.getByLabelText(i18n.t("account:ME_PROFILE_EMAIL_2FA_CODE")), "123456");
    await user.click(screen.getByRole("button", { name: i18n.t("settings:SETTINGS_SAVE") }));

    await waitFor(() => {
      expect(confirmMyEmailChangeMock).toHaveBeenCalledWith({
        new_email: "new@example.com",
        code: "654321",
        two_factor_code: "123456",
      });
    });
  });

  it("oauth account requiring relogin should navigate to login", async () => {
    const user = userEvent.setup();
    getMySecurityCapabilitiesMock.mockResolvedValue({
      hasPassword: false,
      twoFactorEnabled: false,
      setPasswordRequiredReauthMethods: ["relogin"],
      emailChangeRequiredReauthMethods: ["relogin"],
    });
    renderDialog();

    const reloginButton = await screen.findByRole("button", {
      name: i18n.t("account:ME_PROFILE_EMAIL_RELOGIN_ACTION"),
    });
    expect(
      screen.getByText(i18n.t("account:ME_PROFILE_EMAIL_RELOGIN_REQUIRED")),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: i18n.t("settings:SETTINGS_SAVE") })).toBeDisabled();

    await user.click(reloginButton);
    expect(navigateMock).toHaveBeenCalledWith({
      to: "/login",
      search: { redirect: "/me/profile" },
      replace: true,
    });
  });
});
