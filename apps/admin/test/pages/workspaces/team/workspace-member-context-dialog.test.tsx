import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { ChromeTabsProvider } from "@arclayer/ui/chrome-tabs";
import { WorkspaceMemberContextDialog } from "@/pages/workspaces/team/shared/components/workspace-member-context-dialog";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (key === "team:TEAM_MEMBER_CONTEXT_MULTIPLE_ROLES")
        return `${String(opts?.count ?? 0)} roles`;
      if (key === "team:TEAM_MEMBER_CONTEXT_SUMMARY")
        return `${String(opts?.roleCount ?? 0)} roles assigned`;
      return key;
    },
  }),
}));

vi.mock("@/api/rbac", () => ({
  listAllWorkspaceRoles: vi.fn().mockResolvedValue([
    {
      id: "role-editor",
      code: "editor",
      name: "Editor",
      description: "Can edit content",
      isDefault: false,
      isSuperuser: false,
      isSystem: false,
      permissionCodes: ["system:content:read"],
    },
  ]),
  listAllWorkspacePermissions: vi.fn().mockResolvedValue([
    {
      id: "permission-content-read",
      code: "system:content:read",
      name: "Read content",
      description: "View workspace content",
      ownerKey: "core",
      ownerName: "Core",
    },
  ]),
}));

vi.mock("@/api/activity", () => ({
  listWorkspaceActivity: vi.fn().mockResolvedValue({ items: [] }),
}));

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

const memberFixture = {
  id: "member-1",
  membershipId: "membership-1",
  membershipStatus: "active" as const,
  isOwner: false,
  userId: "user-1",
  username: "ada",
  email: "ada@example.com",
  displayName: "Ada Lovelace",
  avatarUrl: null,
  userStatus: "active" as const,
  lastLoginAt: null,
  roleCodes: ["editor"],
};

function renderDialog(open = true, member = memberFixture) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <QueryClientProvider client={queryClient}>
      <ChromeTabsProvider
        labels={{ scrollLeftAriaLabel: "scroll left", scrollRightAriaLabel: "scroll right" }}
      >
        <WorkspaceMemberContextDialog
          open={open}
          onOpenChange={() => undefined}
          workspaceId="ws-1"
          currentUserId="user-2"
          member={member}
          onAdjustRoles={() => undefined}
          onEnable={() => undefined}
          onDisable={() => undefined}
        />
      </ChromeTabsProvider>
    </QueryClientProvider>,
  );
}

describe("WorkspaceMemberContextDialog", () => {
  it("成员存在时可以稳定渲染，不因 member 初始化顺序崩溃", () => {
    renderDialog();

    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("team:TEAM_MEMBER_CONTEXT_SCOPE")).toBeInTheDocument();
  });

  it("通过角色 permissionCodes 推导成员访问摘要", async () => {
    renderDialog();

    expect(await screen.findByText("Read content")).toBeInTheDocument();
  });

  it("关闭时保留最近一次成员快照，避免关闭动画阶段内容提前卸载", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(
      <QueryClientProvider client={queryClient}>
        <ChromeTabsProvider
          labels={{ scrollLeftAriaLabel: "scroll left", scrollRightAriaLabel: "scroll right" }}
        >
          <WorkspaceMemberContextDialog
            open
            onOpenChange={() => undefined}
            workspaceId="ws-1"
            currentUserId="user-2"
            member={memberFixture}
            onAdjustRoles={() => undefined}
            onEnable={() => undefined}
            onDisable={() => undefined}
          />
        </ChromeTabsProvider>
      </QueryClientProvider>,
    );

    view.rerender(
      <QueryClientProvider client={queryClient}>
        <ChromeTabsProvider
          labels={{ scrollLeftAriaLabel: "scroll left", scrollRightAriaLabel: "scroll right" }}
        >
          <WorkspaceMemberContextDialog
            open={false}
            onOpenChange={() => undefined}
            workspaceId="ws-1"
            currentUserId="user-2"
            member={null}
            onAdjustRoles={() => undefined}
            onEnable={() => undefined}
            onDisable={() => undefined}
          />
        </ChromeTabsProvider>
      </QueryClientProvider>,
    );

    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
  });
});
