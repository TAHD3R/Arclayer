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
import { AIComposerToolbar } from "@/components/ai/ai-composer-toolbar";
import { AIComposerDirectiveChips } from "@/components/ai/ai-composer-directive-chips";
import { AIComposerRotatingPlaceholder } from "@/components/ai/ai-composer-rotating-placeholder";
import { AIComposerTriggerInput } from "@/components/ai/ai-composer-trigger-input";
import { AIComposerTriggers } from "@/components/ai/ai-composer-triggers";
import { AISuggestions } from "@/components/ai/ai-suggestions";
import { ComposerQueue } from "@/components/assistant-ui/composer-queue";
import { Button } from "@arclayer/ui/button";
import { cn } from "@arclayer/lib/utils";
import {
  ActionBarPrimitive,
  AuiIf,
  type AssistantState,
  BranchPickerPrimitive,
  ComposerPrimitive,
  ErrorPrimitive,
  groupPartByType,
  MessagePrimitive,
  ThreadPrimitive,
  type ToolCallMessagePartComponent,
  useAuiState,
} from "@assistant-ui/react";
import {
  ArrowDownIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  GlobeIcon,
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
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";

export type ThreadGroupPart = MessagePrimitive.GroupedParts.GroupPart;

export { ComposerQueue };

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
  composerAccessory?: ReactNode;
  variant?: "default" | "sidebar";
  welcomeName?: string | undefined;
};

const EMPTY_COMPONENTS: ThreadComponents = {};
type ThreadVariant = NonNullable<ThreadProps["variant"]>;
const ThreadComponentsContext = createContext<ThreadComponents>(EMPTY_COMPONENTS);
const ThreadVariantContext = createContext<ThreadVariant>("default");
const ThreadWelcomeNameContext = createContext<string | undefined>(undefined);

// Startup exposes a loading placeholder thread; treat it as a new chat so
// the composer mounts centered. Loads after startup keep the docked layout.
const isNewChatView = (s: AssistantState) =>
  s.thread.messages.length === 0 && (!s.thread.isLoading || s.threads.isLoading);

export const Thread: FC<ThreadProps> = ({
  components = EMPTY_COMPONENTS,
  composerAccessory,
  variant = "default",
  welcomeName,
}) => {
  const isEmpty = useAuiState(isNewChatView);

  return (
    <ThreadComponentsContext.Provider value={components}>
      <ThreadVariantContext.Provider value={variant}>
        <ThreadWelcomeNameContext.Provider value={welcomeName}>
          <ThreadRoot composerAccessory={composerAccessory} isEmpty={isEmpty} variant={variant} />
        </ThreadWelcomeNameContext.Provider>
      </ThreadVariantContext.Provider>
    </ThreadComponentsContext.Provider>
  );
};

const ThreadRoot: FC<{
  composerAccessory?: ReactNode;
  isEmpty: boolean;
  variant: ThreadVariant;
}> = ({ composerAccessory, isEmpty, variant }) => {
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
        className={cn(
          "relative flex flex-1 flex-col overflow-x-hidden overflow-y-auto scroll-smooth",
          isSidebar && "scrollbar-none",
        )}
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
            {composerAccessory}
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
        className="aui-thread-scroll-to-bottom dark:border-border dark:bg-background dark:hover:bg-accent absolute -top-12 z-10 self-center !rounded-full p-4 disabled:invisible"
      >
        <ArrowDownIcon />
      </TooltipIconButton>
    </ThreadPrimitive.ScrollToBottom>
  );
};

