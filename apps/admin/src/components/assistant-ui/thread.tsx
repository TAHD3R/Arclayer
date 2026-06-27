"use client";

import { UserMessageAttachments } from "@/components/assistant-ui/attachment";
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
import {
  AIComposerContextControls,
  AIComposerInputActions,
  AIComposerToolbar,
} from "@/components/ai/ai-composer-toolbar";
import { ComposerQueue } from "@/components/assistant-ui/composer-queue";
import { formatAIChatError, resumeAIAgentRunForConversation } from "@/api/ai";
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
  type ToolCallMessagePartComponent,
  useAuiState,
} from "@assistant-ui/react";
import {
  ArrowDownIcon,
  BanIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  DownloadIcon,
  HammerIcon,
  ListChecksIcon,
  MoreHorizontalIcon,
  PencilIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
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
import type {
  AIAgentExecutionSummary,
  AIAgentArtifactStep,
  AIAgentInterrupt,
  AIAgentMessageArtifact,
} from "@/stores/use-ai-chat-store";

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
  variant?: "default" | "sidebar";
};

const EMPTY_COMPONENTS: ThreadComponents = {};
type ThreadVariant = NonNullable<ThreadProps["variant"]>;

const ThreadComponentsContext = createContext<ThreadComponents>(EMPTY_COMPONENTS);
const ThreadVariantContext = createContext<ThreadVariant>("default");

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
          className="aui-thread-welcome-suggestion text-foreground hover:bg-muted border-border/60 h-auto gap-1.5 !rounded-full border px-3.5 py-1.5 text-sm font-normal whitespace-nowrap transition-colors"
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
      <ComposerQueue />
      <div
        data-slot="aui_composer-shell"
        className={cn(
          "flex w-full min-w-0 flex-col gap-2 rounded-(--composer-radius) bg-(--composer-bg) p-(--composer-padding) transition-colors hover:border-border focus-within:border-border dark:shadow-none",
          isSidebar
            ? "min-h-[8.5rem] border border-border/60"
            : "h-[6.5rem] min-h-[6.5rem] border border-border/60 dark:border-muted-foreground/15",
        )}
      >
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

const AgentArtifact: FC = () => {
  const artifact = useAuiState((s) => s.message.metadata.custom?.agentArtifact);
  if (!isAIAgentMessageArtifact(artifact)) return null;
  return <AgentArtifactCard artifact={artifact} />;
};

type AgentRunSummaryStatus = "running" | "completed" | "cancelled" | "failed";

export const AgentRunSummary: FC = () => {
  const { t } = useTranslation(["ai", "common"]);
  const rawRunId = useAuiState((s) => s.message.metadata.custom?.agentRunId);
  const rawStatus = useAuiState((s) => s.message.metadata.custom?.agentStatus);
  const rawThreadId = useAuiState((s) => s.message.metadata.custom?.agentThreadId);
  const rawCheckpointId = useAuiState((s) => s.message.metadata.custom?.agentCheckpointId);
  const rawSummary = useAuiState((s) => s.message.metadata.custom?.agentExecutionSummary);
  const runId = typeof rawRunId === "string" && rawRunId.trim() ? rawRunId : null;
  const status = readAgentRunSummaryStatus(rawStatus);
  const threadId = typeof rawThreadId === "string" && rawThreadId.trim() ? rawThreadId : null;
  const checkpointId =
    typeof rawCheckpointId === "string" && rawCheckpointId.trim() ? rawCheckpointId : null;
  const executionSummary = isAIAgentExecutionSummary(rawSummary) ? rawSummary : null;

  if (!runId || !status) return null;

  const Icon = status === "completed" ? CheckIcon : status === "running" ? RefreshCwIcon : BanIcon;
  const tone =
    status === "failed"
      ? "border-destructive/35 bg-destructive/5 text-destructive"
      : "border-border/70 bg-muted/25 text-muted-foreground";

  return (
    <section
      className={cn("mt-3 rounded-lg border px-3 py-2 text-caption", tone)}
      aria-label={t("ai:AI_AGENT_RUN_SUMMARY_TITLE")}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        <span className="inline-flex min-w-0 items-center gap-1.5 font-semibold">
          <Icon
            className={cn("size-3.5 shrink-0", status === "running" && "animate-spin")}
            aria-hidden="true"
          />
          <span className="truncate">{agentRunStatusLabel(t, status)}</span>
        </span>
        <span className="min-w-0 truncate font-mono text-[11px]">{runId}</span>
        {checkpointId ? (
          <span className="min-w-0 truncate text-[11px]">
            {t("ai:AI_AGENT_RUN_CHECKPOINT")}: <span className="font-mono">{checkpointId}</span>
          </span>
        ) : threadId ? (
          <span className="min-w-0 truncate text-[11px]">
            {t("ai:AI_AGENT_RUN_THREAD")}: <span className="font-mono">{threadId}</span>
          </span>
        ) : null}
      </div>
      {executionSummary ? <AgentExecutionSummary summary={executionSummary} /> : null}
    </section>
  );
};

