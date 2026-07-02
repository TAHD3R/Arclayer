"use client";

import { ComposerAttachments, UserMessageAttachments } from "@/components/assistant-ui/attachment";
import { useNavigate } from "@tanstack/react-router";
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
import { AIComposerDirectiveChips } from "@/components/ai/ai-composer-directive-chips";
import { AIComposerTriggers } from "@/components/ai/ai-composer-triggers";
import { AIContextRecommendations } from "@/components/ai/ai-context-recommendations";
import { AISuggestions } from "@/components/ai/ai-suggestions";
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
  FolderOpenIcon,
  FolderPlusIcon,
  GlobeIcon,
  HammerIcon,
  Layers3Icon,
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
  AIWorkspaceActionArtifact,
  AIWorkspaceActionProject,
} from "@/stores/use-ai-chat-store";
import { useAiChatStore } from "@/stores/use-ai-chat-store";
import { sendAIWorkspaceActionMessage } from "@/components/ai/ai-chat-runtime";

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
  variant = "default",
  welcomeName,
}) => {
  const isEmpty = useAuiState(isNewChatView);

  return (
    <ThreadComponentsContext.Provider value={components}>
      <ThreadVariantContext.Provider value={variant}>
        <ThreadWelcomeNameContext.Provider value={welcomeName}>
          <ThreadRoot isEmpty={isEmpty} variant={variant} />
        </ThreadWelcomeNameContext.Provider>
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
        className="relative flex flex-1 flex-col overflow-x-hidden overflow-y-scroll scroll-smooth"
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
        {isSidebar ? (
          <div className="flex min-w-0 flex-col gap-2 rounded-t-(--composer-radius) border border-b-0 border-border/60 bg-muted/55 px-2.5 pb-2 pt-2.5 shadow-sm backdrop-blur-xl">
            <AIContextRecommendations />
            <AIComposerContextControls compact />
          </div>
        ) : null}
        <ComposerQueue />
        <div
          data-slot="aui_composer-shell"
          className={cn(
            "relative flex w-full min-w-0 flex-col gap-2 rounded-(--composer-radius) bg-(--composer-bg) p-(--composer-padding) transition-colors hover:border-border focus-within:border-border dark:shadow-none",
            isSidebar
              ? "min-h-[8.5rem] !rounded-t-none border border-border/60 backdrop-blur-xl"
              : "h-[6.5rem] min-h-[6.5rem] border border-border/60 dark:border-muted-foreground/15",
          )}
        >
          <AIComposerDirectiveChips scope="thread" />
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
          <AIComposerTriggers />
          {isSidebar ? <AIComposerInputActions /> : <AIComposerToolbar />}
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

const AgentArtifact: FC = () => {
  const artifact = useAuiState((s) => s.message.metadata.custom?.agentArtifact);
  if (!isAIAgentMessageArtifact(artifact)) return null;
  return <AgentArtifactCard artifact={artifact} />;
};

const WorkspaceActionArtifact: FC = () => {
  const artifact = useAuiState((s) => s.message.metadata.custom?.workspaceAction);
  if (!isAIWorkspaceActionArtifact(artifact)) return null;
  return <WorkspaceActionCard artifact={artifact} />;
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
  const conversationId = useAuiState((s) => {
    const value = s.message.metadata.custom?.conversationId;
    return typeof value === "string" ? value : null;
  });
  const [executePending, setExecutePending] = useState(false);
  const [executeError, setExecuteError] = useState<string | null>(null);
  const isPlan = artifact.type === "agent_execution_plan";
  const title = isPlan
    ? t("ai:AI_AGENT_ARTIFACT_PLAN_TITLE")
    : t("ai:AI_AGENT_ARTIFACT_BUILD_TITLE");
  const items = isPlan ? artifact.steps : artifact.operations;
  const Icon = isPlan ? ListChecksIcon : HammerIcon;
  const canExecuteWorkspacePlan =
    isPlan && artifact.source === "workspace_action:planned_mutation" && Boolean(conversationId);

  const handleExecuteWorkspacePlan = async () => {
    if (!conversationId) return;
    setExecutePending(true);
    setExecuteError(null);
    useAiChatStore.getState().setComposerMode("build");
    try {
      await sendAIWorkspaceActionMessage(conversationId, artifact.goal);
    } catch (error) {
      setExecuteError(formatAIChatError(error));
    } finally {
      setExecutePending(false);
    }
  };

  return (
    <section className="mt-3 overflow-hidden rounded-lg border border-border/70 bg-muted/30 text-sm">
      <div className="flex min-w-0 items-center justify-between gap-3 border-b border-border/60 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <h3 className="truncate text-sm font-semibold text-foreground">{title}</h3>
        </div>
        <span className="shrink-0 rounded-md border border-border/60 bg-background/70 px-2 py-0.5 text-caption font-medium text-muted-foreground">
          {agentArtifactStatusLabel(t, artifact.status)}
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
              <span>{item.title}</span>
              {item.toolName || item.detail ? (
                <span className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-caption text-muted-foreground">
                  {item.toolName ? (
                    <span className="min-w-0 truncate font-mono">{item.toolName}</span>
                  ) : null}
                  {item.detail ? <span className="min-w-0 truncate">{item.detail}</span> : null}
                </span>
              ) : null}
            </span>
            <span className="rounded-md bg-background/70 px-1.5 py-0.5 text-caption font-medium text-muted-foreground">
              {agentArtifactStatusLabel(t, item.status)}
            </span>
          </li>
        ))}
      </ol>
      {canExecuteWorkspacePlan ? (
        <div className="flex flex-col gap-2 border-t border-border/60 px-3 py-2">
          {executeError ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-2 text-footnote font-medium text-destructive">
              {executeError}
            </p>
          ) : null}
          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              className="h-8 gap-1.5 rounded-md px-2.5"
              disabled={executePending}
              onClick={() => void handleExecuteWorkspacePlan()}
            >
              <CheckIcon className="size-3.5" aria-hidden="true" />
              {executePending
                ? t("ai:AI_WORKSPACE_ACTION_EXECUTING")
                : t("ai:AI_WORKSPACE_ACTION_EXECUTE_PLAN")}
            </Button>
          </div>
        </div>
      ) : null}
      {!isPlan ? <AgentBuildArtifactFooter artifact={artifact} /> : null}
    </section>
  );
};

