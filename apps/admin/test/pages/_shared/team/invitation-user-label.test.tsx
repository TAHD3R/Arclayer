import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it } from "vitest";

import { InvitationUserLabel } from "@/pages/workspaces/team/shared/components/invitation-user-label";

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
});

describe("InvitationUserLabel", () => {
  it("为邀请场景提供统一 trigger affordance 和上下文 hover card", async () => {
    const user = userEvent.setup();

    render(
      <InvitationUserLabel
        user={{
          displayName: "Ada Lovelace",
          username: "ada",
          email: "ada@example.com",
          avatarUrl: "/avatars/ada.png",
          userId: "user_ada",
        }}
        roleLabel="Administrator"
        status="pending"
        statusLabel="Pending"
        details={[
          { label: "Invitee", value: "invitee@example.com" },
          { label: "Expires", value: "2026-03-24 09:00" },
        ]}
      />,
    );

    const trigger = screen.getByText("Ada Lovelace").closest("[data-user-identity-trigger]");
    expect(trigger).not.toBeNull();
    expect(trigger).toHaveClass("rounded-lg");
    expect(trigger).toHaveClass("hover:bg-accent/45");

    await user.hover(trigger!);

    await waitFor(() => {
      expect(screen.getByText("Administrator")).toBeVisible();
      expect(screen.getByText("Pending")).toBeVisible();
      expect(screen.getByText("invitee@example.com")).toBeVisible();
      expect(screen.getByText("2026-03-24 09:00")).toBeVisible();
    });
  });
});
