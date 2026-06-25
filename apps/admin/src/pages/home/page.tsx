import { useQuery } from "@tanstack/react-query";
import { useMemo, useRef, useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  CompositeAttachmentAdapter,
  SimpleTextAttachmentAdapter,
  WebSpeechDictationAdapter,
  useExternalStoreRuntime,
  type ThreadMessageLike,
} from "@assistant-ui/react";

import * as authApi from "@/api/auth";
import { listProjects } from "@/api/projects";
import { ComposerAttachments } from "@/components/assistant-ui/attachment";
import { AIComposerToolbar } from "@/components/ai/ai-composer-toolbar";
import { appendMessageToText, sendAIChatMessage } from "@/components/ai/ai-chat-runtime";
import { formatAIChatError } from "@/api/ai";
import { getUserDisplayName, normalizeUserProfile } from "@/lib/auth/user-profile";
import { HomeRecentProjectsSection } from "@/pages/home/home-recent-projects-section";
import { useAiChatStore } from "@/stores/use-ai-chat-store";
import { useAuthStore } from "@/stores/use-auth-store";
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
  onSubmitStart: () => void;
  onSubmitError: (message: string) => void;
};

function HomeComposer({ inputRef, onSubmitStart, onSubmitError }: HomeComposerProps) {
  const { t } = useTranslation(["ai", "common"]);
  const createConversation = useAiChatStore((s) => s.createConversation);
  const openDrawer = useAiChatStore((s) => s.openDrawer);
  const streaming = useAiChatStore((s) => s.streaming);
  const dictationAdapter = useMemo(() => createDictationAdapter(), []);
  const attachmentAdapter = useMemo(
    () => new CompositeAttachmentAdapter([new SimpleTextAttachmentAdapter()]),
    [],
  );

  const runtime = useExternalStoreRuntime({
    messages: useMemo<ThreadMessageLike[]>(() => [], []),
    isRunning: streaming,
    adapters: {
      attachments: attachmentAdapter,
      dictation: dictationAdapter,
    },
    convertMessage: (message: ThreadMessageLike) => message,
    setMessages: () => {
      // Home is an entry composer only; persisted messages live in the side panel store.
    },
    onNew: async (message) => {
      const text = appendMessageToText(message).trim();
      if (!text) return;

      const conversationId = createConversation();
      onSubmitStart();
      openDrawer();

      try {
        await sendAIChatMessage(conversationId, text);
      } catch (err) {
        onSubmitError(formatAIChatError(err));
      }
    },
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ComposerPrimitive.Root className="aui-home-composer-root relative flex w-full min-w-0 flex-col">
        <ComposerPrimitive.AttachmentDropzone asChild>
          <div className="flex min-h-[8.75rem] w-full min-w-0 flex-col gap-3 rounded-[1.75rem] border border-border/70 bg-[color-mix(in_oklab,var(--color-muted)_30%,var(--color-background))] p-3 transition-colors hover:border-border focus-within:border-border">
            <ComposerAttachments />
            <ComposerPrimitive.Input
              ref={inputRef}
              rows={1}
              autoFocus
              placeholder={t("ai:AI_CHAT_INPUT_PLACEHOLDER")}
              aria-label={t("ai:AI_CHAT_INPUT_PLACEHOLDER")}
              className="h-20 min-h-20 max-h-20 w-full min-w-0 resize-none bg-transparent px-3 py-2 text-callout leading-relaxed text-label-primary outline-none [field-sizing:fixed] placeholder:text-label-secondary"
            />
            <AIComposerToolbar />
          </div>
        </ComposerPrimitive.AttachmentDropzone>
      </ComposerPrimitive.Root>
    </AssistantRuntimeProvider>
  );
}

/**
 * `/` 是 AI 入口 surface，不绑定全局 active conversation。
 * 发送首条消息时才新建会话，并在右侧 AI 面板中承载后续对话。
 */
export function HomePage() {
  const { t } = useTranslation(["ai", "common"]);
  const accessToken = useAuthStore((s) => s.accessToken);
  const sessionVersion = useAuthStore((s) => s.sessionVersion);
  const currentWorkspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const lastWorkspaceId = useWorkspaceStore((s) => s.lastWorkspaceId);
  const [localError, setLocalError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const workspaceId = currentWorkspaceId ?? lastWorkspaceId;
  const meQuery = useQuery({
    queryKey: ["auth", "me", sessionVersion],
    enabled: Boolean(accessToken),
    queryFn: async () => authApi.me(),
    meta: { silent: true },
  });
  const profile = useMemo(() => normalizeUserProfile(meQuery.data), [meQuery.data]);
  const displayName = useMemo(
    () =>
      profile.displayName ??
      profile.username ??
      profile.email ??
      getUserDisplayName(accessToken, t("ai:AI_CHAT_HOME_USER_FALLBACK")),
    [accessToken, profile.displayName, profile.email, profile.username, t],
  );
  const recentProjectsQuery = useQuery({
    queryKey: ["home", "recent-projects", workspaceId, sessionVersion],
    enabled: Boolean(accessToken && workspaceId),
    queryFn: async () =>
      listProjects({
        workspaceId: String(workspaceId),
        archived: false,
        page: 1,
        size: 3,
      }),
    staleTime: 30 * 1000,
    retry: false,
    meta: { silent: true },
  });
  const recentProjects = recentProjectsQuery.data?.items ?? [];
  const hasRecentProjects = recentProjects.length > 0;

  return (
    <div className="flex h-full min-h-0 w-full flex-col" data-page="ai-home">
      <div
        className={cn(
          "mx-auto flex h-full w-full max-w-6xl flex-col px-6 py-8",
          hasRecentProjects
            ? "justify-between gap-12 pt-10 pb-8 xl:gap-16"
            : "justify-center gap-8",
        )}
      >
        <div
          className={cn(
            "flex w-full flex-col items-center gap-8",
            hasRecentProjects && "min-h-[24rem] flex-1 justify-center pb-12",
          )}
        >
          <div className="flex flex-col items-center text-center">
            <h1 className="max-w-3xl text-title font-semibold leading-tight text-label-primary">
              {t("ai:AI_CHAT_HOME_GREETING", { name: displayName })}
            </h1>
          </div>

          <div className="mx-auto w-full max-w-3xl">
            <HomeComposer
              inputRef={textareaRef}
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
      </div>
    </div>
  );
}
