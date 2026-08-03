import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  AIComposerDirectiveChips,
  AIComposerDirectiveSync,
} from "@/components/ai/ai-composer-directive-chips";
import { useAIComposerDirectiveStore } from "@/components/ai/ai-composer-directives";
import { useAiChatStore } from "@/stores/use-ai-chat-store";

const mocks = vi.hoisted(() => ({
  composerText: "",
  runConfig: {} as { custom?: Record<string, unknown> },
  setRunConfig: vi.fn(),
}));

vi.mock("@assistant-ui/react", () => ({
  useAui: () => ({
    composer: () => ({
      getState: () => ({ runConfig: mocks.runConfig }),
      setRunConfig: mocks.setRunConfig,
    }),
  }),
  useAuiState: (selector: (state: { composer: { text: string } }) => unknown) =>
    selector({ composer: { text: mocks.composerText } }),
}));

vi.mock("@arclayer/ui/tooltip", () => ({
  Tooltip: ({ children }: { children?: ReactNode }) => <>{children}</>,
  TooltipContent: () => null,
  TooltipTrigger: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        AI_CHAT_WEB_SEARCH: "Web search",
        AI_CHAT_WEB_SEARCH_ENABLED: "Web search enabled",
      })[key] ?? key,
  }),
}));

describe("AIComposerDirectiveChips", () => {
  beforeEach(() => {
    mocks.composerText = "";
    mocks.runConfig = {};
    mocks.setRunConfig.mockClear();
    useAIComposerDirectiveStore.setState({
      directivesByScope: { thread: [], home: [] },
    });
    useAiChatStore.setState({ webSearchEnabled: false });
  });

  it("keeps web search as the only chip above the rich composer", () => {
    useAiChatStore.setState({ webSearchEnabled: true });
    render(<AIComposerDirectiveChips scope="thread" />);

    expect(screen.getByText("Web search enabled")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Web search" })).toBeInTheDocument();
  });

  it("synchronizes Agent and Skill IDs from serialized rich-text nodes", async () => {
    mocks.composerText = ":skill[Interface Design Review]{name=skill-1}";
    useAIComposerDirectiveStore
      .getState()
      .addDirectives("thread", [
        { type: "skill", id: "skill-1", label: "Interface Design Review" },
      ]);

    render(<AIComposerDirectiveSync scope="thread" />);

    await waitFor(() =>
      expect(mocks.setRunConfig).toHaveBeenCalledWith({
        custom: {
          mentionedAgentIds: [],
          selectedSkillInstallationIds: ["skill-1"],
        },
      }),
    );
  });

  it("removes a stored reference after its Lexical node is deleted", async () => {
    useAIComposerDirectiveStore
      .getState()
      .addDirectives("thread", [{ type: "agent", id: "agent-1", label: "Data Analyst" }]);

    render(<AIComposerDirectiveSync scope="thread" />);

    await waitFor(() =>
      expect(useAIComposerDirectiveStore.getState().directivesByScope.thread).toEqual([]),
    );
  });
});
