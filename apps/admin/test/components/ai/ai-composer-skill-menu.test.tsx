import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { listWorkspaceSkillGrantOptions } from "@/api/workspace-skills";
import { AIComposerSkillMenu } from "@/components/ai/ai-composer-skill-menu";
import { useAIComposerDirectiveStore } from "@/components/ai/ai-composer-directives";
import { SettingsScreenProvider } from "@/components/layout/settings-screen-provider";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

const composerMocks = vi.hoisted(() => ({
  setText: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => composerMocks.navigate,
}));

vi.mock("@assistant-ui/react", () => ({
  useAui: () => ({
    composer: () => ({
      getState: () => ({ text: "现有问题" }),
      setText: composerMocks.setText,
    }),
  }),
}));

vi.mock("@/api/workspace-skills", () => ({
  WORKSPACE_SKILLS_QUERY_KEY: ["workspace", "skills"],
  listWorkspaceSkillGrantOptions: vi.fn(),
}));

vi.mock("@/components/layout/settings-screen-provider", () => ({
  SettingsScreenProvider: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string>) => {
      const labels: Record<string, string> = {
        AI_CHAT_SKILL_LABEL: "技能",
        AI_CHAT_SKILL_SELECT: "选择技能",
        AI_CHAT_SKILL_ENABLED_TITLE: "已启用技能",
        AI_CHAT_SKILL_MANAGE: "管理技能",
        AI_CHAT_SKILL_LOADING: "正在读取",
        AI_CHAT_SKILL_LOAD_FAILED: "读取失败",
        AI_CHAT_SKILL_EMPTY: "暂无技能",
        AI_CHAT_SKILL_ADD: "添加技能",
        AI_CHAT_SKILL_CREATE_WITH_ARCLAYER: "通过 Arclayer 创建",
        AI_CHAT_SKILL_IMPORT: "导入技能",
      };
      if (key === "AI_CHAT_SKILL_PROMPT") {
        return `请使用已启用的${values?.skill ?? ""}技能帮我处理：`;
      }
      return labels[key] ?? key;
    },
  }),
}));

function renderMenu(children: ReactNode = <AIComposerSkillMenu />) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <SettingsScreenProvider>{children}</SettingsScreenProvider>
    </QueryClientProvider>,
  );
}

describe("AIComposerSkillMenu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAIComposerDirectiveStore.getState().clearDirectives("thread");
    useWorkspaceStore.setState({
      currentWorkspaceId: "workspace-1",
      lastWorkspaceId: "workspace-1",
    });
    vi.mocked(listWorkspaceSkillGrantOptions).mockResolvedValue({
      installations: [
        {
          acceptedDataEgress: [],
          acceptedPermissions: [],
          acceptedRequiredTools: [],
          createdAt: "2026-07-23T00:00:00Z",
          id: "installation-1",
          installedByUserId: null,
          metadataRevision: 1,
          packageChecksum: "checksum",
          packageId: "package-1",
          packageScope: "workspace",
          safeReasonCode: null,
          status: "enabled",
          updatedAt: "2026-07-23T00:00:00Z",
          updatedByUserId: null,
          validationFindingHash: "finding-hash",
          versionId: "version-1",
          workspaceId: "workspace-1",
        },
      ],
      officialPackages: [],
      workspacePackages: [
        {
          createdAt: "2026-07-23T00:00:00Z",
          createdByUserId: null,
          description: "生成结构化电商内容",
          displayName: "电商内容",
          id: "package-1",
          latestValidVersionId: "version-1",
          metadataRevision: 1,
          publisherId: "workspace-1",
          publisherName: "Workspace",
          slug: "commerce-content",
          sourceKind: "workspace",
          status: "active",
          trustLevel: "workspace",
          updatedAt: "2026-07-23T00:00:00Z",
          updatedByUserId: null,
          versionCount: 1,
          workspaceId: "workspace-1",
        },
      ],
    });
  });

  it("loads enabled workspace Skills and stores the selected Skill as composer context", async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole("button", { name: "选择技能" }));
    await user.click(await screen.findByRole("menuitem", { name: /电商内容/ }));

    expect(composerMocks.setText).not.toHaveBeenCalled();
    expect(useAIComposerDirectiveStore.getState().directivesByScope.thread).toEqual([
      {
        type: "skill",
        id: "installation-1",
        label: "电商内容",
        instruction: "请使用已启用的电商内容技能帮我处理：",
      },
    ]);
  });

  it("offers Arclayer creation and import from the add-skill submenu", async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole("button", { name: "选择技能" }));
    const addSkillItem = await screen.findByRole("menuitem", { name: "添加技能" });
    addSkillItem.focus();
    await user.keyboard("{ArrowRight}");
    const createItem = await screen.findByRole("menuitem", { name: "通过 Arclayer 创建" });
    createItem.focus();
    await user.keyboard("{Enter}");

    await waitFor(() => expect(composerMocks.setText).toHaveBeenCalledWith("/skill-creator "));

    await user.click(screen.getByRole("button", { name: "选择技能" }));
    const reopenedAddSkillItem = await screen.findByRole("menuitem", { name: "添加技能" });
    reopenedAddSkillItem.focus();
    await user.keyboard("{ArrowRight}");
    const importItem = await screen.findByRole("menuitem", { name: "导入技能" });
    importItem.focus();
    await user.keyboard("{Enter}");

    await waitFor(() =>
      expect(composerMocks.navigate).toHaveBeenCalledWith({
        to: "/customization/skills",
        search: { action: "import" },
      }),
    );
  });
});