const AgentExecutionSummary: FC<{ summary: AIAgentExecutionSummary }> = ({ summary }) => {
  const { t } = useTranslation(["ai", "common"]);
  const details = [
    summary.toolNames.length
      ? t("ai:AI_AGENT_RUN_TOOLS", {
          count: summary.toolNames.length,
          names: summary.toolNames.join(", "),
        })
      : "",
    summary.totalTokens !== undefined
      ? t("ai:AI_AGENT_RUN_TOKENS", {
          total: summary.totalTokens,
          prompt: summary.promptTokens ?? 0,
          completion: summary.completionTokens ?? 0,
        })
      : "",
  ].filter(Boolean);

  if (details.length === 0) return null;
  return <div className="mt-1 truncate text-[11px] opacity-85">{details.join(" · ")}</div>;
};

const AgentInterrupt: FC = () => {
  const { t } = useTranslation(["ai", "common"]);
  const rawInterrupt = useAuiState((s) => s.message.metadata.custom?.agentInterrupt);
  const rawConversationId = useAuiState((s) => s.message.metadata.custom?.conversationId);
  const rawStatus = useAuiState((s) => s.message.metadata.custom?.agentStatus);
  const interrupt = isAIAgentInterrupt(rawInterrupt) ? rawInterrupt : null;
  const conversationId = typeof rawConversationId === "string" ? rawConversationId : null;
  const status = typeof rawStatus === "string" ? rawStatus : "interrupted";
  const [pending, setPending] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!interrupt || !conversationId) return null;

  const running = pending !== null || status === "running";
  const checkpoint = interrupt.checkpointId ?? interrupt.interruptId ?? interrupt.threadId;

  const handleDecision = async (approved: boolean) => {
    const action = approved ? "approve" : "reject";
    setPending(action);
    setError(null);
    try {
      await resumeAIAgentRunForConversation(conversationId, {
        runId: interrupt.runId,
        approved,
        comment: approved
          ? t("ai:AI_AGENT_INTERRUPT_APPROVED_COMMENT")
          : t("ai:AI_AGENT_INTERRUPT_REJECTED_COMMENT"),
      });
    } catch (err) {
      setError(formatAIChatError(err));
    } finally {
      setPending(null);
    }
  };

  return (
    <section className="mt-3 overflow-hidden rounded-lg border border-border/70 bg-background text-sm">
      <div className="flex min-w-0 items-center justify-between gap-3 border-b border-border/60 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <ShieldCheckIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <h3 className="truncate text-sm font-semibold text-foreground">
            {t("ai:AI_AGENT_INTERRUPT_TITLE")}
          </h3>
        </div>
        <span className="shrink-0 rounded-md border border-border/60 bg-muted/40 px-2 py-0.5 text-caption font-medium text-muted-foreground">
          {status}
        </span>
      </div>
      <div className="grid gap-2 px-3 py-2.5">
        <dl className="grid grid-cols-[5.25rem_minmax(0,1fr)] gap-x-2 gap-y-1 text-caption">
          <dt className="text-muted-foreground">{t("ai:AI_AGENT_INTERRUPT_AGENT")}</dt>
          <dd className="truncate font-medium text-foreground">{interrupt.agentId}</dd>
          <dt className="text-muted-foreground">{t("ai:AI_AGENT_INTERRUPT_MODE")}</dt>
          <dd className="font-medium text-foreground">{interrupt.mode}</dd>
          {checkpoint ? (
            <>
              <dt className="text-muted-foreground">{t("ai:AI_AGENT_INTERRUPT_CHECKPOINT")}</dt>
              <dd className="truncate font-mono text-[11px] text-muted-foreground">{checkpoint}</dd>
            </>
          ) : null}
        </dl>
        <p className="line-clamp-3 rounded-md bg-muted/35 px-2.5 py-2 text-footnote leading-relaxed text-muted-foreground">
          {interrupt.prompt}
        </p>
        {error ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-2 text-footnote font-medium text-destructive">
            {error}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border/60 px-3 py-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 rounded-md px-2.5"
          disabled={running}
          onClick={() => void handleDecision(false)}
        >
          <BanIcon className="size-3.5" aria-hidden="true" />
          {pending === "reject"
            ? t("ai:AI_AGENT_INTERRUPT_REJECTING")
            : t("ai:AI_AGENT_INTERRUPT_REJECT")}
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-8 gap-1.5 rounded-md px-2.5"
          disabled={running}
          onClick={() => void handleDecision(true)}
        >
          <CheckIcon className="size-3.5" aria-hidden="true" />
          {pending === "approve"
            ? t("ai:AI_AGENT_INTERRUPT_APPROVING")
            : t("ai:AI_AGENT_INTERRUPT_APPROVE")}
        </Button>
      </div>
    </section>
  );
};

