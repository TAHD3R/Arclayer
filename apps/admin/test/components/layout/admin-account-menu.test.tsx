import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import * as authApi from "@/api/auth";
import { AdminAccountMenu } from "@/components/layout/admin-account-menu";
import {
  SettingsScreenProvider,
  useSettingsScreen,
} from "@/components/layout/settings-screen-provider";
import { setThemePreferenceWithTransition } from "@/components/ui/theme-transition";
import { useAuthStore } from "@/stores/use-auth-store";
import { usePreferencesStore } from "@/stores/use-preference-store";
import { ChromeTabsProvider } from "@arclayer/ui/chrome-tabs";
import { SidebarProvider } from "@arclayer/ui/sidebar";

const navigateMock = vi.fn().mockResolvedValue(undefined);
const openMock = vi.fn();
const routerState = {
  pathname: "/w/ws-1/",
  hash: "",
};

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigateMock,
  useRouterState: ({
    select,
  }: {
    select: (state: { location: { pathname: string; hash: string } }) => unknown;
  }) => select({ location: { pathname: routerState.pathname, hash: routerState.hash } }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: {
      t: (key: string) => key,
    },
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
          <SettingsScreenProvider>
            {component}
            <SettingsScreenProbe />
          </SettingsScreenProvider>
        </SidebarProvider>
      </ChromeTabsProvider>
    </QueryClientProvider>,
  );
}

