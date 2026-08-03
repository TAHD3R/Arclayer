import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { revokeCurrentPlatformSession } from "@/access/access-api";
import { getPlatformCapabilityCatalog } from "@/capabilities/catalog-api";
import { PlatformAuthProvider } from "@/auth/platform-auth";
import { savePlatformSession } from "@/auth/platform-session";
import { initializePlatformI18n, i18n } from "@/lib/i18n";
import { PlatformPreferencesProvider } from "@/lib/preferences";
import { getOperationalSignal } from "@/operations/operations-api";
import { loadPlatformOverview } from "@/overview/overview-api";
import { routeTree } from "@/routeTree.gen";

vi.mock("@/overview/overview-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/overview/overview-api")>();
  return { ...actual, loadPlatformOverview: vi.fn() };
});

vi.mock("@/access/access-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/access/access-api")>();
  return { ...actual, revokeCurrentPlatformSession: vi.fn() };
});

vi.mock("@/components/platform-aurora", () => ({
  PlatformAurora: () => <div data-testid="platform-aurora" />,
}));

vi.mock("@/pages/tenant-users", () => ({
  TenantUsersPage: () => <h1>Users</h1>,
}));

vi.mock("@/saved-views/saved-views-control", () => ({
  SavedViewsControl: () => null,
}));

beforeAll(async () => {
  await initializePlatformI18n("en-US");
});

beforeEach(async () => {
  window.localStorage.clear();
  document.documentElement.dataset.theme = "light";
  document.documentElement.lang = "en-US";
  await i18n.changeLanguage("en-US");
  vi.mocked(loadPlatformOverview).mockReset();
  vi.mocked(revokeCurrentPlatformSession).mockReset();
  vi.mocked(revokeCurrentPlatformSession).mockResolvedValue({
    correlationId: "sign-out-correlation",
    entityId: "LqVpBuzAEzGFbgyzVOS4rA",
    mutation: "revoke_platform_session",
    replayed: false,
  });
  vi.mocked(loadPlatformOverview).mockResolvedValue({
    catalog: { status: "ready", data: { items: [] } },
    attention: {
      status: "ready",
      data: { items: [], next: null, page: 1, pages: 1, prev: null, size: 5, total: 0 },
    },
    recovered: {
      status: "ready",
      data: { items: [], next: null, page: 1, pages: 1, prev: null, size: 5, total: 0 },
    },
    loadedAt: "2026-08-01T00:00:00.000Z",
  });
  savePlatformSession({
    state: "authenticated",
    credential: {
      accessToken: "platform-shell-test-token",
      expiresIn: 600,
      session: {
        absoluteExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        actorId: "1jz6k6rWQdK2nZk3fD3d1Q",
        isInstanceOwner: true,
        policyRevision: 1,
        sessionId: "LqVpBuzAEzGFbgyzVOS4rA",
      },
    },
  });
});

