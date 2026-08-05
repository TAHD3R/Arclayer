import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const runtimeMocks = vi.hoisted(() => ({
  archive: vi.fn(async (_threadId: string) => undefined),
  delete: vi.fn(async (_threadId: string) => undefined),
  isLoading: false,
  isLoadingMore: false,
  hasMore: false,
  newThread: vi.fn(),
  nowMs: Date.now(),
  openDrawer: vi.fn(),
  reload: vi.fn(async () => undefined),
  rename: vi.fn(async (_title: string) => undefined),
  showThreads: true,
  threadMetadataReady: true,
  unarchive: vi.fn(async (_threadId: string) => undefined),
  updateCustom: vi.fn(async (_custom: Record<string, unknown>) => undefined),
}));

vi.mock("@assistant-ui/react", async () => {
  const React = await import("react");
  type Item = {
    id: string;
    title: string;
    status: "regular" | "archived";
    lastMessageAt: Date;
    custom: {
      projectId: string | null;
      updatedAt: string;
      archivedAt: string | null;
      pinned: boolean;
    };
  };
  const ItemContext = React.createContext<Item | null>(null);
  const activeItems: Item[] = [
    {
      id: "thread-1",
      title: "Homepage collaboration",
      status: "regular",
      lastMessageAt: new Date(runtimeMocks.nowMs),
      custom: {
        projectId: "project-1",
        updatedAt: new Date(runtimeMocks.nowMs).toISOString(),
        archivedAt: null,
        pinned: false,
      },
    },
  ];
  const archivedItems: Item[] = [
    {
      id: "thread-2",
      title: "Archived research",
      status: "archived",
      lastMessageAt: new Date(runtimeMocks.nowMs - 24 * 60 * 60 * 1000),
      custom: {
        projectId: "project-2",
        updatedAt: new Date(runtimeMocks.nowMs - 24 * 60 * 60 * 1000).toISOString(),
        archivedAt: new Date(runtimeMocks.nowMs - 24 * 60 * 60 * 1000).toISOString(),
        pinned: false,
      },
    },
  ];
  const action = (callback: (item: Item) => void) =>
    function Action({ children }: { children: ReactElement }) {
      const item = React.useContext(ItemContext);
      return React.cloneElement(children, {
        onClick: () => {
          if (item) callback(item);
        },
      } as Record<string, unknown>);
    };

  return {
    ThreadListItemByIndexProvider: ({
      archived = false,
      index,
      children,
    }: {
      archived?: boolean;
      index: number;
      children: ReactNode;
    }) => {
      const item = runtimeMocks.showThreads
        ? (archived ? archivedItems : activeItems)[index]
        : undefined;
      return item ? <ItemContext.Provider value={item}>{children}</ItemContext.Provider> : null;
    },
    useAui: () => ({
      threads: () => ({
        reload: runtimeMocks.reload,
        item: ({ id }: { id: string }) => ({
          archive: () => runtimeMocks.archive(id),
          delete: () => runtimeMocks.delete(id),
          rename: (title: string) => runtimeMocks.rename(title),
          unarchive: () => runtimeMocks.unarchive(id),
          updateCustom: (custom: Record<string, unknown>) => runtimeMocks.updateCustom(custom),
        }),
      }),
    }),
    useAuiState: (selector: (state: unknown) => unknown) => {
      const item = React.useContext(ItemContext);
      return selector({
        threadListItem: item ?? { id: "new", title: "" },
        threads: {
          threadIds: runtimeMocks.showThreads ? activeItems.map(({ id }) => id) : [],
          archivedThreadIds: runtimeMocks.showThreads ? archivedItems.map(({ id }) => id) : [],
          threadItems: runtimeMocks.showThreads
            ? [...activeItems, ...archivedItems].map((thread) =>
                runtimeMocks.threadMetadataReady
                  ? thread
                  : { ...thread, lastMessageAt: undefined, custom: undefined },
              )
            : [],
          isLoading: runtimeMocks.isLoading,
          isLoadingMore: runtimeMocks.isLoadingMore,
          hasMore: runtimeMocks.hasMore,
        },
      });
    },
    ThreadListPrimitive: {
      Root: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
      New: ({ children }: { children: ReactElement<{ onClick?: () => void }> }) =>
        React.cloneElement(children, {
          onClick: () => {
            runtimeMocks.newThread();
            children.props.onClick?.();
          },
        }),
      Items: ({ archived, children }: { archived?: boolean; children: () => ReactNode }) => (
        <>
          {(runtimeMocks.showThreads ? (archived ? archivedItems : activeItems) : []).map(
            (item) => (
              <ItemContext.Provider key={item.id} value={item}>
                {children()}
              </ItemContext.Provider>
            ),
          )}
        </>
      ),
      LoadMore: ({ children }: { children: ReactElement }) => children,
    },
    ThreadListItemPrimitive: {
      Root: ({ children, ...props }: { children?: ReactNode }) => <div {...props}>{children}</div>,
      Trigger: ({ children, ...props }: { children?: ReactNode }) => (
        <button type="button" {...props}>
          {children}
        </button>
      ),
      Title: ({ fallback }: { fallback?: ReactNode }) => {
        const item = React.useContext(ItemContext);
        return item?.title || fallback;
      },
      Archive: action((item) => runtimeMocks.archive(item.id)),
      Unarchive: action((item) => runtimeMocks.unarchive(item.id)),
      Delete: action((item) => runtimeMocks.delete(item.id)),
    },
  };
});