function SettingsScreenProbe() {
  const settings = useSettingsScreen();
  return (
    <>
      <div data-testid="settings-open">{String(settings.state.open)}</div>
      <div data-testid="settings-screen">{settings.state.screen}</div>
    </>
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
    vi.stubGlobal("open", openMock);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    openMock.mockClear();
    routerState.pathname = "/w/ws-1/";
    routerState.hash = "";

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

  it("展示设置、订阅、偏好、资源、法律与退出入口", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdminAccountMenu />);

    await openAccountMenu(user);

    expect(await screen.findByRole("button", { name: "ACCOUNT_MENU_ACCOUNT" })).toBeVisible();
    expect(screen.getByRole("button", { name: "ACCOUNT_MENU_WORKSPACE_SETTINGS" })).toBeVisible();
    expect(screen.getByRole("button", { name: "ACCOUNT_MENU_SUBSCRIPTION" })).toBeVisible();
    expect(screen.getByRole("button", { name: "ACCOUNT_MENU_LANGUAGE" })).toBeVisible();
    expect(screen.getByRole("button", { name: "ACCOUNT_MENU_APPEARANCE" })).toBeVisible();
    expect(screen.getByRole("button", { name: "ACCOUNT_MENU_DOCS_RESOURCES" })).toBeVisible();
    expect(screen.getByRole("button", { name: "ACCOUNT_MENU_TERMS_PRIVACY" })).toBeVisible();
    expect(screen.getByRole("button", { name: "ACCOUNT_LOGOUT" })).toBeVisible();
    expect(screen.queryByText("ACCOUNT_MENU_WORKSPACE_SETTINGS_DESC")).toBeNull();
    expect(screen.queryByText("ACCOUNT_MENU_DOCS_RESOURCES_DESC")).toBeNull();
    expect(screen.queryByRole("button", { name: "ACCOUNT_THEME_SYSTEM" })).toBeNull();
    expect(screen.queryByRole("button", { name: "ACCOUNT_THEME_LIGHT" })).toBeNull();
    expect(screen.queryByRole("button", { name: "ACCOUNT_THEME_DARK" })).toBeNull();
    expect(screen.queryByRole("button", { name: "ACCOUNT_LANGUAGE_ZH" })).toBeNull();
    expect(screen.queryByRole("button", { name: "ACCOUNT_LANGUAGE_EN" })).toBeNull();
    expect(screen.queryByRole("button", { name: "ACCOUNT_MENU_DOCUMENTATION" })).toBeNull();
    expect(screen.queryByRole("button", { name: "ACCOUNT_MENU_TERMS" })).toBeNull();

    expect(screen.queryByRole("button", { name: "ACCOUNT_SHORTCUTS" })).toBeNull();
    expect(screen.queryByRole("button", { name: "ACCOUNT_ORGANIZATION_SETTINGS" })).toBeNull();
    expect(screen.queryByRole("button", { name: "ACCOUNT_WORKSPACES" })).toBeNull();
    expect(screen.queryByRole("button", { name: "ACCOUNT_NOTIFICATIONS" })).toBeNull();
  });

  it("账号菜单 action icon 会被约束为标准 16px 尺寸，不再膨胀到面板宽度", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdminAccountMenu />);

    await openAccountMenu(user);

    const accountAction = screen.getByRole("button", { name: "ACCOUNT_MENU_ACCOUNT" });
    expect(accountAction.querySelector(".size-4")).not.toBeNull();
  });

  it("header trigger keeps the shell transparent and uses the outline border token on the avatar", async () => {
    renderWithProviders(<AdminAccountMenu variant="header" />);

    const avatar = await screen.findByLabelText("Tester");
    const trigger = avatar.closest("button");

    expect(trigger).not.toBeNull();
    expect(trigger?.className).toContain("border-transparent");
    expect(trigger?.className).toContain("bg-transparent");
    expect(avatar.className).toContain("ring-border");
    expect(avatar.className).toContain("dark:ring-input");
  });

  it("hover 语言偏好入口时会在右侧显示语言子浮层，不再切换整块菜单", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdminAccountMenu />);

    await openAccountMenu(user);
    await user.hover(screen.getByRole("button", { name: "ACCOUNT_MENU_LANGUAGE" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "ACCOUNT_LANGUAGE_ZH" })).toBeVisible();
      expect(screen.getByRole("button", { name: "ACCOUNT_LANGUAGE_EN" })).toBeVisible();
      expect(screen.getByRole("button", { name: "ACCOUNT_MENU_ACCOUNT" })).toBeVisible();
    });
    expect(document.body.querySelector(".fi-cn")).not.toBeNull();
    expect(document.body.querySelector(".fi-us")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "common:BACK" })).toBeNull();
    expect(screen.queryByRole("button", { name: "ACCOUNT_THEME_DARK" })).toBeNull();
  });

  it("hover 外观入口后会显示右侧子浮层并更新主题偏好", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdminAccountMenu />);

    await openAccountMenu(user);
    await user.hover(screen.getByRole("button", { name: "ACCOUNT_MENU_APPEARANCE" }));
    await user.click(await screen.findByRole("button", { name: "ACCOUNT_THEME_DARK" }));

    expect(setThemePreferenceWithTransition).toHaveBeenCalledWith("dark", { direction: "ltr" });
  });

  it("hover 文档资源入口后会显示右侧子浮层并打开文档链接", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdminAccountMenu />);

    await openAccountMenu(user);
    await user.hover(screen.getByRole("button", { name: "ACCOUNT_MENU_DOCS_RESOURCES" }));
    await user.click(await screen.findByRole("button", { name: "ACCOUNT_MENU_DOCUMENTATION" }));

    expect(openMock).toHaveBeenCalledWith(
      "https://docs.arclayer.com",
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("hover 条款隐私入口后会显示右侧子浮层并打开法律弹窗", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdminAccountMenu />);

    await openAccountMenu(user);
    await user.hover(screen.getByRole("button", { name: "ACCOUNT_MENU_TERMS_PRIVACY" }));
    await user.click(await screen.findByRole("button", { name: "ACCOUNT_MENU_TERMS" }));

    await waitFor(() => {
      const dialogs = screen.getAllByRole("dialog");
      const openDialog = dialogs.find(
        (candidate) => candidate.getAttribute("data-state") === "open",
      );
      expect(openDialog).toBeDefined();
      expect(
        within(openDialog as HTMLElement).getByRole("heading", {
          name: "auth:TERMS_OF_SERVICE_MODAL_TITLE",
        }),
      ).toBeVisible();
    });
  });

  it("点击语言子浮层项会更新语言偏好", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdminAccountMenu />);

    await openAccountMenu(user);
    await user.hover(screen.getByRole("button", { name: "ACCOUNT_MENU_LANGUAGE" }));
    await user.click(await screen.findByRole("button", { name: "ACCOUNT_LANGUAGE_EN" }));

    expect(usePreferencesStore.getState().locale).toBe("en-US");
  });

  it("选择语言后主浮层与子浮层会一起关闭，不会残留子浮层", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdminAccountMenu />);

    await openAccountMenu(user);
    await user.hover(screen.getByRole("button", { name: "ACCOUNT_MENU_LANGUAGE" }));
    await user.click(await screen.findByRole("button", { name: "ACCOUNT_LANGUAGE_EN" }));

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "ACCOUNT_MENU_ACCOUNT" })).toBeNull();
      expect(screen.queryByRole("button", { name: "ACCOUNT_LANGUAGE_EN" })).toBeNull();
      expect(document.body.querySelector('[data-slot="popover-content"]')).toBeNull();
    });
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

  it("从 workspace shell 打开账号设置时会打开 provider settings screen", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdminAccountMenu />);

    await openAccountMenu(user);
    await user.click(screen.getByRole("button", { name: "ACCOUNT_MENU_ACCOUNT" }));

    expect(screen.getByTestId("settings-open")).toHaveTextContent("true");
    expect(screen.getByTestId("settings-screen")).toHaveTextContent("personal.profile");
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("从账号菜单打开 workspace settings 时会切到工作空间设置 screen", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdminAccountMenu />);

    await openAccountMenu(user);
    await user.click(screen.getByRole("button", { name: "ACCOUNT_MENU_WORKSPACE_SETTINGS" }));

    expect(screen.getByTestId("settings-open")).toHaveTextContent("true");
    expect(screen.getByTestId("settings-screen")).toHaveTextContent("workspace.general");
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("点击 Subscription 会打开工作空间套餐与用量设置", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdminAccountMenu />);

    await openAccountMenu(user);
    await user.click(screen.getByRole("button", { name: "ACCOUNT_MENU_SUBSCRIPTION" }));

    expect(screen.getByTestId("settings-open")).toHaveTextContent("true");
    expect(screen.getByTestId("settings-screen")).toHaveTextContent("workspace.plan-usage");
    expect(openMock).not.toHaveBeenCalled();
  });

  it("在 /workspaces 打开个人设置时复用同一套 provider contract", async () => {
    routerState.pathname = "/workspaces/";
    const user = userEvent.setup();
    renderWithProviders(<AdminAccountMenu />);

    await openAccountMenu(user);
    await user.click(screen.getByRole("button", { name: "ACCOUNT_MENU_ACCOUNT" }));

    expect(screen.getByTestId("settings-open")).toHaveTextContent("true");
    expect(screen.getByTestId("settings-screen")).toHaveTextContent("personal.profile");
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
