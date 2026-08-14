import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const aiChatState = vi.hoisted(() => ({ drawerOpen: true }));

vi.mock("@/components/DotField", () => ({ default: () => null }));
vi.mock("@/components/layout/admin-account-menu", () => ({
  AdminAccountMenu: () => <div data-testid="account-menu" />,
}));
vi.mock("@/components/ai/ai-drawer-overlay", () => ({
  AIDrawerOverlay: () => <aside data-testid="ai-drawer" />,
}));
vi.mock("@/components/ai/arclayer-assistant-scope", () => ({
  ArclayerAssistantScope: ({ children }: { children: (state: object) => React.ReactNode }) =>
    children({}),
}));
vi.mock("@/stores/use-ai-chat-store", () => ({
  useAiChatStore: (selector: (state: typeof aiChatState) => unknown) => selector(aiChatState),
}));

import { CreationLayout } from "@/layouts/creation-layout";

describe("CreationLayout", () => {
  it("keeps the main panel inside the viewport with symmetric desktop insets", () => {
    render(
      <CreationLayout>
        <div data-testid="editor-content" />
      </CreationLayout>,
    );

    const mainPanel = screen.getByTestId("editor-content").parentElement;
    expect(mainPanel).not.toBeNull();
    expect(mainPanel).toHaveClass("self-stretch");
    expect(mainPanel).not.toHaveClass("h-full");
    expect(mainPanel).toHaveClass("min-[769px]:m-4", "min-[769px]:rounded-2xl");
  });
});
