"use client";

import { ComposerAttachments, UserMessageAttachments } from "@/components/assistant-ui/attachment";
import { MarkdownText } from "@/components/assistant-ui/markdown-text";
import {
  Reasoning,
  ReasoningContent,
  ReasoningRoot,
  ReasoningText,
  ReasoningTrigger,
} from "@/components/assistant-ui/reasoning";
import { ToolFallback } from "@/components/assistant-ui/tool-fallback";
import {
  ToolGroupContent,
  ToolGroupRoot,
  ToolGroupTrigger,
} from "@/components/assistant-ui/tool-group";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
import { retryLatestAIChatMessage } from "@/components/ai/ai-chat-runtime";
import {
  AIComposerContextControls,
  AIComposerInputActions,
  AIComposerToolbar,
} from "@/components/ai/ai-composer-toolbar";
import { useAiChatStore } from "@/stores/use-ai-chat-store";
import { Button } from "@arclayer/ui/button";
import { cn } from "@arclayer/lib/utils";
import {
  ActionBarMorePrimitive,
  ActionBarPrimitive,
  AuiIf,
  type AssistantState,
  BranchPickerPrimitive,
  ComposerPrimitive,
  ErrorPrimitive,
  groupPartByType,
  MessagePrimitive,
  SuggestionPrimitive,
  ThreadPrimitive,
  type MessageState,
  useAui,
  type ToolCallMessagePartComponent,
  useAuiState,
} from "@assistant-ui/react";
import {
  ArrowDownIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  DownloadIcon,
  MoreHorizontalIcon,
  PencilIcon,
  RefreshCwIcon,
} from "lucide-react";
import {
  createContext,
  useContext,
  useState,
  type ComponentType,
  type FC,
  type PropsWithChildren,
} from "react";
import { useTranslation } from "react-i18next";

export type ThreadGroupPart = MessagePrimitive.GroupedParts.GroupPart;

/**
 * Optional component overrides for the thread. `AssistantMessage` and
 * `Welcome` replace whole sections; the remaining slots override how the
 * assistant message renders tool calls and part groups. Tool UIs registered
 * by name (toolkit `render`, `useAssistantDataUI`) take precedence over
 * `ToolFallback`.
 */
export type ThreadComponents = {
  AssistantMessage?: ComponentType | undefined;
  Welcome?: ComponentType | undefined;
  ToolFallback?: ToolCallMessagePartComponent | undefined;
  ToolGroup?: ComponentType<PropsWithChildren<{ group: ThreadGroupPart }>> | undefined;
  ReasoningGroup?: ComponentType<PropsWithChildren<{ group: ThreadGroupPart }>> | undefined;
};

export type ThreadProps = {
  components?: ThreadComponents | undefined;
  variant?: "default" | "sidebar";
};

const EMPTY_COMPONENTS: ThreadComponents = {};
type ThreadVariant = NonNullable<ThreadProps["variant"]>;
type MessageContent = MessageState["content"];

const ThreadComponentsContext = createContext<ThreadComponents>(EMPTY_COMPONENTS);
const ThreadVariantContext = createContext<ThreadVariant>("default");

function messageContentToPlainText(content: MessageContent): string {
  return content
    .map((part) => {
      if (part.type === "text") return part.text;
      return "";
    })
    .join("");
}

// Startup exposes a loading placeholder thread; treat it as a new chat so
// the composer mounts centered. Loads after startup keep the docked layout.
const isNewChatView = (s: AssistantState) =>
  s.thread.messages.length === 0 && (!s.thread.isLoading || s.threads.isLoading);

export const Thread: FC<ThreadProps> = ({ components = EMPTY_COMPONENTS, variant = "default" }) => {
  const isEmpty = useAuiState(isNewChatView);

  return (
    <ThreadComponentsContext.Provider value={components}>
      <ThreadVariantContext.Provider value={variant}>
        <ThreadRoot isEmpty={isEmpty} variant={variant} />
      </ThreadVariantContext.Provider>
    </ThreadComponentsContext.Provider>
  );
};