const AgentArtifactCard: FC<{ artifact: AIAgentMessageArtifact }> = ({ artifact }) => {
  const { t } = useTranslation(["ai", "common"]);
  const isPlan = artifact.type === "agent_execution_plan";
  const title = isPlan
    ? t("ai:AI_AGENT_ARTIFACT_PLAN_TITLE")
    : t("ai:AI_AGENT_ARTIFACT_BUILD_TITLE");
  const items = isPlan ? artifact.steps : artifact.operations;
  const Icon = isPlan ? ListChecksIcon : HammerIcon;

  return (
    <section className="mt-3 overflow-hidden rounded-lg border border-border/70 bg-muted/30 text-sm">
      <div className="flex min-w-0 items-center justify-between gap-3 border-b border-border/60 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <h3 className="truncate text-sm font-semibold text-foreground">{title}</h3>
        </div>
        <span className="shrink-0 rounded-md border border-border/60 bg-background/70 px-2 py-0.5 text-caption font-medium text-muted-foreground">
          {artifact.status}
        </span>
      </div>
      {artifact.goal.trim() ? (
        <p className="border-b border-border/50 px-3 py-2 text-footnote leading-relaxed text-muted-foreground">
          {artifact.goal}
        </p>
      ) : null}
      <ol className="divide-y divide-border/50">
        {items.map((item, index) => (
          <li
            key={item.id}
            className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-start gap-2 px-3 py-2"
          >
            <span className="text-caption font-medium text-muted-foreground tabular-nums">
              {index + 1}
            </span>
            <span className="min-w-0 text-footnote leading-relaxed text-foreground">
              {item.title}
            </span>
            <span className="rounded-md bg-background/70 px-1.5 py-0.5 text-caption font-medium text-muted-foreground">
              {item.status}
            </span>
          </li>
        ))}
      </ol>
      {!isPlan ? <AgentBuildArtifactFooter artifact={artifact} /> : null}
    </section>
  );
};

