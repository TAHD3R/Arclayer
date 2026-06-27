import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AI_CHAT_SUGGESTIONS, AISuggestions } from "@/components/ai/ai-suggestions";

const assistantUiMock = vi.hoisted(() => ({
  append: vi.fn(),
  setText: vi.fn(),
  composerState: { runConfig: { mode: "test" } },
  threadState: { isDisabled: false, isRunning: false },
}));

vi.mock("@assistant-ui/react", () => ({
  useAui: () => ({
    thread: () => ({
      getState: () => assistantUiMock.threadState,
      append: assistantUiMock.append,
    }),
    composer: () => ({
      getState: () => assistantUiMock.composerState,
      setText: assistantUiMock.setText,
    }),
  }),
  useAuiState: (
    selector: (state: {
      thread: { isDisabled: boolean; isRunning: boolean; messages: unknown[] };
    }) => unknown,
  ) => selector({ thread: { ...assistantUiMock.threadState, messages: [] } }),
}));

vi.mock("lucide-react", () => ({
  ClipboardCheckIcon: (props: { className?: string }) => <span {...props} />,
  FileSearchIcon: (props: { className?: string }) => <span {...props} />,
  Layers3Icon: (props: { className?: string }) => <span {...props} />,
  RocketIcon: (props: { className?: string }) => <span {...props} />,
  RouteIcon: (props: { className?: string }) => <span {...props} />,
}));

vi.mock("@arclayer/ui/button", () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children?: ReactNode }) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock("@arclayer/ui/tooltip", () => ({
  Tooltip: ({ children }: { children?: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children?: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const labels: Record<string, string> = {
        "ai:AI_CHAT_SUGGESTION_REVIEW_PAGE": "梳理当前页面",
        "ai:AI_CHAT_SUGGESTION_REVIEW_PAGE_PROMPT":
          "请结合当前页面和工作区上下文，帮我总结关键状态、潜在风险和下一步动作。",
        "ai:AI_CHAT_SUGGESTION_REVIEW_PAGE_DESC": "基于当前 Admin 页面整理状态、风险和决策点。",
        "ai:AI_CHAT_SUGGESTION_CHECK_CONTENT": "检查内容质量",
        "ai:AI_CHAT_SUGGESTION_CHECK_CONTENT_PROMPT":
          "请检查当前内容或内容库的完整性、工作流状态和发布风险，并给出优先级建议。",
        "ai:AI_CHAT_SUGGESTION_CHECK_CONTENT_DESC": "发现内容完整性、工作流和上线风险问题。",
        "ai:AI_CHAT_SUGGESTION_PLAN_MODEL": "规划内容模型",
        "ai:AI_CHAT_SUGGESTION_PLAN_MODEL_PROMPT":
          "请基于当前项目，梳理内容模型、字段结构和工作流可以优化的方向，先给出分阶段计划。",
        "ai:AI_CHAT_SUGGESTION_PLAN_MODEL_DESC": "为当前项目设计模型结构、字段和治理流程。",
        "ai:AI_CHAT_SUGGESTION_LAUNCH_CHECKLIST": "生成发布清单",
        "ai:AI_CHAT_SUGGESTION_LAUNCH_CHECKLIST_PROMPT":
          "请为当前项目生成发布前检查清单，覆盖内容、资源、SEO、权限和回滚准备。",
        "ai:AI_CHAT_SUGGESTION_LAUNCH_CHECKLIST_DESC":
          "整理上线前需要确认的内容、资源、SEO 和权限事项。",
        "ai:AI_CHAT_SUGGESTION_IMPROVE_FLOW": "优化页面体验",
        "ai:AI_CHAT_SUGGESTION_IMPROVE_FLOW_PROMPT":
          "请审视当前页面的信息结构和操作流，指出可以提升效率、可读性和操作确定性的改进点。",
        "ai:AI_CHAT_SUGGESTION_IMPROVE_FLOW_DESC": "从当前页面出发，找出更高效的操作路径。",
      };
      return labels[key] ?? key;
    },
  }),
}));

describe("AISuggestions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assistantUiMock.threadState = { isDisabled: false, isRunning: false };
  });

  it("renders the shared quick action suggestions", () => {
    render(<AISuggestions />);

    for (const suggestion of AI_CHAT_SUGGESTIONS) {
      expect(
        screen.queryByRole("button", { name: new RegExp(suggestion.titleKey) }),
      ).not.toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "梳理当前页面" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "规划内容模型" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "生成发布清单" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "检查内容质量" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "优化页面体验" })).not.toBeInTheDocument();
  });

  it("sends the selected prompt through the assistant runtime", () => {
    render(<AISuggestions />);

    fireEvent.click(screen.getByRole("button", { name: "规划内容模型" }));

    expect(assistantUiMock.append).toHaveBeenCalledWith({
      content: [
        {
          type: "text",
          text: "请基于当前项目，梳理内容模型、字段结构和工作流可以优化的方向，先给出分阶段计划。",
        },
      ],
      runConfig: assistantUiMock.composerState.runConfig,
    });
    expect(assistantUiMock.setText).toHaveBeenCalledWith("");
  });

  it("fills the composer instead of appending while the thread is running", () => {
    assistantUiMock.threadState = { isDisabled: false, isRunning: true };
    render(<AISuggestions />);

    fireEvent.click(screen.getByRole("button", { name: "生成发布清单" }));

    expect(assistantUiMock.append).not.toHaveBeenCalled();
    expect(assistantUiMock.setText).toHaveBeenCalledWith(
      "请为当前项目生成发布前检查清单，覆盖内容、资源、SEO、权限和回滚准备。",
    );
  });
});