const ThreadRoot: FC<{ isEmpty: boolean; variant: ThreadVariant }> = ({ isEmpty, variant }) => {
  const { Welcome = ThreadWelcome } = useContext(ThreadComponentsContext);
  const isSidebar = variant === "sidebar";

  return (
    <ThreadPrimitive.Root
      className={cn(
        "aui-root aui-thread-root @container flex h-full flex-col",
        isSidebar ? "bg-transparent" : "bg-background",
      )}
      style={{
        ["--thread-max-width" as string]: isSidebar ? "100%" : "44rem",
        ["--composer-bg" as string]:
          "color-mix(in oklab, var(--color-muted) 30%, var(--color-background))",
        ["--composer-radius" as string]: isSidebar ? "1.5rem" : "1.5rem",
        ["--composer-padding" as string]: "8px",
      }}
    >
      <ThreadPrimitive.Viewport
        turnAnchor="top"
        data-slot="aui_thread-viewport"
        className="relative flex flex-1 flex-col overflow-x-auto overflow-y-scroll scroll-smooth"
      >
        <div
          className={cn(
            "mx-auto flex w-full max-w-(--thread-max-width) flex-1 flex-col",
            isEmpty && !isSidebar && "justify-center",
            isSidebar ? "min-h-full pt-2" : "px-4 pt-4",
          )}
        >
          <AuiIf condition={isNewChatView}>
            <Welcome />
          </AuiIf>

          <div
            data-slot="aui_message-group"
            className={cn(
              "flex flex-col empty:hidden",
              isSidebar ? "gap-y-5 pb-56" : "mb-14 gap-y-6",
            )}
          >
            <ThreadPrimitive.Messages>{() => <ThreadMessage />}</ThreadPrimitive.Messages>
          </div>

          <ThreadPrimitive.ViewportFooter
            className={cn(
              "aui-thread-viewport-footer flex w-full min-w-0 flex-col gap-4 overflow-visible",
              isSidebar ? "bg-transparent pb-0 md:pb-0" : "bg-background pb-4 md:pb-6",
              !isEmpty && "sticky bottom-0 mt-auto rounded-t-(--composer-radius)",
              isSidebar && "sticky bottom-0 mt-auto pt-3",
            )}
          >
            <ThreadScrollToBottom />
            <Composer />
            {!isSidebar ? (
              <AuiIf condition={(s) => isNewChatView(s) && s.composer.isEmpty}>
                <ThreadSuggestions />
              </AuiIf>
            ) : null}
          </ThreadPrimitive.ViewportFooter>
        </div>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
};

const ThreadMessage: FC = () => {
  const { AssistantMessage: AssistantMessageComponent = AssistantMessage } =
    useContext(ThreadComponentsContext);
  const role = useAuiState((s) => s.message.role);
  const isEditing = useAuiState((s) => s.message.composer.isEditing);

  if (isEditing) return <EditComposer />;
  if (role === "user") return <UserMessage />;
  return <AssistantMessageComponent />;
};

const ThreadScrollToBottom: FC = () => {
  const { t } = useTranslation(["ai", "common"]);

  return (
    <ThreadPrimitive.ScrollToBottom asChild>
      <TooltipIconButton
        tooltip={t("ai:AI_CHAT_SCROLL_TO_BOTTOM")}
        variant="outline"
        className="aui-thread-scroll-to-bottom dark:border-border dark:bg-background dark:hover:bg-accent absolute -top-12 z-10 self-center rounded-full p-4 disabled:invisible"
      >
        <ArrowDownIcon />
      </TooltipIconButton>
    </ThreadPrimitive.ScrollToBottom>
  );
};

const ThreadWelcome: FC = () => {
  const { t } = useTranslation(["ai", "common"]);
  const variant = useContext(ThreadVariantContext);
  const isSidebar = variant === "sidebar";

  if (isSidebar) {
    return (
      <div className="aui-thread-welcome-root mb-6 flex items-start pt-2">
        <div className="min-w-0 rounded-2xl rounded-tl-md border border-border/70 bg-background px-3.5 py-3 shadow-sm">
          <p className="text-callout leading-relaxed text-label-primary">
            {t("ai:AI_CHAT_WELCOME_MESSAGE")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "aui-thread-welcome-root mb-6 flex flex-col px-4",
        isSidebar ? "items-start px-2 pt-2 text-left" : "items-center text-center",
      )}
    >
      <h1 className="aui-thread-welcome-message-inner fade-in slide-in-from-bottom-1 animate-in fill-mode-both text-2xl font-semibold duration-200">
        {t("ai:AI_CHAT_EMPTY_TITLE")}
      </h1>
    </div>
  );
};

const ThreadSuggestions: FC = () => {
  return (
    <div className="aui-thread-welcome-suggestions flex w-full flex-wrap items-center justify-center gap-2 px-4">
      <ThreadPrimitive.Suggestions>{() => <ThreadSuggestionItem />}</ThreadPrimitive.Suggestions>
    </div>
  );
};

const ThreadSuggestionItem: FC = () => {
  return (
    <div className="aui-thread-welcome-suggestion-display fade-in slide-in-from-bottom-2 animate-in fill-mode-both duration-200">
      <SuggestionPrimitive.Trigger send asChild>
        <Button
          variant="ghost"
          className="aui-thread-welcome-suggestion text-foreground hover:bg-muted border-border/60 h-auto gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-normal whitespace-nowrap transition-colors"
        >
          <SuggestionPrimitive.Title className="aui-thread-welcome-suggestion-text-1" />
          <SuggestionPrimitive.Description className="aui-thread-welcome-suggestion-text-2 empty:hidden" />
        </Button>
      </SuggestionPrimitive.Trigger>
    </div>
  );
};

const Composer: FC = () => {
  const { t } = useTranslation(["ai", "common"]);
  const variant = useContext(ThreadVariantContext);
  const isSidebar = variant === "sidebar";

  return (
    <ComposerPrimitive.Root
      className={cn(
        "aui-composer-root relative flex w-full min-w-0 flex-col",
        isSidebar && "gap-2",
      )}
    >
      {isSidebar ? <AIComposerContextControls compact /> : null}
      <ComposerPrimitive.AttachmentDropzone asChild>
        <div
          data-slot="aui_composer-shell"
          className={cn(
            "data-[dragging=true]:border-border flex w-full min-w-0 flex-col gap-2 rounded-(--composer-radius) bg-(--composer-bg) p-(--composer-padding) transition-colors hover:border-border focus-within:border-border data-[dragging=true]:border-dashed data-[dragging=true]:bg-[color-mix(in_oklab,var(--color-accent)_50%,var(--color-background))] dark:shadow-none",
            isSidebar
              ? "min-h-[8.5rem] border border-border/60"
              : "h-[6.5rem] min-h-[6.5rem] border border-border/60 dark:border-muted-foreground/15",
          )}
        >
          <ComposerAttachments />
          <ComposerPrimitive.Input
            placeholder={t("ai:AI_CHAT_INPUT_PLACEHOLDER")}
            className={cn(
              "aui-composer-input placeholder:text-muted-foreground/80 w-full min-w-0 resize-none bg-transparent px-2.5 py-1 text-callout outline-none [field-sizing:fixed]",
              isSidebar ? "h-20 min-h-20 max-h-20" : "h-12 min-h-12 max-h-12",
            )}
            rows={1}
            autoFocus
            aria-label="Message input"
          />
          {isSidebar ? <AIComposerInputActions /> : <AIComposerToolbar />}
        </div>
      </ComposerPrimitive.AttachmentDropzone>
    </ComposerPrimitive.Root>
  );
};

const MessageError: FC = () => {
  const { t } = useTranslation(["ai", "common"]);
  const [expanded, setExpanded] = useState(false);
  const rawSummary = useAuiState((s) =>
    s.message.status?.type === "incomplete" && s.message.status.reason === "error"
      ? s.message.status.error
      : "",
  );
  const summary = typeof rawSummary === "string" ? rawSummary : "";
  const rawDetails = useAuiState((s) => s.message.metadata.custom?.errorDetails);
  const details = typeof rawDetails === "string" ? rawDetails.trim() : "";
  const hasDistinctDetails = details.length > 0 && details !== summary.trim();

  return (
    <MessagePrimitive.Error>
      <ErrorPrimitive.Root className="aui-message-error-root border-destructive bg-destructive/10 text-destructive dark:bg-destructive/5 mt-2 overflow-hidden rounded-xl border text-sm dark:text-red-200">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left font-semibold"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          <ErrorPrimitive.Message className="aui-message-error-message line-clamp-1 min-w-0 flex-1" />
          <span className="shrink-0 text-caption font-medium opacity-80">
            {expanded ? t("ai:AI_CHAT_ERROR_COLLAPSE") : t("ai:AI_CHAT_ERROR_EXPAND")}
          </span>
        </button>
        <div className={cn("border-t border-destructive/25 px-3 py-2", !expanded && "hidden")}>
          <pre className="aui-message-error-detail max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-footnote leading-relaxed">
            {hasDistinctDetails ? details : t("ai:AI_CHAT_ERROR_NO_DETAILS")}
          </pre>
        </div>
      </ErrorPrimitive.Root>
    </MessagePrimitive.Error>
  );
};

const AssistantMessage: FC = () => {
  const {
    ToolFallback: ToolFallbackComponent = ToolFallback,
    ToolGroup,
    ReasoningGroup,
  } = useContext(ThreadComponentsContext);

  // reserves space for action bar and compensates with `-mb` for consistent msg spacing
  // keeps hovered action bar from shifting layout (autohide doesn't support absolute positioning well)
  // for pt-[n] use -mb-[n + 6] & min-h-[n + 6] to preserve compensation
  const ACTION_BAR_PT = "pt-1.5";
  const ACTION_BAR_HEIGHT = `-mb-7.5 min-h-7.5 ${ACTION_BAR_PT}`;

  return (
    <MessagePrimitive.Root
      data-slot="aui_assistant-message-root"
      data-role="assistant"
      className="fade-in slide-in-from-bottom-1 animate-in relative duration-150"
    >
      <div
        data-slot="aui_assistant-message-content"
        // [contain-intrinsic-size:auto_24px] fixes issue #4104, don't change without checking for regressions
        className="text-foreground px-2 leading-relaxed wrap-break-word [contain-intrinsic-size:auto_24px] [content-visibility:auto]"
      >
        <MessagePrimitive.GroupedParts
          groupBy={groupPartByType({
            reasoning: ["group-chainOfThought", "group-reasoning"],
            "tool-call": ["group-chainOfThought", "group-tool"],
            "standalone-tool-call": [],
          })}
        >
          {({ part, children }) => {
            switch (part.type) {
              case "group-chainOfThought":
                return <div data-slot="aui_chain-of-thought">{children}</div>;
              case "group-tool":
                if (ToolGroup) {
                  return <ToolGroup group={part}>{children}</ToolGroup>;
                }
                return (
                  <ToolGroupRoot variant="ghost">
                    <ToolGroupTrigger
                      count={part.indices.length}
                      active={part.status.type === "running"}
                    />
                    <ToolGroupContent>{children}</ToolGroupContent>
                  </ToolGroupRoot>
                );
              case "group-reasoning": {
                if (ReasoningGroup) {
                  return <ReasoningGroup group={part}>{children}</ReasoningGroup>;
                }
                const running = part.status.type === "running";
                return (
                  <ReasoningRoot streaming={running}>
                    <ReasoningTrigger active={running} />
                    <ReasoningContent aria-busy={running}>
                      <ReasoningText>{children}</ReasoningText>
                    </ReasoningContent>
                  </ReasoningRoot>
                );
              }
              case "text":
                return <MarkdownText />;
              case "reasoning":
                return <Reasoning {...part} />;
              case "tool-call":
                return part.toolUI ?? <ToolFallbackComponent {...part} />;
              case "data":
                return part.dataRendererUI;
              case "indicator":
                return (
                  <span
                    data-slot="aui_assistant-message-indicator"
                    className="animate-pulse font-sans"
                    aria-label="Assistant is working"
                  >
                    {"●"}
                  </span>
                );
              default:
                return null;
            }
          }}
        </MessagePrimitive.GroupedParts>
        <MessageError />
      </div>

      <div
        data-slot="aui_assistant-message-footer"
        className={cn("ms-2 flex items-center", ACTION_BAR_HEIGHT)}
      >
        <BranchPicker />
        <AssistantActionBar />
      </div>
    </MessagePrimitive.Root>
  );
};

const AssistantActionBar: FC = () => {
  const { t } = useTranslation(["ai", "common"]);
  const activeId = useAiChatStore((s) => s.activeId);

  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      className="aui-assistant-action-bar-root text-muted-foreground animate-in fade-in col-start-3 row-start-2 -ms-1 flex gap-1 duration-200"
    >
      <ActionBarPrimitive.Copy asChild>
        <TooltipIconButton tooltip={t("ai:AI_CHAT_ACTION_COPY")}>
          <AuiIf condition={(s) => s.message.isCopied}>
            <CheckIcon className="animate-in zoom-in-50 fade-in duration-200 ease-out" />
          </AuiIf>
          <AuiIf condition={(s) => !s.message.isCopied}>
            <CopyIcon className="animate-in zoom-in-75 fade-in duration-150" />
          </AuiIf>
        </TooltipIconButton>
      </ActionBarPrimitive.Copy>
      <TooltipIconButton
        tooltip={t("ai:AI_CHAT_ACTION_REFRESH")}
        disabled={!activeId}
        onClick={() => {
          if (!activeId)
            throw new Error("Cannot refresh AI message without an active conversation");
          void retryLatestAIChatMessage(activeId);
        }}
      >
        <RefreshCwIcon />
      </TooltipIconButton>
      <ActionBarMorePrimitive.Root>
        <ActionBarMorePrimitive.Trigger asChild>
          <TooltipIconButton
            tooltip={t("ai:AI_CHAT_ACTION_MORE")}
            className="data-[state=open]:bg-accent"
          >
            <MoreHorizontalIcon />
          </TooltipIconButton>
        </ActionBarMorePrimitive.Trigger>
        <ActionBarMorePrimitive.Content
          side="bottom"
          align="start"
          sideOffset={6}
          className="aui-action-bar-more-content bg-popover/95 text-popover-foreground data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=closed]:animate-out data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 min-w-[8rem] overflow-hidden rounded-xl border p-1.5 shadow-lg backdrop-blur-sm"
        >
          <ActionBarPrimitive.ExportMarkdown asChild>
            <ActionBarMorePrimitive.Item className="aui-action-bar-more-item hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm outline-none select-none">
              <DownloadIcon className="size-4" />
              {t("ai:AI_CHAT_ACTION_EXPORT_MARKDOWN")}
            </ActionBarMorePrimitive.Item>
          </ActionBarPrimitive.ExportMarkdown>
        </ActionBarMorePrimitive.Content>
      </ActionBarMorePrimitive.Root>
    </ActionBarPrimitive.Root>
  );
};