function agentArtifactStatusLabel(
  t: ReturnType<typeof useTranslation>["t"],
  status: string,
): string {
  if (status === "planned") return t("ai:AI_AGENT_ARTIFACT_STATUS_PLANNED");
  if (status === "completed") return t("ai:AI_AGENT_ARTIFACT_STATUS_COMPLETED");
  if (status === "running") return t("ai:AI_AGENT_ARTIFACT_STATUS_RUNNING");
  if (status === "failed") return t("ai:AI_AGENT_ARTIFACT_STATUS_FAILED");
  return status;
}

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

const WorkspaceActionCard: FC<{ artifact: AIWorkspaceActionArtifact }> = ({ artifact }) => {
  const { t } = useTranslation(["ai", "common"]);
  const navigate = useNavigate();
  const isCreated = artifact.type === "workspace_project_created";
  const isContentModelCreated = artifact.type === "workspace_content_model_created";
  const isList = artifact.type === "workspace_project_list";
  const title = isCreated
    ? t("ai:AI_WORKSPACE_ACTION_PROJECT_CREATED_TITLE")
    : isContentModelCreated
      ? t("ai:AI_WORKSPACE_ACTION_CONTENT_MODEL_CREATED_TITLE")
      : isList
        ? t("ai:AI_WORKSPACE_ACTION_PROJECT_LIST_TITLE", { count: artifact.total })
        : t("ai:AI_WORKSPACE_ACTION_NAVIGATION_TITLE");
  const Icon = isContentModelCreated ? Layers3Icon : isCreated ? FolderPlusIcon : FolderOpenIcon;

  const handleNavigate = () => {
    void navigate({ to: artifact.navigation.path as never });
  };

  return (
    <section className="mt-3 overflow-hidden rounded-lg border border-border/70 bg-muted/30 text-sm">
      <div className="flex min-w-0 items-center justify-between gap-3 border-b border-border/60 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <h3 className="truncate text-sm font-semibold text-foreground">{title}</h3>
        </div>
        <span className="shrink-0 rounded-md border border-border/60 bg-background/70 px-2 py-0.5 text-caption font-medium text-muted-foreground">
          {t("ai:AI_WORKSPACE_ACTION_STATUS_COMPLETED")}
        </span>
      </div>
      {artifact.type === "workspace_project_created" ? (
        <WorkspaceProjectRow project={artifact.project} />
      ) : null}
      {artifact.type === "workspace_content_model_created" ? (
        <WorkspaceContentModelRow contentModel={artifact.contentModel} />
      ) : null}
      {artifact.type === "workspace_project_list" ? (
        <div className="divide-y divide-border/50">
          {artifact.projects.length ? (
            artifact.projects.map((project) => (
              <WorkspaceProjectRow key={project.id} project={project} />
            ))
          ) : (
            <p className="px-3 py-2 text-footnote text-muted-foreground">
              {t("ai:AI_WORKSPACE_ACTION_PROJECT_LIST_EMPTY")}
            </p>
          )}
        </div>
      ) : null}
      <div className="flex justify-end border-t border-border/60 px-3 py-2">
        <Button
          type="button"
          size="sm"
          className="h-8 gap-1.5 rounded-md px-2.5"
          onClick={handleNavigate}
        >
          <FolderOpenIcon className="size-3.5" aria-hidden="true" />
          {artifact.navigation.label}
        </Button>
      </div>
    </section>
  );
};

