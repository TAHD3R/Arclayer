import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const runtimeMocks = vi.hoisted(() => ({
  archive: vi.fn(async (_threadId: string) => undefined),
  delete: vi.fn(async (_threadId: string) => undefined),
  isLoading: false,
  newThread: vi.fn(),
  openDrawer: vi.fn(),
  rename: vi.fn(async (_title: string) => undefined),
  unarchive: vi.fn(async (_threadId: string) => undefined),
}));

vi.mock("@assistant-ui/react", async () => {
  const React = await import("react");
  type Item = { id: string; title: string };
  const ItemContext = React.createContext<Item | null>(null);
  const activeItems: Item[] = [{ id: "thread-1", title: "Homepage collaboration" }];
  const archivedItems: Item[] = [{ id: "thread-2", title: "Archived research" }];
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
    useAui: () => ({
      threads: () => ({
        item: ({ id }: { id: string }) => ({
          archive: () => runtimeMocks.archive(id),
          delete: () => runtimeMocks.delete(id),
          rename: (title: string) => runtimeMocks.rename(title),
          unarchive: () => runtimeMocks.unarchive(id),
        }),
      }),
    }),
    useAuiState: (selector: (state: unknown) => unknown) => {
      const item = React.useContext(ItemContext);
      return selector({
        threadListItem: item ?? { id: "new", title: "" },
        threads: {
          threadIds: activeItems.map(({ id }) => id),
          archivedThreadIds: archivedItems.map(({ id }) => id),
          isLoading: runtimeMocks.isLoading,
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
          {(archived ? archivedItems : activeItems).map((item) => (
            <ItemContext.Provider key={item.id} value={item}>
              {children()}
            </ItemContext.Provider>
          ))}
        </>
      ),
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

vi.mock("@/components/ai/agent-launcher", () => ({
  AgentLauncher: () => <div data-testid="agent-launcher" />,
}));

vi.mock("@/stores/use-ai-chat-store", () => ({
  useAiChatStore: (selector: (state: { openDrawer: () => void }) => unknown) =>
    selector({ openDrawer: runtimeMocks.openDrawer }),
}));

vi.mock("@arclayer/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children?: ReactNode }) => children,
  DropdownMenuContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children?: ReactNode }) => children,
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
}));
vi.mock("@arclayer/ui/tooltip", () => ({
  Tooltip: ({ children }: { children?: ReactNode }) => children,
  TooltipTrigger: ({ children }: { children?: ReactNode }) => children,
  TooltipContent: ({ children }: { children?: ReactNode }) => children,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, params?: { title?: string }) =>
      params?.title ? `${key}:${params.title}` : key,
  }),
}));

import { AgentThreadHistory } from "@/components/ai/agent-thread-history";
import { AgentThreadSidebar } from "@/components/ai/agent-thread-sidebar";

describe("AgentThreadHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runtimeMocks.isLoading = false;
  });

  it("renders active and archived server Threads and creates a new conversation", () => {
    render(<AgentThreadHistory />);

    expect(screen.getByText("Homepage collaboration")).toBeInTheDocument();
    expect(screen.getByText("Archived research")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "ai:AI_CHAT_THREAD_NEW" }));
    expect(runtimeMocks.newThread).toHaveBeenCalledTimes(1);
  });

  it("renames, archives, restores, and explicitly confirms deletion", async () => {
    render(<AgentThreadHistory />);

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

  it("opens the normalized Drawer for a new or selected Thread", () => {
    render(<AgentThreadSidebar />);

    fireEvent.click(screen.getByRole("button", { name: "ai:AI_CHAT_THREAD_NEW" }));
    expect(runtimeMocks.newThread).toHaveBeenCalledTimes(1);
    expect(runtimeMocks.openDrawer).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Homepage collaboration" }));
    expect(runtimeMocks.openDrawer).toHaveBeenCalledTimes(2);
  });

  it("distinguishes loading from an empty Thread history", () => {
    runtimeMocks.isLoading = true;

    render(<AgentThreadSidebar />);

    expect(screen.getByRole("status")).toHaveTextContent("ai:AI_CHAT_THREAD_LOADING");
    expect(screen.queryByText("Homepage collaboration")).not.toBeInTheDocument();
  });
});
