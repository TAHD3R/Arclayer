import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@assistant-ui/react", () => ({
  AuiIf: ({ children }: { children?: ReactNode }) => <>{children}</>,
  ThreadPrimitive: {
    Suggestion: ({
      children,
      prompt,
      send,
    }: {
      children?: ReactNode;
      prompt: string;
      send?: boolean;
    }) => (
      <button type="button" data-prompt={prompt} data-send={String(send)}>
        {children}
      </button>
    ),
  },
  useAuiState: (selector: (state: unknown) => unknown) =>
    selector({
      thread: {
        isEmpty: false,
        isRunning: false,
        suggestions: [{ prompt: "确认计划" }, { prompt: "细化执行方案" }],
      },
    }),
}));

import { ThreadFollowupSuggestions } from "@/components/assistant-ui/follow-up-suggestions";

describe("ThreadFollowupSuggestions", () => {
  it("renders runtime suggestions as send actions", () => {
    render(<ThreadFollowupSuggestions />);

    expect(screen.getByRole("button", { name: "确认计划" })).toHaveAttribute("data-send", "true");
    expect(screen.getByRole("button", { name: "细化执行方案" })).toHaveAttribute(
      "data-prompt",
      "细化执行方案",
    );
  });
});
