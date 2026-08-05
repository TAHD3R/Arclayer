import { render, screen } from "@testing-library/react";
import type { ReactNode, TextareaHTMLAttributes } from "react";
import { describe, expect, it, vi } from "vitest";

import { Thread } from "@/components/assistant-ui/thread";

vi.mock("@/components/ai/ai-composer-toolbar", () => ({
  AIComposerContextControls: () => null,
  AIComposerInputActions: () => null,
  AIComposerToolbar: () => null,
}));

vi.mock("@/components/assistant-ui/composer-queue", () => ({
  ComposerQueue: () => null,
}));

vi.mock("@/components/ai/ai-suggestions", () => ({
  AISuggestions: ({ variant }: { variant?: string }) => (
    <div data-testid="ai-suggestions" data-variant={variant} />
  ),
}));

vi.mock("@/components/ai/ai-composer-triggers", () => ({
  AIComposerTriggers: () => null,
}));

vi.mock("@/components/ai/ai-composer-directive-chips", () => ({
  AIComposerDirectiveSync: () => null,
  AIComposerDirectiveChips: () => null,
}));

vi.mock("@/components/ai/ai-composer-rich-input", () => ({
  AIComposerDirectiveInsertionProvider: ({ children }: { children?: ReactNode }) => <>{children}</>,
  AIComposerRichInput: (props: TextareaHTMLAttributes<HTMLTextAreaElement>) => (
    <textarea {...props} />
  ),
}));

vi.mock("@assistant-ui/react", async () => {
  const Passthrough = ({ children }: { children?: ReactNode }) => <>{children}</>;
  const primitive = new Proxy(
    {},
    {
      get: () => Passthrough,
    },
  );

  return {
    ActionBarMorePrimitive: primitive,
    ActionBarPrimitive: primitive,
    AuiIf: ({ children }: { children?: ReactNode }) => <>{children}</>,
    BranchPickerPrimitive: primitive,
    ComposerPrimitive: {
      Attachments: () => null,
      Root: Passthrough,
      Unstable_TriggerPopoverRoot: Passthrough,
      Input: (props: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} />,
    },
    ErrorPrimitive: primitive,
    MessagePrimitive: {
      Root: Passthrough,
      GroupedParts: () => null,
      Error: () => null,
    },
    ThreadPrimitive: {
      Root: Passthrough,
      Viewport: Passthrough,
      Messages: () => null,
      ViewportFooter: Passthrough,
      ScrollToBottom: () => null,
    },
    groupPartByType: vi.fn(),
    unstable_useTriggerPopoverTriggers: () => new Map(),
    useAui: () => ({
      composer: () => ({ setText: vi.fn() }),
    }),
    useAuiState: (selector: (state: unknown) => unknown) =>
      selector({
        composer: { isEmpty: true, text: "" },
        thread: { isLoading: false, messages: [] },
        threads: { isLoading: false },
        message: {
          role: "assistant",
          composer: { isEditing: false },
          metadata: { custom: {} },
        },
      }),
  };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) => {
      if (key === "ai:AI_CHAT_HOME_GREETING") {
        return `今天我能帮你做什么，${String(values?.name ?? "朋友")}？`;
      }
      if (key === "ai:AI_CHAT_HOME_USER_FALLBACK") return "朋友";
      return key;
    },
  }),
}));

describe("Thread empty state suggestions", () => {
  it("shows suggestions without the agent profile under the sidebar greeting", () => {
    render(
      <Thread
        variant="sidebar"
        welcomeName="Philip Cole"
        welcomeAgent={{
          name: "Arclayer Coordinator",
          description: "协调规划与构建工作",
          supportedExecutionModes: ["plan", "build"],
        }}
      />,
    );

    expect(screen.getByText("今天我能帮你做什么，Philip Cole？")).toBeInTheDocument();
    expect(screen.getByText("ai:AI_CHAT_SIDEBAR_STARTER_HINT")).toBeInTheDocument();
    expect(screen.queryByText("Arclayer Coordinator")).not.toBeInTheDocument();
    expect(screen.queryByText("协调规划与构建工作")).not.toBeInTheDocument();
    expect(screen.getByTestId("ai-suggestions")).toBeInTheDocument();
    expect(screen.getByTestId("ai-suggestions")).toHaveAttribute("data-variant", "home");
  });
});