const ThreadWelcome: FC = () => {
  const { t } = useTranslation(["ai", "common"]);
  const variant = useContext(ThreadVariantContext);
  const welcomeName = useContext(ThreadWelcomeNameContext);
  const isSidebar = variant === "sidebar";

  if (isSidebar) {
    return (
      <div className="aui-thread-welcome-root flex min-h-[22rem] flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
        <h2 className="max-w-[22rem] text-title3 font-semibold leading-tight text-label-primary">
          {t("ai:AI_CHAT_HOME_GREETING", {
            name: welcomeName ?? t("ai:AI_CHAT_HOME_USER_FALLBACK"),
          })}
        </h2>
        <AISuggestions className="flex w-full flex-wrap items-center justify-center gap-2" />
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
  return <AISuggestions className="flex w-full flex-wrap items-center justify-center gap-2 px-4" />;
};

const Composer: FC = () => {
  const { t } = useTranslation(["ai", "common"]);
  const variant = useContext(ThreadVariantContext);
  const isSidebar = variant === "sidebar";

  return (
    <ComposerPrimitive.Unstable_TriggerPopoverRoot>
      <ComposerPrimitive.Root
        className={cn(
          "aui-composer-root relative flex w-full min-w-0 flex-col",
          isSidebar && "gap-0",
        )}
      >
        <ComposerQueue />
        <div
          data-slot="aui_composer-shell"
          data-ai-composer-shell
          className={cn(
            "relative flex w-full min-w-0 flex-col gap-2 rounded-(--composer-radius) bg-(--composer-bg) p-(--composer-padding) transition-colors hover:border-border focus-within:border-border data-[trigger-open=true]:z-40 dark:shadow-none",
            isSidebar
              ? "min-h-[10rem] border border-border/60 bg-muted"
              : "h-[6.5rem] min-h-[6.5rem] border border-border/60 dark:border-muted-foreground/15",
          )}
        >
          <AIComposerDirectiveChips scope="thread" />
          <ComposerAttachments />
          <div className="relative min-w-0 flex-1">
            <AIComposerTriggerInput
              placeholder={t("ai:AI_CHAT_INPUT_PLACEHOLDER")}
              className={cn(
                "aui-composer-input w-full min-w-0 resize-none bg-transparent px-2.5 py-1 text-callout text-label-primary outline-none [field-sizing:fixed] placeholder:text-transparent",
                isSidebar ? "h-20 min-h-20 max-h-20" : "h-12 min-h-12 max-h-12",
              )}
              rows={1}
              autoFocus
              aria-label={t("ai:AI_CHAT_INPUT_PLACEHOLDER")}
            />
            <AIComposerRotatingPlaceholder className="top-1 px-0" multiline={isSidebar} />
          </div>
          <AIComposerTriggers scope="thread" />
          <AIComposerToolbar surface={isSidebar ? "sidebar" : "default"} />
        </div>
      </ComposerPrimitive.Root>
    </ComposerPrimitive.Unstable_TriggerPopoverRoot>
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
      className="group fade-in slide-in-from-bottom-1 animate-in relative duration-150"
    >
      <div
        data-slot="aui_assistant-message-content"
        // [contain-intrinsic-size:auto_24px] fixes issue #4104, don't change without checking for regressions
        className="px-2 text-callout leading-relaxed text-label-primary wrap-break-word [contain-intrinsic-size:auto_24px] [content-visibility:auto]"
      >
        <AssistantMessageHeader />
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

const AssistantMessageHeader: FC = () => {
  const { t, i18n } = useTranslation(["ai", "common"]);
  const rawCreatedAt = useAuiState((s) => s.message.metadata.custom?.createdAt);
  const createdAt = typeof rawCreatedAt === "number" ? new Date(rawCreatedAt) : null;
  const formattedTime = createdAt
    ? createdAt.toLocaleTimeString(i18n.language, {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";
  const createdAtIso = createdAt?.toISOString();

  return (
    <div className="mb-2 flex min-w-0 items-center justify-between gap-3 text-footnote">
      <div className="flex min-w-0 items-center gap-2 text-label-primary">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-border/70 bg-muted/50 text-[11px] font-semibold">
          A
        </span>
        <span className="truncate font-semibold">{t("ai:AI_CHAT_ASSISTANT_NAME")}</span>
      </div>
      {formattedTime && createdAtIso ? (
        <time
          className="shrink-0 text-caption text-label-secondary opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
          dateTime={createdAtIso}
        >
          {formattedTime}
        </time>
      ) : null}
    </div>
  );
};

const AssistantActionBar: FC = () => {
  const { t } = useTranslation(["ai", "common"]);

  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      className="aui-assistant-action-bar-root col-start-3 row-start-2 -ms-1 flex min-w-24 gap-1 text-label-secondary opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100"
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
      <ActionBarPrimitive.Reload asChild>
        <TooltipIconButton tooltip={t("ai:AI_CHAT_ACTION_REFRESH")}>
          <RefreshCwIcon />
        </TooltipIconButton>
      </ActionBarPrimitive.Reload>
    </ActionBarPrimitive.Root>
  );
};

const UserMessage: FC = () => {
  const { t } = useTranslation(["ai"]);
  const webSearchEnabled = useAuiState((s) => s.message.metadata.custom?.webSearchEnabled === true);

  return (
    <MessagePrimitive.Root
      data-slot="aui_user-message-root"
      className="group fade-in slide-in-from-bottom-1 animate-in grid auto-rows-auto grid-cols-[minmax(72px,1fr)_auto] content-start gap-y-2 px-2 duration-150 [contain-intrinsic-size:auto_60px] [content-visibility:auto] [&:where(>*)]:col-start-2"
      data-role="user"
    >
      <UserMessageAttachments />

      <div className="aui-user-message-content-wrapper relative col-start-2 min-w-0">
        <div className="aui-user-message-content peer rounded-xl bg-muted px-4 py-2 text-callout text-label-primary wrap-break-word empty:hidden">
          {webSearchEnabled ? (
            <span className="mb-1.5 inline-flex max-w-full items-center gap-1.5 rounded-full border border-border/70 bg-background/70 px-2 py-1 text-caption font-semibold text-label-primary shadow-sm">
              <GlobeIcon className="size-3.5 shrink-0 text-label-secondary" aria-hidden="true" />
              <span className="min-w-0 truncate">{t("ai:AI_CHAT_WEB_SEARCH_ENABLED")}</span>
            </span>
          ) : null}
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

  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      className="aui-user-action-bar-root flex min-h-7 min-w-7 flex-col items-end opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100"
    >
      <ActionBarPrimitive.Edit asChild>
        <TooltipIconButton tooltip={t("ai:AI_CHAT_ACTION_EDIT")} className="aui-user-action-edit">
          <PencilIcon />
        </TooltipIconButton>
      </ActionBarPrimitive.Edit>
    </ActionBarPrimitive.Root>
  );
};

const EditComposer: FC = () => {
  const { t } = useTranslation(["ai", "common"]);

  return (
    <MessagePrimitive.Root data-slot="aui_edit-composer-wrapper" className="flex flex-col px-2">
      <ComposerPrimitive.Root className="aui-edit-composer-root border-border/60 dark:border-muted-foreground/15 ms-auto flex w-full max-w-[85%] flex-col rounded-(--composer-radius) border bg-(--composer-bg) shadow-[0_4px_16px_-8px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04)] dark:shadow-none">
        <ComposerPrimitive.Input
          className="aui-edit-composer-input text-label-primary min-h-14 w-full resize-none bg-transparent px-4 pt-3 pb-1 text-base outline-none"
          autoFocus
        />
        <div className="aui-edit-composer-footer mx-2.5 mb-2.5 flex items-center gap-1.5 self-end">
          <ComposerPrimitive.Cancel asChild>
            <Button variant="ghost" size="sm" className="h-8 !rounded-full px-3.5">
              {t("common:CANCEL")}
            </Button>
          </ComposerPrimitive.Cancel>
          <ComposerPrimitive.Send asChild>
            <Button size="sm" className="h-8 !rounded-full px-3.5">
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
        "aui-branch-picker-root text-label-secondary -ms-2 me-2 inline-flex items-center text-xs",
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
