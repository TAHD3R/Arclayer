import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";

vi.mock("antd", () => ({
  Avatar: ({
    children,
    src,
    shape,
    size,
    className,
  }: {
    children?: ReactNode;
    src?: unknown;
    shape?: unknown;
    size?: unknown;
    className?: unknown;
  }) => (
    <div
      data-testid="avatar"
      data-src={typeof src === "string" ? src : ""}
      data-shape={typeof shape === "string" ? shape : "circle"}
      data-size={String(size ?? "")}
      className={typeof className === "string" ? className : undefined}
    >
      {children}
    </div>
  ),
}));

vi.mock("@/lib/assets/asset-urls", () => ({
  resolveAssetRefToPublicUrlPath: (ref: string | null | undefined) =>
    ref ? `resolved:${ref}` : undefined,
}));

import { OrganizationAvatar, UserAvatar, WorkspaceAvatar } from "@/components/common/entity-avatar";

describe("entity-avatar", () => {
  test("renders user avatar with resolved source and initials", () => {
    render(<UserAvatar name="Ada Lovelace" assetRef="/assets/user.png" size={28} />);

    const avatar = screen.getByTestId("avatar");
    expect(avatar).toHaveAttribute("data-shape", "circle");
    expect(avatar).toHaveAttribute("data-src", "resolved:/assets/user.png");
    expect(avatar).toHaveTextContent("AL");
  });

  test("renders workspace avatar as square", () => {
    render(<WorkspaceAvatar name="Content Lab" assetRef="workspace-icon" size={40} />);

    const avatar = screen.getByTestId("avatar");
    expect(avatar).toHaveAttribute("data-shape", "square");
    expect(avatar).toHaveAttribute("data-src", "resolved:workspace-icon");
    expect(avatar).toHaveTextContent("CL");
  });

  test("falls back to default organization label when name is missing", () => {
    render(<OrganizationAvatar name="" assetRef={null} size={40} />);

    const avatar = screen.getByTestId("avatar");
    expect(avatar).toHaveAttribute("data-shape", "square");
    expect(avatar).toHaveAttribute("data-src", "");
    expect(avatar).toHaveTextContent("组");
  });
});