describe("Platform shell", () => {
  it("keeps inactive capability domains at their primary destinations", async () => {
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ["/"] }),
    });
    await router.load();
    render(
      <PlatformPreferencesProvider>
        <PlatformAuthProvider>
          <RouterProvider router={router} />
        </PlatformAuthProvider>
      </PlatformPreferencesProvider>,
    );

    expect(await screen.findByRole("link", { name: "Workspaces" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "Users" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Projects" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Requests and errors" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "Performance trends" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Platform team" })).toBeVisible();
  });

  it("uses one projection for the active Workspace sidebar, breadcrumb, and command search", async () => {
    const user = userEvent.setup();
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ["/users"] }),
    });
    await router.load();
    render(
      <PlatformPreferencesProvider>
        <PlatformAuthProvider>
          <RouterProvider router={router} />
        </PlatformAuthProvider>
      </PlatformPreferencesProvider>,
    );

    const workspaceLinks = await screen.findAllByRole("link", { name: "Workspaces" });
    expect(workspaceLinks.some((link) => link.getAttribute("href") === "/workspaces")).toBe(true);
    expect(workspaceLinks.some((link) => !link.hasAttribute("href"))).toBe(true);
    expect(screen.getByRole("link", { name: "Users" })).toHaveAttribute("data-active", "true");
    expect(screen.getByRole("link", { name: "Projects" })).toHaveAttribute("data-active", "false");
    expect(screen.getByRole("link", { name: "Requests and errors" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "Performance trends" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Platform team" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Open navigation" }));
    const dialog = await screen.findByRole("dialog", { name: "Go to a page" });
    await waitFor(() => expect(dialog).toBeVisible());
    expect(within(dialog).getByRole("option", { name: "Workspaces" })).toBeVisible();
    for (const option of within(dialog).getAllByRole("option", { name: "Users" })) {
      expect(option).toBeVisible();
    }
    expect(within(dialog).getByRole("option", { name: "Projects" })).toBeVisible();
    expect(within(dialog).queryByText("Background jobs")).not.toBeInTheDocument();
  });

  it("projects only the authorized backed Workspace peer", async () => {
    const catalog = await getPlatformCapabilityCatalog();
    const tenantCapability = catalog.items.find(
      ({ capabilityId }) => capabilityId === "tenant-governance",
    );
    expect(tenantCapability).toBeDefined();
    vi.mocked(getPlatformCapabilityCatalog).mockResolvedValueOnce({
      items: [
        {
          ...tenantCapability!,
          navigationTargets: tenantCapability!.navigationTargets.filter(
            ({ routeTarget }) => routeTarget === "tenants.users",
          ),
        },
      ],
    });
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ["/"] }),
    });
    await router.load();
    render(
      <PlatformPreferencesProvider>
        <PlatformAuthProvider>
          <RouterProvider router={router} />
        </PlatformAuthProvider>
      </PlatformPreferencesProvider>,
    );

    expect((await screen.findAllByRole("link", { name: "Overview" })).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Users" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "Workspaces" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Projects" })).not.toBeInTheDocument();
    expect(
      screen.queryByText("Some available pages are not supported by this build."),
    ).not.toBeInTheDocument();
  });

  it("does not render a route Outlet for an unauthorized Workspace path", async () => {
    const catalog = await getPlatformCapabilityCatalog();
    const accessCapability = catalog.items.find(({ capabilityId }) => capabilityId === "access");
    expect(accessCapability).toBeDefined();
    vi.mocked(getPlatformCapabilityCatalog).mockResolvedValueOnce({
      items: [accessCapability!],
    });
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ["/workspaces"] }),
    });
    await router.load();
    render(
      <PlatformPreferencesProvider>
        <PlatformAuthProvider>
          <RouterProvider router={router} />
        </PlatformAuthProvider>
      </PlatformPreferencesProvider>,
    );

    expect(await screen.findAllByText("Your Platform account can't open this page.")).toHaveLength(
      2,
    );
    expect(screen.queryByRole("heading", { name: "Workspaces" })).not.toBeInTheDocument();
  });

  it("keeps an authorized source investigation detail inside Needs attention", async () => {
    const catalog = await getPlatformCapabilityCatalog();
    vi.mocked(getPlatformCapabilityCatalog).mockResolvedValueOnce({
      items: [
        ...catalog.items,
        {
          activationAvailable: false,
          canManage: true,
          capabilityId: "operations-signals",
          descriptionI18nKey: "inbox:PAGE_DESCRIPTION",
          domain: "operations",
          enablementState: "enabled",
          managePermissionMatch: "all",
          missingPrerequisiteCodes: [],
          nameI18nKey: "navigation:NEEDS_ATTENTION",
          navigationCandidate: true,
          navigationTargets: [
            {
              requiredViewPermissions: ["platform:operations-signals:read"],
              routeTarget: "operations.signals",
              viewPermissionMatch: "all",
            },
          ],
          readinessState: "ready",
          requiredManagePermissions: [],
          requiredViewPermissions: ["platform:operations-signals:read"],
          routeTarget: "operations.signals",
          runtimeHealth: "not_reported",
          supportState: "supported",
          viewPermissionMatch: "all",
        },
      ],
    } as never);
    vi.mocked(getOperationalSignal).mockRejectedValueOnce(new Error("source unavailable"));
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ["/attention/signal-1"] }),
    });
    await router.load();
    render(
      <PlatformPreferencesProvider>
        <PlatformAuthProvider>
          <RouterProvider router={router} />
        </PlatformAuthProvider>
      </PlatformPreferencesProvider>,
    );

    await waitFor(() => expect(getOperationalSignal).toHaveBeenCalled());
    expect(screen.getAllByText("Needs attention").length).toBeGreaterThan(0);
    expect(screen.queryByText("Your Platform account can't open this page.")).toBeNull();
  });

  it("shows loading state without static navigation or route-content fallback", async () => {
    vi.mocked(getPlatformCapabilityCatalog).mockReturnValueOnce(
      new Promise<never>(() => undefined),
    );
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ["/workspaces"] }),
    });
    await router.load();
    render(
      <PlatformPreferencesProvider>
        <PlatformAuthProvider>
          <RouterProvider router={router} />
        </PlatformAuthProvider>
      </PlatformPreferencesProvider>,
    );

    expect((await screen.findAllByText("Loading available pages…")).length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: "Workspaces" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Workspaces" })).not.toBeInTheDocument();
  });

  it("shows Catalog failure and retries without a static navigation fallback", async () => {
    vi.mocked(getPlatformCapabilityCatalog).mockRejectedValueOnce(new Error("catalog unavailable"));
    const user = userEvent.setup();
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ["/"] }),
    });
    await router.load();
    render(
      <PlatformPreferencesProvider>
        <PlatformAuthProvider>
          <RouterProvider router={router} />
        </PlatformAuthProvider>
      </PlatformPreferencesProvider>,
    );

    const alerts = await screen.findAllByRole("alert");
    expect(alerts.some((alert) => alert.textContent?.includes("Can't load available pages"))).toBe(
      true,
    );
    expect(screen.queryByRole("link", { name: "Workspaces" })).not.toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Try again" })[0]);
    expect(await screen.findByRole("heading", { name: "Overview" })).toBeVisible();
  });

  it("keeps a capability navigation contract error visible instead of rendering a partial shell", async () => {
    const catalog = await getPlatformCapabilityCatalog();
    const accessCapability = catalog.items.find(({ capabilityId }) => capabilityId === "access");
    expect(accessCapability).toBeDefined();
    vi.mocked(getPlatformCapabilityCatalog).mockResolvedValueOnce({
      items: [
        {
          ...accessCapability!,
          navigationTargets: [
            {
              requiredViewPermissions: ["platform:access-team:read"],
              routeTarget: "access.unknown",
              viewPermissionMatch: "all",
            },
          ],
        },
      ],
    } as never);
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ["/"] }),
    });
    await router.load();
    render(
      <PlatformPreferencesProvider>
        <PlatformAuthProvider>
          <RouterProvider router={router} />
        </PlatformAuthProvider>
      </PlatformPreferencesProvider>,
    );

    expect(await screen.findAllByTestId("capability-error-code")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          textContent: expect.stringContaining("PLATFORM_CAPABILITY_NAVIGATION_CONTRACT_ERROR"),
        }),
      ]),
    );
    expect(screen.getAllByTestId("capability-error-message")[0]).toHaveTextContent(
      "Unregistered Platform capability navigation target: access.unknown",
    );
    expect(screen.queryByText(/Some available pages/)).not.toBeInTheDocument();
  });

  it("renders the real Overview healthy state without a Product link in the account menu", async () => {
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ["/"] }),
    });
    await router.load();

    render(
      <PlatformPreferencesProvider>
        <PlatformAuthProvider>
          <RouterProvider router={router} />
        </PlatformAuthProvider>
      </PlatformPreferencesProvider>,
    );

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeVisible();
    expect(screen.getByText(/Nothing needs attention right now/)).toBeVisible();
    expect(screen.getByRole("heading", { name: "Area status" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "Back to product" })).not.toBeInTheDocument();
  });

  it("revokes the current server Session before clearing the Platform credential", async () => {
    const user = userEvent.setup();
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ["/"] }),
    });
    await router.load();
    render(
      <PlatformPreferencesProvider>
        <PlatformAuthProvider>
          <RouterProvider router={router} />
        </PlatformAuthProvider>
      </PlatformPreferencesProvider>,
    );

    await user.click(await screen.findByRole("button", { name: "Sign out" }));
    expect(window.localStorage.getItem("arclayer:platform:session")).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Revoke and sign out" }));
    await waitFor(() =>
      expect(revokeCurrentPlatformSession).toHaveBeenCalledWith("LqVpBuzAEzGFbgyzVOS4rA", {
        correlationId: expect.any(String),
        idempotencyKey: expect.any(String),
      }),
    );
    expect(window.localStorage.getItem("arclayer:platform:session")).toBeNull();
    expect(await screen.findByRole("heading", { name: "Welcome back" })).toBeVisible();
  });

  it("keeps the local credential and reuses revocation identity when sign out is unconfirmed", async () => {
    vi.mocked(revokeCurrentPlatformSession)
      .mockRejectedValueOnce(new Error("network unavailable"))
      .mockRejectedValueOnce(new Error("network unavailable"));
    const user = userEvent.setup();
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ["/"] }),
    });
    await router.load();
    render(
      <PlatformPreferencesProvider>
        <PlatformAuthProvider>
          <RouterProvider router={router} />
        </PlatformAuthProvider>
      </PlatformPreferencesProvider>,
    );

    await user.click(await screen.findByRole("button", { name: "Sign out" }));
    await user.click(screen.getByRole("button", { name: "Revoke and sign out" }));
    expect(await screen.findByText("This device was not signed out")).toBeVisible();
    expect(window.localStorage.getItem("arclayer:platform:session")).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Revoke and sign out" }));

    await waitFor(() => expect(revokeCurrentPlatformSession).toHaveBeenCalledTimes(2));
    const firstRequest = vi.mocked(revokeCurrentPlatformSession).mock.calls[0]?.[1];
    const secondRequest = vi.mocked(revokeCurrentPlatformSession).mock.calls[1]?.[1];
    expect(secondRequest).toEqual(firstRequest);
    expect(window.localStorage.getItem("arclayer:platform:session")).not.toBeNull();
  });

  it("switches locale and all three theme preferences through Header utilities", async () => {
    const user = userEvent.setup();
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ["/"] }),
    });
    await router.load();
    render(
      <PlatformPreferencesProvider>
        <PlatformAuthProvider>
          <RouterProvider router={router} />
        </PlatformAuthProvider>
      </PlatformPreferencesProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Open administrator menu" }));
    await user.click(screen.getByRole("menuitem", { name: "Change language" }));
    await user.click(screen.getByRole("menuitemradio", { name: "简体中文" }));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "总览" })).toBeVisible();
    });
    expect(document.documentElement.lang).toBe("zh-CN");

    await user.click(screen.getByRole("button", { name: "打开管理员菜单" }));
    await user.click(screen.getByRole("menuitem", { name: "主题" }));
    await user.click(screen.getByRole("menuitemradio", { name: "浅色" }));
    expect(document.documentElement).not.toHaveClass("dark");

    await user.click(screen.getByRole("button", { name: "打开管理员菜单" }));
    await user.click(screen.getByRole("menuitem", { name: "主题" }));
    await user.click(screen.getByRole("menuitemradio", { name: "深色" }));
    expect(document.documentElement).toHaveClass("dark");

    await user.click(screen.getByRole("button", { name: "打开管理员菜单" }));
    await user.click(screen.getByRole("menuitem", { name: "主题" }));
    await user.click(screen.getByRole("menuitemradio", { name: "使用系统设置" }));
    expect(window.localStorage.getItem("arclayer:platform:theme")).toBe("system");
  });

  it("keeps the collapsed navigation label available to keyboard focus", async () => {
    const user = userEvent.setup();
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ["/"] }),
    });
    await router.load();
    const { container } = render(
      <PlatformPreferencesProvider>
        <PlatformAuthProvider>
          <RouterProvider router={router} />
        </PlatformAuthProvider>
      </PlatformPreferencesProvider>,
    );

    await screen.findByRole("heading", { name: "Overview" });
    const trigger = container.querySelector<HTMLButtonElement>('[data-slot="sidebar-trigger"]');
    expect(trigger).not.toBeNull();
    await user.click(trigger!);
    const navigationLink = container.querySelector<HTMLAnchorElement>(
      '[data-sidebar="menu-button"]',
    );
    expect(navigationLink).not.toBeNull();
    navigationLink!.focus();
    expect(navigationLink).toHaveFocus();
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Overview");
  });
});
