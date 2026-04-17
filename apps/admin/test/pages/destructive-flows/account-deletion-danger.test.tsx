import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

import { DEFAULT_LOCALE, i18n, initI18n } from "@/lib/i18n";
import { UserDangerSection } from "@/pages/usercenter/profile/components/profile-danger-section";
import { useAuthStore } from "@/stores/use-auth-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import { TooltipProvider } from "@arclayer/ui/tooltip";

const navigateMock = vi.fn().mockResolvedValue(undefined);
const getDeleteMyAccountCapabilitiesMock = vi.fn();
const deleteMyAccountMock = vi.fn();

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock("@/api/auth", () => ({
  getDeleteMyAccountCapabilities: (...args: unknown[]) =>
    getDeleteMyAccountCapabilitiesMock(...args),
  deleteMyAccount: (...args: unknown[]) => deleteMyAccountMock(...args),
}));

function renderWithQuery(node: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>{node}</TooltipProvider>
    </QueryClientProvider>,
  );
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
  useAuthStore.setState({
    keepSession: true,
    sessionVersion: 1,
    accessToken: "token",
    refreshToken: "refresh",
    tokenType: "bearer",
    expiresIn: 3600,
    refreshExpiresIn: 86400,
  });
  useWorkspaceStore.setState({ currentWorkspaceId: "ws-current", lastWorkspaceId: "ws-current" });
});

