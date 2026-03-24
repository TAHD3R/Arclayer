import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { ChromeTabsProvider } from "@arclayer/ui/chrome-tabs";
import { MemberContextDialog } from "@/pages/workspaces/team/shared/components/member-context-dialog";

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

function renderDialog() {
  return render(
    <ChromeTabsProvider
      labels={{ scrollLeftAriaLabel: "scroll left", scrollRightAriaLabel: "scroll right" }}
    >
      <MemberContextDialog
        open
        onOpenChange={() => undefined}
        dialogTitle="Member details"
        dialogDescription="See access and activity in one place"
        member={{
          displayName: "Ada Lovelace",
          username: "ada",
          email: "ada@example.com",
          avatarUrl: "/avatars/ada.png",
        }}
        scopeLabel="Organization"
        badges={<span>Administrator</span>}
        actionButtons={[
          {
            key: "change-role",
            label: "Change role",
            onClick: () => undefined,
          },
        ]}
        tabs={[
          { key: "overview", label: "Overview", content: <div>Overview panel</div> },
          { key: "access", label: "Access", content: <div>Access panel</div> },
        ]}
      />
    </ChromeTabsProvider>,
  );
}

describe("MemberContextDialog", () => {
  it("显示顶部摘要并支持通过 ChromeTabs 切换内容", async () => {
    const user = userEvent.setup();
    renderDialog();

    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("Organization")).toBeInTheDocument();
    expect(screen.getByText("Administrator")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Change role" })).toBeInTheDocument();
    expect(screen.getByText("Overview panel")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Access" }));
    expect(screen.getByText("Access panel")).toBeInTheDocument();
  });
});
