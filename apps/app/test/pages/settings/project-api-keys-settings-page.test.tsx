import type { PropsWithChildren, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProjectApiKeysSettingsPage } from "@/pages/projects/settings/api-keys/page";

const listProjectApiKeysMock = vi.fn();
const createProjectApiKeyMock = vi.fn();
const rotateProjectApiKeyMock = vi.fn();
const revokeProjectApiKeyMock = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values?.name
        ? `${key}:${values.name}`
        : values?.count !== undefined
          ? `${key}:${values.count}`
          : key,
  }),
}));

vi.mock("@/api/project-settings", () => ({
  listProjectApiKeys: (...args: unknown[]) => listProjectApiKeysMock(...args),
  createProjectApiKey: (...args: unknown[]) => createProjectApiKeyMock(...args),
  rotateProjectApiKey: (...args: unknown[]) => rotateProjectApiKeyMock(...args),
  revokeProjectApiKey: (...args: unknown[]) => revokeProjectApiKeyMock(...args),
}));

vi.mock("@/hooks/use-workspace-permission-access", () => ({
  useProjectPermissionAccess: () => ({
    authzQuery: { isFetched: true },
    actionsQuery: { isFetched: true },
    hasAction: (code: string) => code === "project:api-keys:manage",
  }),
}));

vi.mock("@/hooks/use-admin-date-time-formatter", () => ({
  useAdminDateTimeFormatter: () => ({
    formatDateTime: (value: string | null | undefined) => value ?? "—",
  }),
}));

vi.mock("@/lib/clipboard", () => ({ copyToClipboard: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/notifications", () => ({
  notifyError: vi.fn(),
  notifySuccessText: vi.fn(),
}));

vi.mock("@/layouts/page-shell/default-page", () => ({
  DefaultPage: ({ children }: PropsWithChildren) => (
    <div data-testid="default-page">{children}</div>
  ),
}));

vi.mock("@/layouts/page-shell/content-guard", () => ({
  ContentGuard: ({
    loading,
    error,
    children,
  }: PropsWithChildren<{ loading: boolean; error?: unknown }>) => {
    if (loading) return <div data-testid="guard-loading" />;
    if (error) return <div data-testid="guard-error" />;
    return <>{children}</>;
  },
}));

vi.mock("@arclayer/ui/setting-dialog", () => ({
  SettingDialog: ({
    open,
    title,
    description,
    footer,
    children,
  }: PropsWithChildren<{
    open: boolean;
    title: ReactNode;
    description?: ReactNode;
    footer?: ReactNode;
  }>) =>
    open ? (
      <div role="dialog" aria-label={String(title)}>
        <div>{title}</div>
        <div>{description}</div>
        {children}
        {footer}
      </div>
    ) : null,
}));

const ACTIVE_DELIVERY_KEY = {
  id: "key-delivery",
  ownerUserId: null,
  workspaceId: "workspace-1",
  siteId: "site-1",
  family: "delivery" as const,
  deliveryPerspective: "published" as const,
  name: "Production site",
  description: "Public website",
  tokenPublicId: "public-1",
  tokenMask: "ark_deliv_abcd...wxyz",
  scopes: ["delivery.read" as const],
  createdByUserId: "user-1",
  lastUsedAt: null,
  expiresAt: null,
  revokedAt: null,
  createdAt: "2026-07-01T00:00:00Z",
  updatedAt: "2026-07-01T00:00:00Z",
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ProjectApiKeysSettingsPage projectId="project-1" />
    </QueryClientProvider>,
  );
}

