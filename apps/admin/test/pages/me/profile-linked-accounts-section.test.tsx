import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

import { issueSSOLinkState, listSSOProviders } from "@/api/auth-sso";
import { listMyOAuthIdentities, unlinkMyOAuthIdentity } from "@/api/oauth-social";
import { DEFAULT_LOCALE, i18n, initI18n } from "@/lib/i18n";
import { ApiError } from "@/lib/http";
import { MeProfileLinkedAccountsSection } from "@/pages/me/profile/components/profile-linked-accounts-section";

vi.mock("@/api/auth-sso", () => ({
  issueSSOLinkState: vi.fn(),
  listSSOProviders: vi.fn(),
}));

vi.mock("@/api/oauth-social", () => ({
  listMyOAuthIdentities: vi.fn(),
  unlinkMyOAuthIdentity: vi.fn(),
}));

vi.mock("@/stores/use-auth-store", () => ({
  useAuthStore: (selector: (state: { accessToken: string; sessionVersion: number }) => unknown) =>
    selector({
      accessToken: "test-token",
      sessionVersion: 1,
    }),
}));

vi.mock("@/stores/use-preference-store", () => ({
  usePreferencesStore: (selector: (state: { themeMode: "light" | "dark" }) => unknown) =>
    selector({ themeMode: "light" }),
}));

vi.mock("@/lib/notifications", () => ({
  notifyError: vi.fn(),
  notifySuccessText: vi.fn(),
}));

const listSSOProvidersMock = vi.mocked(listSSOProviders);
const issueSSOLinkStateMock = vi.mocked(issueSSOLinkState);
const listMyOAuthIdentitiesMock = vi.mocked(listMyOAuthIdentities);
const unlinkMyOAuthIdentityMock = vi.mocked(unlinkMyOAuthIdentity);

function renderWithQuery(node: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{node}</QueryClientProvider>);
}

function renderSection() {
  return renderWithQuery(<MeProfileLinkedAccountsSection redirect="/me/profile" />);
}

beforeAll(async () => {
  await initI18n(DEFAULT_LOCALE);
});

beforeEach(() => {
  vi.clearAllMocks();
  issueSSOLinkStateMock.mockResolvedValue({ token: "link-token", expires_in: 600 });
  unlinkMyOAuthIdentityMock.mockResolvedValue(null);
});

describe("MeProfileLinkedAccountsSection", () => {
  async function waitUntilLoaded() {
    await waitFor(() => {
      expect(document.querySelector(".animate-pulse")).toBeNull();
    });
  }

  it("不应该在后端返回空数据时渲染任何 mock provider 行", async () => {
    listSSOProvidersMock.mockResolvedValue({ providers: [] });
    listMyOAuthIdentitiesMock.mockResolvedValue({ identities: [] });

    renderSection();

    await waitFor(() => {
      expect(listSSOProvidersMock).toHaveBeenCalledTimes(1);
      expect(listMyOAuthIdentitiesMock).toHaveBeenCalledTimes(1);
    });
    await waitUntilLoaded();

    expect(screen.getByText(i18n.t("account:ME_LINKED_ACCOUNTS_EMPTY"))).toBeInTheDocument();
    expect(screen.queryByText("Google")).not.toBeInTheDocument();
    expect(screen.queryByText("GitHub")).not.toBeInTheDocument();
    expect(screen.queryByText("user@example.com")).not.toBeInTheDocument();
  });

  it("不应该在 identities 接口 404 时回落到 mock 账号数据", async () => {
    listSSOProvidersMock.mockResolvedValue({ providers: [] });
    listMyOAuthIdentitiesMock.mockRejectedValue(
      new ApiError({
        status: 404,
        message: "Not found",
      }),
    );

    renderSection();

    await waitFor(() => {
      expect(listSSOProvidersMock).toHaveBeenCalledTimes(1);
      expect(listMyOAuthIdentitiesMock).toHaveBeenCalledTimes(1);
    });
    await waitUntilLoaded();

    expect(screen.getByText(i18n.t("account:ME_LINKED_ACCOUNTS_EMPTY"))).toBeInTheDocument();
    expect(screen.queryByText("user@example.com")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: i18n.t("account:ME_LINKED_ACCOUNTS_CONNECT") }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: i18n.t("account:ME_LINKED_ACCOUNTS_DISCONNECT") }),
    ).not.toBeInTheDocument();
  });
});
