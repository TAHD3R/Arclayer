"use client";

import { ThreadListItemPrimitive, useAui, useAuiState } from "@assistant-ui/react";
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  CheckIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PinIcon,
  PinOffIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useState, type MouseEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@arclayer/ui/alert-dialog";
import { Button } from "@arclayer/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuIconItem,
  DropdownMenuTrigger,
} from "@arclayer/ui/dropdown-menu";
import { Input } from "@arclayer/ui/input";

interface AgentThreadListItemProps {
  readonly archived: boolean;
  readonly pinned: boolean;
  readonly timeText: string;
  readonly onThreadSelect?: () => void;
}

function ThreadActionButton(props: {
  readonly label: string;
  readonly children: ReactNode;
  readonly disabled?: boolean;
  readonly onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={props.label}
      title={props.label}
      disabled={props.disabled}
      onClick={props.onClick}
      className="text-label-secondary hover:text-label-primary"
    >
      {props.children}
    </Button>
  );
}

export function AgentThreadListItem({
  archived,
  pinned,
  timeText,
  onThreadSelect,
}: AgentThreadListItemProps) {
  const { t } = useTranslation(["ai", "common"]);
  const api = useAui();
  const item = useAuiState((state) => state.threadListItem);
  const [renaming, setRenaming] = useState(false);
  const [draftTitle, setDraftTitle] = useState(item.title || "");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [mutationPending, setMutationPending] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const runMutation = async (
    mutation: () => unknown | Promise<unknown>,
    errorKey = "ai:AI_CHAT_THREAD_UPDATE_FAILED",
  ) => {
    setMutationPending(true);
    setMutationError(null);
    try {
      await mutation();
      return true;
    } catch (error) {
      console.error("Failed to update Agent conversation", error);
      setMutationError(t(errorKey));
      return false;
    } finally {
      setMutationPending(false);
    }
  };

  const threadItem = () => api.threads().item({ id: item.id });
  const saveTitle = async () => {
    const title = draftTitle.trim();
    if (!title) {
      setMutationError(t("ai:AI_CHAT_THREAD_TITLE_REQUIRED"));
      return;
    }
    if (await runMutation(() => threadItem().rename(title), "ai:AI_CHAT_THREAD_RENAME_FAILED")) {
      setRenaming(false);
    }
  };
  const archiveThread = () =>
    void runMutation(() => (archived ? threadItem().unarchive() : threadItem().archive()));
  const togglePinned = () =>
    void runMutation(async () => {
      await threadItem().updateCustom({ ...item.custom, pinned: !pinned });
      await api.threads().reload();
    });
  const deleteThread = async () => {
    if (await runMutation(() => threadItem().delete())) setDeleteOpen(false);
  };
  const selectThread = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    await api.threadListItem().switchTo();
    onThreadSelect?.();
  };
  const title = item.title || t("ai:AI_CHAT_NEW_CONVERSATION");

  return (
    <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
      <ThreadListItemPrimitive.Root className="group/thread rounded-md data-[active]:bg-accent/70">
        <div className="flex min-h-11 items-center gap-1 px-1 py-0.5">
          {renaming ? (
            <form
              className="flex min-w-0 flex-1 items-center gap-1 px-1"
              onSubmit={(event) => {
                event.preventDefault();
                void saveTitle();
              }}
            >
              <Input
                value={draftTitle}
                autoFocus
                aria-label={t("ai:AI_CHAT_THREAD_RENAME_INPUT")}
                disabled={mutationPending}
                onChange={(event) => setDraftTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setRenaming(false);
                }}
                className="h-8 min-w-0"
              />
              <ThreadActionButton
                label={t("common:CONFIRM")}
                disabled={mutationPending}
                onClick={() => void saveTitle()}
              >
                <CheckIcon className="size-4" aria-hidden="true" />
              </ThreadActionButton>
              <ThreadActionButton
                label={t("common:CANCEL")}
                disabled={mutationPending}
                onClick={() => setRenaming(false)}
              >
                <XIcon className="size-4" aria-hidden="true" />
              </ThreadActionButton>
            </form>
          ) : (
            <div className="relative grid min-h-11 min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] grid-rows-[auto_auto] items-center gap-x-1 rounded-md px-1 py-0.5 transition-colors duration-100 hover:bg-accent/40 group-data-[active]/thread:bg-accent/70 motion-reduce:transition-none">
              <ThreadListItemPrimitive.Trigger
                aria-label={title}
                className="absolute inset-0 z-0 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={selectThread}
              />
              <span className="pointer-events-none relative z-10 col-start-1 row-start-1 flex min-w-0 items-center gap-1.5 px-1 text-caption font-medium text-label-primary">
                {pinned ? <PinIcon className="size-3.5 shrink-0" aria-hidden="true" /> : null}
                <span className="min-w-0 truncate">
                  <ThreadListItemPrimitive.Title fallback={t("ai:AI_CHAT_NEW_CONVERSATION")} />
                </span>
              </span>
              <span className="pointer-events-none relative z-10 col-start-1 row-start-2 mt-0.5 min-w-0 truncate px-1 text-caption text-label-tertiary">
                {timeText}
              </span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("ai:AI_CHAT_THREAD_MORE")}
                    className="relative z-20 col-start-2 row-start-1 shrink-0 text-label-secondary opacity-0 transition-opacity duration-100 group-hover/thread:opacity-100 group-focus-within/thread:opacity-100 group-data-[active]/thread:opacity-100 motion-reduce:transition-none hover:text-label-primary"
                  >
                    <MoreHorizontalIcon className="size-4" aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44 rounded-md p-1">
                  <DropdownMenuIconItem
                    icon={
                      pinned ? (
                        <PinOffIcon className="size-4" aria-hidden="true" />
                      ) : (
                        <PinIcon className="size-4" aria-hidden="true" />
                      )
                    }
                    disabled={mutationPending}
                    onSelect={togglePinned}
                  >
                    {t(pinned ? "ai:AI_CHAT_THREAD_UNPIN" : "ai:AI_CHAT_THREAD_PIN")}
                  </DropdownMenuIconItem>
                  <DropdownMenuIconItem
                    icon={<PencilIcon className="size-4" aria-hidden="true" />}
                    onSelect={() => {
                      setDraftTitle(item.title || "");
                      setRenaming(true);
                    }}
                  >
                    {t("ai:AI_CHAT_THREAD_RENAME")}
                  </DropdownMenuIconItem>
                  <DropdownMenuIconItem
                    icon={
                      archived ? (
                        <ArchiveRestoreIcon className="size-4" aria-hidden="true" />
                      ) : (
                        <ArchiveIcon className="size-4" aria-hidden="true" />
                      )
                    }
                    disabled={mutationPending}
                    onSelect={archiveThread}
                  >
                    {t(archived ? "ai:AI_CHAT_THREAD_UNARCHIVE" : "ai:AI_CHAT_THREAD_ARCHIVE")}
                  </DropdownMenuIconItem>
                  <DropdownMenuIconItem
                    icon={<Trash2Icon className="size-4" aria-hidden="true" />}
                    variant="destructive"
                    onSelect={() => setDeleteOpen(true)}
                  >
                    {t("ai:AI_CHAT_THREAD_DELETE")}
                  </DropdownMenuIconItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
        {mutationError ? (
          <p role="alert" className="px-3 pb-2 text-caption text-destructive">
            {mutationError}
          </p>
        ) : null}
      </ThreadListItemPrimitive.Root>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("ai:AI_CHAT_THREAD_DELETE_CONFIRM", { title })}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("ai:AI_CHAT_THREAD_DELETE_DESCRIPTION")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutationPending}>{t("common:CANCEL")}</AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button
              type="button"
              variant="destructive"
              disabled={mutationPending}
              onClick={(event) => {
                event.preventDefault();
                void deleteThread();
              }}
            >
              {t("common:DELETE")}
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
