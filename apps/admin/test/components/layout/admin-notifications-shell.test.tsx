import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AdminNotificationsShell } from "@/components/layout/admin-notifications-shell";

vi.mock("@/components/layout/admin-notifications-panel", () => ({
  AdminNotificationsPanel: ({ className, isPinned }: { className?: string; isPinned: boolean }) => (
    <div data-testid={isPinned ? "pinned-panel" : "floating-panel"} className={className}>
      panel
    </div>
  ),
}));

describe("AdminNotificationsShell", () => {
  it("让通知面板采用内容驱动宽度，而不是固定 rem 宽度", () => {
    render(
      <AdminNotificationsShell
        open
        pinned={false}
        closeAriaLabel="close"
        onPinnedChange={() => undefined}
        onClose={() => undefined}
      />,
    );

    const panel = screen.getByTestId("floating-panel");
    expect(panel).toHaveClass("w-fit", "max-w-full");
    expect(panel).not.toHaveClass("w-[min(100%,32rem)]");
  });
});
