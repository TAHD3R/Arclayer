import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

import { listMySessions, revokeMySession, revokeOtherSessions } from "@/api/auth";
import { DEFAULT_LOCALE, i18n, initI18n } from "@/lib/i18n";
import { UserSessionsSection } from "@/pages/usercenter/security/components/security-sessions-section";

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

describe("UserSessionsSection", () => {
  it("renders a lightweight sessions table without search or toolbar controls", async () => {
    mockSessions();

    renderWithQuery(<UserSessionsSection />);

    expect(await screen.findByText("Safari on macOS")).toBeInTheDocument();
    expect(screen.getByText(i18n.t("account:ME_SECURITY_SESSIONS_TABLE_DESC"))).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", {
        name: i18n.t("account:ME_SECURITY_SESSIONS_COL_DEVICE"),
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", {
        name: i18n.t("account:ME_SECURITY_SESSIONS_COL_LAST_ACTIVE"),
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", {
        name: i18n.t("account:ME_SECURITY_SESSIONS_COL_LOCATION"),
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("columnheader").at(3)).toHaveTextContent("");

    expect(screen.getByText(i18n.t("account:ME_SECURITY_SESSIONS_CURRENT"))).toBeInTheDocument();
    expect(screen.getByText("formatted:2026-03-07T00:10:00Z")).toBeInTheDocument();
    expect(screen.queryByText("2026-03-07T00:10:00Z")).not.toBeInTheDocument();
    const currentRow = screen.getByText("Safari on macOS").closest("tr");
    expect(currentRow).not.toBeNull();
    expect(
      within(currentRow as HTMLElement).getByRole("button", {
        name: i18n.t("account:ME_SECURITY_SESSIONS_KICK"),
      }),
    ).toBeDisabled();

    expect(
      screen.queryByPlaceholderText(i18n.t("account:ME_SECURITY_SESSIONS_SEARCH_PLACEHOLDER")),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: i18n.t("common:DATA_TABLE_COLUMNS") }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: i18n.t("common:DATA_TABLE_REFRESH") }),
    ).not.toBeInTheDocument();
  });

  it("opens confirm dialogs before revoking one session or all other sessions", async () => {
    const user = userEvent.setup();
    mockSessions();
    revokeMySessionMock.mockResolvedValue(null);
    revokeOtherSessionsMock.mockResolvedValue({ revokedCount: 1 });

    renderWithQuery(<UserSessionsSection />);

    const otherRow = (await screen.findByText("Chrome on Windows")).closest("tr");
    expect(otherRow).not.toBeNull();

    await user.click(
      within(otherRow as HTMLElement).getByRole("button", {
        name: i18n.t("account:ME_SECURITY_SESSIONS_KICK"),
      }),
    );

    let dialog = await screen.findByRole("alertdialog");
    let dialogScope = within(dialog);
    expect(
      dialogScope.getByText(
        i18n.t("account:ME_SECURITY_SESSIONS_KICK_CONFIRM_DESC", {
          device: "Chrome on Windows",
        }),
      ),
    ).toBeInTheDocument();
    expect(revokeMySessionMock).not.toHaveBeenCalled();

    await user.click(
      dialogScope.getByRole("button", { name: i18n.t("account:ME_SECURITY_SESSIONS_KICK") }),
    );

    await waitFor(() => {
      expect(revokeMySessionMock).toHaveBeenCalledWith("sid-other");
    });
    await waitFor(
      () => {
        expect(document.body).not.toHaveAttribute("data-scroll-locked");
      },
      { timeout: 5000 },
    );

    await user.click(
      screen.getByRole("button", {
        name: i18n.t("account:ME_SECURITY_SESSIONS_KICK_ALL"),
      }),
    );

    dialog = await screen.findByRole("alertdialog");
    dialogScope = within(dialog);
    expect(
      dialogScope.getByText(i18n.t("account:ME_SECURITY_SESSIONS_KICK_ALL_CONFIRM_DESC")),
    ).toBeInTheDocument();
    expect(revokeOtherSessionsMock).toHaveBeenCalledTimes(0);

    await user.click(
      dialogScope.getByRole("button", {
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

    renderWithQuery(<UserSessionsSection />);

    expect(await screen.findByText("127.0.0.1")).toBeInTheDocument();
  });
});
