import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

import { listMySessions, revokeMySession, revokeOtherSessions } from "@/api/auth";
import { DEFAULT_LOCALE, i18n, initI18n } from "@/lib/i18n";
import { MeSecuritySessionsSection } from "@/pages/me/security/components/security-sessions-section";

vi.mock("@/api/auth", () => ({
  listMySessions: vi.fn(),
  revokeMySession: vi.fn(),
  revokeOtherSessions: vi.fn(),
}));

vi.mock("@/lib/notifications", () => ({
  notifyError: vi.fn(),
  notifySuccessText: vi.fn(),
}));

vi.mock("@/hooks/use-admin-date-time-formatter", () => ({
  useAdminDateTimeFormatter: () => ({
    formatDateTime: (value: string | null | undefined, options?: { emptyValue?: string }) =>
      value ? `formatted:${value}` : (options?.emptyValue ?? "-"),
  }),
}));

const listMySessionsMock = vi.mocked(listMySessions);
const revokeMySessionMock = vi.mocked(revokeMySession);
const revokeOtherSessionsMock = vi.mocked(revokeOtherSessions);

function renderWithQuery(node: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{node}</QueryClientProvider>);
}

function mockSessions() {
  listMySessionsMock.mockResolvedValue({
    items: [
      {
        sessionId: "sid-current",
        current: true,
        revocable: false,
        issuedAt: "2026-03-07T00:00:00Z",
        lastUsedAt: "2026-03-07T00:10:00Z",
        ipAddress: "127.0.0.1",
        deviceLabel: "Safari on macOS",
        locationLabel: "Shanghai",
        authMethod: "password",
        userAgent: "Safari",
      },
      {
        sessionId: "sid-other",
        current: false,
        revocable: true,
        issuedAt: "2026-03-06T00:00:00Z",
        lastUsedAt: "2026-03-06T00:10:00Z",
        ipAddress: "10.0.0.8",
        deviceLabel: "Chrome on Windows",
        locationLabel: "Hangzhou",
        authMethod: "sso",
        userAgent: "Chrome",
      },
    ],
    total: 2,
  });
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
});

describe("MeSecuritySessionsSection", () => {
  it("renders default columns, formatted time, current tag, and refresh toolbar", async () => {
    const user = userEvent.setup();
    mockSessions();

    renderWithQuery(<MeSecuritySessionsSection />);

    expect(await screen.findByText("Safari on macOS")).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", {
        name: i18n.t("account:ME_SECURITY_SESSIONS_COL_DEVICE"),
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", {
        name: i18n.t("account:ME_SECURITY_SESSIONS_COL_LOCATION"),
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", {
        name: i18n.t("account:ME_SECURITY_SESSIONS_COL_LAST_ACTIVE"),
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", {
        name: i18n.t("account:ME_SECURITY_SESSIONS_COL_ACTIONS"),
      }),
    ).toBeInTheDocument();

    expect(
      screen.queryByRole("columnheader", {
        name: i18n.t("account:ME_SECURITY_SESSIONS_COL_SIGNED_IN"),
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("columnheader", {
        name: i18n.t("account:ME_SECURITY_SESSIONS_COL_AUTH_METHOD"),
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("columnheader", {
        name: i18n.t("account:ME_SECURITY_SESSIONS_COL_IP"),
      }),
    ).not.toBeInTheDocument();

    expect(screen.getByText("formatted:2026-03-07T00:10:00Z")).toBeInTheDocument();
    expect(screen.queryByText("2026-03-07T00:10:00Z")).not.toBeInTheDocument();

    const currentTag = screen.getByText(i18n.t("account:ME_SECURITY_SESSIONS_CURRENT"));
    expect(currentTag).toBeVisible();

    expect(
      screen.getByPlaceholderText(i18n.t("account:ME_SECURITY_SESSIONS_SEARCH_PLACEHOLDER")),
    ).toBeInTheDocument();
    const refreshButton = screen.getByRole("button", { name: i18n.t("common:DATA_TABLE_REFRESH") });
    expect(
      screen.getByRole("button", { name: i18n.t("common:DATA_TABLE_CUSTOMIZE") }),
    ).toBeInTheDocument();

    await user.click(refreshButton);

    await waitFor(() => {
      expect(listMySessionsMock).toHaveBeenCalledTimes(2);
    });
  });

  it("reveals hidden fields from toolbar and revokes sessions", async () => {
    const user = userEvent.setup();
    mockSessions();
    revokeMySessionMock.mockResolvedValue(null);
    revokeOtherSessionsMock.mockResolvedValue({ revokedCount: 1 });

    renderWithQuery(<MeSecuritySessionsSection />);

    await screen.findByText("Chrome on Windows");
    await user.click(screen.getByRole("button", { name: i18n.t("common:DATA_TABLE_CUSTOMIZE") }));

    await user.click(
      screen.getByRole("switch", {
        name: i18n.t("account:ME_SECURITY_SESSIONS_COL_SIGNED_IN"),
      }),
    );
    await user.click(
      screen.getByRole("switch", {
        name: i18n.t("account:ME_SECURITY_SESSIONS_COL_IP"),
      }),
    );

    expect(
      await screen.findByRole("columnheader", {
        name: i18n.t("account:ME_SECURITY_SESSIONS_COL_SIGNED_IN"),
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("formatted:2026-03-06T00:00:00Z")).toBeInTheDocument();
    expect(screen.getByText("Hangzhou")).toBeInTheDocument();
    expect(screen.getByText("10.0.0.8")).toBeInTheDocument();

    const row = screen.getByText("Chrome on Windows").closest("tr");
    expect(row).not.toBeNull();
    await user.click(
      within(row as HTMLElement).getByRole("button", {
        name: i18n.t("account:ME_SECURITY_SESSIONS_KICK"),
      }),
    );

    await waitFor(() => {
      expect(revokeMySessionMock).toHaveBeenCalledWith("sid-other");
    });

    await user.click(
      screen.getByRole("button", {
        name: i18n.t("account:ME_SECURITY_SESSIONS_KICK_ALL"),
      }),
    );

    await waitFor(() => {
      expect(revokeOtherSessionsMock).toHaveBeenCalledTimes(1);
    });
  });

  it("falls back to IP when location label is unavailable", async () => {
    listMySessionsMock.mockResolvedValue({
      items: [
        {
          sessionId: "sid-local",
          current: true,
          revocable: false,
          issuedAt: "2026-03-07T00:00:00Z",
          lastUsedAt: "2026-03-07T00:10:00Z",
          ipAddress: "127.0.0.1",
          deviceLabel: "Safari on macOS",
          locationLabel: "-",
          authMethod: "password",
          userAgent: "Safari",
        },
      ],
      total: 1,
    });

    renderWithQuery(<MeSecuritySessionsSection />);

    const ipFallbackCells = await screen.findAllByText("127.0.0.1");
    expect(ipFallbackCells.length).toBeGreaterThan(0);
  });

  it("removes the session revocation behavior alert", async () => {
    mockSessions();

    renderWithQuery(<MeSecuritySessionsSection />);

    await screen.findByText("Safari on macOS");
    expect(
      screen.queryByText(i18n.t("account:ME_SECURITY_SESSIONS_REVOKE_NOTE_TITLE")),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(i18n.t("account:ME_SECURITY_SESSIONS_REVOKE_NOTE")),
    ).not.toBeInTheDocument();
  });
});
