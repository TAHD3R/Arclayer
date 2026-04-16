import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

import { confirmMyEmailChange, requestMyEmailChange } from "@/api/auth";
import { DEFAULT_LOCALE, i18n, initI18n } from "@/lib/i18n";
import { UserChangeEmailDialog } from "@/pages/usercenter/profile/components/profile-change-email-dialog";

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
  requestMyEmailChange: vi.fn(),
  confirmMyEmailChange: vi.fn(),
}));

vi.mock("@/stores/use-auth-store", () => ({
  useAuthStore: (selector: (state: { clear: () => void }) => unknown) =>
    selector({ clear: clearAuthMock }),
}));

vi.mock("@/stores/use-workspace-store", () => ({
  useWorkspaceStore: (selector: (state: { clearWorkspace: () => void }) => unknown) =>
    selector({ clearWorkspace: clearWorkspaceMock }),
}));

vi.mock("@/lib/notifications", () => ({
  notifyError: vi.fn(),
  notifySuccessText: vi.fn(),
}));

const requestMyEmailChangeMock = vi.mocked(requestMyEmailChange);
const confirmMyEmailChangeMock = vi.mocked(confirmMyEmailChange);

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
  navigateMock.mockResolvedValue(undefined);
});

describe("UserChangeEmailDialog", () => {
  function renderDialog() {
    return renderWithQuery(
      <UserChangeEmailDialog open onOpenChange={vi.fn()} nextEmail="old@example.com" />,
    );
  }

  it("requests a code first and then confirms the email change with otp only", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.clear(screen.getByLabelText(i18n.t("account:ME_PROFILE_EMAIL_NEW_EMAIL")));
    await user.type(
      screen.getByLabelText(i18n.t("account:ME_PROFILE_EMAIL_NEW_EMAIL")),
      "new@example.com",
    );

    await user.click(
      screen.getByRole("button", { name: i18n.t("account:ME_PROFILE_EMAIL_SEND_CODE") }),
    );

    await waitFor(() => {
      expect(requestMyEmailChangeMock).toHaveBeenCalledWith({ new_email: "new@example.com" });
    });

    expect(
      screen.queryByText(
        i18n.t("account:ME_PROFILE_EMAIL_CODE_SENT_HINT", { email: "new@example.com" }),
      ),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText(i18n.t("account:ME_PROFILE_EMAIL_NEW_EMAIL")),
    ).not.toBeInTheDocument();

    expect(screen.getByText(i18n.t("auth:LOGIN_EMAIL_CODE_RESEND_PREFIX"))).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: i18n.t("auth:LOGIN_EMAIL_CODE_RESEND_WAIT", { countdown: "20s" }),
      }),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText(i18n.t("account:ME_PROFILE_EMAIL_CODE")), "654321");
    await user.click(screen.getByRole("button", { name: i18n.t("settings:SETTINGS_SAVE") }));

    await waitFor(() => {
      expect(confirmMyEmailChangeMock).toHaveBeenCalledWith({
        new_email: "new@example.com",
        code: "654321",
      });
    });
    await waitFor(() => {
      expect(clearAuthMock).toHaveBeenCalled();
      expect(clearWorkspaceMock).toHaveBeenCalled();
      expect(navigateMock).toHaveBeenCalledWith({
        to: "/login",
        search: { redirect: "/" },
        replace: true,
      });
    });
  });

  it("keeps request failures out of the dialog body", async () => {
    const user = userEvent.setup();
    requestMyEmailChangeMock.mockRejectedValueOnce(new Error("request failed"));
    renderDialog();

    await user.clear(screen.getByLabelText(i18n.t("account:ME_PROFILE_EMAIL_NEW_EMAIL")));
    await user.type(
      screen.getByLabelText(i18n.t("account:ME_PROFILE_EMAIL_NEW_EMAIL")),
      "new@example.com",
    );
    await user.click(
      screen.getByRole("button", { name: i18n.t("account:ME_PROFILE_EMAIL_SEND_CODE") }),
    );

    await waitFor(() => {
      expect(screen.queryByText("request failed")).not.toBeInTheDocument();
    });
  });
});
