import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  WebSpeechDictationAdapter,
  createMessageQueue,
  useAui,
  useExternalStoreRuntime,
  type AppendMessage,
  type MessageQueueController,
  type ThreadMessageLike,
} from "@assistant-ui/react";
import { useNavigate, useSearch } from "@tanstack/react-router";

import * as authApi from "@/api/auth";
import { listProjects } from "@/api/projects";
import { AIComposerTriggers } from "@/components/ai/ai-composer-triggers";
import { AIComposerDirectiveChips } from "@/components/ai/ai-composer-directive-chips";
import { AIComposerToolbar } from "@/components/ai/ai-composer-toolbar";
import { AISuggestions } from "@/components/ai/ai-suggestions";
import { ComposerAttachments } from "@/components/assistant-ui/attachment";
import { ComposerQueue } from "@/components/assistant-ui/composer-queue";
import { AdminRouteContainer } from "@/components/layout/admin-route-container";
import {
  applyWebSearchDirective,
  appendMessageToText,
  createAIChatAttachmentAdapter,
  projectIdFromComposerDirective,
} from "@/components/ai/ai-composer-entry";
import {
  agentIdsForComposerScope,
  buildTextWithAIComposerDirectives,
  cleanAIComposerDirectiveText,
  clearAIComposerDirectives,
} from "@/components/ai/ai-composer-directives";
import { formatAIChatError } from "@/api/ai";
import { getUserDisplayName, normalizeUserProfile } from "@/lib/auth/user-profile";
import { HomeInspirationSection } from "@/pages/home/home-inspiration-section";
import { HomeRecentProjectsSection } from "@/pages/home/home-recent-projects-section";
import { useAiChatStore } from "@/stores/use-ai-chat-store";
import { useAuthStore } from "@/stores/use-auth-store";
import { useAIEntryStore } from "@/stores/use-ai-entry-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import { cn } from "@arclayer/lib/utils";

function createDictationAdapter() {
  if (typeof window === "undefined") return undefined;
  if (!WebSpeechDictationAdapter.isSupported()) return undefined;
  return new WebSpeechDictationAdapter({
    language: navigator.language,
    continuous: true,
    interimResults: true,
  });
}

type HomeComposerProps = {
  inputRef: RefObject<HTMLTextAreaElement | null>;
  initialPrompt?: string;
  onInitialPromptApplied?: () => void;
  onSubmitStart: () => void;
  onSubmitError: (message: string) => void;
};

function HomeComposerInitialPrompt(props: {
  inputRef: RefObject<HTMLTextAreaElement | null>;
  prompt?: string;
  onApplied?: () => void;
}) {
  const { inputRef, onApplied, prompt: rawPrompt } = props;
  const aui = useAui();
  const appliedPromptRef = useRef<string | null>(null);

  useEffect(() => {
    const prompt = rawPrompt?.trim();
    if (!prompt) {
      appliedPromptRef.current = null;
      return;
    }
    if (appliedPromptRef.current === prompt) return;

    appliedPromptRef.current = prompt;
    aui.composer().setText(prompt);
    inputRef.current?.focus();
    onApplied?.();
  }, [aui, inputRef, onApplied, rawPrompt]);

  return null;
}

