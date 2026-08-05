"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ComposerPrimitive,
  unstable_defaultDirectiveFormatter,
  unstable_useMentionAdapter,
  useAui,
  type Unstable_Mention,
} from "@assistant-ui/react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { listAIWorkspaceAgents } from "@/api/ai";
import { listAssets } from "@/api/assets";
import { listContentItems } from "@/api/content";
import { toMasonryItem } from "@/lib/assets/to-masonry-item";
import {
  agentIdsForComposerScope,
  skillInstallationIdsForComposerScope,
  useAIComposerDirectiveStore,
  type AIComposerDirectiveScope,
} from "@/components/ai/ai-composer-directives";
import {
  AIComposerMentionPopoverContent,
  AIComposerSlashPopoverContent,
} from "@/components/ai/ai-composer-trigger-popover-content";
import { useEnabledAIComposerSkills } from "@/components/ai/ai-composer-skill-menu";
import { listProjects } from "@/api/projects";
import { useAuthStore } from "@/stores/use-auth-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import { cn } from "@arclayer/lib/utils";
import { OVERLAY_LAYER_SHADOW_CLASSNAME } from "@arclayer/ui/layer-shadow";

type AIComposerTriggersProps = {
  placement?: "top" | "bottom";
  scope: AIComposerDirectiveScope;
};

function composerTriggerPopoverClassName(
  placement: NonNullable<AIComposerTriggersProps["placement"]>,
) {
  return cn(
    "fade-in zoom-in-95 absolute left-3 z-[2500] flex max-h-[24rem] max-w-[calc(100vw-2rem)] w-[min(36rem,calc(100%-1.5rem))] flex-col animate-in overflow-hidden rounded-xl border border-border/70 bg-popover p-1.5 text-popover-foreground duration-150 motion-reduce:animate-none",
    OVERLAY_LAYER_SHADOW_CLASSNAME,
    placement === "bottom"
      ? "slide-in-from-top-2 top-full mt-2 origin-top"
      : "slide-in-from-bottom-2 bottom-full mb-2 origin-bottom",
  );
}