vi.mock("@arclayer/ui/popover", () => ({
  Popover: ({ children }: { children?: ReactNode }) => children,
  PopoverTrigger: ({ children }: { children?: ReactNode }) => children,
  PopoverContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@arclayer/hooks/use-now-tick", () => ({
  useNowTick: () => runtimeMocks.nowMs,
}));

vi.mock("@/stores/use-ai-chat-store", () => ({
  useAiChatStore: (selector: (state: { openDrawer: () => void }) => unknown) =>
    selector({ openDrawer: runtimeMocks.openDrawer }),
}));

vi.mock("@arclayer/ui/dropdown-menu", async () => {
  const React = await import("react");
  const RadioContext = React.createContext<(value: string) => void>(() => undefined);
  return {
    DropdownMenu: ({ children }: { children?: ReactNode }) => children,
    DropdownMenuContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
    DropdownMenuTrigger: ({ children }: { children?: ReactNode }) => children,
    DropdownMenuLabel: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
    DropdownMenuSeparator: () => <hr />,
    DropdownMenuRadioGroup: ({
      children,
      onValueChange,
    }: {
      children?: ReactNode;
      onValueChange?: (value: string) => void;
    }) => (
      <RadioContext.Provider value={onValueChange ?? (() => undefined)}>
        {children}
      </RadioContext.Provider>
    ),
    DropdownMenuRadioItem: ({ children, value }: { children?: ReactNode; value: string }) => {
      const onValueChange = React.useContext(RadioContext);
      return (
        <button type="button" onClick={() => onValueChange(value)}>
          {children}
        </button>
      );
    },
    DropdownMenuIconItem: ({
      children,
      disabled,
      onSelect,
    }: {
      children?: ReactNode;
      disabled?: boolean;
      onSelect?: () => void;
    }) => (
      <button type="button" disabled={disabled} onClick={onSelect}>
        {children}
      </button>
    ),
  };
});
vi.mock("@arclayer/ui/tooltip", () => ({
  Tooltip: ({ children }: { children?: ReactNode }) => children,
  TooltipTrigger: ({ children }: { children?: ReactNode }) => children,
  TooltipContent: ({ children }: { children?: ReactNode }) => children,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, params?: { title?: string }) =>
      params?.title ? `${key}:${params.title}` : key,
    i18n: { language: "en-US", resolvedLanguage: "en-US" },
  }),
}));

import { AgentThreadHistory } from "@/components/ai/agent-thread-history";
import { AgentThreadSidebar } from "@/components/ai/agent-thread-sidebar";