describe("ProjectApiKeysSettingsPage", () => {
  beforeEach(() => {
    listProjectApiKeysMock.mockReset();
    createProjectApiKeyMock.mockReset();
    rotateProjectApiKeyMock.mockReset();
    revokeProjectApiKeyMock.mockReset();
    listProjectApiKeysMock.mockResolvedValue([ACTIVE_DELIVERY_KEY]);
  });

  it("renders credentials in a scannable table", async () => {
    renderPage();

    expect(await screen.findByTestId("project-api-key-row-key-delivery")).toHaveTextContent(
      "Production site",
    );
    expect(
      screen.getByRole("columnheader", { name: "SETTINGS_PROJECT_API_KEYS_SCOPES" }),
    ).toBeInTheDocument();
    expect(screen.getByText("ark_deliv_abcd...wxyz")).toBeInTheDocument();
  });

  it("switches to a legal service-key scope set and hides delivery perspective", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByTestId("project-api-key-create-trigger"));
    await user.click(
      screen.getByRole("combobox", {
        name: "account:SETTINGS_PROJECT_API_KEYS_FAMILY_LABEL",
      }),
    );
    await user.click(
      screen.getByRole("option", {
        name: "account:SETTINGS_PROJECT_API_KEYS_FAMILY_SERVICE",
      }),
    );

    expect(
      screen.queryByLabelText("account:SETTINGS_PROJECT_API_KEYS_PERSPECTIVE_LABEL"),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("SETTINGS_PROJECT_API_KEYS_SCOPE_CONTENT_READ")).toBeChecked();
    expect(
      screen.queryByLabelText("SETTINGS_PROJECT_API_KEYS_SCOPE_DELIVERY_READ"),
    ).not.toBeInTheDocument();
  });

  it("creates a preview delivery key with selected scopes and UTC expiry", async () => {
    const user = userEvent.setup();
    const expiresAt = "2099-01-02T03:04";
    createProjectApiKeyMock.mockResolvedValue({
      key: { ...ACTIVE_DELIVERY_KEY, id: "key-new", deliveryPerspective: "preview" },
      secretToken: "ark_deliv_once-only",
    });
    renderPage();

    await user.click(await screen.findByTestId("project-api-key-create-trigger"));
    await user.type(
      screen.getByRole("textbox", { name: "account:SETTINGS_PROJECT_API_KEYS_NAME" }),
      "Preview site",
    );
    await user.click(screen.getByLabelText("SETTINGS_PROJECT_API_KEYS_SCOPE_GRAPHQL_READ"));
    await user.click(
      screen.getByRole("combobox", {
        name: "account:SETTINGS_PROJECT_API_KEYS_PERSPECTIVE_LABEL",
      }),
    );
    await user.click(
      screen.getByRole("option", {
        name: "account:SETTINGS_PROJECT_API_KEYS_PERSPECTIVE_PREVIEW",
      }),
    );
    await user.type(
      screen.getByLabelText("account:SETTINGS_PROJECT_API_KEYS_EXPIRES_AT"),
      expiresAt,
    );
    await user.click(screen.getByTestId("project-api-key-create-submit"));

    await waitFor(() => {
      expect(createProjectApiKeyMock).toHaveBeenCalledWith("project-1", {
        family: "delivery",
        name: "Preview site",
        description: null,
        scopes: ["delivery.read", "graphql.read"],
        expiresAt: new Date(expiresAt).toISOString(),
        deliveryPerspective: "preview",
      });
    });
    expect(await screen.findByText("ark_deliv_once-only")).toBeInTheDocument();
  });

  it("requires confirmation before rotating and reveals the replacement secret", async () => {
    const user = userEvent.setup();
    rotateProjectApiKeyMock.mockResolvedValue({
      key: ACTIVE_DELIVERY_KEY,
      secretToken: "ark_deliv_rotated-once",
    });
    renderPage();

    await user.click(await screen.findByTestId("project-api-key-rotate-key-delivery"));
    expect(rotateProjectApiKeyMock).not.toHaveBeenCalled();
    await user.click(screen.getByTestId("project-api-key-confirm-submit"));

    await waitFor(() => {
      expect(rotateProjectApiKeyMock).toHaveBeenCalledWith("project-1", "key-delivery");
    });
    expect(await screen.findByText("ark_deliv_rotated-once")).toBeInTheDocument();
  });

  it("requires confirmation before revoking", async () => {
    const user = userEvent.setup();
    revokeProjectApiKeyMock.mockResolvedValue({
      ...ACTIVE_DELIVERY_KEY,
      revokedAt: "2026-07-12T00:00:00Z",
    });
    renderPage();

    await user.click(await screen.findByTestId("project-api-key-revoke-key-delivery"));
    expect(revokeProjectApiKeyMock).not.toHaveBeenCalled();
    await user.click(screen.getByTestId("project-api-key-confirm-submit"));

    await waitFor(() => {
      expect(revokeProjectApiKeyMock).toHaveBeenCalledWith("project-1", "key-delivery");
    });
  });
});
