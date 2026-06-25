import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { MessageCircle, PlusIcon, Trash2 } from "lucide-react";

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
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@arclayer/ui/empty";
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
  const activeId = useAiChatStore((s) => s.activeId);
  const drawerOpen = useAiChatStore((s) => s.drawerOpen);
  const createConversation = useAiChatStore((s) => s.createConversation);
  const selectConversation = useAiChatStore((s) => s.selectConversation);
  const deleteConversation = useAiChatStore((s) => s.deleteConversation);
  const openDrawer = useAiChatStore((s) => s.openDrawer);

  const handleCreateConversation = () => {
    createConversation();
    openDrawer();
  };

  const handleSelectConversation = (id: string) => {
    selectConversation(id);
    openDrawer();
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="min-h-0 w-full min-w-0 flex-1 overflow-auto scrollbar-none">
        {conversations.length === 0 ? (
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
                className="mt-4 h-9 !rounded-full gap-2 px-3 text-label-primary"
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
              {conversations.map((conversation) => (
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
                        <ItemHeader className="gap-3">
                          <ItemTitle className="min-w-0 flex-1">
                            <span className="min-w-0 truncate text-headline text-label-primary">
                              {conversation.title}
                            </span>
                          </ItemTitle>
                          <AlertDialogTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              aria-label={t("ai:AI_CHAT_DELETE_CONFIRM")}
                              className="shrink-0 !rounded-full text-label-secondary hover:text-destructive"
                              onClick={(event) => {
                                event.stopPropagation();
                              }}
                              onKeyDown={(event) => event.stopPropagation()}
                            >
                              <Trash2 className="size-4" aria-hidden="true" />
                            </Button>
                          </AlertDialogTrigger>
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
                          onClick={() => deleteConversation(conversation.id)}
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
      {conversations.length > 0 ? (
        <div className="flex w-full min-w-0 shrink-0 items-center border-t border-border/60 px-2 py-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 w-full justify-start gap-2 !rounded-full px-3"
            onClick={handleCreateConversation}
          >
            <PlusIcon className="size-4" aria-hidden="true" />
            <span>{t("ai:AI_CHAT_NEW_CONVERSATION")}</span>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