describe("AgentThreadHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runtimeMocks.isLoading = false;
    runtimeMocks.isLoadingMore = false;
    runtimeMocks.hasMore = false;
    runtimeMocks.showThreads = true;
    runtimeMocks.threadMetadataReady = true;
  });

  it("renders active and archived server Threads and creates a new conversation", () => {
    render(<AgentThreadHistory />);

    expect(screen.getByText("Homepage collaboration")).toBeInTheDocument();
    expect(screen.getByText("Archived research")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "ai:AI_CHAT_THREAD_NEW" }));
    expect(runtimeMocks.newThread).toHaveBeenCalledTimes(1);
  });

  it("pins, renames, archives, restores, and explicitly confirms deletion", async () => {
    render(<AgentThreadHistory />);

    fireEvent.click(screen.getAllByRole("button", { name: "ai:AI_CHAT_THREAD_PIN" })[0]!);
    await waitFor(() => {
      expect(runtimeMocks.updateCustom).toHaveBeenCalledWith(
        expect.objectContaining({ pinned: true }),
      );
      expect(runtimeMocks.reload).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getAllByRole("button", { name: "ai:AI_CHAT_THREAD_RENAME" })[0]!);
    fireEvent.change(screen.getByLabelText("ai:AI_CHAT_THREAD_RENAME_INPUT"), {
      target: { value: "Homepage launch" },
    });
    fireEvent.click(screen.getByRole("button", { name: "common:CONFIRM" }));
    await waitFor(() => expect(runtimeMocks.rename).toHaveBeenCalledWith("Homepage launch"));

    fireEvent.click(screen.getByRole("button", { name: "ai:AI_CHAT_THREAD_ARCHIVE" }));
    fireEvent.click(screen.getByRole("button", { name: "ai:AI_CHAT_THREAD_UNARCHIVE" }));
    await waitFor(() => {
      expect(runtimeMocks.archive).toHaveBeenCalledWith("thread-1");
      expect(runtimeMocks.unarchive).toHaveBeenCalledWith("thread-2");
    });

    fireEvent.click(screen.getAllByRole("button", { name: "ai:AI_CHAT_THREAD_DELETE" })[0]!);
    expect(
      screen.getByText("ai:AI_CHAT_THREAD_DELETE_CONFIRM:Homepage collaboration"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "common:DELETE" }));
    await waitFor(() => expect(runtimeMocks.delete).toHaveBeenCalledWith("thread-1"));
  });

  it("opens the normalized Drawer for a selected Thread", () => {
    render(<AgentThreadSidebar projects={[{ projectId: "project-1", name: "Marketing site" }]} />);

    expect(screen.getByText("Marketing site")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "ai:AI_CHAT_THREAD_NEW" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Homepage collaboration/ }));
    expect(runtimeMocks.openDrawer).toHaveBeenCalledTimes(1);
  });

  it("switches grouping modes and collapses conversation groups", () => {
    render(<AgentThreadSidebar projects={[{ projectId: "project-1", name: "Marketing site" }]} />);

    fireEvent.click(screen.getByRole("button", { name: "ai:AI_CHAT_THREAD_GROUP_BY_TIME" }));
    const todayGroup = screen.getByRole("button", { name: "ai:AI_CHAT_THREAD_TIME_TODAY" });
    expect(todayGroup).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(todayGroup);
    expect(todayGroup).toHaveAttribute("aria-expanded", "false");
  });

  it("distinguishes loading from an empty Thread history", () => {
    runtimeMocks.isLoading = true;

    render(<AgentThreadSidebar />);

    expect(screen.getByRole("status")).toHaveTextContent("ai:AI_CHAT_THREAD_LOADING");
    expect(screen.queryByText("Homepage collaboration")).not.toBeInTheDocument();
  });

  it("does not render an epoch date while a new Thread waits for server metadata", () => {
    runtimeMocks.threadMetadataReady = false;

    render(<AgentThreadSidebar />);

    expect(screen.getByRole("status")).toHaveTextContent("ai:AI_CHAT_THREAD_LOADING");
    expect(screen.queryByText(/1970/)).not.toBeInTheDocument();
  });

  it("hides conversation controls and shows the empty copy when no Threads exist", () => {
    runtimeMocks.showThreads = false;

    render(<AgentThreadSidebar />);

    expect(
      screen.queryByRole("heading", { name: "ai:AI_CHAT_THREAD_HISTORY" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "ai:AI_CHAT_THREAD_FILTER_LABEL" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("ai:AI_CHAT_THREAD_ACTIVE_EMPTY")).toBeInTheDocument();
    expect(screen.getByText("ai:AI_CHAT_THREAD_ACTIVE_EMPTY_DESCRIPTION")).toBeInTheDocument();
  });
});
