import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  CheckSquare2Icon,
  ChevronDownIcon,
  ChevronRightIcon,
  MessageCircle,
  FolderIcon,
  ListIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PinIcon,
  PlusIcon,
  Trash2,
  XIcon,
} from "lucide-react";

import {
  deleteAIConversation,
  loadAIConversations,
  renameAIConversation,
  setAIConversationArchived,
} from "@/api/ai";
import { notifyError } from "@/lib/notifications";
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
import { Checkbox } from "@arclayer/ui/checkbox";
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
  DropdownMenuGroup,
  DropdownMenuIconItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
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

type ConversationOrganization = "recent" | "project" | "archived";

function readConversationProjectId(contextSnapshot?: Record<string, unknown>): string | null {
  const projectId = contextSnapshot?.projectId;
  return typeof projectId === "string" && projectId.trim() ? projectId : null;
}

function readConversationProjectName(contextSnapshot?: Record<string, unknown>): string | null {
  const projectName = contextSnapshot?.projectName;
  return typeof projectName === "string" && projectName.trim() ? projectName : null;
}

function isConversationArchived(conversation: {
  archivedAt: number | null;
  projectArchivedAt?: number | null;
}) {
  return Boolean(conversation.archivedAt || conversation.projectArchivedAt);
}

async function setConversationArchiveState(conversationId: string, archived: boolean) {
  try {
    await setAIConversationArchived(conversationId, archived);
  } catch (error) {
    notifyError(error);
  }
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
  const [organization, setOrganization] = useState<ConversationOrganization>("recent");
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [collapsedSectionKeys, setCollapsedSectionKeys] = useState<Set<string>>(() => new Set());
  const [batchPending, setBatchPending] = useState(false);
  const pinnedIdSet = useMemo(() => new Set(pinnedConversationIds), [pinnedConversationIds]);
  const conversationsWithMessages = useMemo(
    () => conversations.filter((conversation) => conversation.messages.length > 0),
    [conversations],
  );
  const visibleConversations = useMemo(
    () =>
      conversationsWithMessages.filter((conversation) =>
        organization === "archived"
          ? isConversationArchived(conversation)
          : !isConversationArchived(conversation),
      ),
    [conversationsWithMessages, organization],
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
  const batchArchiveTargetCount = useMemo(
    () =>
      conversations.filter(
        (conversation) =>
          selectedIds.has(conversation.id) &&
          (organization !== "archived" || !conversation.projectArchivedAt),
      ).length,
    [conversations, organization, selectedIds],
  );
  const conversationSections = useMemo(() => {
    if (organization !== "project") {
      return [{ key: "recent", title: null, conversations: sortedConversations }];
    }

    const groups = new Map<string, { title: string; conversations: typeof sortedConversations }>();
    for (const conversation of sortedConversations) {
      const projectId = readConversationProjectId(conversation.contextSnapshot) ?? "other";
      const title =
        projectId === "other"
          ? t("ai:AI_CHAT_ORGANIZE_OTHER")
          : (readConversationProjectName(conversation.contextSnapshot) ??
            t("ai:AI_CHAT_ORGANIZE_PROJECT_FALLBACK"));
      const group = groups.get(projectId) ?? { title, conversations: [] };
      groups.set(projectId, { ...group, conversations: [...group.conversations, conversation] });
    }

    return [...groups.entries()]
      .map(([projectId, group]) => ({
        key: projectId,
        title: group.title,
        conversations: group.conversations,
      }))
      .sort((left, right) => left.title.localeCompare(right.title, i18n.language));
  }, [i18n.language, organization, sortedConversations, t]);

  useEffect(() => {
    const controller = new AbortController();
    void loadAIConversations({ signal: controller.signal });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (organization !== "archived") return;
    const controller = new AbortController();
    void loadAIConversations({ archived: true, signal: controller.signal });
    return () => controller.abort();
  }, [organization]);

  const handleCreateConversation = () => {
    if (organization === "archived") {
      setOrganization("recent");
    }
    const activeConversation = conversations.find((conversation) => conversation.id === activeId);
    if (!activeConversation || activeConversation.messages.length > 0) {
      createConversation();
    }
    openDrawer();
  };

  const handleSelectConversation = (id: string) => {
    if (selectionMode) {
      setSelectedIds((current) => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      return;
    }
    selectConversation(id);
    openDrawer();
  };

  const handleOrganizationChange = (next: ConversationOrganization) => {
    setOrganization(next);
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const handleToggleSelectionMode = () => {
    setSelectionMode((current) => !current);
    setSelectedIds(new Set());
  };

  const handleToggleSection = (key: string) => {
    setCollapsedSectionKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleBatchArchive = async () => {
    const targetIds = conversations
      .filter((conversation) => selectedIds.has(conversation.id))
      .filter((conversation) => organization !== "archived" || !conversation.projectArchivedAt)
      .map((conversation) => conversation.id);
    if (targetIds.length === 0) return;
    setBatchPending(true);
    try {
      const archived = organization !== "archived";
      await Promise.all(
        targetIds.map((conversationId) => setAIConversationArchived(conversationId, archived)),
      );
      setSelectedIds(new Set());
      setSelectionMode(false);
    } catch (error) {
      notifyError(error);
    } finally {
      setBatchPending(false);
    }
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    setBatchPending(true);
    try {
      await Promise.all([...selectedIds].map(deleteAIConversation));
      setSelectedIds(new Set());
      setSelectionMode(false);
    } catch (error) {
      notifyError(error);
    } finally {
      setBatchPending(false);
    }
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
      {conversationsWithMessages.length > 0 ? (
        <div className="flex shrink-0 items-center justify-between px-2 pb-1 pt-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 px-2 text-footnote font-semibold"
            onClick={handleToggleSelectionMode}
          >
            {selectionMode ? (
              <XIcon className="size-4" aria-hidden="true" />
            ) : (
              <CheckSquare2Icon className="size-4" aria-hidden="true" />
            )}
            {selectionMode ? t("common:CANCEL") : t("ai:AI_CHAT_SELECT")}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 px-2 text-footnote font-semibold"
              >
                {organization === "recent" ? (
                  <ListIcon className="size-4" aria-hidden="true" />
                ) : organization === "project" ? (
                  <FolderIcon className="size-4" aria-hidden="true" />
                ) : (
                  <ArchiveIcon className="size-4" aria-hidden="true" />
                )}
                {organization === "recent"
                  ? t("ai:AI_CHAT_ORGANIZE_RECENT")
                  : organization === "project"
                    ? t("ai:AI_CHAT_ORGANIZE_PROJECT")
                    : t("ai:AI_CHAT_ORGANIZE_ARCHIVED")}
                <ChevronDownIcon className="size-4 opacity-70" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44 rounded-md p-1">
              <DropdownMenuGroup>
                <DropdownMenuRadioGroup
                  value={organization}
                  onValueChange={(value) =>
                    handleOrganizationChange(value as ConversationOrganization)
                  }
                >
                  <DropdownMenuRadioItem value="recent">
                    <ListIcon className="size-4" aria-hidden="true" />
                    {t("ai:AI_CHAT_ORGANIZE_RECENT")}
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="project">
                    <FolderIcon className="size-4" aria-hidden="true" />
                    {t("ai:AI_CHAT_ORGANIZE_PROJECT")}
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="archived">
                    <ArchiveIcon className="size-4" aria-hidden="true" />
                    {t("ai:AI_CHAT_ORGANIZE_ARCHIVED")}
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : null}
      <div className="min-h-0 w-full min-w-0 flex-1 overflow-auto scrollbar-none">
        {visibleConversations.length === 0 ? (
          <Empty className="min-h-full gap-0 px-4 py-6">
            <EmptyHeader className="max-w-[14rem] gap-0">
              <EmptyMedia variant="icon" className="mb-4 text-label-secondary">
                <MessageCircle className="size-5" aria-hidden="true" />
              </EmptyMedia>
              <h3>
                <EmptyTitle className="text-callout font-semibold text-label-primary">
                  {organization === "archived"
                    ? t("ai:AI_CHAT_ARCHIVED_EMPTY_TITLE")
                    : t("common:SIDEBAR_CHAT_EMPTY_TITLE")}
                </EmptyTitle>
              </h3>
              <EmptyDescription className="mt-2 text-footnote">
                {organization === "archived"
                  ? t("ai:AI_CHAT_ARCHIVED_EMPTY_DESC")
                  : t("common:SIDEBAR_CHAT_EMPTY_DESC")}
              </EmptyDescription>
              {organization !== "archived" ? (
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
              ) : null}
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="w-full min-w-0 px-1 py-1">
            {conversationSections.map((section) => (
              <section key={section.key} className="mb-2 last:mb-0">
                {section.title ? (
                  <h3>
                    <button
                      type="button"
                      className="group/section flex w-full items-center gap-1 px-2 pb-1 pt-2 text-left text-caption font-semibold text-label-secondary hover:text-label-primary"
                      aria-expanded={!collapsedSectionKeys.has(section.key)}
                      onClick={() => handleToggleSection(section.key)}
                    >
                      <span className="min-w-0 flex-1 truncate">{section.title}</span>
                      <ChevronRightIcon
                        className={cn(
                          "size-3.5 shrink-0 opacity-0 transition-[transform,opacity] duration-150 group-hover/section:opacity-100 group-focus-visible/section:opacity-100",
                          !collapsedSectionKeys.has(section.key) && "rotate-90",
                        )}
                        aria-hidden="true"
                      />
                    </button>
                  </h3>
                ) : null}
                {!collapsedSectionKeys.has(section.key) ? (
                  <ul className="flex flex-col gap-0.5">
                    {section.conversations.map((conversation) => (
                      <li key={conversation.id}>
                        <AlertDialog>
                          <Item
                            size="sm"
                            variant={
                              drawerOpen && conversation.id === activeId ? "muted" : "default"
                            }
                            role="button"
                            tabIndex={0}
                            onClick={() => handleSelectConversation(conversation.id)}
                            className={cn(
                              "relative w-full min-w-0 cursor-pointer rounded-md border-0 transition-[background-color,box-shadow,opacity] duration-150",
                              "hover:bg-accent/40 active:bg-accent/60",
                              drawerOpen && conversation.id === activeId && "bg-accent/60",
                              pinnedIdSet.has(conversation.id) &&
                                "bg-accent/25 before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-primary",
                            )}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                handleSelectConversation(conversation.id);
                              }
                            }}
                          >
                            {selectionMode ? (
                              <Checkbox
                                checked={selectedIds.has(conversation.id)}
                                aria-label={t("ai:AI_CHAT_SELECT_CONVERSATION", {
                                  title: conversation.title,
                                })}
                                onClick={(event) => event.stopPropagation()}
                                onCheckedChange={() => handleSelectConversation(conversation.id)}
                              />
                            ) : null}
                            <ItemContent className="min-w-0 gap-1">
                              <ItemHeader className="min-w-0 items-center gap-1">
                                <ItemTitle className="min-w-0 flex-1">
                                  <span className="flex min-w-0 items-center gap-1.5 text-headline text-label-primary">
                                    {pinnedIdSet.has(conversation.id) ? (
                                      <PinIcon
                                        className="size-3.5 shrink-0 text-primary"
                                        aria-hidden="true"
                                      />
                                    ) : null}
                                    <span className="min-w-0 flex-1 truncate">
                                      {conversation.title}
                                    </span>
                                  </span>
                                </ItemTitle>
                                {!selectionMode ? (
                                  <div className="ml-0.5 flex shrink-0 items-center gap-0.5">
                                    <AlertDialogTrigger asChild>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon-sm"
                                        aria-label={t("ai:AI_CHAT_DELETE_CONFIRM")}
                                        className="size-7 shrink-0 !rounded-sm text-label-secondary hover:text-destructive"
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
                                          className="size-7 shrink-0 !rounded-sm text-label-secondary hover:text-label-primary"
                                          onClick={(event) => event.stopPropagation()}
                                          onKeyDown={(event) => event.stopPropagation()}
                                        >
                                          <MoreHorizontalIcon
                                            className="size-4"
                                            aria-hidden="true"
                                          />
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent
                                        align="end"
                                        className="w-36 rounded-md p-1"
                                      >
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
                                        <DropdownMenuIconItem
                                          icon={
                                            conversation.archivedAt &&
                                            !conversation.projectArchivedAt ? (
                                              <ArchiveRestoreIcon className="size-4" />
                                            ) : (
                                              <ArchiveIcon className="size-4" />
                                            )
                                          }
                                          onClick={(event) => event.stopPropagation()}
                                          disabled={Boolean(conversation.projectArchivedAt)}
                                          onSelect={() => {
                                            if (conversation.projectArchivedAt) return;
                                            void setConversationArchiveState(
                                              conversation.id,
                                              !conversation.archivedAt,
                                            );
                                          }}
                                        >
                                          {conversation.projectArchivedAt
                                            ? t("ai:AI_CHAT_PROJECT_ARCHIVED")
                                            : conversation.archivedAt
                                              ? t("ai:AI_CHAT_UNARCHIVE")
                                              : t("ai:AI_CHAT_ARCHIVE")}
                                        </DropdownMenuIconItem>
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  </div>
                                ) : null}
                              </ItemHeader>
                              <span className="min-w-0 truncate text-footnote text-label-secondary">
                                {formatRelative(conversation.updatedAt, relativeTimeFormatter)}
                              </span>
                            </ItemContent>
                          </Item>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                {t("ai:AI_CHAT_DELETE_DIALOG_TITLE")}
                              </AlertDialogTitle>
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
                ) : null}
              </section>
            ))}
          </div>
        )}
      </div>
      {visibleConversations.length > 0 ? (
        <div className="flex w-full min-w-0 shrink-0 items-center border-t border-border/60 px-2 py-2">
          {selectionMode ? (
            <div className="flex w-full items-center">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-9 flex-1 justify-center gap-2 !rounded-md px-2"
                    disabled={batchArchiveTargetCount === 0 || batchPending}
                  >
                    {organization === "archived" ? (
                      <ArchiveRestoreIcon className="size-4" aria-hidden="true" />
                    ) : (
                      <ArchiveIcon className="size-4" aria-hidden="true" />
                    )}
                    <span>
                      {organization === "archived"
                        ? t("ai:AI_CHAT_UNARCHIVE")
                        : t("ai:AI_CHAT_ARCHIVE")}
                    </span>
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      {organization === "archived"
                        ? t("ai:AI_CHAT_BATCH_UNARCHIVE_TITLE")
                        : t("ai:AI_CHAT_BATCH_ARCHIVE_TITLE")}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      {organization === "archived"
                        ? t("ai:AI_CHAT_BATCH_UNARCHIVE_DESC", {
                            count: batchArchiveTargetCount,
                          })
                        : t("ai:AI_CHAT_BATCH_ARCHIVE_DESC", { count: selectedIds.size })}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t("common:CANCEL")}</AlertDialogCancel>
                    <AlertDialogAction onClick={() => void handleBatchArchive()}>
                      {organization === "archived"
                        ? t("ai:AI_CHAT_UNARCHIVE")
                        : t("ai:AI_CHAT_ARCHIVE")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <div className="h-5 w-px shrink-0 bg-border/70" aria-hidden="true" />
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-9 flex-1 justify-center gap-2 !rounded-md px-2 text-label-secondary hover:text-destructive"
                    disabled={selectedIds.size === 0 || batchPending}
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                    <span>{t("common:DELETE")}</span>
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t("ai:AI_CHAT_BATCH_DELETE_TITLE")}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {t("ai:AI_CHAT_BATCH_DELETE_DESC", { count: selectedIds.size })}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t("common:CANCEL")}</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-white hover:bg-destructive/90"
                      onClick={() => void handleBatchDelete()}
                    >
                      {t("common:DELETE")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ) : (
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
          )}
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
