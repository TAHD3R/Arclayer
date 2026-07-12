import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { PanelRightClose, PlusIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Thread } from "@/components/assistant-ui/thread";
import { AIApprovalQueue } from "@/components/ai/ai-approval-queue";
import { AIChatRuntimeProvider } from "@/components/ai/ai-chat-runtime";
import { AIContentProposalCard } from "@/components/ai/ai-content-proposal-card";
import { FeedbackDialog } from "@/components/feedback/feedback-dialog";
import { useCurrentUserProfile } from "@/hooks/use-current-user-profile";
import { getUserDisplayName } from "@/lib/auth/user-profile";
import { useAuthStore } from "@/stores/use-auth-store";
import {
  ensureAIConversationPersistedForRuntime,
  loadAIConversations,
  renameAIConversation,
} from "@/api/ai";
import { useAiChatStore } from "@/stores/use-ai-chat-store";
import { cn } from "@arclayer/lib/utils";
import { Button } from "@arclayer/ui/button";
import { Input } from "@arclayer/ui/input";
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
          className="!rounded-full text-label-secondary hover:text-label-primary"
        >
          {props.children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{props.label}</TooltipContent>
    </Tooltip>
  );
}

export function AIDrawerOverlay(props: { widthPx: number }) {
  const { t } = useTranslation(["ai", "common"]);
  const drawerOpen = useAiChatStore((s) => s.drawerOpen);
  const activeId = useAiChatStore((s) => s.activeId);
  const conversations = useAiChatStore((s) => s.conversations);
  const accessToken = useAuthStore((s) => s.accessToken);
  const { profile } = useCurrentUserProfile();
  const createConversation = useAiChatStore((s) => s.createConversation);
  const closeDrawer = useAiChatStore((s) => s.closeDrawer);
  const routeLocation = useRouterState({
    select: (state) => ({
      pathname: state.location.pathname,
      search: state.location.searchStr,
    }),
  });
  const activeConversation = conversations.find((conversation) => conversation.id === activeId);
  const conversationTitle = activeConversation?.title ?? t("ai:AI_CHAT_NEW_CONVERSATION");
  const welcomeName =
    profile?.displayName ??
    profile?.username ??
    profile?.email ??
    getUserDisplayName(accessToken, t("ai:AI_CHAT_HOME_USER_FALLBACK"));
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(conversationTitle);
  const titleInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (drawerOpen && !activeId && conversations.length === 0) {
      createConversation();
    }
  }, [activeId, conversations.length, createConversation, drawerOpen]);

  useEffect(() => {
    if (!drawerOpen) return;
    const controller = new AbortController();
    void loadAIConversations({ signal: controller.signal });
    return () => controller.abort();
  }, [drawerOpen]);

  useEffect(() => {
    if (!drawerOpen || !activeId || !activeConversation) return;
    if (activeConversation.messages.length === 0) return;

    const snapshot = activeConversation.contextSnapshot ?? {};
    const snapshotPathname = typeof snapshot.pathname === "string" ? snapshot.pathname : null;
    const snapshotSearch = typeof snapshot.search === "string" ? snapshot.search : "";
    if (snapshotPathname === routeLocation.pathname && snapshotSearch === routeLocation.search) {
      return;
    }

    void ensureAIConversationPersistedForRuntime(activeId);
  }, [activeConversation, activeId, drawerOpen, routeLocation.pathname, routeLocation.search]);

  useEffect(() => {
    if (!editingTitle) {
      setTitleDraft(conversationTitle);
    }
  }, [conversationTitle, editingTitle]);

  useEffect(() => {
    if (editingTitle) {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }
  }, [editingTitle]);

  useEffect(() => {
    if (!drawerOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || editingTitle) return;
      if (event.key === "Escape") {
        closeDrawer();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeDrawer, drawerOpen, editingTitle]);

  const commitTitle = () => {
    const nextTitle = titleDraft.trim();
    if (activeConversation && nextTitle && nextTitle !== activeConversation.title) {
      void renameAIConversation(activeConversation.id, nextTitle);
    }
    setTitleDraft(activeConversation?.title ?? conversationTitle);
    setEditingTitle(false);
  };

  const cancelTitleEdit = () => {
    setTitleDraft(activeConversation?.title ?? conversationTitle);
    setEditingTitle(false);
  };

  const handleCreateConversation = () => {
    if (activeConversation?.messages.length === 0) return;
    createConversation();
  };

  return (
    <aside
      className={cn(
        "my-4 mr-4 h-[calc(100vh-2rem)] shrink-0 overflow-hidden rounded-2xl transition-[width,opacity] duration-[250ms] ease-out",
        drawerOpen ? "opacity-100" : "w-0 opacity-0",
      )}
      style={drawerOpen ? { width: props.widthPx } : undefined}
      aria-hidden={!drawerOpen}
      aria-label={t("ai:AI_CHAT_ASK")}
    >
      {drawerOpen ? (
        <div className="flex h-full w-full flex-col">
          <div className="flex h-[61px] shrink-0 items-center gap-2">
            <DrawerIconButton label={t("ai:AI_CHAT_HIDE")} onClick={closeDrawer}>
              <PanelRightClose className="size-4" aria-hidden="true" />
            </DrawerIconButton>

            <div className="min-w-0 flex-1">
              {editingTitle ? (
                <Input
                  ref={titleInputRef}
                  value={titleDraft}
                  aria-label={t("ai:AI_CHAT_RENAME")}
                  onChange={(event) => setTitleDraft(event.target.value)}
                  onBlur={commitTitle}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      commitTitle();
                    }
                    if (event.key === "Escape") {
                      event.preventDefault();
                      cancelTitleEdit();
                    }
                  }}
                  className="h-8 rounded-md border-transparent bg-accent/50 px-2 text-headline font-semibold"
                />
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="block min-w-0 max-w-full cursor-text truncate rounded-md px-2 py-1 text-left text-headline font-semibold text-label-primary transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => setEditingTitle(true)}
                    >
                      {conversationTitle}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{t("ai:AI_CHAT_RENAME")}</TooltipContent>
                </Tooltip>
              )}
            </div>

            <FeedbackDialog
              source="ai_sidebar"
              conversationId={activeId}
              trigger={
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-callout font-semibold text-label-secondary hover:text-label-primary"
                >
                  {t("common:TOPBAR_FEEDBACK")}
                </Button>
              }
            />
            <DrawerIconButton
              label={t("ai:AI_CHAT_NEW_CONVERSATION")}
              onClick={handleCreateConversation}
            >
              <PlusIcon className="size-4" aria-hidden="true" />
            </DrawerIconButton>
          </div>
          <div className="min-h-0 flex-1">
            {activeId ? (
              <div className="flex h-full min-h-0 flex-col">
                <AIContentProposalCard enabled={drawerOpen} />
                <AIApprovalQueue enabled={drawerOpen} />
                <div className="min-h-0 flex-1">
                  <AIChatRuntimeProvider conversationId={activeId}>
                    <Thread variant="sidebar" welcomeName={welcomeName} />
                  </AIChatRuntimeProvider>
                </div>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-center text-callout text-label-secondary">
                {t("ai:AI_CHAT_EMPTY_HINT")}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </aside>
  );
}