describe("account deletion danger flow", () => {
  it("shows the blocked reason as a tooltip on the delete action", async () => {
    getDeleteMyAccountCapabilitiesMock.mockResolvedValue({
      email: "demo@example.com",
      canDelete: false,
      blockedReason: "ACCOUNT_DELETE_LAST_ORG_OWNER",
      requiredReauthMethods: ["relogin"],
      hasPassword: false,
      twoFactorEnabled: false,
      hasLinkedOauthIdentities: true,
    });

    renderWithQuery(
      <UserDangerSection email="demo@example.com" redirect="/settings/personal/profile" />,
    );

    const action = await screen.findByRole("button", {
      name: i18n.t("account:ME_DELETE_ACCOUNT_ACTION"),
    });
    await waitFor(() => {
      expect(getDeleteMyAccountCapabilitiesMock).toHaveBeenCalled();
      expect(screen.getByTestId("delete-account-tooltip-trigger")).toBeInTheDocument();
    });
    expect(action).toHaveAttribute("aria-disabled", "true");
    expect(
      screen.queryByText(i18n.t("errors:ACCOUNT_DELETE_LAST_ORG_OWNER")),
    ).not.toBeInTheDocument();

    const trigger = screen.getByTestId("delete-account-tooltip-trigger");
    fireEvent.mouseEnter(trigger);
    fireEvent.mouseOver(trigger);

    await waitFor(() => {
      expect(screen.getByText(i18n.t("errors:ACCOUNT_DELETE_LAST_ORG_OWNER"))).toBeInTheDocument();
    });
  });

  it("renders 2FA fields and submits backup code without password", async () => {
    const user = userEvent.setup();
    getDeleteMyAccountCapabilitiesMock.mockResolvedValue({
      email: "demo@example.com",
      canDelete: true,
      blockedReason: null,
      requiredReauthMethods: ["2fa"],
      hasPassword: false,
      twoFactorEnabled: true,
      hasLinkedOauthIdentities: true,
    });
    deleteMyAccountMock.mockResolvedValue(null);

    renderWithQuery(
      <UserDangerSection email="demo@example.com" redirect="/settings/personal/profile" />,
    );

    await user.click(
      await screen.findByRole("button", { name: i18n.t("account:ME_DELETE_ACCOUNT_ACTION") }),
    );
    const dialog = await screen.findByRole("dialog");
    const dialogScope = within(dialog);
    expect(
      dialogScope.queryByLabelText(i18n.t("account:ME_DELETE_ACCOUNT_CONFIRM_PASSWORD")),
    ).not.toBeInTheDocument();
    await user.type(
      dialogScope.getByLabelText(i18n.t("account:ME_DELETE_ACCOUNT_CONFIRM_EMAIL")),
      "demo@example.com",
    );
    await user.type(
      dialogScope.getByLabelText(i18n.t("account:ME_DELETE_ACCOUNT_2FA_BACKUP_CODE")),
      "ABCD-EFGH",
    );
    await user.click(
      dialogScope.getByRole("button", { name: i18n.t("account:ME_DELETE_ACCOUNT_ACTION") }),
    );

    await waitFor(() => {
      expect(deleteMyAccountMock).toHaveBeenCalledWith({
        email: "demo@example.com",
        backupCode: "ABCD-EFGH",
      });
    });
  });

  it("requires relogin instead of direct submit", async () => {
    const user = userEvent.setup();
    getDeleteMyAccountCapabilitiesMock.mockResolvedValue({
      email: "demo@example.com",
      canDelete: true,
      blockedReason: null,
      requiredReauthMethods: ["relogin"],
      hasPassword: false,
      twoFactorEnabled: false,
      hasLinkedOauthIdentities: true,
    });

    renderWithQuery(
      <UserDangerSection email="demo@example.com" redirect="/settings/personal/profile" />,
    );

    await user.click(
      await screen.findByRole("button", { name: i18n.t("account:ME_DELETE_ACCOUNT_ACTION") }),
    );
    const dialog = await screen.findByRole("dialog");
    const dialogScope = within(dialog);
    expect(
      dialogScope.getAllByText(i18n.t("account:ME_DELETE_ACCOUNT_RELOGIN_REQUIRED")).length,
    ).toBeGreaterThan(0);

    const deleteButton = dialogScope.getByRole("button", {
      name: i18n.t("account:ME_DELETE_ACCOUNT_ACTION"),
    });
    expect(deleteButton).toBeDisabled();

    await user.click(
      dialogScope.getByRole("button", { name: i18n.t("account:ME_DELETE_ACCOUNT_RELOGIN_ACTION") }),
    );
    expect(navigateMock).toHaveBeenCalledWith({
      to: "/login",
      search: { redirect: "/settings/personal/profile" },
      replace: true,
    });
  });

  it("deletes password account and clears local session state", async () => {
    const user = userEvent.setup();
    getDeleteMyAccountCapabilitiesMock.mockResolvedValue({
      email: "demo@example.com",
      canDelete: true,
      blockedReason: null,
      requiredReauthMethods: ["password"],
      hasPassword: true,
      twoFactorEnabled: false,
      hasLinkedOauthIdentities: false,
    });
    deleteMyAccountMock.mockResolvedValue(null);

    renderWithQuery(
      <UserDangerSection email="demo@example.com" redirect="/settings/personal/profile" />,
    );

    await user.click(
      await screen.findByRole("button", { name: i18n.t("account:ME_DELETE_ACCOUNT_ACTION") }),
    );
    const dialog = await screen.findByRole("dialog");
    const dialogScope = within(dialog);
    await user.type(
      dialogScope.getByLabelText(i18n.t("account:ME_DELETE_ACCOUNT_CONFIRM_EMAIL")),
      "demo@example.com",
    );
    await user.type(
      dialogScope.getByLabelText(i18n.t("account:ME_DELETE_ACCOUNT_CONFIRM_PASSWORD")),
      "secret-pass",
    );
    await user.click(
      dialogScope.getByRole("button", { name: i18n.t("account:ME_DELETE_ACCOUNT_ACTION") }),
    );

    await waitFor(() => {
      expect(deleteMyAccountMock).toHaveBeenCalledWith({
        email: "demo@example.com",
        password: "secret-pass",
      });
      expect(navigateMock).toHaveBeenCalledWith({ to: "/login", replace: true });
    });
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(useWorkspaceStore.getState().currentWorkspaceId).toBeNull();
  });
});
