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
  AISuggestions: () => <div data-testid="ai-suggestions" />,
}));

vi.mock("@/components/ai/ai-context-recommendations", () => ({
  AIContextRecommendations: () => null,
}));

vi.mock("@/components/ai/ai-composer-triggers", () => ({
  AIComposerTriggers: () => null,
}));

vi.mock("@/components/ai/ai-composer-directive-chips", () => ({
  AIComposerDirectiveChips: () => null,
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
    useAuiState: (selector: (state: unknown) => unknown) =>
      selector({
        composer: { isEmpty: true },
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
  it("shows suggestions under the sidebar greeting", () => {
    render(<Thread variant="sidebar" welcomeName="Philip Cole" />);

    expect(screen.getByText("今天我能帮你做什么，Philip Cole？")).toBeInTheDocument();
    expect(screen.getByTestId("ai-suggestions")).toBeInTheDocument();
  });
});
