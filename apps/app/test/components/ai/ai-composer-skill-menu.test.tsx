import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { listWorkspaceSkillGrantOptions } from "@/api/workspace-skills";
import { AIComposerSkillMenu } from "@/components/ai/ai-composer-skill-menu";
import { useAIComposerDirectiveStore } from "@/components/ai/ai-composer-directives";
import { SettingsScreenProvider } from "@/components/layout/settings-screen-provider";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

const composerMocks = vi.hoisted(() => ({
  runConfig: { custom: { existing: "value" } } as { custom?: Record<string, unknown> },
  setRunConfig: vi.fn(),
  setText: vi.fn(),
  insertDirective: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => composerMocks.navigate,
}));

vi.mock("@assistant-ui/react", () => ({
  useAui: () => ({
    composer: () => ({
      getState: () => ({ text: "现有问题", runConfig: composerMocks.runConfig }),
      setRunConfig: composerMocks.setRunConfig,
      setText: composerMocks.setText,
    }),
  }),
}));

vi.mock("@/components/ai/ai-composer-rich-input", () => ({
  useAIComposerDirectiveInsertion: () => ({ insertDirective: composerMocks.insertDirective }),
}));

vi.mock("@/api/workspace-skills", () => ({
  WORKSPACE_SKILLS_QUERY_KEY: ["workspace", "skills"],
  listWorkspaceSkillGrantOptions: vi.fn(),
}));

vi.mock("@/components/layout/settings-screen-provider", () => ({
  SettingsScreenProvider: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

vi.mock("@arclayer/ui/dropdown-menu", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@arclayer/ui/dropdown-menu")>();
  const ActualDropdownMenuContent = actual.DropdownMenuContent;

  return {
    ...actual,
    DropdownMenuContent: ({
      collisionPadding,
      ...props
    }: ComponentProps<typeof ActualDropdownMenuContent>) => (
      <ActualDropdownMenuContent
        data-collision-padding={String(collisionPadding)}
        collisionPadding={collisionPadding}
        {...props}
      />
    ),
  };
});

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
        AI_CHAT_SKILL_WRITE_MANUALLY: "手动编写",
        AI_CHAT_SKILL_IMPORT_GITHUB: "从 GitHub 导入",
        AI_CHAT_SKILL_UPLOAD_ZIP: "上传 ZIP",
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
    composerMocks.runConfig = { custom: { existing: "value" } };
    composerMocks.setRunConfig.mockImplementation((runConfig) => {
      composerMocks.runConfig = runConfig as { custom?: Record<string, unknown> };
    });
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

  it("inserts a selected Skill as an inline directive at the active cursor", async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole("button", { name: "选择技能" }));
    await user.click(await screen.findByRole("menuitem", { name: /电商内容/ }));

    expect(composerMocks.setText).not.toHaveBeenCalled();
    expect(composerMocks.insertDirective).toHaveBeenCalledWith({
      type: "skill",
      id: "installation-1",
      label: "电商内容",
    });
    expect(composerMocks.setRunConfig).toHaveBeenCalledWith({
      custom: { existing: "value", selectedSkillInstallationIds: ["installation-1"] },
    });
    expect(useAIComposerDirectiveStore.getState().directivesByScope.thread).toEqual([
      {
        type: "skill",
        id: "installation-1",
        label: "电商内容",
      },
    ]);
  });

  it("keeps the Skill menu inside a padded viewport collision boundary", async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole("button", { name: "选择技能" }));

    expect(await screen.findByRole("menu")).toHaveAttribute("data-collision-padding", "16");
  });

  it("renders an icon-only trigger without changing the Skill menu", async () => {
    const user = userEvent.setup();
    renderMenu(<AIComposerSkillMenu iconOnly />);

    const trigger = screen.getByRole("button", { name: "选择技能" });
    expect(trigger).toHaveClass("w-8", "px-0");
    expect(trigger).toHaveAttribute("title", "技能");
    expect(trigger).not.toHaveTextContent("技能");

    await user.click(trigger);
    expect(await screen.findByRole("menuitem", { name: /电商内容/ })).toBeInTheDocument();
  });

  it("offers every supported creation path from the add-skill submenu", async () => {
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
    const githubItem = await screen.findByRole("menuitem", { name: "从 GitHub 导入" });
    githubItem.focus();
    await user.keyboard("{Enter}");

    await waitFor(() =>
      expect(composerMocks.navigate).toHaveBeenCalledWith({
        to: "/customization/skills",
        search: { action: "github" },
      }),
    );

    await user.click(screen.getByRole("button", { name: "选择技能" }));
    const thirdAddSkillItem = await screen.findByRole("menuitem", { name: "添加技能" });
    thirdAddSkillItem.focus();
    await user.keyboard("{ArrowRight}");
    const zipItem = await screen.findByRole("menuitem", { name: "上传 ZIP" });
    zipItem.focus();
    await user.keyboard("{Enter}");

    await waitFor(() =>
      expect(composerMocks.navigate).toHaveBeenCalledWith({
        to: "/customization/skills",
        search: { action: "zip" },
      }),
    );

    await user.click(screen.getByRole("button", { name: "选择技能" }));
    const fourthAddSkillItem = await screen.findByRole("menuitem", { name: "添加技能" });
    fourthAddSkillItem.focus();
    await user.keyboard("{ArrowRight}");
    const manualItem = await screen.findByRole("menuitem", { name: "手动编写" });
    manualItem.focus();
    await user.keyboard("{Enter}");

    await waitFor(() =>
      expect(composerMocks.navigate).toHaveBeenCalledWith({
        to: "/customization/skills",
        search: { action: "manual" },
      }),
    );
  });
});
