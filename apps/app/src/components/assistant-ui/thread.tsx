"use client";

import { UserMessageAttachments } from "@/components/assistant-ui/attachment";
import { AssistantDataPart } from "@/components/assistant-ui/assistant-data-part";
import { MarkdownText } from "@/components/assistant-ui/markdown-text";
import { Reasoning, ReasoningText } from "@/components/assistant-ui/reasoning";
import { ToolFallback } from "@/components/assistant-ui/tool-fallback";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
import { AIComposerToolbar } from "@/components/ai/ai-composer-toolbar";
import {
  AIComposerDirectiveChips,
  AIComposerDirectiveSync,
} from "@/components/ai/ai-composer-directive-chips";
import { AIComposerEditorContextChips } from "@/components/ai/ai-composer-editor-context-chips";
import {
  AIComposerDirectiveInsertionProvider,
  AIComposerRichInput,
} from "@/components/ai/ai-composer-rich-input";
import { AIComposerRotatingPlaceholder } from "@/components/ai/ai-composer-rotating-placeholder";
import { AIComposerTriggers } from "@/components/ai/ai-composer-triggers";
import { AISuggestions } from "@/components/ai/ai-suggestions";
import { ComposerQueue } from "@/components/assistant-ui/composer-queue";
import { ThreadFollowupSuggestions } from "@/components/assistant-ui/follow-up-suggestions";
import { ThinkingIndicator } from "@/components/assistant-ui/elements/thinking-indicator";
import { ErrorState } from "@/components/assistant-ui/elements/error-state";
import { InlineCitation } from "@/components/assistant-ui/elements/inline-citation";
import { ghostButton, mono } from "@/components/assistant-ui/elements/surfaces";
import { Sources } from "@/components/assistant-ui/elements/sources";
import { StreamingText } from "@/components/assistant-ui/elements/streaming-text";
import { WebSearch } from "@/components/assistant-ui/elements/web-search";
import { ReasoningPanel } from "@/components/assistant-ui/elements/reasoning-panel";
import { ToolTimeline } from "@/components/assistant-ui/elements/tool-timeline";
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
  MessagePartPrimitive,
  ThreadPrimitive,
  type ThreadAssistantMessagePart,
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
  WrenchIcon,
  FileIcon,
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
  welcomeAgent?:
    | Readonly<{
        name: string;
        description: string;
        supportedExecutionModes: readonly ("plan" | "build")[];
        agentId?: string;
        avatarUrl?: string | null;
      }>
    | undefined;
  welcomeName?: string | undefined;
};

const EMPTY_COMPONENTS: ThreadComponents = {};
type ThreadVariant = NonNullable<ThreadProps["variant"]>;
const ThreadComponentsContext = createContext<ThreadComponents>(EMPTY_COMPONENTS);
const ThreadVariantContext = createContext<ThreadVariant>("default");
const ThreadWelcomeNameContext = createContext<string | undefined>(undefined);
const ThreadWelcomeAgentContext = createContext<ThreadProps["welcomeAgent"]>(undefined);

// Startup exposes a loading placeholder thread; treat it as a new chat so
// the composer mounts centered. Loads after startup keep the docked layout.
const isNewChatView = (s: AssistantState) =>
  s.thread.messages.length === 0 && (!s.thread.isLoading || s.threads.isLoading);

