import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { AdminAccountMenu } from "@/components/layout/admin-account-menu";
import * as authApi from "@/api/auth";
import { setThemePreferenceWithTransition } from "@/components/ui/theme-transition";
import { useAuthStore } from "@/stores/use-auth-store";
import { usePreferencesStore } from "@/stores/use-preference-store";
import { ChromeTabsProvider } from "@celestial/ui/chrome-tabs";
import { SidebarProvider } from "@celestial/ui/sidebar";

const navigateMock = vi.fn().mockResolvedValue(undefined);

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigateMock,
  useRouterState: ({
    select,
  }: {
    select: (state: { location: { pathname: string } }) => unknown;
  }) => select({ location: { pathname: "/w/ws-1/" } }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@/api/auth", () => ({
  me: vi.fn(),
  logout: vi.fn(),
}));

vi.mock("@/components/ui/theme-transition", () => ({
  setThemePreferenceWithTransition: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/i18n", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/i18n")>();
  return {
    ...actual,
    i18n: {
      ...actual.i18n,
      changeLanguage: vi.fn().mockResolvedValue(undefined),
    },
  };
});

function renderWithProviders(component: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ChromeTabsProvider
        labels={{ scrollLeftAriaLabel: "scroll left", scrollRightAriaLabel: "scroll right" }}
      >
        <SidebarProvider defaultOpen className="h-screen">
          {component}
        </SidebarProvider>
      </ChromeTabsProvider>
    </QueryClientProvider>,
  );
}

async function openAccountMenu(user: ReturnType<typeof userEvent.setup>) {
  const triggerName = await screen.findByText("Tester");
  const trigger = triggerName.closest("button");
  if (!trigger) throw new Error("Missing account menu trigger");
  await user.click(trigger);
  await waitFor(() => {
    expect(screen.getByRole("button", { name: "ACCOUNT_MENU_ACCOUNT" })).toBeVisible();
  });
}

describe("AdminAccountMenu", () => {
  beforeAll(() => {
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

    class ResizeObserverMock {
      observe() {
        return undefined;
      }
      unobserve() {
        return undefined;
      }
      disconnect() {
        return undefined;
      }
    }

    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  });

  beforeEach(() => {
    vi.clearAllMocks();

    useAuthStore.setState({
      accessToken: "token",
      refreshToken: "refresh-token",
      keepSession: true,
      sessionVersion: 1,
    });
    usePreferencesStore.setState({
      themePreference: "system",
      themeMode: "light",
      locale: "zh-CN",
      localePreference: null,
      localePreferenceMode: "workspace",
    });

    vi.mocked(authApi.me).mockResolvedValue({
      id: "user-1",
      username: "tester",
      email: "tester@example.com",
      displayName: "Tester",
    } as never);
    vi.mocked(authApi.logout).mockResolvedValue(null);
  });

  it("只展示统一账号入口 + 偏好子菜单入口 + 快捷键 + 退出，不再展示组织/工作区/通知/帮助入口", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdminAccountMenu />);

    await openAccountMenu(user);

    expect(await screen.findByRole("button", { name: "ACCOUNT_MENU_ACCOUNT" })).toBeVisible();
    expect(screen.getByRole("button", { name: "ACCOUNT_MENU_LANGUAGE_PREFERENCES" })).toBeVisible();
    expect(screen.getByRole("button", { name: "ACCOUNT_MENU_APPEARANCE" })).toBeVisible();
    expect(screen.getByRole("button", { name: "ACCOUNT_SHORTCUTS" })).toBeVisible();
    expect(screen.getByRole("button", { name: "ACCOUNT_LOGOUT" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "ACCOUNT_THEME_SYSTEM" })).toBeNull();
    expect(screen.queryByRole("button", { name: "ACCOUNT_THEME_LIGHT" })).toBeNull();
    expect(screen.queryByRole("button", { name: "ACCOUNT_THEME_DARK" })).toBeNull();
    expect(screen.queryByRole("button", { name: "ACCOUNT_LANGUAGE_ZH" })).toBeNull();
    expect(screen.queryByRole("button", { name: "ACCOUNT_LANGUAGE_EN" })).toBeNull();

    expect(screen.queryByRole("button", { name: "ACCOUNT_ORGANIZATION_SETTINGS" })).toBeNull();
    expect(screen.queryByRole("button", { name: "ACCOUNT_WORKSPACES" })).toBeNull();
    expect(screen.queryByRole("button", { name: "ACCOUNT_NOTIFICATIONS" })).toBeNull();
    expect(screen.queryByRole("button", { name: "ACCOUNT_HELP_CENTER" })).toBeNull();
  });

  it("点击语言偏好入口后只展示语言二级菜单", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdminAccountMenu />);

    await openAccountMenu(user);
    await user.click(screen.getByRole("button", { name: "ACCOUNT_MENU_LANGUAGE_PREFERENCES" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "ACCOUNT_LANGUAGE_ZH" })).toBeVisible();
      expect(screen.getByRole("button", { name: "ACCOUNT_LANGUAGE_EN" })).toBeVisible();
      expect(screen.getByRole("button", { name: "common:BACK" })).toBeVisible();
    });
    expect(screen.queryByRole("button", { name: "ACCOUNT_THEME_DARK" })).toBeNull();
  });

  it("点击外观入口后会进入二级菜单并更新主题偏好", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdminAccountMenu />);

    await openAccountMenu(user);
    await user.click(screen.getByRole("button", { name: "ACCOUNT_MENU_APPEARANCE" }));
    await user.click(await screen.findByRole("button", { name: "ACCOUNT_THEME_DARK" }));

    expect(setThemePreferenceWithTransition).toHaveBeenCalledWith("dark", { direction: "ltr" });
  });

  it("点击语言二级菜单项会更新语言偏好", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdminAccountMenu />);

    await openAccountMenu(user);
    await user.click(screen.getByRole("button", { name: "ACCOUNT_MENU_LANGUAGE_PREFERENCES" }));
    await user.click(await screen.findByRole("button", { name: "ACCOUNT_LANGUAGE_EN" }));

    expect(usePreferencesStore.getState().locale).toBe("en-US");
  });

  it("点击退出会调用后端 logout，再清空本地登录态并跳转", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdminAccountMenu />);

    await openAccountMenu(user);
    await user.click(screen.getByRole("button", { name: "ACCOUNT_LOGOUT" }));

    await waitFor(() => {
      expect(authApi.logout).toHaveBeenCalledWith({ refreshToken: "refresh-token" });
    });
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(useAuthStore.getState().refreshToken).toBeNull();
    expect(navigateMock).toHaveBeenCalledWith({ to: "/login", replace: true });
  });
});
