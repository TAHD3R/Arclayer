import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const assistantUiState = vi.hoisted(() => ({
  parts: [
    {
      type: "tool-call",
      toolCallId: "tool-project-bootstrap",
      toolName: "project.bootstrap",
      args: { name: "AI SaaS Builder" },
      argsText: '{"name":"AI SaaS Builder"}',
      result: { projectId: "project-1" },
      status: { type: "complete" },
    },
  ],
}));

vi.mock("@assistant-ui/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@assistant-ui/react")>()),
  useAuiState: (selector: (state: unknown) => unknown) =>
    selector({ message: { parts: assistantUiState.parts } }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "zh-CN" },
    t: (key: string, values?: Record<string, unknown>) => {
      const labels: Record<string, string> = {
        "ai:AI_CHAT_PROJECT_BOOTSTRAP_TOOL_TITLE": "创建 Builder 项目",
        "ai:AI_CHAT_TOOL_CALLS_TITLE": `调用了 ${String(values?.count ?? 0)} 个工具`,
        "ai:AI_CHAT_TOOL_CALLS_ACTIVE": `正在调用 ${String(values?.count ?? 0)} 个工具`,
      };
      return labels[key] ?? key;
    },
  }),
}));

import { AssistantToolTimeline } from "@/components/assistant-ui/thread";

describe("AssistantToolTimeline", () => {
  it("expands to a tool list without rendering the nested tool card", async () => {
    const user = userEvent.setup();
    const group = {
      type: "group-tool",
      indices: [0],
      status: { type: "complete" },
    } as never;

    render(
      <AssistantToolTimeline group={group}>
        <div>重复的工具卡片</div>
      </AssistantToolTimeline>,
    );

    await user.click(screen.getByRole("button", { name: "调用了 1 个工具" }));

    expect(screen.getByText("创建 Builder 项目")).toBeInTheDocument();
    expect(screen.queryByText("重复的工具卡片")).not.toBeInTheDocument();
  });
});
