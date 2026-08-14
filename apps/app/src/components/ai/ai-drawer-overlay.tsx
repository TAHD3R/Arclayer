import { useAui, useAuiState } from "@assistant-ui/react";
import {
  CheckIcon,
  MessageSquarePlus,
  PanelRightClose,
  PencilIcon,
  PlusIcon,
  XIcon,
} from "lucide-react";
import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";

import { AIApprovalQueue } from "@/components/ai/ai-approval-queue";
import {
  AI_EDITOR_CONTEXT_ATTACHMENT_TYPE,
  formatAiEditorContextName,
  formatAiEditorContextPrefix,
} from "@/components/ai/ai-editor-context";
import type { ArclayerAssistantState } from "@/components/ai/arclayer-assistant-scope";
import { Thread } from "@/components/assistant-ui/thread";
import { FeedbackComposer } from "@/components/feedback/feedback-dialog";
import { useCurrentUserProfile } from "@/hooks/use-current-user-profile";
import { getUserDisplayName } from "@/lib/auth/user-profile";
import { useAiChatStore } from "@/stores/use-ai-chat-store";
import { useAuthStore } from "@/stores/use-auth-store";
import { useAIEntryStore } from "@/stores/use-ai-entry-store";
import { cn } from "@arclayer/lib/utils";
import { Button } from "@arclayer/ui/button";
import { Input } from "@arclayer/ui/input";
import { Spinner } from "@arclayer/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@arclayer/ui/tooltip";

function DrawerIconButton(props: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={props.label}
          onClick={props.onClick}
          className="size-11 text-label-secondary hover:text-label-primary min-[769px]:size-8"
        >
          {props.children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{props.label}</TooltipContent>
    </Tooltip>
  );
}

function useAIEntryDispatcher() {
  const api = useAui();
  const pendingEntry = useAIEntryStore((state) => state.entries[0] ?? null);
  const consumeEntry = useAIEntryStore((state) => state.consume);
  const threadReadyRef = useRef(false);
  const dispatchingRef = useRef(false);
  const [dispatchError, setDispatchError] = useState<unknown>(null);

  const startNewThread = useCallback(async () => {
    await api.threads().switchToNewThread();
    threadReadyRef.current = true;
  }, [api]);

  useEffect(() => {
    if (pendingEntry === null || dispatchingRef.current) return;
    dispatchingRef.current = true;
    void (async () => {
      try {
        if (!threadReadyRef.current) await startNewThread();
        await api.thread().append({
          role: "user",
          content: [{ type: "text", text: pendingEntry.prompt }],
          runConfig: {
            custom: {
              mentionedAgentIds: pendingEntry.mentionedAgentIds,
              selectedSkillInstallationIds: pendingEntry.selectedSkillInstallationIds,
            },
          },
        });
        dispatchingRef.current = false;
        consumeEntry(pendingEntry.id);
      } catch (error) {
        dispatchingRef.current = false;
        setDispatchError(error);
      }
    })();
  }, [api, consumeEntry, pendingEntry, startNewThread]);

  if (dispatchError !== null) throw dispatchError;
  return startNewThread;
}

function useAIEditorContextAttachment() {
  const { t } = useTranslation(["ai", "account"]);
  const aui = useAui();
  const pendingEditorContext = useAiChatStore((state) => state.pendingEditorContext);
  const consumePendingEditorContext = useAiChatStore((state) => state.consumePendingEditorContext);
  const drawerOpen = useAiChatStore((state) => state.drawerOpen);

  useEffect(() => {
    if (!drawerOpen || !pendingEditorContext) return;
    const context = pendingEditorContext;
    consumePendingEditorContext();
    const stageLabel = t(
      `account:CREATION_EDITOR_STAGE_${
        context.stage === "styleGuide" ? "STYLE_GUIDE" : context.stage.toUpperCase()
      }`,
    );
    void aui
      .composer()
      .addAttachment({
        id: `${AI_EDITOR_CONTEXT_ATTACHMENT_TYPE}:${
          context.targetId ?? context.pageId ?? context.stage
        }`,
        type: AI_EDITOR_CONTEXT_ATTACHMENT_TYPE,
        name: formatAiEditorContextName(context, stageLabel),
        content: [{ type: "text", text: formatAiEditorContextPrefix(context) }],
      })
      .catch(() => undefined);
  }, [aui, consumePendingEditorContext, drawerOpen, pendingEditorContext, t]);
}