export const Thread: FC<ThreadProps> = ({
  components = EMPTY_COMPONENTS,
  composerAccessory,
  variant = "default",
  welcomeAgent,
  welcomeName,
}) => {
  const isEmpty = useAuiState(isNewChatView);

  return (
    <ThreadComponentsContext.Provider value={components}>
      <ThreadVariantContext.Provider value={variant}>
        <ThreadWelcomeAgentContext.Provider value={welcomeAgent}>
          <ThreadWelcomeNameContext.Provider value={welcomeName}>
            <ThreadRoot composerAccessory={composerAccessory} isEmpty={isEmpty} variant={variant} />
          </ThreadWelcomeNameContext.Provider>
        </ThreadWelcomeAgentContext.Provider>
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
          <AuiIf condition={(s) => s.thread.isLoading && s.thread.messages.length === 0}>
            <ThreadLoadingState />
          </AuiIf>
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
            <ThreadFollowupSuggestions />
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
      <div className="aui-thread-welcome-root flex min-h-[22rem] flex-1 flex-col items-start justify-end gap-3 px-3 pb-5 text-left">
        <div className="flex items-start gap-2">
          <span className="text-title2 leading-tight" aria-hidden="true">
            👋
          </span>
          <h2 className="max-w-[22rem] text-title3 font-semibold leading-tight text-label-primary">
            {t("ai:AI_CHAT_HOME_GREETING", {
              name: welcomeName ?? t("ai:AI_CHAT_HOME_USER_FALLBACK"),
            })}
          </h2>
        </div>
        <p className="text-footnote text-label-secondary">{t("ai:AI_CHAT_SIDEBAR_STARTER_HINT")}</p>
        <AISuggestions
          variant="home"
          className="flex w-full flex-wrap items-center justify-start gap-2"
        />
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

const ThreadLoadingState: FC = () => {
  const { t } = useTranslation(["ai"]);
  return (
    <div className="flex min-h-24 items-center justify-center py-8">
      <ThinkingIndicator label={t("ai:AI_CHAT_THREAD_PREPARING")} state="loading" />
    </div>
  );
};

const Composer: FC = () => {
  const { t } = useTranslation(["ai", "common"]);
  const variant = useContext(ThreadVariantContext);
  const isSidebar = variant === "sidebar";
  const DictationTranscript = ComposerPrimitive.DictationTranscript;
  const awaitingHumanInput = useAuiState((state) => {
    const message = state.thread.messages.at(-1);
    return (
      message?.role === "assistant" &&
      message.status?.type === "requires-action" &&
      message.content.some(
        (part) => part.type === "tool-call" && part.toolName === "human.request_input",
      )
    );
  });

  return (
    <ComposerPrimitive.Unstable_TriggerPopoverRoot>
      <AIComposerDirectiveInsertionProvider scope="thread">
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
                : "min-h-[6.5rem] border border-border/60 dark:border-muted-foreground/15",
            )}
          >
            <AIComposerDirectiveSync scope="thread" />
            <AIComposerDirectiveChips scope="thread" />
            <AIComposerEditorContextChips />
            <div className="relative min-w-0 flex-1">
              <AIComposerRichInput
                className={cn(
                  "aui-composer-input px-2 py-1",
                  isSidebar ? "h-20 min-h-20 max-h-20" : "h-12 min-h-12 max-h-12",
                )}
                autoFocus
                aria-label={
                  awaitingHumanInput
                    ? t("ai:AI_CHAT_HUMAN_TOOL_YOUR_ANSWER")
                    : t("ai:AI_CHAT_INPUT_PLACEHOLDER")
                }
              />
              {DictationTranscript ? (
                <AuiIf condition={(s) => s.composer.dictation != null}>
                  <DictationTranscript className="pointer-events-none absolute inset-x-2 bottom-1 line-clamp-1 text-xs text-label-secondary" />
                </AuiIf>
              ) : null}
              <AIComposerRotatingPlaceholder className="top-1 px-0" multiline={isSidebar} />
            </div>
            <AIComposerTriggers />
            <AIComposerToolbar surface={isSidebar ? "sidebar" : "default"} />
          </div>
        </ComposerPrimitive.Root>
      </AIComposerDirectiveInsertionProvider>
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
      <ErrorPrimitive.Root className="aui-message-error-root mt-2 overflow-hidden">
        <ErrorState
          title={summary || t("ai:AI_CHAT_ERROR_GENERIC")}
          detail={
            hasDistinctDetails
              ? t("ai:AI_CHAT_ERROR_DETAILS_AVAILABLE")
              : t("ai:AI_CHAT_ERROR_NO_DETAILS")
          }
          retrying={false}
        />
        {hasDistinctDetails ? (
          <button
            type="button"
            className="mt-1 px-4 text-xs text-red-600/70 underline-offset-2 hover:underline dark:text-red-400/70"
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? t("ai:AI_CHAT_ERROR_COLLAPSE") : t("ai:AI_CHAT_ERROR_EXPAND")}
          </button>
        ) : null}
        {hasDistinctDetails && expanded ? (
          <pre className="aui-message-error-detail mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-red-500/[0.04] p-3 font-mono text-footnote leading-relaxed text-red-700/80 dark:text-red-300/80">
            {details}
          </pre>
        ) : null}
      </ErrorPrimitive.Root>
    </MessagePrimitive.Error>
  );
};

