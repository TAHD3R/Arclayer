import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AIComposerDirectiveChips } from "@/components/ai/ai-composer-directive-chips";
import { useAIComposerDirectiveStore } from "@/components/ai/ai-composer-directives";
import { useAiChatStore } from "@/stores/use-ai-chat-store";

vi.mock("@assistant-ui/react", () => ({
  useAui: () => ({
    composer: () => ({
      getState: () => ({ runConfig: {} }),
      setRunConfig: vi.fn(),
      setText: vi.fn(),
    }),
  }),
  useAuiState: (selector: (state: { composer: { text: string } }) => unknown) =>
    selector({ composer: { text: "" } }),
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
        "ai:AI_CHAT_DIRECTIVE_SKILL": "Skill",
        AI_CHAT_DIRECTIVE_SKILL: "Skill",
      })[key] ?? key,
  }),
}));

describe("AIComposerDirectiveChips", () => {
  beforeEach(() => {
    useAIComposerDirectiveStore.setState({
      directivesByScope: {
        thread: [{ type: "skill", id: "skill-1", label: "Interface Design Review" }],
        home: [],
      },
    });
    useAiChatStore.setState({ webSearchEnabled: false });
  });

  it("overlays the close action without reserving chip layout width", () => {
    render(<AIComposerDirectiveChips scope="thread" />);

    const removeButton = screen.getByRole("button", { name: "Skill" });
    const chip = removeButton.parentElement;

    expect(chip).toHaveClass("relative");
    expect(removeButton).toHaveClass(
      "absolute",
      "pointer-events-none",
      "group-hover/tag:pointer-events-auto",
    );
  });
});
