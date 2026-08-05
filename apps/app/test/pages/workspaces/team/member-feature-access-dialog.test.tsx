import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  MemberFeatureAccessDialog,
  type MemberFeatureAccessView,
} from "@/pages/workspaces/team/members/components/member-feature-access-dialog";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values ? `${key} ${Object.values(values).join(" ")}` : key,
  }),
}));

const limitedAccess: MemberFeatureAccessView = {
  id: "ai-writing",
  name: "AI writing",
  description: "Draft and refine workspace content.",
  capacity: { kind: "limited", assignedCount: 1, limit: 2, availableCount: 1 },
  assigned: false,
  change: { action: "assign", availability: { status: "available" } },
};

const unlimitedAccess: MemberFeatureAccessView = {
  id: "review-tools",
  name: "Review tools",
  description: "Review changes before publishing.",
  capacity: { kind: "unlimited", assignedCount: 3 },
  assigned: true,
  change: { action: "revoke", availability: { status: "available" } },
};

function renderDialog(
  overrides: Partial<React.ComponentProps<typeof MemberFeatureAccessDialog>> = {},
) {
  const props: React.ComponentProps<typeof MemberFeatureAccessDialog> = {
    open: true,
    onOpenChange: vi.fn(),
    memberName: "Alice Chen",
    canManage: true,
    items: [limitedAccess, unlimitedAccess],
    onRetry: vi.fn(),
    onAssign: vi.fn(),
    onRevoke: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<MemberFeatureAccessDialog {...props} />) };
}

describe("MemberFeatureAccessDialog", () => {
  it("renders limited and unlimited capacity as access without exposing protocol language", () => {
    renderDialog();

    expect(screen.getByText(/featureAccess:DIALOG_TITLE Alice Chen/)).toBeInTheDocument();
    expect(screen.getByText(/featureAccess:USAGE AI writing 1 2/)).toBeInTheDocument();
    expect(screen.getByText(/featureAccess:AVAILABLE 1/)).toBeInTheDocument();
    expect(screen.getByText(/featureAccess:UNLIMITED Review tools/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\b(?:RBAC|Entitlement|seat|permission code)\b/i);
  });

  it("keeps revoke available while new access is paused for payment recovery", async () => {
    const user = userEvent.setup();
    const onAssign = vi.fn();
    const onRevoke = vi.fn();
    renderDialog({
      paymentRecoveryLimited: true,
      onAssign,
      onRevoke,
      items: [
        {
          ...limitedAccess,
          change: {
            action: "assign",
            availability: { status: "available" },
          },
        },
        unlimitedAccess,
      ],
    });

    expect(screen.getByText("featureAccess:PAYMENT_RECOVERY_TITLE")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "featureAccess:ASSIGN" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "featureAccess:REVOKE" }));

    expect(onAssign).not.toHaveBeenCalled();
    expect(onRevoke).toHaveBeenCalledWith(unlimitedAccess);
  });

  it("surfaces read failure and retries only after an explicit action", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    renderDialog({ items: [], loadError: true, onRetry });

    expect(screen.getByText("featureAccess:LOAD_FAILED_TITLE")).toBeInTheDocument();
    expect(onRetry).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "featureAccess:TRY_AGAIN" }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
