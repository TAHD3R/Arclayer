import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Unstable_Mention } from "@assistant-ui/react";
import {
  agentIdsForComposerScope,
  useAIComposerDirectiveStore,
} from "@/components/ai/ai-composer-directives";
import { AIComposerTriggers } from "@/components/ai/ai-composer-triggers";
import { useAuthStore } from "@/stores/use-auth-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

type MentionAdapterOptions = {
  readonly items?: readonly Unstable_Mention[];
  readonly onInserted?: (item: Unstable_Mention) => void;
};

const mentionMocks = vi.hoisted(() => ({
  options: null as MentionAdapterOptions | null,
  runConfig: { custom: { existing: "value" } } as { custom?: Record<string, unknown> },
  setRunConfig: vi.fn(),
  setText: vi.fn(),
}));

vi.mock("@assistant-ui/react", async () => {
  const React = await import("react");
  const Passthrough = ({ children }: { children?: ReactNode }) =>
    React.createElement(React.Fragment, null, children);
  const TriggerPopover = Object.assign(Passthrough, {
    Directive: () => null,
    Action: () => null,
  });
  const TriggerPopoverItems = ({
    children,
  }: {
    children: (items: readonly Unstable_Mention[]) => ReactNode;
  }) => React.createElement(React.Fragment, null, children([]));

  return {
    ComposerPrimitive: {
      Unstable_TriggerPopover: TriggerPopover,
      Unstable_TriggerPopoverItems: TriggerPopoverItems,
      Unstable_TriggerPopoverItem: Passthrough,
    },
    unstable_defaultDirectiveFormatter: {
      serialize: vi.fn(),
      parse: vi.fn(),
    },
    unstable_useMentionAdapter: (options: MentionAdapterOptions) => {
      mentionMocks.options = options;
      return { adapter: {}, directive: {} };
    },
    unstable_useSlashCommandAdapter: () => ({ adapter: {}, action: {} }),
    useAui: () => ({
      composer: () => ({
        getState: () => ({ runConfig: mentionMocks.runConfig }),
        setRunConfig: mentionMocks.setRunConfig,
        setText: mentionMocks.setText,
      }),
    }),
  };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const AGENT_ID = "A1b2C3d4E5f6G7h8I9j0K1";

function renderTriggers(props: ComponentProps<typeof AIComposerTriggers>) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AIComposerTriggers {...props} />
    </QueryClientProvider>,
  );
}

describe("AIComposerTriggers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mentionMocks.options = null;
    mentionMocks.runConfig = { custom: { existing: "value" } };
    useAIComposerDirectiveStore.getState().clearDirectives("thread");
    useAIComposerDirectiveStore.getState().clearDirectives("home");
    useAuthStore.setState({ accessToken: null, sessionVersion: 0 });
    useWorkspaceStore.setState({
      currentWorkspaceId: null,
      lastWorkspaceId: null,
      currentProjectId: null,
      lastProjectId: null,
    });
  });

  it("registers an Agent only after assistant-ui reports a real mention insertion", () => {
    renderTriggers({ scope: "thread" });
    const agent: Unstable_Mention = {
      id: AGENT_ID,
      type: "agent",
      label: "Data Analyst",
    };

    expect(agentIdsForComposerScope("thread")).toEqual([]);
    act(() => mentionMocks.options?.onInserted?.(agent));

    expect(agentIdsForComposerScope("thread")).toEqual([AGENT_ID]);
    expect(mentionMocks.setRunConfig).toHaveBeenCalledWith({
      custom: { existing: "value", mentionedAgentIds: [AGENT_ID] },
    });
  });

  it("keeps home and thread mention trust isolated", () => {
    renderTriggers({ scope: "home" });
    const agent: Unstable_Mention = {
      id: AGENT_ID,
      type: "agent",
      label: "Data Analyst",
    };

    act(() => mentionMocks.options?.onInserted?.(agent));

    expect(agentIdsForComposerScope("home")).toEqual([AGENT_ID]);
    expect(agentIdsForComposerScope("thread")).toEqual([]);
  });
});
