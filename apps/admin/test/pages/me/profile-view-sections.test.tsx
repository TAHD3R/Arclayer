import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

import { me } from "@/api/auth";
import { DEFAULT_LOCALE, i18n, initI18n } from "@/lib/i18n";
import { SettingsScreenProvider } from "@/components/layout/settings-screen-provider";
import { UserProfileView } from "@/pages/usercenter/profile/components/user-profile-view";

vi.mock("@/api/auth", () => ({
  me: vi.fn(),
}));

vi.mock("@/stores/use-auth-store", () => ({
  useAuthStore: (
    selector: (state: { accessToken: string | null; sessionVersion: number }) => unknown,
  ) => selector({ accessToken: "token", sessionVersion: 1 }),
}));

vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<object>("@tanstack/react-router");
  return {
    ...actual,
    useRouterState: ({
      select,
    }: {
      select: (state: { location: { pathname: string; searchStr: string } }) => unknown;
    }) => select({ location: { pathname: "/settings/personal/profile", searchStr: "" } }),
  };
});

vi.mock("@/pages/usercenter/profile/components/profile-basics-section", () => ({
  UserProfileBasicsSection: () => <div data-testid="profile-basics-section" />,
}));

vi.mock("@/pages/usercenter/profile/components/profile-account-security-section", () => ({
  UserProfileAccountSecuritySection: () => <div data-testid="profile-account-security-section" />,
}));

vi.mock("@/pages/usercenter/profile/components/profile-linked-accounts-section", () => ({
  UserLinkedAccountsSection: () => <div data-testid="profile-linked-accounts-section" />,
}));

vi.mock("@/pages/usercenter/profile/components/profile-danger-section", () => ({
  UserDangerSection: () => <div data-testid="profile-danger-section" />,
}));

vi.mock("@/pages/usercenter/security/components/security-sessions-section", () => ({
  UserSessionsSection: () => <div data-testid="profile-devices-section" />,
}));

const meMock = vi.mocked(me);

function renderWithQuery(node: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SettingsScreenProvider>{node}</SettingsScreenProvider>
    </QueryClientProvider>,
  );
}

beforeAll(async () => {
  await initI18n(DEFAULT_LOCALE);
});

beforeEach(() => {
  vi.clearAllMocks();
  meMock.mockResolvedValue({
    id: "user-1",
    username: "philip",
    displayName: "Philip",
    email: "philip@example.com",
    avatarUrl: null,
  } as never);
});

describe("UserProfileView sections", () => {
  it("renders devices as a standalone panel after account security", async () => {
    renderWithQuery(<UserProfileView mode="dialog" />);

    expect(
      await screen.findByText(i18n.t("account:ME_PROFILE_DEVICES_PANEL_TITLE")),
    ).toBeInTheDocument();
    expect(screen.getByTestId("profile-account-security-section")).toBeInTheDocument();
    expect(screen.getByTestId("profile-devices-section")).toBeInTheDocument();
  });
});