const WorkspaceProjectRow: FC<{ project: AIWorkspaceActionProject }> = ({ project }) => (
  <div className="grid gap-1 px-3 py-2.5">
    <div className="flex min-w-0 items-center justify-between gap-3">
      <span className="truncate text-footnote font-semibold text-foreground">{project.name}</span>
      <span className="shrink-0 rounded-md bg-background/70 px-1.5 py-0.5 font-mono text-caption text-muted-foreground">
        {project.slug}
      </span>
    </div>
    {project.description ? (
      <p className="line-clamp-2 text-caption leading-relaxed text-muted-foreground">
        {project.description}
      </p>
    ) : null}
  </div>
);

const WorkspaceContentModelRow: FC<{
  contentModel: Extract<
    AIWorkspaceActionArtifact,
    { type: "workspace_content_model_created" }
  >["contentModel"];
}> = ({ contentModel }) => (
  <div className="grid gap-1 px-3 py-2.5">
    <div className="flex min-w-0 items-center justify-between gap-3">
      <span className="truncate text-footnote font-semibold text-foreground">
        {contentModel.name}
      </span>
      <span className="shrink-0 rounded-md bg-background/70 px-1.5 py-0.5 font-mono text-caption text-muted-foreground">
        {contentModel.singularKey}
      </span>
    </div>
    {contentModel.description ? (
      <p className="line-clamp-2 text-caption leading-relaxed text-muted-foreground">
        {contentModel.description}
      </p>
    ) : null}
  </div>
);

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

function isAIWorkspaceActionArtifact(value: unknown): value is AIWorkspaceActionArtifact {
  if (!isRecord(value) || value.status !== "completed") return false;
  if (value.type === "workspace_project_created") {
    return isWorkspaceActionProject(value.project) && isWorkspaceActionNavigation(value.navigation);
  }
  if (value.type === "workspace_project_list") {
    return (
      Array.isArray(value.projects) &&
      value.projects.every(isWorkspaceActionProject) &&
      typeof value.total === "number" &&
      isWorkspaceActionNavigation(value.navigation)
    );
  }
  if (value.type === "workspace_content_model_created") {
    return (
      isWorkspaceActionContentModel(value.contentModel) &&
      isWorkspaceActionNavigation(value.navigation)
    );
  }
  if (value.type === "workspace_navigation") {
    return isWorkspaceActionNavigation(value.navigation);
  }
  return false;
}

function isWorkspaceActionProject(value: unknown): value is AIWorkspaceActionProject {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.slug === "string" &&
    (value.description === undefined ||
      value.description === null ||
      typeof value.description === "string")
  );
}

function isWorkspaceActionContentModel(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.singularKey === "string" &&
    typeof value.pluralKey === "string" &&
    typeof value.modelKind === "string" &&
    (value.description === undefined ||
      value.description === null ||
      typeof value.description === "string")
  );
}

function isWorkspaceActionNavigation(value: unknown): value is { label: string; path: string } {
  return isRecord(value) && typeof value.label === "string" && typeof value.path === "string";
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
      className="group fade-in slide-in-from-bottom-1 animate-in relative duration-150"
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
        <WorkspaceActionArtifact />
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
      className="aui-assistant-action-bar-root text-muted-foreground col-start-3 row-start-2 -ms-1 flex min-w-24 gap-1 opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100"
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
        <div className="aui-user-message-content peer bg-muted text-foreground rounded-xl px-4 py-2 wrap-break-word empty:hidden">
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
