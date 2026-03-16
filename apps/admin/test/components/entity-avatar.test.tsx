import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

vi.mock("@/lib/assets/asset-urls", () => ({
  resolveAssetRefToPublicUrlPath: (ref: string | null | undefined) =>
    ref ? `resolved:${ref}` : undefined,
}));

import { OrganizationAvatar, UserAvatar, WorkspaceAvatar } from "@/components/common/entity-avatar";

describe("entity-avatar", () => {
  test("renders user avatar image with resolved source", () => {
    render(<UserAvatar name="Ada Lovelace" assetRef="/assets/user.png" size={28} />);

    const avatar = screen.getByLabelText("Ada Lovelace");
    const image = screen.getByRole("img", { name: "Ada Lovelace" });

    expect(avatar).toHaveClass("rounded-full");
    expect(image).toHaveAttribute("src", "resolved:/assets/user.png");
  });

  test("renders workspace avatar fallback initials as square", () => {
    render(<WorkspaceAvatar name="Content Lab" assetRef={null} size={40} />);

    const avatar = screen.getByLabelText("Content Lab");

    expect(avatar).toHaveClass("rounded-md");
    expect(avatar).toHaveTextContent("CL");
  });

  test("falls back to default organization label when name is missing", () => {
    render(<OrganizationAvatar name="" assetRef={null} size={40} />);

    const avatar = screen.getByLabelText("组织");

    expect(avatar).toHaveClass("rounded-md");
    expect(avatar).toHaveTextContent("组");
  });
});
