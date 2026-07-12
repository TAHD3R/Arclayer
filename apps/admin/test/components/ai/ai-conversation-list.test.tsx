import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { setAIConversationArchived } from "@/api/ai";
import { AIConversationList } from "@/components/ai/ai-conversation-list";
import { useAiChatStore } from "@/stores/use-ai-chat-store";

const { loadAIConversationsMock, setAIConversationArchivedMock } = vi.hoisted(() => ({
  loadAIConversationsMock: vi.fn(async () => undefined),
  setAIConversationArchivedMock: vi.fn(async () => undefined),
}));

vi.mock("@/api/ai", () => ({
  deleteAIConversation: vi.fn(async () => undefined),
  loadAIConversations: loadAIConversationsMock,
  renameAIConversation: vi.fn(async () => undefined),
  setAIConversationArchived: setAIConversationArchivedMock,
}));

vi.mock("@/lib/notifications", () => ({
  notifyError: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "zh-CN" },
    t: (key: string) => key,
  }),
}));

describe("AIConversationList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAiChatStore.setState({
      conversations: [
        {
          id: "conversation-project",
          title: "企业站规划",
          messages: [{ role: "user", content: "规划企业站" }],
          contextSnapshot: {
            projectId: "project-1",
            projectName: "Arclayer 企业站",
          },
          createdAt: 1,
          updatedAt: 2,
          archivedAt: null,
        },
        {
          id: "conversation-other",
          title: "系统设置讨论",
          messages: [{ role: "user", content: "检查系统设置" }],
          createdAt: 1,
          updatedAt: 1,
          archivedAt: null,
        },
      ],
      activeId: "conversation-project",
      pinnedConversationIds: [],
      drawerOpen: false,
      streaming: false,
    });
  });

  it("uses a named mode trigger and collapses conversations under their real project name", async () => {
    const user = userEvent.setup();
    render(<AIConversationList />);

    expect(screen.getByRole("button", { name: "ai:AI_CHAT_SELECT" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "ai:AI_CHAT_ORGANIZE_RECENT" }));
    await user.click(screen.getByRole("menuitemradio", { name: "ai:AI_CHAT_ORGANIZE_PROJECT" }));

    const projectSection = screen.getByRole("button", { name: "Arclayer 企业站" });
    expect(projectSection).toHaveAttribute("aria-expanded", "true");
    expect(projectSection).toHaveClass("group/section");
    expect(projectSection.querySelector("svg")).toHaveClass("group-hover/section:opacity-100");
    expect(screen.getByText("企业站规划")).toBeInTheDocument();

    await user.click(projectSection);

    expect(projectSection).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("企业站规划")).not.toBeInTheDocument();
  });

  it("replaces the new-conversation footer with real batch actions in selection mode", async () => {
    const user = userEvent.setup();
    render(<AIConversationList />);

    await user.click(screen.getByRole("button", { name: "ai:AI_CHAT_SELECT" }));
    const [firstConversationCheckbox] = screen.getAllByRole("checkbox", {
      name: "ai:AI_CHAT_SELECT_CONVERSATION",
    });
    if (!firstConversationCheckbox) throw new Error("Missing conversation checkbox");
    await user.click(firstConversationCheckbox);
    await user.click(screen.getByRole("button", { name: "ai:AI_CHAT_ARCHIVE" }));

    expect(setAIConversationArchived).not.toHaveBeenCalled();
    const confirmation = screen.getByRole("alertdialog");
    expect(within(confirmation).getByText("ai:AI_CHAT_BATCH_ARCHIVE_TITLE")).toBeInTheDocument();
    await user.click(within(confirmation).getByRole("button", { name: "ai:AI_CHAT_ARCHIVE" }));

    await waitFor(() => {
      expect(setAIConversationArchived).toHaveBeenCalledWith("conversation-project", true);
    });
    expect(screen.getByRole("button", { name: "ai:AI_CHAT_SELECT" })).toBeInTheDocument();
  });

  it("moves conversations from archived projects out of active views", async () => {
    const user = userEvent.setup();
    useAiChatStore.setState({
      conversations: [
        {
          id: "conversation-archived-project",
          title: "归档项目里的讨论",
          messages: [{ role: "user", content: "继续讨论" }],
          contextSnapshot: { projectId: "project-archived", projectName: "旧官网" },
          createdAt: 1,
          updatedAt: 1,
          archivedAt: null,
          projectArchivedAt: 2,
        },
      ],
      activeId: "conversation-archived-project",
    });
    render(<AIConversationList />);

    expect(screen.queryByText("归档项目里的讨论")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "ai:AI_CHAT_ORGANIZE_RECENT" }));
    await user.click(screen.getByRole("menuitemradio", { name: "ai:AI_CHAT_ORGANIZE_ARCHIVED" }));

    expect(await screen.findByText("归档项目里的讨论")).toBeInTheDocument();
  });
});
