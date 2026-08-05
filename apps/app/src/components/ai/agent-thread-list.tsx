"use client";

import {
  ThreadListItemPrimitive,
  ThreadListPrimitive,
  useAui,
  useAuiState,
} from "@assistant-ui/react";
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  CheckIcon,
  MoreHorizontalIcon,
  PencilIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "@arclayer/lib/utils";
import { Button } from "@arclayer/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuIconItem,
  DropdownMenuTrigger,
} from "@arclayer/ui/dropdown-menu";
import { Input } from "@arclayer/ui/input";
import { Separator } from "@arclayer/ui/separator";
import { Spinner } from "@arclayer/ui/spinner";

interface AgentThreadListProps {
  readonly className?: string;
  readonly onThreadSelect?: () => void;
}

interface AgentThreadListItemProps {
  readonly archived: boolean;
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

function AgentThreadListItem({ archived, onThreadSelect }: AgentThreadListItemProps) {
  const { t } = useTranslation(["ai", "common"]);
  const api = useAui();
  const item = useAuiState((state) => state.threadListItem);
  const [renaming, setRenaming] = useState(false);
  const [draftTitle, setDraftTitle] = useState(item.title || "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [mutationPending, setMutationPending] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const runMutation = async (mutation: () => unknown | Promise<unknown>) => {
    setMutationPending(true);
    setMutationError(null);
    try {
      await mutation();
      return true;
    } catch (error) {
      console.error("Failed to update Agent conversation", error);
      setMutationError(t("ai:AI_CHAT_THREAD_UPDATE_FAILED"));
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
    if (await runMutation(() => threadItem().rename(title))) setRenaming(false);
  };

  const archiveThread = () =>
    void runMutation(() => (archived ? threadItem().unarchive() : threadItem().archive()));

  const deleteThread = async () => {
    if (await runMutation(() => threadItem().delete())) setConfirmDelete(false);
  };

  return (
    <ThreadListItemPrimitive.Root className="group/thread rounded-lg data-[active]:bg-accent">
      <div className="flex min-h-11 items-center gap-1 px-1.5 py-1">
        {renaming ? (
          <form
            className="flex min-w-0 flex-1 items-center gap-1"
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
        ) : confirmDelete ? (
          <div className="flex min-w-0 flex-1 items-center gap-2 px-1">
            <p className="min-w-0 flex-1 truncate text-footnote text-label-primary">
              {t("ai:AI_CHAT_THREAD_DELETE_CONFIRM", {
                title: item.title || t("ai:AI_CHAT_NEW_CONVERSATION"),
              })}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={mutationPending}
              onClick={() => setConfirmDelete(false)}
            >
              {t("common:CANCEL")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={mutationPending}
              onClick={() => void deleteThread()}
            >
              {t("common:DELETE")}
            </Button>
          </div>
        ) : (
          <>
            <ThreadListItemPrimitive.Trigger
              className="min-w-0 flex-1 rounded-md px-2 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={onThreadSelect}
            >
              <span className="block truncate text-footnote font-medium text-label-primary">
                <ThreadListItemPrimitive.Title fallback={t("ai:AI_CHAT_NEW_CONVERSATION")} />
              </span>
            </ThreadListItemPrimitive.Trigger>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("ai:AI_CHAT_THREAD_MORE")}
                  className="shrink-0 text-label-secondary opacity-0 transition-opacity duration-100 group-hover/thread:opacity-100 group-focus-within/thread:opacity-100 group-data-[active]/thread:opacity-100 motion-reduce:transition-none hover:text-label-primary"
                >
                  <MoreHorizontalIcon className="size-4" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44 rounded-md p-1">
                <DropdownMenuIconItem
                  icon={<PencilIcon className="size-4" aria-hidden="true" />}
                  onSelect={() => {
                    setDraftTitle(item.title || "");
                    setRenaming(true);
                    setConfirmDelete(false);
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
                  onSelect={() => {
                    setConfirmDelete(true);
                    setRenaming(false);
                  }}
                >
                  {t("ai:AI_CHAT_THREAD_DELETE")}
                </DropdownMenuIconItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </div>
      {mutationError ? (
        <p role="alert" className="px-3 pb-2 text-caption text-destructive">
          {mutationError}
        </p>
      ) : null}
    </ThreadListItemPrimitive.Root>
  );
}

function ThreadCollection(props: {
  readonly archived: boolean;
  readonly count: number;
  readonly onThreadSelect?: () => void;
}) {
  const { t } = useTranslation(["ai"]);
  const label = t(props.archived ? "ai:AI_CHAT_THREAD_ARCHIVED" : "ai:AI_CHAT_THREAD_ACTIVE");

  return (
    <section aria-label={label}>
      <div className="flex items-center justify-between px-3 py-2">
        <h3 className="text-caption font-semibold text-label-secondary">{label}</h3>
        <span className="text-caption tabular-nums text-label-tertiary">{props.count}</span>
      </div>
      {props.count === 0 ? (
        <p className="px-3 py-3 text-footnote text-label-secondary">
          {t(
            props.archived ? "ai:AI_CHAT_THREAD_ARCHIVED_EMPTY" : "ai:AI_CHAT_THREAD_ACTIVE_EMPTY",
          )}
        </p>
      ) : (
        <ThreadListPrimitive.Items archived={props.archived}>
          {() => (
            <AgentThreadListItem archived={props.archived} onThreadSelect={props.onThreadSelect} />
          )}
        </ThreadListPrimitive.Items>
      )}
    </section>
  );
}

export function AgentThreadList({ className, onThreadSelect }: AgentThreadListProps) {
  const { t } = useTranslation(["ai"]);
  const isLoading = useAuiState((state) => state.threads.isLoading);
  const activeCount = useAuiState((state) => state.threads.threadIds.length);
  const archivedCount = useAuiState((state) => state.threads.archivedThreadIds.length);

  if (isLoading) {
    return (
      <div
        role="status"
        className={cn(
          "flex min-h-28 items-center justify-center gap-2 px-4 text-footnote text-label-secondary",
          className,
        )}
      >
        <Spinner className="size-4" aria-hidden="true" />
        <span>{t("ai:AI_CHAT_THREAD_LOADING")}</span>
      </div>
    );
  }

  return (
    <div className={cn("min-h-0 overflow-y-auto p-1.5", className)}>
      <ThreadCollection archived={false} count={activeCount} onThreadSelect={onThreadSelect} />
      <Separator className="my-1.5" />
      <ThreadCollection archived count={archivedCount} onThreadSelect={onThreadSelect} />
    </div>
  );
}
