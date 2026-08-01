import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { getPlatformCapabilityCatalog } from "@/capabilities/catalog-api";
import { PlatformAuthProvider } from "@/auth/platform-auth";
import { savePlatformSession } from "@/auth/platform-session";
import { initializePlatformI18n, i18n } from "@/lib/i18n";
import { PlatformPreferencesProvider } from "@/lib/preferences";
import { loadPlatformOverview } from "@/overview/overview-api";
import { routeTree } from "@/routeTree.gen";

vi.mock("@/overview/overview-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/overview/overview-api")>();
  return { ...actual, loadPlatformOverview: vi.fn() };
});

beforeAll(async () => {
  await initializePlatformI18n("en-US");
});

beforeEach(async () => {
  window.localStorage.clear();
  document.documentElement.dataset.theme = "light";
  document.documentElement.lang = "en-US";
  await i18n.changeLanguage("en-US");
  vi.mocked(loadPlatformOverview).mockReset();
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
        actorId: "actor-shell-test",
        isInstanceOwner: true,
        policyRevision: 1,
        sessionId: "session-shell-test",
      },
    },
  });
});

describe("Platform shell", () => {
  it("derives peer navigation from authorized trusted capability modules", async () => {
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
    expect(screen.getByRole("link", { name: "Requests & errors" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Performance trends" })).toBeVisible();
    expect(screen.getByRole("link", { name: "AI usage" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Activity trends" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Audit trail" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Platform team" })).toBeVisible();
    expect(screen.getAllByRole("link", { name: "Platform team" })).toHaveLength(1);
  });

  it("omits deferred Catalog targets without presenting an incomplete product surface", async () => {
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
    expect(screen.queryByRole("link", { name: "Users" })).not.toBeInTheDocument();
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

    expect(
      await screen.findAllByText("This page is not available to your Platform account."),
    ).toHaveLength(2);
    expect(screen.queryByRole("heading", { name: "Workspaces" })).not.toBeInTheDocument();
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

    expect((await screen.findAllByText("Loading available pages")).length).toBeGreaterThan(0);
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
    expect(
      alerts.some((alert) => alert.textContent?.includes("Available pages could not be loaded")),
    ).toBe(true);
    expect(screen.queryByRole("link", { name: "Workspaces" })).not.toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Try again" })[0]);
    expect(await screen.findByRole("heading", { name: "Overview" })).toBeVisible();
  });

  it("renders the real Overview healthy state and independent Product link", async () => {
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
    expect(screen.getByText(/No current condition requires operator action/)).toBeVisible();
    expect(screen.getByRole("heading", { name: "Domain status" })).toBeVisible();
    const productApplicationLink = screen.getByRole("link", {
      name: /Return to product/,
    });
    expect(productApplicationLink).toHaveAttribute("href", "https://app.arclayer.localhost/");
    expect(productApplicationLink).toHaveAttribute("aria-label", "Return to product");
  });

  it("clears the Platform credential when signing out", async () => {
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
    expect(window.localStorage.getItem("arclayer:platform:session")).toBeNull();
    expect(
      await screen.findByRole("heading", { name: "Sign in to the Platform Console" }),
    ).toBeVisible();
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

    await user.click(screen.getByRole("button", { name: "Change language" }));
    await user.click(screen.getByRole("menuitemradio", { name: "简体中文" }));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "总览" })).toBeVisible();
    });
    expect(document.documentElement.lang).toBe("zh-CN");

    await user.click(screen.getByRole("button", { name: "外观" }));
    await user.click(screen.getByRole("menuitemradio", { name: "浅色" }));
    expect(document.documentElement.dataset.theme).toBe("light");

    await user.click(screen.getByRole("button", { name: "外观" }));
    await user.click(screen.getByRole("menuitemradio", { name: "深色" }));
    expect(document.documentElement.dataset.theme).toBe("dark");

    await user.click(screen.getByRole("button", { name: "外观" }));
    await user.click(screen.getByRole("menuitemradio", { name: "跟随系统" }));
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
