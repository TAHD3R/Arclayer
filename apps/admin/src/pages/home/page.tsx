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

import { listProjects } from "@/api/projects";
import { AIComposerDirectiveChips } from "@/components/ai/ai-composer-directive-chips";
import { AIComposerRotatingPlaceholder } from "@/components/ai/ai-composer-rotating-placeholder";
import { AIComposerToolbar } from "@/components/ai/ai-composer-toolbar";
import { AIComposerTriggerInput } from "@/components/ai/ai-composer-trigger-input";
import { AIComposerTriggers } from "@/components/ai/ai-composer-triggers";
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
  skillInstallationIdsForComposerScope,
} from "@/components/ai/ai-composer-directives";
import { formatAIChatError } from "@/api/ai";
import { HomeAIBackground } from "@/pages/home/home-ai-background";
import { HomeAIPromptStarters } from "@/pages/home/home-ai-prompt-starters";
import { HomeBrandHero } from "@/pages/home/home-brand-hero";
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
        useAIEntryStore
          .getState()
          .submit(
            trimmed,
            agentIdsForComposerScope("home"),
            skillInstallationIdsForComposerScope("home"),
          );
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
          <div
            data-ai-composer-shell
            className="relative flex min-h-[13rem] w-full min-w-0 flex-col gap-3 rounded-[1.75rem] border border-border/60 bg-[color-mix(in_oklab,var(--color-muted)_30%,var(--color-background))] p-3 shadow-none ring-inset transition-[border-color,box-shadow] duration-150 hover:border-border focus-within:z-40 focus-within:border-border focus-within:ring-1 focus-within:ring-border data-[trigger-open=true]:z-40 motion-reduce:transition-none"
          >
            <AIComposerDirectiveChips scope="home" />
            <ComposerAttachments />
            <div className="relative min-h-32 flex-1">
              <AIComposerTriggerInput
                ref={inputRef}
                rows={1}
                autoFocus
                placeholder={t("ai:AI_CHAT_INPUT_PLACEHOLDER")}
                aria-label={t("ai:AI_CHAT_INPUT_PLACEHOLDER")}
                className="h-32 min-h-32 max-h-32 w-full min-w-0 resize-none bg-transparent px-3 py-2 text-callout leading-relaxed text-label-primary outline-none [field-sizing:fixed] placeholder:text-transparent"
              />
              <AIComposerRotatingPlaceholder />
            </div>
            <AIComposerTriggers placement="bottom" scope="home" />
            <AIComposerToolbar surface="home" />
          </div>
          <HomeAIPromptStarters inputRef={inputRef} />
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
  const { prompt: initialPrompt } = useSearch({ from: "/" });
  const navigate = useNavigate();
  const accessToken = useAuthStore((s) => s.accessToken);
  const sessionVersion = useAuthStore((s) => s.sessionVersion);
  const workspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const [localError, setLocalError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
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
    <AdminRouteContainer
      pageFrame="full"
      className="min-h-full isolate"
      innerClassName="relative z-10 min-h-full px-0"
      overlay={<HomeAIBackground />}
    >
      <div
        data-page="ai-home"
        className={cn(
          "mx-auto flex min-h-full w-full max-w-[88rem] flex-col gap-10 px-6 pb-8 sm:px-8 lg:px-10 xl:gap-12",
          hasRecentProjects ? "pt-10 xl:pt-12" : "pt-8",
        )}
      >
        <div
          data-slot="home-ai-entry"
          className={cn(
            "flex w-full shrink-0 flex-col items-center justify-center gap-8",
            hasRecentProjects
              ? "min-h-[clamp(28rem,52svh,36rem)]"
              : "min-h-[clamp(28rem,calc(100svh_-_18rem),72rem)]",
          )}
        >
          <HomeBrandHero />

          <div className="mx-auto w-full max-w-[64rem]">
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
          <HomeRecentProjectsSection workspaceId={workspaceId} projects={recentProjects} />
        ) : null}
        <HomeInspirationSection />
      </div>
    </AdminRouteContainer>
  );
}
