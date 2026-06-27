"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ComposerPrimitive,
  unstable_defaultDirectiveFormatter,
  unstable_useMentionAdapter,
  unstable_useSlashCommandAdapter,
  useAui,
  type Unstable_Mention,
  type Unstable_SlashCommand,
} from "@assistant-ui/react";
import { FolderIcon, FolderPlusIcon, Layers3Icon, ListIcon } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { listProjects } from "@/api/projects";
import { useAuthStore } from "@/stores/use-auth-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import { cn } from "@arclayer/lib/utils";

function composerTriggerItemClassName(index: number) {
  return cn(
    "flex w-full min-w-0 items-start gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors",
    "hover:bg-muted data-[highlighted]:bg-muted",
    index > 0 && "mt-0.5",
  );
}

export function AIComposerTriggers() {
  const { t } = useTranslation(["ai"]);
  const aui = useAui();
  const accessToken = useAuthStore((s) => s.accessToken);
  const sessionVersion = useAuthStore((s) => s.sessionVersion);
  const currentWorkspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const lastWorkspaceId = useWorkspaceStore((s) => s.lastWorkspaceId);
  const workspaceId = currentWorkspaceId ?? lastWorkspaceId;

  const projectsQuery = useQuery({
    queryKey: ["ai", "composer", "project-mentions", workspaceId, sessionVersion],
    enabled: Boolean(accessToken && workspaceId),
    queryFn: async () =>
      listProjects({
        workspaceId: String(workspaceId),
        archived: false,
        ordering: "-updated_at",
        page: 1,
        size: 8,
      }),
    staleTime: 30_000,
    retry: false,
    meta: { silent: true },
  });

  const projectMentions = useMemo<Unstable_Mention[]>(
    () =>
      (projectsQuery.data?.items ?? []).map((project) => ({
        id: project.id,
        type: "project",
        label: project.name,
        description: project.description ?? project.slug,
        icon: "project",
      })),
    [projectsQuery.data?.items],
  );

  const mention = unstable_useMentionAdapter({
    items: projectMentions,
    includeModelContextTools: false,
    formatter: unstable_defaultDirectiveFormatter,
  });

  const slashCommands = useMemo<Unstable_SlashCommand[]>(
    () => [
      {
        id: "create-project",
        label: t("ai:AI_CHAT_COMMAND_CREATE_PROJECT"),
        description: t("ai:AI_CHAT_COMMAND_CREATE_PROJECT_DESC"),
        icon: "create-project",
        execute: () => aui.composer().setText(t("ai:AI_CHAT_COMMAND_CREATE_PROJECT_PROMPT")),
      },
      {
        id: "create-content-model",
        label: t("ai:AI_CHAT_COMMAND_CREATE_CONTENT_MODEL"),
        description: t("ai:AI_CHAT_COMMAND_CREATE_CONTENT_MODEL_DESC"),
        icon: "content-model",
        execute: () => aui.composer().setText(t("ai:AI_CHAT_COMMAND_CREATE_CONTENT_MODEL_PROMPT")),
      },
      {
        id: "list-projects",
        label: t("ai:AI_CHAT_COMMAND_LIST_PROJECTS"),
        description: t("ai:AI_CHAT_COMMAND_LIST_PROJECTS_DESC"),
        icon: "list-projects",
        execute: () => aui.composer().setText(t("ai:AI_CHAT_COMMAND_LIST_PROJECTS_PROMPT")),
      },
    ],
    [aui, t],
  );

  const slash = unstable_useSlashCommandAdapter({
    commands: slashCommands,
    removeOnExecute: true,
  });

  return (
    <>
      <ComposerPrimitive.Unstable_TriggerPopover
        char="@"
        adapter={mention.adapter}
        isLoading={projectsQuery.isFetching}
        aria-label={t("ai:AI_CHAT_PROJECT_MENTION_LABEL")}
        className="absolute inset-x-3 bottom-full z-20 mb-2 max-h-64 overflow-y-auto rounded-xl border border-border/70 bg-popover p-1.5 text-popover-foreground shadow-lg"
      >
        <ComposerPrimitive.Unstable_TriggerPopover.Directive {...mention.directive} />
        <ComposerPrimitive.Unstable_TriggerPopoverItems>
          {(items) =>
            items.map((item, index) => (
              <ComposerPrimitive.Unstable_TriggerPopoverItem
                key={item.id}
                item={item}
                index={index}
                className={composerTriggerItemClassName(index)}
              >
                <FolderIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{item.label}</span>
                  {item.description ? (
                    <span className="mt-0.5 block truncate text-caption text-muted-foreground">
                      {item.description}
                    </span>
                  ) : null}
                </span>
              </ComposerPrimitive.Unstable_TriggerPopoverItem>
            ))
          }
        </ComposerPrimitive.Unstable_TriggerPopoverItems>
      </ComposerPrimitive.Unstable_TriggerPopover>

      <ComposerPrimitive.Unstable_TriggerPopover
        char="/"
        adapter={slash.adapter}
        aria-label={t("ai:AI_CHAT_COMMAND_MENU_LABEL")}
        className="absolute inset-x-3 bottom-full z-20 mb-2 max-h-64 overflow-y-auto rounded-xl border border-border/70 bg-popover p-1.5 text-popover-foreground shadow-lg"
      >
        <ComposerPrimitive.Unstable_TriggerPopover.Action {...slash.action} />
        <ComposerPrimitive.Unstable_TriggerPopoverItems>
          {(items) =>
            items.map((item, index) => {
              const Icon =
                item.id === "create-project"
                  ? FolderPlusIcon
                  : item.id === "create-content-model"
                    ? Layers3Icon
                    : ListIcon;
              return (
                <ComposerPrimitive.Unstable_TriggerPopoverItem
                  key={item.id}
                  item={item}
                  index={index}
                  className={composerTriggerItemClassName(index)}
                >
                  <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{item.label}</span>
                    {item.description ? (
                      <span className="mt-0.5 block truncate text-caption text-muted-foreground">
                        {item.description}
                      </span>
                    ) : null}
                  </span>
                </ComposerPrimitive.Unstable_TriggerPopoverItem>
              );
            })
          }
        </ComposerPrimitive.Unstable_TriggerPopoverItems>
      </ComposerPrimitive.Unstable_TriggerPopover>
    </>
  );
}