function AssistantDrawerThread(props: {
  readonly welcomeName: string;
  readonly leadAgent: Extract<ArclayerAssistantState, { status: "ready" }>["leadAgent"];
  readonly closeDrawer: () => void;
}) {
  const { t } = useTranslation(["ai", "common"]);
  const api = useAui();
  const title = useAuiState((state) => state.threadListItem.title);
  const threadId = useAuiState((state) => state.threadListItem.id);
  const remoteThreadId = useAuiState((state) => state.threadListItem.remoteId);
  const startNewThread = useAIEntryDispatcher();
  useAIEditorContextAttachment();
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState(title || t("ai:AI_CHAT_NEW_CONVERSATION"));
  const [titlePending, setTitlePending] = useState(false);
  const [titleError, setTitleError] = useState<string | null>(null);
  const displayTitle = title || t("ai:AI_CHAT_NEW_CONVERSATION");

  useEffect(() => {
    setEditingTitle(false);
    setDraftTitle(displayTitle);
    setTitleError(null);
  }, [displayTitle, threadId]);

  const beginTitleEdit = () => {
    setDraftTitle(displayTitle);
    setTitleError(null);
    setEditingTitle(true);
  };

  const cancelTitleEdit = () => {
    setTitleError(null);
    setEditingTitle(false);
  };

  const saveTitle = async () => {
    const nextTitle = draftTitle.trim();
    if (!nextTitle) {
      setTitleError(t("ai:AI_CHAT_THREAD_TITLE_REQUIRED"));
      return;
    }
    if (nextTitle === displayTitle) {
      cancelTitleEdit();
      return;
    }

    setTitlePending(true);
    setTitleError(null);
    try {
      await api.threads().item({ id: threadId }).rename(nextTitle);
      setEditingTitle(false);
    } catch (error) {
      console.error("Failed to rename the AI conversation", error);
      setTitleError(t("ai:AI_CHAT_THREAD_RENAME_FAILED"));
    } finally {
      setTitlePending(false);
    }
  };

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex h-[61px] shrink-0 items-center gap-2">
        <DrawerIconButton label={t("ai:AI_CHAT_HIDE")} onClick={props.closeDrawer}>
          <PanelRightClose className="size-4" aria-hidden="true" />
        </DrawerIconButton>
        {editingTitle ? (
          <form
            className="flex min-w-0 flex-1 flex-wrap items-center gap-1 px-2"
            onSubmit={(event) => {
              event.preventDefault();
              void saveTitle();
            }}
          >
            <Input
              value={draftTitle}
              autoFocus
              aria-label={t("ai:AI_CHAT_THREAD_RENAME_INPUT")}
              disabled={titlePending}
              onChange={(event) => setDraftTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") cancelTitleEdit();
              }}
              className="h-8 min-w-0 flex-1 text-footnote"
            />
            <Button
              type="submit"
              variant="ghost"
              size="icon-sm"
              aria-label={t("common:CONFIRM")}
              disabled={titlePending}
            >
              <CheckIcon className="size-4" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t("common:CANCEL")}
              disabled={titlePending}
              onClick={cancelTitleEdit}
            >
              <XIcon className="size-4" aria-hidden="true" />
            </Button>
            {titleError ? (
              <p role="alert" className="basis-full truncate px-1 text-xs text-destructive">
                {titleError}
              </p>
            ) : null}
          </form>
        ) : (
          <button
            type="button"
            aria-label={`${t("ai:AI_CHAT_ACTION_EDIT")}: ${displayTitle}`}
            title={t("ai:AI_CHAT_ACTION_EDIT")}
            onClick={beginTitleEdit}
            className="group/title flex min-w-0 flex-1 items-center gap-1 rounded-md px-2 text-left text-headline font-semibold text-label-primary outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="min-w-0 flex-1 truncate">{displayTitle}</span>
            <PencilIcon
              className="size-3.5 shrink-0 opacity-0 transition-opacity duration-100 group-hover/title:opacity-100 group-focus-visible/title:opacity-100 motion-reduce:transition-none"
              aria-hidden="true"
            />
          </button>
        )}
        <DrawerIconButton
          label={t("ai:AI_CHAT_FEEDBACK")}
          onClick={() => setFeedbackOpen((current) => !current)}
        >
          <MessageSquarePlus className="size-4" aria-hidden="true" />
        </DrawerIconButton>
        <DrawerIconButton
          label={t("ai:AI_CHAT_NEW_CONVERSATION")}
          onClick={() => void startNewThread()}
        >
          <PlusIcon className="size-4" aria-hidden="true" />
        </DrawerIconButton>
      </div>
      <div className="min-h-0 flex-1">
        <Thread
          variant="sidebar"
          welcomeName={props.welcomeName}
          welcomeAgent={props.leadAgent}
          composerAccessory={
            <div className="relative">
              <div className="px-3">
                <AIApprovalQueue enabled />
              </div>
              <div
                className={cn("absolute inset-x-0 bottom-0 z-30", feedbackOpen ? "" : "hidden")}
                aria-hidden={!feedbackOpen}
              >
                <FeedbackComposer
                  source="ai_sidebar"
                  initialIntent="problem"
                  hiddenContext={remoteThreadId ? { threadId: remoteThreadId } : undefined}
                  variant="card"
                  active={feedbackOpen}
                  autoFocus={false}
                  onCancel={() => setFeedbackOpen(false)}
                  onSuccess={() => setFeedbackOpen(false)}
                />
              </div>
            </div>
          }
        />
      </div>
    </div>
  );
}

