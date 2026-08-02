import { useAui, useAuiState } from "@assistant-ui/react";
import { MessageSquarePlus, PanelRightClose, PlusIcon } from "lucide-react";
import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";

import { AgentThreadHistory } from "@/components/ai/agent-thread-history";
import { AIApprovalQueue } from "@/components/ai/ai-approval-queue";
import { Thread } from "@/components/assistant-ui/thread";
import { FeedbackComposer } from "@/components/feedback/feedback-dialog";
import { useCurrentUserProfile } from "@/hooks/use-current-user-profile";
import { getUserDisplayName } from "@/lib/auth/user-profile";
import { useAiChatStore } from "@/stores/use-ai-chat-store";
import { useAuthStore } from "@/stores/use-auth-store";
import { useAIEntryStore } from "@/stores/use-ai-entry-store";
import { cn } from "@arclayer/lib/utils";
import { Button } from "@arclayer/ui/button";
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

function AssistantDrawerThread(props: {
  readonly welcomeName: string;
  readonly closeDrawer: () => void;
}) {
  const { t } = useTranslation(["ai"]);
  const title = useAuiState((state) => state.threadListItem.title);
  const remoteThreadId = useAuiState((state) => state.threadListItem.remoteId);
  const startNewThread = useAIEntryDispatcher();
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex h-[61px] shrink-0 items-center gap-2">
        <DrawerIconButton label={t("ai:AI_CHAT_HIDE")} onClick={props.closeDrawer}>
          <PanelRightClose className="size-4" aria-hidden="true" />
        </DrawerIconButton>
        <div className="min-w-0 flex-1 truncate px-2 text-headline font-semibold text-label-primary">
          {title || t("ai:AI_CHAT_NEW_CONVERSATION")}
        </div>
        <DrawerIconButton
          label={t("ai:AI_CHAT_FEEDBACK")}
          onClick={() => setFeedbackOpen((current) => !current)}
        >
          <MessageSquarePlus className="size-4" aria-hidden="true" />
        </DrawerIconButton>
        <AgentThreadHistory />
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
          composerAccessory={
            <div className="px-3">
              <AIApprovalQueue enabled />
              <div className={feedbackOpen ? "" : "hidden"} aria-hidden={!feedbackOpen}>
                <FeedbackComposer
                  source="ai_sidebar"
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

export function AIDrawerOverlay(props: { widthPx: number; assistantAvailable: boolean }) {
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
      {drawerOpen && props.assistantAvailable ? (
        <AssistantDrawerThread welcomeName={welcomeName} closeDrawer={closeDrawer} />
      ) : drawerOpen ? (
        <div className="flex h-full items-center justify-center px-6 text-center text-callout text-label-secondary">
          {t("ai:AI_CHAT_PROJECT_SELECT")}
        </div>
      ) : null}
    </aside>
  );
}
