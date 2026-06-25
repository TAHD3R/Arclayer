import { useNavigate } from "@tanstack/react-router";
import { ChevronDownIcon, PlusIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { ProjectAvatar, projectAvatarPropsFromIdentity } from "@/components/common/project-avatar";
import { Button } from "@arclayer/ui/button";
import { useAdminDateTimeFormatter } from "@/hooks/use-admin-date-time-formatter";
import { projectHomePath } from "@/lib/routing/workspace-routing";
import type { ProjectListItem } from "@arclayer/openapi/admin-types";

export function HomeRecentProjectsSection({
  workspaceId,
  projects,
}: {
  workspaceId: string | null;
  projects: readonly ProjectListItem[];
}) {
  const { t } = useTranslation(["ai", "common"]);
  const navigate = useNavigate();
  const dateTime = useAdminDateTimeFormatter({ workspaceId });

  const openCreateProject = () => {
    void navigate({ to: "/projects", search: { create: "1" } });
  };

  return (
    <section className="w-full" aria-labelledby="home-recent-projects-title">
      <div
        className="relative mb-4 flex w-full items-center justify-between"
        data-testid="home-recent-project-section"
      >
        <h2 id="home-recent-projects-title" className="text-title2 text-label-primary">
          {t("ai:AI_CHAT_HOME_RECENT_PROJECTS")}
        </h2>
        <Button type="button" variant="ghost" onClick={() => void navigate({ to: "/projects" })}>
          {t("ai:AI_CHAT_HOME_SEE_ALL_PROJECTS")}
          <span className="flex size-6 -rotate-90 items-center justify-center rounded-lg transition-all duration-300 group-hover:bg-accent">
            <ChevronDownIcon className="size-4" aria-hidden="true" />
          </span>
        </Button>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(16rem,100%),1fr))] gap-4 lg:grid-cols-4">
        <CreateProjectHomeCard
          label={t("ai:AI_CHAT_HOME_CREATE_PROJECT")}
          onClick={openCreateProject}
        />
        {projects.map((project) => (
          <RecentProjectCard
            key={project.id}
            project={project}
            createdLabel={t("ai:AI_CHAT_HOME_PROJECT_CREATED_AT", {
              date: dateTime.formatDate(project.createdAt),
            })}
            onClick={() => void navigate({ to: projectHomePath(project.id) as never })}
          />
        ))}
      </div>
    </section>
  );
}

function CreateProjectHomeCard(props: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="group flex w-full cursor-pointer flex-col gap-[10px] text-left"
      data-testid="lovart-home-create-project-card"
      onClick={props.onClick}
    >
      <div
        className="relative w-full overflow-hidden rounded-xl border border-dashed border-border bg-muted/45 transition-colors group-hover:border-border/90"
        style={{ aspectRatio: "239.2 / 135.4" }}
      >
        <div className="absolute inset-0 flex items-center justify-center text-label-secondary">
          <PlusIcon className="size-6" aria-hidden="true" />
        </div>
        <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:bg-accent/30 group-hover:opacity-100" />
      </div>
      <div className="flex h-[42px] w-full shrink-0 flex-col items-start justify-start">
        <div className="flex h-6 w-full items-center pl-1 text-headline text-label-primary">
          {props.label}
        </div>
      </div>
    </button>
  );
}

function RecentProjectCard(props: {
  project: ProjectListItem;
  createdLabel: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-testid="lovart-project-card"
      className="group flex w-full cursor-pointer flex-col gap-[10px] text-left"
      onClick={props.onClick}
    >
      <div
        className="relative w-full overflow-hidden rounded-xl border border-border bg-muted/45"
        style={{ aspectRatio: "239.2 / 135.4" }}
      >
        {props.project.iconUrl ? (
          <img
            src={props.project.iconUrl}
            alt=""
            className="absolute inset-0 size-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-muted">
            <ProjectAvatar
              name={props.project.name}
              size={56}
              {...projectAvatarPropsFromIdentity(props.project)}
            />
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:bg-accent/25 group-hover:opacity-100" />
      </div>
      <div className="flex w-full shrink-0 flex-col justify-center gap-0.5">
        <div className="flex h-6 w-full shrink-0 items-center gap-3 pl-1">
          <div className="min-w-0 flex-1 truncate text-headline text-label-primary">
            {props.project.name}
          </div>
        </div>
        <div className="flex shrink-0 items-center overflow-hidden px-1 text-callout whitespace-nowrap text-label-secondary">
          {props.createdLabel}
        </div>
      </div>
    </button>
  );
}