function HomeComposer({
  inputRef,
  initialPrompt,
  onInitialPromptApplied,
  onSubmitStart,
  onSubmitError,
}: HomeComposerProps) {
  const { t } = useTranslation(["ai", "common"]);
  const openDrawer = useAiChatStore((s) => s.openDrawer);
  const queuedMessageRunnerRef = useRef<(message: AppendMessage) => Promise<void>>(async () => {
    throw new Error("Home AI message queue runner is not initialized");
  });
  const [, forceQueueRender] = useState(0);
  const dictationAdapter = useMemo(() => createDictationAdapter(), []);
  const attachmentAdapter = useMemo(() => createAIChatAttachmentAdapter("home"), []);

  const queueController = useMemo<MessageQueueController>(() => {
    const controller = createMessageQueue({
      run: (message) => {
        void queuedMessageRunnerRef.current(message).finally(() => {
          controller.notifyIdle();
        });
      },
    });
    return controller;
  }, []);

  useEffect(() => {
    const unsubscribe = queueController.subscribe(() => {
      forceQueueRender((version) => version + 1);
    });
    return () => {
      unsubscribe();
      queueController.adapter.clear("cancel-run");
    };
  }, [queueController]);

  const sendHomePrompt = useCallback(
    async (text: string) => {
      const textWithDirectives = buildTextWithAIComposerDirectives(
        "home",
        applyWebSearchDirective(text.trim()),
      );
      const trimmed = cleanAIComposerDirectiveText(textWithDirectives);
      if (!trimmed) return;

      onSubmitStart();
      try {
        const directiveProjectId = projectIdFromComposerDirective(textWithDirectives);
        const workspaceState = useWorkspaceStore.getState();
        if (directiveProjectId) workspaceState.setCurrentProjectId(directiveProjectId);
        useAIEntryStore.getState().submit(trimmed, agentIdsForComposerScope("home"));
        openDrawer();
      } catch (err) {
        onSubmitError(formatAIChatError(err));
      } finally {
        clearAIComposerDirectives("home");
      }
    },
    [onSubmitError, onSubmitStart, openDrawer],
  );

  const sendHomeMessage = useCallback(
    async (message: AppendMessage) => {
      await sendHomePrompt(appendMessageToText(message));
    },
    [sendHomePrompt],
  );
  useEffect(() => {
    queuedMessageRunnerRef.current = sendHomeMessage;
  }, [sendHomeMessage]);

  const runHomePromptOutsideQueue = useCallback(
    async (text: string) => {
      if (!text.trim()) return;

      queueController.notifyBusy();
      try {
        await sendHomePrompt(text);
      } finally {
        queueController.notifyIdle();
      }
    },
    [queueController, sendHomePrompt],
  );

  const runtime = useExternalStoreRuntime({
    messages: useMemo<ThreadMessageLike[]>(() => [], []),
    isRunning: false,
    adapters: {
      dictation: dictationAdapter,
      attachments: attachmentAdapter,
    },
    queue: queueController.adapter,
    convertMessage: (message: ThreadMessageLike) => message,
    setMessages: () => {
      // Home is an entry composer only; persisted messages live in the side panel store.
    },
    onCancel: async () => {
      queueController.adapter.clear("cancel-run");
    },
    onNew: async (message) => {
      await runHomePromptOutsideQueue(appendMessageToText(message));
    },
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <HomeComposerInitialPrompt
        inputRef={inputRef}
        prompt={initialPrompt}
        onApplied={onInitialPromptApplied}
      />
      <ComposerPrimitive.Unstable_TriggerPopoverRoot>
        <ComposerPrimitive.Root className="aui-home-composer-root relative flex w-full min-w-0 flex-col">
          <ComposerQueue />
          <div className="relative flex min-h-[8.75rem] w-full min-w-0 flex-col gap-3 rounded-[1.75rem] border border-border/70 bg-[color-mix(in_oklab,var(--color-muted)_30%,var(--color-background))] p-3 transition-colors hover:border-border focus-within:border-border">
            <AIComposerDirectiveChips scope="home" />
            <ComposerAttachments />
            <ComposerPrimitive.Input
              ref={inputRef}
              rows={1}
              autoFocus
              placeholder={t("ai:AI_CHAT_INPUT_PLACEHOLDER")}
              aria-label={t("ai:AI_CHAT_INPUT_PLACEHOLDER")}
              className="h-20 min-h-20 max-h-20 w-full min-w-0 resize-none bg-transparent px-3 py-2 text-callout leading-relaxed text-label-primary outline-none [field-sizing:fixed] placeholder:text-label-secondary"
            />
            <AIComposerTriggers placement="bottom" scope="home" />
            <AIComposerToolbar />
          </div>
          <AISuggestions className="mt-3 flex w-full flex-wrap items-center justify-center gap-2 px-2" />
        </ComposerPrimitive.Root>
      </ComposerPrimitive.Unstable_TriggerPopoverRoot>
    </AssistantRuntimeProvider>
  );
}

/**
 * `/` 是 AI 入口 surface，不创建第二套 Conversation authority。
 * Prompt 进入 scene 级 normalized Agent Thread runtime，并在右侧 Drawer 中承载执行过程。
 */
export function HomePage() {
  const { t } = useTranslation(["ai", "common"]);
  const { prompt: initialPrompt } = useSearch({ from: "/" });
  const navigate = useNavigate();
  const accessToken = useAuthStore((s) => s.accessToken);
  const sessionVersion = useAuthStore((s) => s.sessionVersion);
  const currentWorkspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const lastWorkspaceId = useWorkspaceStore((s) => s.lastWorkspaceId);
  const [localError, setLocalError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const workspaceId = currentWorkspaceId ?? lastWorkspaceId;
  const { data: me } = useQuery({
    queryKey: ["auth", "me", sessionVersion],
    enabled: Boolean(accessToken),
    queryFn: async () => authApi.me(),
    meta: { silent: true },
  });
  const profile = useMemo(() => normalizeUserProfile(me), [me]);
  const displayName = useMemo(
    () =>
      profile.displayName ??
      profile.username ??
      profile.email ??
      getUserDisplayName(accessToken, t("ai:AI_CHAT_HOME_USER_FALLBACK")),
    [accessToken, profile.displayName, profile.email, profile.username, t],
  );
  const { data: recentProjectsData } = useQuery({
    queryKey: ["home", "recent-projects", workspaceId, sessionVersion],
    enabled: Boolean(accessToken && workspaceId),
    queryFn: async () =>
      listProjects({
        workspaceId: String(workspaceId),
        archived: false,
        ordering: "-updated_at",
        page: 1,
        size: 3,
      }),
    staleTime: 30 * 1000,
    retry: false,
    meta: { silent: true },
  });
  const recentProjects = recentProjectsData?.items ?? [];
  const hasRecentProjects = recentProjects.length > 0;
  const clearInitialPrompt = useCallback(() => {
    void navigate({ to: "/" as never, search: {} as never, replace: true });
  }, [navigate]);

  return (
    <AdminRouteContainer pageFrame="full" className="min-h-full" innerClassName="min-h-full px-0">
      <div
        data-page="ai-home"
        className={cn(
          "mx-auto flex w-full max-w-[88rem] flex-col px-6 pt-8 sm:px-8 lg:px-10",
          hasRecentProjects
            ? "justify-start gap-12 pt-16 xl:gap-14 xl:pt-20"
            : "min-h-full justify-center gap-8 py-8",
        )}
      >
        <div
          className={cn(
            "flex w-full flex-col items-center gap-7",
            hasRecentProjects &&
              "min-h-[clamp(20rem,42vh,28rem)] shrink-0 justify-center pb-3 xl:min-h-[clamp(22rem,44vh,30rem)]",
          )}
        >
          <div className="flex flex-col items-center text-center">
            <h1 className="max-w-3xl text-title font-semibold leading-tight text-label-primary">
              {t("ai:AI_CHAT_HOME_GREETING", { name: displayName })}
            </h1>
          </div>

          <div className="mx-auto w-full max-w-[44rem]">
            <HomeComposer
              inputRef={textareaRef}
              initialPrompt={initialPrompt}
              onInitialPromptApplied={clearInitialPrompt}
              onSubmitStart={() => setLocalError(null)}
              onSubmitError={setLocalError}
            />
            {localError ? (
              <p className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-footnote text-destructive">
                {localError}
              </p>
            ) : null}
          </div>
        </div>
        {hasRecentProjects ? (
          <>
            <HomeRecentProjectsSection workspaceId={workspaceId} projects={recentProjects} />
            <HomeInspirationSection />
          </>
        ) : null}
      </div>
    </AdminRouteContainer>
  );
}
