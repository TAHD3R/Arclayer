import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { InvitationsPage } from "@/pages/invitations/page";

vi.mock("@tanstack/react-router", () => ({
  getRouteApi: () => ({ useSearch: () => ({ token: "invite-token" }) }),
}));

vi.mock("@/pages/invitations/components/invitations-view", () => ({
  InvitationsView: ({ token }: { token: string | null }) => (
    <div data-testid="invitations-view">{token ?? "no-token"}</div>
  ),
}));

describe("InvitationsPage", () => {
  it("renders the Product invitation flow directly", () => {
    render(<InvitationsPage />);

    expect(screen.getByTestId("invitations-view")).toHaveTextContent("invite-token");
  });
});
