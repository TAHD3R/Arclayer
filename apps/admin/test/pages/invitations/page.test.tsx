import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { InvitationsPage } from "@/pages/invitations/page";

type RuntimeState = {
  runtime: Record<string, unknown> | null;
  instanceSetupStatus: "uninitialized" | "ready" | "repair_required" | null;
  instanceSetupRepairReason: string | null;
};

const { navigateMock, runtimeState } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  runtimeState: {
    runtime: {} as RuntimeState["runtime"],
    instanceSetupStatus: "ready" as RuntimeState["instanceSetupStatus"],
    instanceSetupRepairReason: null as RuntimeState["instanceSetupRepairReason"],
  },
}));

let currentSearch: Record<string, unknown> = { token: "invite-token" };

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigateMock,
  getRouteApi: () => ({ useSearch: () => currentSearch }),
}));

vi.mock("@/hooks/use-system-runtime", () => ({
  useSystemRuntime: () => runtimeState,
}));

vi.mock("@/pages/invitations/components/invitations-view", () => ({
  InvitationsView: ({ token }: { token: string | null }) => (
    <div data-testid="invitations-view">{token ?? "no-token"}</div>
  ),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

beforeEach(() => {
  navigateMock.mockReset();
  currentSearch = { token: "invite-token" };
  runtimeState.runtime = {};
  runtimeState.instanceSetupStatus = "ready";
  runtimeState.instanceSetupRepairReason = null;
});

describe("InvitationsPage instance gating", () => {
  it("blocks invite flow until instance setup is completed", async () => {
    runtimeState.instanceSetupStatus = "uninitialized";

    render(<InvitationsPage />);

    await waitFor(() => {
      expect(screen.getByText("invite:INVITE_SETUP_REQUIRED_TITLE")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("invitations-view")).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "invite:INVITE_SETUP_REQUIRED_ACTION" }));

    expect(navigateMock).toHaveBeenCalledWith({
      to: "/login",
      search: { redirect: "/invitations?token=invite-token" },
    });
  });

  it("shows repair gate instead of normal invite flow when instance is invalid", async () => {
    runtimeState.instanceSetupStatus = "repair_required";
    runtimeState.instanceSetupRepairReason = "missing_install_lock";

    render(<InvitationsPage />);

    await waitFor(() => {
      expect(screen.getByText("invite:INVITE_REPAIR_REQUIRED_TITLE")).toBeInTheDocument();
    });
    expect(screen.getByText("missing_install_lock")).toBeInTheDocument();
    expect(screen.queryByTestId("invitations-view")).not.toBeInTheDocument();
  });

  it("renders the normal invite flow once the instance is ready", async () => {
    render(<InvitationsPage />);

    await waitFor(() => {
      expect(screen.getByTestId("invitations-view")).toBeInTheDocument();
    });
    expect(screen.getByTestId("invitations-view")).toHaveTextContent("invite-token");
  });
});