const AssistantMessage: FC = () => {
  const { t } = useTranslation(["ai"]);
  const isRunning = useAuiState((s) => s.message.status?.type === "running");
  const isRunningToolOnly = useAuiState(
    (s) =>
      s.message.status?.type === "running" &&
      s.message.parts.some((part) => part.type === "tool-call") &&
      !s.message.parts.some((part) => part.type === "text" || part.type === "reasoning"),
  );
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
                return <AssistantToolTimeline group={part}>{children}</AssistantToolTimeline>;
              case "group-reasoning": {
                if (ReasoningGroup) {
                  return <ReasoningGroup group={part}>{children}</ReasoningGroup>;
                }
                return <AssistantReasoningPanel group={part}>{children}</AssistantReasoningPanel>;
              }
              case "text":
                return <AssistantStreamingText />;
              case "reasoning":
                return <Reasoning {...part} />;
              case "tool-call":
                return part.toolUI ?? <ToolFallbackComponent {...part} />;
              case "data":
                return <AssistantDataPart part={part} />;
              case "source":
                return <AssistantSourcePart part={part} />;
              case "file":
                return <AssistantFilePart part={part} />;
              case "image":
                return <MessagePartPrimitive.Image />;
              case "indicator":
                return isRunningToolOnly ? null : (
                  <ThinkingIndicator label={t("ai:AI_CHAT_PREPARING_CONTENT")} state="thinking" />
                );
              default:
                return null;
            }
          }}
        </MessagePrimitive.GroupedParts>
        <MessageError />
      </div>

      {!isRunning ? (
        <div
          data-slot="aui_assistant-message-footer"
          className={cn("ms-2 flex items-center", ACTION_BAR_HEIGHT)}
        >
          <BranchPicker />
          <AssistantActionBar />
        </div>
      ) : null}
    </MessagePrimitive.Root>
  );
};

