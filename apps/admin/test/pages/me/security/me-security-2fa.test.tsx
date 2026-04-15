import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

import {
  beginTwoFactorSetup,
  confirmTwoFactorSetup,
  disableTwoFactor,
  getTwoFactorCapabilities,
  getTwoFactorStatus,
  regenerateTwoFactorBackupCodes,
} from "@/api/auth";
import { DEFAULT_LOCALE, i18n, initI18n } from "@/lib/i18n";
import { UserTwoFactorSection } from "@/pages/usercenter/security/components/security-two-factor-section";

vi.mock("@/api/auth", () => ({
  getTwoFactorStatus: vi.fn(),
  getTwoFactorCapabilities: vi.fn(),
  beginTwoFactorSetup: vi.fn(),
  confirmTwoFactorSetup: vi.fn(),
  disableTwoFactor: vi.fn(),
  regenerateTwoFactorBackupCodes: vi.fn(),
}));

vi.mock("@/lib/notifications", () => ({
  notifyError: vi.fn(),
  notifySuccessText: vi.fn(),
}));

vi.mock("@arclayer/ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children: ReactElement | ReactElement[] }) => <>{children}</>,
  Tooltip: ({ children }: { children: ReactElement | ReactElement[] }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactElement }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactElement | string }) => <>{children}</>,
}));

const getTwoFactorStatusMock = vi.mocked(getTwoFactorStatus);
const getTwoFactorCapabilitiesMock = vi.mocked(getTwoFactorCapabilities);
const beginTwoFactorSetupMock = vi.mocked(beginTwoFactorSetup);
const confirmTwoFactorSetupMock = vi.mocked(confirmTwoFactorSetup);
const disableTwoFactorMock = vi.mocked(disableTwoFactor);
const regenerateTwoFactorBackupCodesMock = vi.mocked(regenerateTwoFactorBackupCodes);

function renderWithQuery(node: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{node}</QueryClientProvider>);
}

beforeAll(async () => {
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    writable: true,
    value: vi.fn(() => ({
      fillRect: vi.fn(),
      clearRect: vi.fn(),
      getImageData: vi.fn(() => ({ data: [] })),
      putImageData: vi.fn(),
      createImageData: vi.fn(),
      setTransform: vi.fn(),
      drawImage: vi.fn(),
      save: vi.fn(),
      fillText: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      stroke: vi.fn(),
      translate: vi.fn(),
      scale: vi.fn(),
      rotate: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      measureText: vi.fn(() => ({ width: 0 })),
      transform: vi.fn(),
      rect: vi.fn(),
      clip: vi.fn(),
    })),
  });
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
});

