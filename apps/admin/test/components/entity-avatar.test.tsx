import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

vi.mock("@/lib/assets/asset-urls", () => ({
  resolveAssetRefToPublicUrlPath: (ref: string | null | undefined) =>
    ref ? `resolved:${ref}` : undefined,
}));

import { UserAvatar, WorkspaceAvatar } from "@/components/common/entity-avatar";

describe("entity-avatar", () => {
  test("renders user avatar image with resolved source", () => {
    render(<UserAvatar name="Ada Lovelace" assetRef="/assets/user.png" size={28} />);

    const avatar = screen.getByLabelText("Ada Lovelace");
    const image = screen.getByRole("img", { name: "Ada Lovelace" });

    expect(avatar).toHaveClass("rounded-full");
    expect(image).toHaveAttribute("src", "resolved:/assets/user.png");
  });

  test("renders workspace avatar fallback initials with compact square corners", () => {
    render(<WorkspaceAvatar name="Content Lab" assetRef={null} size={40} />);

    const avatar = screen.getByLabelText("Content Lab");

    expect(avatar).toHaveClass("rounded-sm");
    expect(avatar).toHaveTextContent("CL");
  });

  test("falls back to initials when the avatar image cannot load", () => {
    render(
      <WorkspaceAvatar name="Philip Cole's Workspace 2" assetRef="/assets/broken.png" size={40} />,
    );

    const image = screen.getByRole("img", { name: "Philip Cole's Workspace 2" });
    fireEvent.error(image);

    const avatar = screen.getByLabelText("Philip Cole's Workspace 2");

    expect(screen.queryByRole("img", { name: "Philip Cole's Workspace 2" })).toBeNull();
    expect(avatar).toHaveTextContent("P2");
  });

  test("renders workspace glyph icon with custom background", () => {
    render(
      <WorkspaceAvatar
        name="Launchpad"
        iconMode="glyph"
        iconGlyph="rocket"
        iconColor="#112233"
        size={40}
      />,
    );

    const avatar = screen.getByLabelText("Launchpad");

    expect(avatar.querySelector("svg.lucide-rocket")).toBeTruthy();
    expect(avatar).toHaveStyle({ backgroundColor: "rgb(17, 34, 51)" });
  });

  test("renders workspace emoji without requiring an image asset", () => {
    render(
      <WorkspaceAvatar
        name="Delight Team"
        iconMode="emoji"
        iconEmoji="🌞"
        iconColor="#ffe082"
        size={40}
      />,
    );

    expect(screen.getByLabelText("Delight Team")).toHaveTextContent("🌞");
  });
});