const UserMessage: FC = () => {
  return (
    <MessagePrimitive.Root
      data-slot="aui_user-message-root"
      className="fade-in slide-in-from-bottom-1 animate-in grid auto-rows-auto grid-cols-[minmax(72px,1fr)_auto] content-start gap-y-2 px-2 duration-150 [contain-intrinsic-size:auto_60px] [content-visibility:auto] [&:where(>*)]:col-start-2"
      data-role="user"
    >
      <UserMessageAttachments />

      <div className="aui-user-message-content-wrapper relative col-start-2 min-w-0">
        <div className="aui-user-message-content peer bg-muted text-foreground rounded-xl px-4 py-2 wrap-break-word empty:hidden">
          <MessagePrimitive.Parts />
        </div>
        <div className="aui-user-action-bar-wrapper absolute start-0 top-1/2 -translate-x-full -translate-y-1/2 pe-2 peer-empty:hidden rtl:translate-x-full">
          <UserActionBar />
        </div>
      </div>

      <BranchPicker
        data-slot="aui_user-branch-picker"
        className="col-span-full col-start-1 row-start-3 -me-1 justify-end"
      />
    </MessagePrimitive.Root>
  );
};

const UserActionBar: FC = () => {
  const { t } = useTranslation(["ai", "common"]);
  const aui = useAui();
  const activeId = useAiChatStore((s) => s.activeId);
  const replaceMessages = useAiChatStore((s) => s.replaceMessages);
  const messageIndex = useAuiState((s) => s.message.index);
  const messageContent = useAuiState((s) => messageContentToPlainText(s.message.content));

  const editInComposer = () => {
    if (!activeId) throw new Error("Cannot edit AI message without an active conversation");

    const conversation = useAiChatStore
      .getState()
      .conversations.find((item) => item.id === activeId);
    if (!conversation) throw new Error(`AI conversation not found: ${activeId}`);

    const message = conversation.messages[messageIndex];
    if (!message || message.role !== "user") {
      throw new Error(`Cannot edit non-user AI message at index ${messageIndex}`);
    }

    replaceMessages(activeId, conversation.messages.slice(0, messageIndex));
    aui.composer().setText(message.content || messageContent);
  };

  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      className="aui-user-action-bar-root flex flex-col items-end"
    >
      <TooltipIconButton
        tooltip={t("ai:AI_CHAT_ACTION_EDIT")}
        className="aui-user-action-edit"
        onClick={editInComposer}
      >
        <PencilIcon />
      </TooltipIconButton>
    </ActionBarPrimitive.Root>
  );
};

