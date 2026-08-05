import { render, screen } from "@testing-library/react";
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
  it("为邀请场景保留简洁身份行，并移除 preview card 详情", () => {
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
    expect(screen.queryByText("ada@example.com")).toBeNull();
    expect(screen.queryByText("Administrator")).toBeNull();
    expect(screen.queryByText("Pending")).toBeNull();
    expect(screen.queryByText("invitee@example.com")).toBeNull();
    expect(screen.queryByText("2026-03-24 09:00")).toBeNull();
  });
});