const AgentBuildArtifactFooter: FC<{
  artifact: Extract<AIAgentMessageArtifact, { type: "agent_build_blueprint" }>;
}> = ({ artifact }) => {
  const { t } = useTranslation(["ai", "common"]);

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-border/60 px-3 py-2 text-caption text-muted-foreground">
      <span className="font-medium">
        {t("ai:AI_AGENT_ARTIFACT_APPLIES_CHANGES", {
          value: artifact.appliesChanges ? "true" : "false",
        })}
      </span>
      {artifact.requiresApprovalBeforeApply ? (
        <span className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background/70 px-2 py-0.5 font-medium">
          <ShieldCheckIcon className="size-3.5" aria-hidden="true" />
          {t("ai:AI_AGENT_ARTIFACT_APPROVAL_REQUIRED")}
        </span>
      ) : null}
    </div>
  );
};

function isAIAgentMessageArtifact(value: unknown): value is AIAgentMessageArtifact {
  if (!isRecord(value)) return false;

  if (value.type === "agent_execution_plan") {
    return (
      typeof value.goal === "string" &&
      typeof value.status === "string" &&
      Array.isArray(value.steps) &&
      value.steps.every(isAIAgentArtifactStep)
    );
  }

  if (value.type === "agent_build_blueprint") {
    return (
      typeof value.goal === "string" &&
      typeof value.status === "string" &&
      Array.isArray(value.operations) &&
      value.operations.every(isAIAgentArtifactStep) &&
      typeof value.appliesChanges === "boolean" &&
      typeof value.requiresApprovalBeforeApply === "boolean"
    );
  }

  return false;
}

function isAIAgentInterrupt(value: unknown): value is AIAgentInterrupt {
  return (
    isRecord(value) &&
    typeof value.kind === "string" &&
    typeof value.runId === "string" &&
    typeof value.agentId === "string" &&
    (value.mode === "build" || value.mode === "plan" || value.mode === "agent") &&
    typeof value.prompt === "string" &&
    isRecord(value.toolOutputs) &&
    typeof value.requiredDecision === "string" &&
    (value.interruptId === undefined || typeof value.interruptId === "string") &&
    (value.threadId === undefined || typeof value.threadId === "string") &&
    (value.checkpointId === undefined || typeof value.checkpointId === "string")
  );
}

function isAIAgentExecutionSummary(value: unknown): value is AIAgentExecutionSummary {
  return (
    isRecord(value) &&
    Array.isArray(value.toolNames) &&
    value.toolNames.every((toolName) => typeof toolName === "string") &&
    (value.promptTokens === undefined || typeof value.promptTokens === "number") &&
    (value.completionTokens === undefined || typeof value.completionTokens === "number") &&
    (value.totalTokens === undefined || typeof value.totalTokens === "number")
  );
}

function isAIAgentArtifactStep(value: unknown): value is AIAgentArtifactStep {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.status === "string"
  );
}

function readAgentRunSummaryStatus(value: unknown): AgentRunSummaryStatus | null {
  if (value === "running" || value === "completed" || value === "cancelled" || value === "failed") {
    return value;
  }
  return null;
}

function agentRunStatusLabel(
  t: ReturnType<typeof useTranslation>["t"],
  status: AgentRunSummaryStatus,
): string {
  if (status === "running") return t("ai:AI_AGENT_RUN_STATUS_RUNNING");
  if (status === "completed") return t("ai:AI_AGENT_RUN_STATUS_COMPLETED");
  if (status === "cancelled") return t("ai:AI_AGENT_RUN_STATUS_CANCELLED");
  return t("ai:AI_AGENT_RUN_STATUS_FAILED");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

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
        <AgentInterrupt />
        <AgentRunSummary />
        <AgentArtifact />
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
      <ActionBarPrimitive.Reload asChild>
        <TooltipIconButton tooltip={t("ai:AI_CHAT_ACTION_REFRESH")}>
          <RefreshCwIcon />
        </TooltipIconButton>
      </ActionBarPrimitive.Reload>
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

  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      className="aui-user-action-bar-root flex flex-col items-end"
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
          className="aui-edit-composer-input text-foreground min-h-14 w-full resize-none bg-transparent px-4 pt-3 pb-1 text-base outline-none"
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