describe("UserTwoFactorSection", () => {
  it("shows not configured tag and starts setup flow", async () => {
    const user = userEvent.setup();
    getTwoFactorStatusMock.mockResolvedValue({ enabled: false, backupCodesRemaining: 0 });
    getTwoFactorCapabilitiesMock.mockResolvedValue({
      enabled: false,
      canSetup: true,
      setupRequiredReauthMethods: ["password"],
      disableRequiredReauthMethods: [],
      regenerateBackupCodesRequiredReauthMethods: [],
      hasPassword: true,
    });
    beginTwoFactorSetupMock.mockResolvedValue({
      secret: "SECRET-123",
      otpauthUri: "otpauth://totp/Arclayer?secret=SECRET-123",
    });

    renderWithQuery(<UserTwoFactorSection />);

    expect(
      await screen.findByText(i18n.t("account:ME_SECURITY_2FA_DISABLED_DESC")),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: i18n.t("account:ME_SECURITY_2FA_ENABLE") }),
    );

    const dialog = await screen.findByRole("dialog");
    const dialogScope = within(dialog);
    await user.type(
      dialogScope.getByLabelText(i18n.t("account:ME_SECURITY_2FA_SETUP_PASSWORD")),
      "secret-pass",
    );
    await user.click(
      dialogScope.getByRole("button", {
        name: i18n.t("account:ME_SECURITY_2FA_SETUP_CONTINUE"),
      }),
    );

    await waitFor(() => {
      expect(beginTwoFactorSetupMock).toHaveBeenCalledWith({ password: "secret-pass" });
    });
    expect(await dialogScope.findByText("SECRET-123")).toBeInTheDocument();
    expect(dialogScope.getByLabelText(i18n.t("auth:TWO_FACTOR_CODE_LABEL"))).toBeInTheDocument();
  });

  it("shows backup codes once after setup confirm", async () => {
    const user = userEvent.setup();
    getTwoFactorStatusMock.mockResolvedValue({ enabled: false, backupCodesRemaining: 0 });
    getTwoFactorCapabilitiesMock.mockResolvedValue({
      enabled: false,
      canSetup: true,
      setupRequiredReauthMethods: ["password"],
      disableRequiredReauthMethods: [],
      regenerateBackupCodesRequiredReauthMethods: [],
      hasPassword: true,
    });
    beginTwoFactorSetupMock.mockResolvedValue({
      secret: "SECRET-123",
      otpauthUri: "otpauth://totp/Arclayer?secret=SECRET-123",
    });
    confirmTwoFactorSetupMock.mockResolvedValue({ backupCodes: ["ABCD-1234"] });

    renderWithQuery(<UserTwoFactorSection />);

    await user.click(
      await screen.findByRole("button", { name: i18n.t("account:ME_SECURITY_2FA_ENABLE") }),
    );
    const dialog = await screen.findByRole("dialog");
    const dialogScope = within(dialog);
    await user.type(
      dialogScope.getByLabelText(i18n.t("account:ME_SECURITY_2FA_SETUP_PASSWORD")),
      "secret-pass",
    );
    await user.click(
      dialogScope.getByRole("button", {
        name: i18n.t("account:ME_SECURITY_2FA_SETUP_CONTINUE"),
      }),
    );
    await dialogScope.findByText("SECRET-123");
    await user.type(dialogScope.getByLabelText(i18n.t("auth:TWO_FACTOR_CODE_LABEL")), "123456");
    await user.click(
      dialogScope.getByRole("button", {
        name: i18n.t("account:ME_SECURITY_2FA_SETUP_CONFIRM"),
      }),
    );

    await waitFor(() => {
      expect(confirmTwoFactorSetupMock).toHaveBeenCalledWith({ code: "123456" });
    });
    expect(await dialogScope.findByText("ABCD-1234")).toBeInTheDocument();
    expect(
      dialogScope.getByRole("button", {
        name: i18n.t("account:ME_SECURITY_2FA_BACKUP_CODES_ACK"),
      }),
    ).toBeInTheDocument();
  });

  it("submits regenerate and disable actions with reauth inputs", async () => {
    const user = userEvent.setup();
    getTwoFactorStatusMock.mockResolvedValue({ enabled: true, backupCodesRemaining: 8 });
    getTwoFactorCapabilitiesMock.mockResolvedValue({
      enabled: true,
      canSetup: false,
      setupRequiredReauthMethods: [],
      disableRequiredReauthMethods: ["totp", "backup_code"],
      regenerateBackupCodesRequiredReauthMethods: ["totp", "backup_code"],
      hasPassword: true,
    });
    regenerateTwoFactorBackupCodesMock.mockResolvedValue({ backupCodes: ["WXYZ-9999"] });
    disableTwoFactorMock.mockResolvedValue(null);

    renderWithQuery(<UserTwoFactorSection />);

    expect(
      await screen.findByText(i18n.t("account:ME_SECURITY_2FA_ENABLED_DESC")),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: i18n.t("account:ME_SECURITY_2FA_REGENERATE") }),
    );
    let dialog = await screen.findByRole("dialog");
    let dialogScope = within(dialog);
    await user.type(
      dialogScope.getByLabelText(i18n.t("auth:TWO_FACTOR_BACKUP_CODE_LABEL")),
      "ABCD-EFGH",
    );
    await user.click(
      dialogScope.getByRole("button", { name: i18n.t("account:ME_SECURITY_2FA_REGENERATE") }),
    );

    await waitFor(() => {
      expect(regenerateTwoFactorBackupCodesMock).toHaveBeenCalledWith({ backupCode: "ABCD-EFGH" });
    });
    expect(await dialogScope.findByText("WXYZ-9999")).toBeInTheDocument();
    await user.click(
      dialogScope.getByRole("button", {
        name: i18n.t("account:ME_SECURITY_2FA_BACKUP_CODES_ACK"),
      }),
    );

    const disableButton = await screen.findByRole("button", {
      name: i18n.t("account:ME_SECURITY_2FA_DISABLE"),
      hidden: true,
    });
    await waitFor(() => {
      expect(disableButton).toBeEnabled();
    });
    fireEvent.click(disableButton);
    dialog = await screen.findByRole("dialog");
    dialogScope = within(dialog);
    await user.type(dialogScope.getByLabelText(i18n.t("auth:TWO_FACTOR_CODE_LABEL")), "654321");
    await user.click(
      dialogScope.getByRole("button", { name: i18n.t("account:ME_SECURITY_2FA_DISABLE") }),
    );

    await waitFor(() => {
      expect(disableTwoFactorMock).toHaveBeenCalledWith({ code: "654321" });
    });
  });

  it("disables setup when the account has no password", async () => {
    getTwoFactorStatusMock.mockResolvedValue({ enabled: false, backupCodesRemaining: 0 });
    getTwoFactorCapabilitiesMock.mockResolvedValue({
      enabled: false,
      canSetup: false,
      setupRequiredReauthMethods: ["relogin"],
      disableRequiredReauthMethods: [],
      regenerateBackupCodesRequiredReauthMethods: [],
      hasPassword: false,
    });

    renderWithQuery(<UserTwoFactorSection />);

    expect(
      await screen.findByRole("button", {
        name: i18n.t("account:ME_SECURITY_2FA_ENABLE"),
      }),
    ).toBeDisabled();
  });
});
