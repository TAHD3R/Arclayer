import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

import { issueSSOLinkState, listSSOProviders } from "@/api/auth-sso";
import { listMyOAuthIdentities, unlinkMyOAuthIdentity } from "@/api/oauth-social";
import { DEFAULT_LOCALE, i18n, initI18n } from "@/lib/i18n";
import { ApiError } from "@/lib/http";
import { UserLinkedAccountsSection } from "@/pages/usercenter/profile/components/profile-linked-accounts-section";

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
  return renderWithQuery(<UserLinkedAccountsSection redirect="/usercenter/profile" />);
}

beforeAll(async () => {
  await initI18n(DEFAULT_LOCALE);
});

beforeEach(() => {
  vi.clearAllMocks();
  issueSSOLinkStateMock.mockResolvedValue({ token: "link-token", expires_in: 600 });
  unlinkMyOAuthIdentityMock.mockResolvedValue(null);
});

describe("UserLinkedAccountsSection", () => {
  async function waitUntilLoaded() {
    await waitFor(() => {
      expect(document.querySelector(".animate-pulse")).toBeNull();
    });
  }

  it("不应该在后端返回空数据时渲染任何 mock provider 行", async () => {
    listSSOProvidersMock.mockResolvedValue({ providers: [] });
    listMyOAuthIdentitiesMock.mockResolvedValue({ identities: [] });

    const view = renderSection();

    await waitFor(() => {
      expect(listSSOProvidersMock).toHaveBeenCalledTimes(1);
      expect(listMyOAuthIdentitiesMock).toHaveBeenCalledTimes(1);
    });
    await waitUntilLoaded();

    expect(view.container).toBeEmptyDOMElement();
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

    const view = renderSection();

    await waitFor(() => {
      expect(listSSOProvidersMock).toHaveBeenCalledTimes(1);
      expect(listMyOAuthIdentitiesMock).toHaveBeenCalledTimes(1);
    });
    await waitUntilLoaded();

    expect(view.container).toBeEmptyDOMElement();
    expect(screen.queryByText("user@example.com")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: i18n.t("account:ME_LINKED_ACCOUNTS_CONNECT") }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: i18n.t("account:ME_LINKED_ACCOUNTS_DISCONNECT") }),
    ).not.toBeInTheDocument();
  });

  it("oauth 关联按钮使用 outline 样式", async () => {
    listSSOProvidersMock.mockResolvedValue({
      providers: [{ provider: "google", label: "Google", startUrl: "/oauth/google/start" }],
    });
    listMyOAuthIdentitiesMock.mockResolvedValue({ identities: [] });

    renderSection();

    const connectButton = await screen.findByRole("button", {
      name: i18n.t("account:ME_LINKED_ACCOUNTS_CONNECT"),
    });

    expect(connectButton).toHaveAttribute("data-variant", "outline");
  });

  it("已关联 provider 使用 i18n 标题和当前账号描述", async () => {
    listSSOProvidersMock.mockResolvedValue({
      providers: [{ provider: "google", label: "Google", startUrl: "/oauth/google/start" }],
    });
    listMyOAuthIdentitiesMock.mockResolvedValue({
      identities: [
        { provider: "google", email: "user@example.com", createdAt: "2026-04-16T00:00:00Z" },
      ],
    });

    renderSection();

    expect(await screen.findByText(i18n.t("auth:OAUTH_GOOGLE"))).toBeInTheDocument();
    expect(
      screen.getByText(
        i18n.t("account:ME_LINKED_ACCOUNTS_CURRENT_ACCOUNT", { email: "user@example.com" }),
      ),
    ).toBeInTheDocument();
  });

  it("取消关联前弹出确认 dialog", async () => {
    const user = userEvent.setup();
    listSSOProvidersMock.mockResolvedValue({
      providers: [{ provider: "google", label: "Google", startUrl: "/oauth/google/start" }],
    });
    listMyOAuthIdentitiesMock.mockResolvedValue({
      identities: [
        { provider: "google", email: "user@example.com", createdAt: "2026-04-16T00:00:00Z" },
      ],
    });

    renderSection();

    await user.click(
      await screen.findByRole("button", { name: i18n.t("account:ME_LINKED_ACCOUNTS_DISCONNECT") }),
    );

    expect(
      screen.getByText(i18n.t("account:ME_LINKED_ACCOUNTS_DISCONNECT_DIALOG_TITLE")),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        i18n.t("account:ME_LINKED_ACCOUNTS_DISCONNECT_DIALOG_DESC", { provider: "Google" }),
      ),
    ).toBeInTheDocument();

    const dialog = screen.getByRole("dialog");

    await user.click(
      within(dialog).getByRole("button", {
        name: i18n.t("account:ME_LINKED_ACCOUNTS_DISCONNECT"),
      }),
    );

    await waitFor(() => {
      expect(unlinkMyOAuthIdentityMock).toHaveBeenCalledWith("google");
    });
  });

  it("只让当前点击的 provider 显示 loading", async () => {
    const user = userEvent.setup();
    issueSSOLinkStateMock.mockImplementation(
      () => new Promise(() => undefined) as ReturnType<typeof issueSSOLinkState>,
    );
    listSSOProvidersMock.mockResolvedValue({
      providers: [
        { provider: "google", label: "Google", startUrl: "/oauth/google/start" },
        { provider: "github", label: "GitHub", startUrl: "/oauth/github/start" },
      ],
    });
    listMyOAuthIdentitiesMock.mockResolvedValue({ identities: [] });

    renderSection();

    const googleRow = (await screen.findByText(i18n.t("auth:OAUTH_GOOGLE"))).closest(
      "div.py-3",
    ) as HTMLElement | null;
    const githubRow = screen
      .getByText(i18n.t("auth:OAUTH_GITHUB"))
      .closest("div.py-3") as HTMLElement | null;
    if (!googleRow || !githubRow) throw new Error("provider rows not found");

    const googleButton = within(googleRow).getByRole("button", {
      name: i18n.t("account:ME_LINKED_ACCOUNTS_CONNECT"),
    });
    const githubButton = within(githubRow).getByRole("button", {
      name: i18n.t("account:ME_LINKED_ACCOUNTS_CONNECT"),
    });

    await user.click(googleButton);

    expect(googleButton).toHaveAttribute("aria-busy", "true");
    expect(githubButton).not.toHaveAttribute("aria-busy", "true");
  });
});