const EditComposer: FC = () => {
  const { t } = useTranslation(["ai", "common"]);

  return (
    <MessagePrimitive.Root data-slot="aui_edit-composer-wrapper" className="flex flex-col px-2">
      <ComposerPrimitive.Root className="aui-edit-composer-root border-border/60 dark:border-muted-foreground/15 ms-auto flex w-full max-w-[85%] flex-col rounded-(--composer-radius) border bg-(--composer-bg) shadow-[0_4px_16px_-8px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04)] dark:shadow-none">
        <ComposerPrimitive.Input
          className="aui-edit-composer-input text-foreground min-h-14 w-full resize-none bg-transparent px-4 pt-3 pb-1 text-base outline-none"
          autoFocus
        />
        <div className="aui-edit-composer-footer mx-2.5 mb-2.5 flex items-center gap-1.5 self-end">
          <ComposerPrimitive.Cancel asChild>
            <Button variant="ghost" size="sm" className="h-8 rounded-full px-3.5">
              {t("common:CANCEL")}
            </Button>
          </ComposerPrimitive.Cancel>
          <ComposerPrimitive.Send asChild>
            <Button size="sm" className="h-8 rounded-full px-3.5">
              {t("ai:AI_CHAT_ACTION_UPDATE")}
            </Button>
          </ComposerPrimitive.Send>
        </div>
      </ComposerPrimitive.Root>
    </MessagePrimitive.Root>
  );
};

const BranchPicker: FC<BranchPickerPrimitive.Root.Props> = ({ className, ...rest }) => {
  const { t } = useTranslation(["ai", "common"]);

  return (
    <BranchPickerPrimitive.Root
      hideWhenSingleBranch
      className={cn(
        "aui-branch-picker-root text-muted-foreground -ms-2 me-2 inline-flex items-center text-xs",
        className,
      )}
      {...rest}
    >
      <BranchPickerPrimitive.Previous asChild>
        <TooltipIconButton tooltip={t("common:PREVIOUS")}>
          <ChevronLeftIcon />
        </TooltipIconButton>
      </BranchPickerPrimitive.Previous>
      <span className="aui-branch-picker-state font-medium">
        <BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count />
      </span>
      <BranchPickerPrimitive.Next asChild>
        <TooltipIconButton tooltip={t("common:NEXT")}>
          <ChevronRightIcon />
        </TooltipIconButton>
      </BranchPickerPrimitive.Next>
    </BranchPickerPrimitive.Root>
  );
};
