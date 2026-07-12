import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

vi.mock("@/lib/assets/asset-urls", () => ({
  resolveAssetRefToPublicUrlPath: (ref: string | null | undefined) =>
    ref ? `resolved:${ref}` : undefined,
}));

import { UserAvatar, WorkspaceAvatar } from "@/components/common/entity-avatar";

const WCAG_NORMAL_TEXT_MINIMUM_CONTRAST = 4.5;

function relativeLuminance(hexColor: string): number {
  const channels = hexColor
    .slice(1)
    .match(/.{2}/g)
    ?.map((channel) => {
      const srgb = Number.parseInt(channel, 16) / 255;
      return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
    });
  if (!channels || channels.length !== 3) throw new Error(`Invalid test color: ${hexColor}`);
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}

function contrastRatio(firstColor: string, secondColor: string): number {
  const lighter = Math.max(relativeLuminance(firstColor), relativeLuminance(secondColor));
  const darker = Math.min(relativeLuminance(firstColor), relativeLuminance(secondColor));
  return (lighter + 0.05) / (darker + 0.05);
}

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

  test("selects a WCAG-compliant foreground for the default custom workspace color", () => {
    render(
      <WorkspaceAvatar
        name="Contrast workspace"
        iconMode="initials"
        iconColor="#337ea9"
        size={40}
      />,
    );

    const avatar = screen.getByLabelText("Contrast workspace");

    expect(avatar).toHaveStyle({
      backgroundColor: "rgb(51, 126, 169)",
      color: "rgb(0, 0, 0)",
    });
    expect(contrastRatio("#337ea9", "#000000")).toBeGreaterThanOrEqual(
      WCAG_NORMAL_TEXT_MINIMUM_CONTRAST,
    );
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
