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
import {
  ClipboardCheckIcon,
  BotIcon,
  FileSearchIcon,
  FolderIcon,
  FolderPlusIcon,
  Layers3Icon,
  RouteIcon,
} from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { listAIProjectAgents } from "@/api/ai";
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

type AIComposerTriggersProps = {
  placement?: "top" | "bottom";
};

function composerTriggerPopoverClassName(
  placement: NonNullable<AIComposerTriggersProps["placement"]>,
) {
  return cn(
    "absolute inset-x-3 z-[2500] max-h-64 overflow-y-auto rounded-xl border border-border/70 bg-popover p-1.5 text-popover-foreground shadow-lg",
    placement === "bottom" ? "top-full mt-2" : "bottom-full mb-2",
  );
}

function actionDirective(id: string, label: string, prompt: string) {
  return `:action[${label}]{name=${id}} ${prompt}`;
}

export function AIComposerTriggers({ placement = "top" }: AIComposerTriggersProps) {
  const { t } = useTranslation(["ai"]);
  const aui = useAui();
  const accessToken = useAuthStore((s) => s.accessToken);
  const sessionVersion = useAuthStore((s) => s.sessionVersion);
  const currentWorkspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const lastWorkspaceId = useWorkspaceStore((s) => s.lastWorkspaceId);
  const currentProjectId = useWorkspaceStore((s) => s.currentProjectId);
  const workspaceId = currentWorkspaceId ?? lastWorkspaceId;

  const { data: projectsData, isFetching: isFetchingProjects } = useQuery({
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
      (projectsData?.items ?? []).map((project) => ({
        id: project.id,
        type: "project",
        label: project.name,
        description: project.description ?? project.slug,
        icon: "project",
      })),
    [projectsData?.items],
  );
  const { data: agentsData, isFetching: isFetchingAgents } = useQuery({
    queryKey: ["ai", "composer", "agent-mentions", currentProjectId],
    enabled: Boolean(accessToken && currentProjectId),
    queryFn: ({ signal }) =>
      listAIProjectAgents({
        projectId: String(currentProjectId),
        signal,
      }),
    staleTime: 30_000,
    retry: false,
    meta: { silent: true },
  });

  const agentMentions = useMemo<Unstable_Mention[]>(
    () =>
      (agentsData?.agents ?? []).map((agent) => ({
        id: agent.agentId,
        type: "agent",
        label: agent.name,
        description: agent.description,
        icon: "agent",
      })),
    [agentsData?.agents],
  );
  const mentions = useMemo<Unstable_Mention[]>(
    () => [...projectMentions, ...agentMentions],
    [agentMentions, projectMentions],
  );

  const mention = unstable_useMentionAdapter({
    items: mentions,
    includeModelContextTools: false,
    formatter: unstable_defaultDirectiveFormatter,
  });

  const slashCommands = useMemo<Unstable_SlashCommand[]>(
    () => [
      {
        id: "launch-project",
        label: t("ai:AI_CHAT_COMMAND_LAUNCH_PROJECT"),
        description: t("ai:AI_CHAT_COMMAND_LAUNCH_PROJECT_DESC"),
        icon: "launch-project",
        execute: () =>
          aui
            .composer()
            .setText(
              actionDirective(
                "launch-project",
                t("ai:AI_CHAT_COMMAND_LAUNCH_PROJECT"),
                t("ai:AI_CHAT_COMMAND_LAUNCH_PROJECT_PROMPT"),
              ),
            ),
      },
      {
        id: "content-model-plan",
        label: t("ai:AI_CHAT_COMMAND_CONTENT_MODEL_PLAN"),
        description: t("ai:AI_CHAT_COMMAND_CONTENT_MODEL_PLAN_DESC"),
        icon: "content-model-plan",
        execute: () =>
          aui
            .composer()
            .setText(
              actionDirective(
                "content-model-plan",
                t("ai:AI_CHAT_COMMAND_CONTENT_MODEL_PLAN"),
                t("ai:AI_CHAT_COMMAND_CONTENT_MODEL_PLAN_PROMPT"),
              ),
            ),
      },
      {
        id: "content-ops-blueprint",
        label: t("ai:AI_CHAT_COMMAND_CONTENT_OPS_BLUEPRINT"),
        description: t("ai:AI_CHAT_COMMAND_CONTENT_OPS_BLUEPRINT_DESC"),
        icon: "content-ops-blueprint",
        execute: () =>
          aui
            .composer()
            .setText(
              actionDirective(
                "content-ops-blueprint",
                t("ai:AI_CHAT_COMMAND_CONTENT_OPS_BLUEPRINT"),
                t("ai:AI_CHAT_COMMAND_CONTENT_OPS_BLUEPRINT_PROMPT"),
              ),
            ),
      },
      {
        id: "launch-readiness-audit",
        label: t("ai:AI_CHAT_COMMAND_LAUNCH_READINESS_AUDIT"),
        description: t("ai:AI_CHAT_COMMAND_LAUNCH_READINESS_AUDIT_DESC"),
        icon: "launch-readiness-audit",
        execute: () =>
          aui
            .composer()
            .setText(
              actionDirective(
                "launch-readiness-audit",
                t("ai:AI_CHAT_COMMAND_LAUNCH_READINESS_AUDIT"),
                t("ai:AI_CHAT_COMMAND_LAUNCH_READINESS_AUDIT_PROMPT"),
              ),
            ),
      },
      {
        id: "page-context-brief",
        label: t("ai:AI_CHAT_COMMAND_PAGE_CONTEXT_BRIEF"),
        description: t("ai:AI_CHAT_COMMAND_PAGE_CONTEXT_BRIEF_DESC"),
        icon: "page-context-brief",
        execute: () =>
          aui
            .composer()
            .setText(
              actionDirective(
                "page-context-brief",
                t("ai:AI_CHAT_COMMAND_PAGE_CONTEXT_BRIEF"),
                t("ai:AI_CHAT_COMMAND_PAGE_CONTEXT_BRIEF_PROMPT"),
              ),
            ),
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
        isLoading={isFetchingProjects || isFetchingAgents}
        aria-label={t("ai:AI_CHAT_PROJECT_MENTION_LABEL")}
        className={composerTriggerPopoverClassName(placement)}
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
                {item.type === "agent" ? (
                  <BotIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                ) : (
                  <FolderIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                )}
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
        className={composerTriggerPopoverClassName(placement)}
      >
        <ComposerPrimitive.Unstable_TriggerPopover.Action {...slash.action} />
        <ComposerPrimitive.Unstable_TriggerPopoverItems>
          {(items) =>
            items.map((item, index) => {
              const Icon =
                item.id === "launch-project"
                  ? FolderPlusIcon
                  : item.id === "content-model-plan"
                    ? Layers3Icon
                    : item.id === "content-ops-blueprint"
                      ? RouteIcon
                      : item.id === "launch-readiness-audit"
                        ? ClipboardCheckIcon
                        : FileSearchIcon;
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