export function AIComposerTriggers({ placement = "top", scope }: AIComposerTriggersProps) {
  const { t } = useTranslation(["ai"]);
  const aui = useAui();
  const accessToken = useAuthStore((s) => s.accessToken);
  const sessionVersion = useAuthStore((s) => s.sessionVersion);
  const workspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const currentProjectId = useWorkspaceStore((s) => s.currentProjectId);

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
    queryKey: ["ai", "composer", "agent-mentions", workspaceId, currentProjectId],
    enabled: Boolean(accessToken && workspaceId),
    queryFn: ({ signal }) =>
      listAIWorkspaceAgents({
        workspaceId: String(workspaceId),
        projectId: currentProjectId,
        signal,
      }),
    staleTime: 30_000,
    retry: false,
    meta: { silent: true },
  });

  const agentMentions = useMemo<Unstable_Mention[]>(() => {
    const mentions: Unstable_Mention[] = [];
    for (const agent of agentsData?.agents ?? []) {
      if (!agent.available) continue;
      mentions.push({
        id: agent.agentId,
        type: "agent",
        label: agent.nameI18nKey ? t(`ai:${agent.nameI18nKey}`) : agent.name,
        description: agent.descriptionI18nKey
          ? t(`ai:${agent.descriptionI18nKey}`)
          : agent.description,
        icon: "agent",
      });
    }
    return mentions;
  }, [agentsData?.agents, t]);
  const { data: assetsData, isFetching: isFetchingAssets } = useQuery({
    queryKey: ["ai", "composer", "asset-mentions", currentProjectId],
    enabled: Boolean(accessToken && currentProjectId),
    queryFn: () =>
      listAssets(String(currentProjectId), {
        page: 1,
        size: 8,
        ordering: "-created_at",
      }),
    staleTime: 30_000,
    retry: false,
    meta: { silent: true },
  });
  const assetMentions = useMemo<Unstable_Mention[]>(
    () =>
      (assetsData?.items ?? []).map((asset) => ({
        id: asset.id,
        type: "asset",
        label: asset.title ?? asset.originalFilename ?? asset.slug ?? asset.id,
        description: asset.mime ?? asset.originalFilename ?? asset.slug ?? undefined,
        icon: "asset",
      })),
    [assetsData?.items],
  );
  const assetPreviewById = useMemo(
    () => new Map((assetsData?.items ?? []).map((asset) => [asset.id, toMasonryItem(asset)])),
    [assetsData?.items],
  );
  const { data: contentData, isFetching: isFetchingContent } = useQuery({
    queryKey: ["ai", "composer", "content-mentions", currentProjectId],
    enabled: Boolean(accessToken && currentProjectId),
    queryFn: () => listContentItems(String(currentProjectId), { page: 1, size: 8 }),
    staleTime: 30_000,
    retry: false,
    meta: { silent: true },
  });
  const contentMentions = useMemo<Unstable_Mention[]>(
    () =>
      (contentData?.items ?? []).map((item) => ({
        id: item.id,
        type: "content",
        label: item.title ?? item.slug,
        description: item.summary ?? item.modelKey ?? item.slug,
        icon: "content",
      })),
    [contentData?.items],
  );
  const mentionCategories = useMemo(() => {
    const categories = [
      {
        id: "agents",
        label: t("ai:AI_CHAT_MENTION_AGENTS"),
        items: agentMentions,
      },
      {
        id: "projects",
        label: t("ai:AI_CHAT_MENTION_PROJECTS"),
        items: projectMentions,
      },
    ];
    if (currentProjectId) {
      categories.push(
        {
          id: "assets",
          label: t("ai:AI_CHAT_MENTION_ASSETS"),
          items: assetMentions,
        },
        {
          id: "content",
          label: t("ai:AI_CHAT_MENTION_CONTENT"),
          items: contentMentions,
        },
      );
    }
    return categories;
  }, [agentMentions, assetMentions, contentMentions, currentProjectId, projectMentions, t]);

  const mention = unstable_useMentionAdapter({
    categories: mentionCategories,
    includeModelContextTools: false,
    formatter: unstable_defaultDirectiveFormatter,
    onInserted: (item) => {
      if (
        item.type !== "agent" &&
        item.type !== "project" &&
        item.type !== "asset" &&
        item.type !== "content"
      ) {
        return;
      }
      const assetPreview = item.type === "asset" ? assetPreviewById.get(item.id) : undefined;
      useAIComposerDirectiveStore.getState().addDirectives(scope, [
        {
          type: item.type,
          id: item.id,
          label: item.label,
          previewUrl: assetPreview?.previewUrl,
          mime: assetPreview?.mimeType,
        },
      ]);
      if (item.type !== "agent") return;
      const composer = aui.composer();
      const current = composer.getState().runConfig;
      composer.setRunConfig({
        ...current,
        custom: {
          ...current.custom,
          mentionedAgentIds: [...agentIdsForComposerScope(scope)],
        },
      });
    },
  });

  const {
    isError: isErrorSkills,
    isLoading: isLoadingSkills,
    skills,
  } = useEnabledAIComposerSkills();

  const skillMentions = useMemo<Unstable_Mention[]>(
    () =>
      skills.map<Unstable_Mention>((skill) => ({
        id: skill.id,
        type: "skill",
        label: skill.label,
        description: skill.description,
        icon: "skill",
      })),
    [skills],
  );

  const slash = unstable_useMentionAdapter({
    items: skillMentions,
    includeModelContextTools: false,
    formatter: unstable_defaultDirectiveFormatter,
    onInserted: (item) => {
      if (item.type !== "skill") return;
      useAIComposerDirectiveStore.getState().addDirectives(scope, [
        {
          type: "skill",
          id: item.id,
          label: item.label,
        },
      ]);
      const composer = aui.composer();
      const current = composer.getState().runConfig;
      composer.setRunConfig({
        ...current,
        custom: {
          ...current.custom,
          selectedSkillInstallationIds: [...skillInstallationIdsForComposerScope(scope)],
        },
      });
    },
  });

  return (
    <>
      <ComposerPrimitive.Unstable_TriggerPopover
        char="@"
        adapter={mention.adapter}
        isLoading={isFetchingProjects || isFetchingAgents || isFetchingAssets || isFetchingContent}
        aria-label={t("ai:AI_CHAT_PROJECT_MENTION_LABEL")}
        className={composerTriggerPopoverClassName(placement)}
      >
        <ComposerPrimitive.Unstable_TriggerPopover.Directive {...mention.directive} />
        <AIComposerMentionPopoverContent placement={placement} />
      </ComposerPrimitive.Unstable_TriggerPopover>

      <ComposerPrimitive.Unstable_TriggerPopover
        char="/"
        adapter={slash.adapter}
        aria-label={t("ai:AI_CHAT_COMMAND_MENU_LABEL")}
        className={composerTriggerPopoverClassName(placement)}
      >
        <ComposerPrimitive.Unstable_TriggerPopover.Directive {...slash.directive} />
        <AIComposerSlashPopoverContent
          isErrorSkills={isErrorSkills}
          isLoadingSkills={isLoadingSkills}
          placement={placement}
          skills={skills}
        />
      </ComposerPrimitive.Unstable_TriggerPopover>
    </>
  );
}
