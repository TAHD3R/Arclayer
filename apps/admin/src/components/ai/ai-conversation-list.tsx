import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  MessageCircle,
  MoreHorizontalIcon,
  PencilIcon,
  PinIcon,
  PlusIcon,
  Trash2,
} from "lucide-react";

import { deleteAIConversation, loadAIConversations, renameAIConversation } from "@/api/ai";
import { useAiChatStore } from "@/stores/use-ai-chat-store";
import { cn } from "@arclayer/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@arclayer/ui/alert-dialog";
import { Button } from "@arclayer/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@arclayer/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuIconItem,
  DropdownMenuTrigger,
} from "@arclayer/ui/dropdown-menu";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@arclayer/ui/empty";
import { Input } from "@arclayer/ui/input";
import { Item, ItemContent, ItemHeader, ItemTitle } from "@arclayer/ui/item";

function formatRelative(ts: number, formatter: Intl.RelativeTimeFormat): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return formatter.format(0, "minute");
  if (min < 60) return formatter.format(-min, "minute");
  const hr = Math.floor(min / 60);
  if (hr < 24) return formatter.format(-hr, "hour");
  const day = Math.floor(hr / 24);
  return formatter.format(-day, "day");
}

export function AIConversationList() {
  const { i18n, t } = useTranslation(["ai", "common"]);
  const relativeTimeFormatter = useMemo(
    () => new Intl.RelativeTimeFormat(i18n.language, { numeric: "auto" }),
    [i18n.language],
  );
  const conversations = useAiChatStore((s) => s.conversations);
  const pinnedConversationIds = useAiChatStore((s) => s.pinnedConversationIds);
  const activeId = useAiChatStore((s) => s.activeId);
  const drawerOpen = useAiChatStore((s) => s.drawerOpen);
  const createConversation = useAiChatStore((s) => s.createConversation);
  const selectConversation = useAiChatStore((s) => s.selectConversation);
  const toggleConversationPinned = useAiChatStore((s) => s.toggleConversationPinned);
  const openDrawer = useAiChatStore((s) => s.openDrawer);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renamePending, setRenamePending] = useState(false);
  const pinnedIdSet = useMemo(() => new Set(pinnedConversationIds), [pinnedConversationIds]);
  const visibleConversations = useMemo(
    () => conversations.filter((conversation) => conversation.messages.length > 0),
    [conversations],
  );
  const sortedConversations = useMemo(
    () =>
      [...visibleConversations].sort((a, b) => {
        const aPinned = pinnedIdSet.has(a.id);
        const bPinned = pinnedIdSet.has(b.id);
        if (aPinned !== bPinned) return aPinned ? -1 : 1;
        return b.updatedAt - a.updatedAt;
      }),
    [pinnedIdSet, visibleConversations],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadAIConversations({ signal: controller.signal });
    return () => controller.abort();
  }, []);

  const handleCreateConversation = () => {
    const activeConversation = conversations.find((conversation) => conversation.id === activeId);
    if (!activeConversation || activeConversation.messages.length > 0) {
      createConversation();
    }
    openDrawer();
  };

  const handleSelectConversation = (id: string) => {
    selectConversation(id);
    openDrawer();
  };
  const renamingConversation = conversations.find((conversation) => conversation.id === renamingId);

  const openRenameDialog = (conversation: (typeof conversations)[number]) => {
    setRenamingId(conversation.id);
    setRenameDraft(conversation.title);
    setRenameError(null);
  };

  const submitRename = async () => {
    if (!renamingConversation) return;
    const title = renameDraft.trim();
    if (!title) {
      setRenameError(t("ai:AI_CHAT_RENAME_REQUIRED"));
      return;
    }
    setRenamePending(true);
    setRenameError(null);
    try {
      await renameAIConversation(renamingConversation.id, title);
      setRenamingId(null);
    } catch (error) {
      setRenameError(error instanceof Error ? error.message : String(error));
    } finally {
      setRenamePending(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="min-h-0 w-full min-w-0 flex-1 overflow-auto scrollbar-none">
        {visibleConversations.length === 0 ? (
          <Empty className="min-h-full gap-0 px-4 py-6">
            <EmptyHeader className="max-w-[14rem] gap-0">
              <EmptyMedia variant="icon" className="mb-4 text-label-secondary">
                <MessageCircle className="size-5" aria-hidden="true" />
              </EmptyMedia>
              <h3>
                <EmptyTitle className="text-callout font-semibold text-label-primary">
                  {t("common:SIDEBAR_CHAT_EMPTY_TITLE")}
                </EmptyTitle>
              </h3>
              <EmptyDescription className="mt-2 text-footnote">
                {t("common:SIDEBAR_CHAT_EMPTY_DESC")}
              </EmptyDescription>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-4 h-9 gap-2 px-3 text-label-primary"
                onClick={handleCreateConversation}
              >
                <PlusIcon className="size-4" aria-hidden="true" />
                <span>{t("ai:AI_CHAT_NEW_CONVERSATION")}</span>
              </Button>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="w-full min-w-0 px-1 py-1">
            <ul className="flex flex-col gap-0.5">
              {sortedConversations.map((conversation) => (
                <li key={conversation.id}>
                  <AlertDialog>
                    <Item
                      size="sm"
                      variant={drawerOpen && conversation.id === activeId ? "muted" : "default"}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleSelectConversation(conversation.id)}
                      className={cn(
                        "w-full min-w-0 cursor-pointer rounded-md border-0 transition-[background-color,box-shadow,opacity] duration-150",
                        "hover:bg-accent/40 active:bg-accent/60",
                        drawerOpen && conversation.id === activeId && "bg-accent/60",
                      )}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          handleSelectConversation(conversation.id);
                        }
                      }}
                    >
                      <ItemContent className="min-w-0 gap-1">
                        <ItemHeader className="min-w-0 items-center gap-1">
                          <ItemTitle className="min-w-0 flex-1">
                            <span className="flex min-w-0 items-center gap-1.5 text-headline text-label-primary">
                              {pinnedIdSet.has(conversation.id) ? (
                                <PinIcon
                                  className="size-3.5 shrink-0 text-label-secondary"
                                  aria-hidden="true"
                                />
                              ) : null}
                              <span className="min-w-0 flex-1 truncate">{conversation.title}</span>
                            </span>
                          </ItemTitle>
                          <div className="ml-0.5 flex shrink-0 items-center gap-0.5">
                            <AlertDialogTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                aria-label={t("ai:AI_CHAT_DELETE_CONFIRM")}
                                className="size-7 shrink-0 !rounded-full text-label-secondary hover:text-destructive"
                                onClick={(event) => {
                                  event.stopPropagation();
                                }}
                                onKeyDown={(event) => event.stopPropagation()}
                              >
                                <Trash2 className="size-4" aria-hidden="true" />
                              </Button>
                            </AlertDialogTrigger>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label={t("ai:AI_CHAT_CONVERSATION_MORE")}
                                  className="size-7 shrink-0 !rounded-full text-label-secondary hover:text-label-primary"
                                  onClick={(event) => event.stopPropagation()}
                                  onKeyDown={(event) => event.stopPropagation()}
                                >
                                  <MoreHorizontalIcon className="size-4" aria-hidden="true" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-36 rounded-xl p-1.5">
                                <DropdownMenuIconItem
                                  icon={<PinIcon className="size-4" />}
                                  onClick={(event) => event.stopPropagation()}
                                  onSelect={() => toggleConversationPinned(conversation.id)}
                                >
                                  {pinnedIdSet.has(conversation.id)
                                    ? t("ai:AI_CHAT_UNPIN")
                                    : t("ai:AI_CHAT_PIN")}
                                </DropdownMenuIconItem>
                                <DropdownMenuIconItem
                                  icon={<PencilIcon className="size-4" />}
                                  onClick={(event) => event.stopPropagation()}
                                  onSelect={() => openRenameDialog(conversation)}
                                >
                                  {t("ai:AI_CHAT_RENAME")}
                                </DropdownMenuIconItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </ItemHeader>
                        <span className="min-w-0 truncate text-footnote text-label-secondary">
                          {formatRelative(conversation.updatedAt, relativeTimeFormatter)}
                        </span>
                      </ItemContent>
                    </Item>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t("ai:AI_CHAT_DELETE_DIALOG_TITLE")}</AlertDialogTitle>
                        <AlertDialogDescription>
                          {t("ai:AI_CHAT_DELETE_DIALOG_DESC", { title: conversation.title })}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t("common:CANCEL")}</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-white hover:bg-destructive/90"
                          onClick={() => {
                            void deleteAIConversation(conversation.id);
                          }}
                        >
                          {t("common:DELETE")}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      {visibleConversations.length > 0 ? (
        <div className="flex w-full min-w-0 shrink-0 items-center border-t border-border/60 px-2 py-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 w-full justify-start gap-2 !rounded-md px-3"
            onClick={handleCreateConversation}
          >
            <PlusIcon className="size-4" aria-hidden="true" />
            <span>{t("ai:AI_CHAT_NEW_CONVERSATION")}</span>
          </Button>
        </div>
      ) : null}
      <Dialog
        open={Boolean(renamingConversation)}
        onOpenChange={(open) => !open && setRenamingId(null)}
      >
        <DialogContent className="sm:max-w-110">
          <DialogHeader>
            <DialogTitle>{t("ai:AI_CHAT_RENAME")}</DialogTitle>
            <DialogDescription>{t("ai:AI_CHAT_RENAME_DESC")}</DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void submitRename();
            }}
          >
            <Input
              value={renameDraft}
              onChange={(event) => setRenameDraft(event.target.value)}
              aria-label={t("ai:AI_CHAT_RENAME")}
              autoFocus
            />
            {renameError ? (
              <p className="text-footnote font-medium text-destructive" role="alert">
                {renameError}
              </p>
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setRenamingId(null)}
                disabled={renamePending}
              >
                {t("common:CANCEL")}
              </Button>
              <Button type="submit" disabled={renamePending}>
                {t("common:CONFIRM")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