function AssistantDrawerStatus(props: {
  state: Exclude<ArclayerAssistantState, { status: "ready" }>;
  closeDrawer: () => void;
}) {
  const { t } = useTranslation(["ai", "common"]);

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex h-[61px] shrink-0 items-center gap-2">
        <DrawerIconButton label={t("ai:AI_CHAT_HIDE")} onClick={props.closeDrawer}>
          <PanelRightClose className="size-4" aria-hidden="true" />
        </DrawerIconButton>
        <div className="min-w-0 flex-1 truncate px-2 text-headline font-semibold text-label-primary">
          {t("ai:AI_CHAT_NEW_CONVERSATION")}
        </div>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-center">
        {props.state.status === "loading" ? (
          <div className="flex items-center gap-2 text-footnote text-label-secondary" role="status">
            <Spinner className="size-4" aria-hidden="true" />
            <span>{t("common:LOADING")}</span>
          </div>
        ) : (
          <div className="flex max-w-sm flex-col items-center gap-4">
            <p className="text-footnote leading-relaxed text-label-secondary">
              {t("ai:AI_CHAT_ERROR_GENERIC")}
            </p>
            {props.state.retry ? (
              <Button type="button" variant="outline" onClick={props.state.retry}>
                {t("common:RETRY")}
              </Button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

export function AIDrawerOverlay(props: {
  widthPx: number;
  assistantState: ArclayerAssistantState;
}) {
  const { t } = useTranslation(["ai"]);
  const drawerOpen = useAiChatStore((state) => state.drawerOpen);
  const closeDrawer = useAiChatStore((state) => state.closeDrawer);
  const accessToken = useAuthStore((state) => state.accessToken);
  const { profile } = useCurrentUserProfile();
  const welcomeName =
    profile?.displayName ??
    profile?.username ??
    profile?.email ??
    getUserDisplayName(accessToken, t("ai:AI_CHAT_HOME_USER_FALLBACK"));
  return (
    <aside
      className={cn(
        "fixed inset-0 z-50 h-svh shrink-0 overflow-hidden bg-background transition-[width,opacity,margin-right] duration-[250ms] ease-out motion-reduce:transition-none min-[769px]:static min-[769px]:inset-auto min-[769px]:my-4 min-[769px]:h-[calc(100vh-2rem)] min-[769px]:rounded-2xl min-[769px]:bg-transparent",
        drawerOpen
          ? "mr-0 w-full opacity-100 min-[769px]:mr-4 min-[769px]:w-[var(--ai-drawer-width)]"
          : "pointer-events-none mr-0 w-0 opacity-0",
      )}
      style={
        drawerOpen ? ({ "--ai-drawer-width": `${props.widthPx}px` } as CSSProperties) : undefined
      }
      aria-hidden={!drawerOpen}
      aria-label={t("ai:AI_CHAT_ASK")}
    >
      {drawerOpen ? (
        props.assistantState.status === "ready" ? (
          <AssistantDrawerThread
            welcomeName={welcomeName}
            leadAgent={props.assistantState.leadAgent}
            closeDrawer={closeDrawer}
          />
        ) : (
          <AssistantDrawerStatus state={props.assistantState} closeDrawer={closeDrawer} />
        )
      ) : null}
    </aside>
  );
}