const AssistantMessageHeader: FC = () => {
  const { t, i18n } = useTranslation(["ai", "common"]);
  const messageStatus = useAuiState((s) => s.message.status?.type);
  const welcomeAgent = useContext(ThreadWelcomeAgentContext);
  const rawCreatedAt = useAuiState((s) => s.message.metadata.custom?.createdAt);
  const createdAt = typeof rawCreatedAt === "number" ? new Date(rawCreatedAt) : null;
  const formattedTime = createdAt
    ? createdAt.toLocaleTimeString(i18n.language, {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";
  const createdAtIso = createdAt?.toISOString();

  if (messageStatus === "running") return null;

  return (
    <div className="mb-2 flex min-w-0 items-center justify-between gap-3 text-footnote">
      <div className="flex min-w-0 items-center gap-2 text-label-primary">
        {welcomeAgent?.avatarUrl ? (
          <img
            src={welcomeAgent.avatarUrl}
            alt=""
            className="size-7 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-border/70 bg-muted/50 text-[11px] font-semibold">
            {(welcomeAgent?.name ?? "A").slice(0, 1).toUpperCase()}
          </span>
        )}
        <span className="truncate font-semibold">
          {welcomeAgent?.name ?? t("ai:AI_CHAT_ASSISTANT_NAME")}
        </span>
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

const AssistantStreamingText: FC = () => {
  const streaming = useAuiState((s) => s.message.status?.type === "running");
  return (
    <StreamingText streaming={streaming}>
      <MarkdownText />
    </StreamingText>
  );
};

const AssistantReasoningPanel: FC<PropsWithChildren<{ group: ThreadGroupPart }>> = ({
  group,
  children,
}) => {
  const { t } = useTranslation(["ai"]);
  const [open, setOpen] = useState(false);
  const streaming = group.status.type === "running";
  return (
    <ReasoningPanel
      steps={[]}
      visibleSteps={0}
      streaming={streaming}
      open={open}
      onOpenChange={setOpen}
      restingLabel={t("ai:AI_CHAT_REASONING_TITLE")}
      activeLabel={t("ai:AI_CHAT_REASONING_ACTIVE")}
    >
      <div className="px-1 py-2" aria-busy={streaming}>
        <ReasoningText>{children}</ReasoningText>
      </div>
    </ReasoningPanel>
  );
};

export const AssistantToolTimeline: FC<PropsWithChildren<{ group: ThreadGroupPart }>> = ({
  group,
  children,
}) => {
  const { t } = useTranslation(["ai"]);
  const [open, setOpen] = useState(false);
  const messageParts = useAuiState((s) => s.message.parts);
  const toolParts = group.indices.flatMap((index) => {
    const part = messageParts[index];
    return part?.type === "tool-call" ? [part] : [];
  });
  const isHumanInput = toolParts.some((part) => part.toolName === "human.request_input");
  const isProjectBootstrap = toolParts.some((part) => part.toolName === "project.bootstrap");
  const toolLabel = (toolName: string, index: number) =>
    ({
      "human.request_input": t("ai:AI_CHAT_HUMAN_TOOL_LABEL"),
      "project.bootstrap": t("ai:AI_CHAT_PROJECT_BOOTSTRAP_TOOL_TITLE"),
      "builder.style_guide.generate": t("ai:AI_CHAT_STYLE_GUIDE_TOOL_TITLE"),
      "builder.wireframe.generate": t("ai:AI_CHAT_WIREFRAME_TOOL_TITLE"),
      "builder.design.generate": t("ai:AI_CHAT_DESIGN_TOOL_TITLE"),
    })[toolName] ?? t("ai:AI_CHAT_TOOL_STEP", { index: index + 1 });

  const steps = toolParts.map((part, index) => ({
    verb: toolLabel(part.toolName, index),
    chip: String(index + 1),
    icon: WrenchIcon,
  }));

  const streaming = group.status.type === "running";
  if (streaming && isProjectBootstrap) {
    return <div className="pt-1">{children}</div>;
  }
  if (streaming) return null;
  if (isHumanInput) {
    return <div className="pt-1">{children}</div>;
  }
  if (group.status.type === "requires-action") {
    return <div className="pt-1">{children}</div>;
  }
  return (
    <ToolTimeline
      steps={steps}
      visibleSteps={steps.length}
      streaming={streaming}
      open={open}
      onOpenChange={setOpen}
      restingLabel={t("ai:AI_CHAT_TOOL_CALLS_TITLE", { count: steps.length })}
      activeLabel={t("ai:AI_CHAT_TOOL_CALLS_ACTIVE", { count: steps.length })}
      stats={[]}
    />
  );
};

type SourcePart = Extract<ThreadAssistantMessagePart, { type: "source" }>;

const sourceDomain = (part: SourcePart) => {
  if (part.sourceType !== "url") {
    return ("filename" in part ? part.filename : undefined) ?? part.mediaType ?? "document";
  }
  try {
    return new URL(part.url).hostname;
  } catch {
    return part.url;
  }
};

const AssistantSourcePart: FC<{ part: SourcePart }> = ({ part }) => {
  const { t } = useTranslation(["ai"]);
  const [open, setOpen] = useState(false);
  const [openCitation, setOpenCitation] = useState<number | null>(null);
  const filename = "filename" in part ? part.filename : undefined;
  const title = part.title ?? part.url ?? filename ?? t("ai:AI_CHAT_SOURCE_DEFAULT_TITLE");
  const source = {
    domain: sourceDomain(part),
    title,
    ...(part.sourceType === "url" ? { url: part.url } : {}),
  };
  return (
    <div className="flex flex-col gap-2 py-1">
      {part.sourceType === "url" ? (
        <WebSearch
          query={title}
          results={[{ title, domain: source.domain }]}
          visibleResults={1}
          searching={false}
          cycle={0}
        />
      ) : null}
      <Sources sources={[source]} open={open} onOpenChange={setOpen} />
      <InlineCitation
        sources={[{ domain: source.domain, title: source.title, snippet: source.title }]}
        openIndex={openCitation}
        onOpenIndexChange={setOpenCitation}
      >
        {source.title}
      </InlineCitation>
    </div>
  );
};

const AssistantFilePart: FC<{
  part: Extract<ThreadAssistantMessagePart, { type: "file" }>;
}> = ({ part }) => (
  <a
    href={part.data}
    target="_blank"
    rel="noreferrer"
    className={cn(ghostButton, "inline-flex w-fit items-center gap-2 rounded-xl px-3 py-2 text-xs")}
  >
    <FileIcon className="size-3.5" />
    <span className="max-w-56 truncate">{part.filename}</span>
    <span className={cn(mono, "text-foreground/40")}>{part.mimeType}</span>
  </a>
);

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
        <div className="aui-user-message-content peer px-0 py-1 text-callout text-label-primary wrap-break-word empty:hidden">
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
        "aui-branch-picker-root text-label-secondary -ms-2 me-2 inline-flex items-center gap-1 text-xs",
        className,
      )}
      {...rest}
    >
      <BranchPickerPrimitive.Previous asChild>
        <TooltipIconButton tooltip={t("common:PREVIOUS")}>
          <ChevronLeftIcon />
        </TooltipIconButton>
      </BranchPickerPrimitive.Previous>
      <span className={cn("aui-branch-picker-state font-medium", mono)}>
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
