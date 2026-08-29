import type { ReactNode } from "react";

import { SettingDialog } from "@arclayer/ui/setting-dialog";

import { WorkspaceSkillFileBrowser, type SkillFileSummary } from "./workspace-skill-file-browser";

export function WorkspaceSkillDetailDialog(
  props: Readonly<{
    actions?: ReactNode;
    belowDescription?: ReactNode;
    description?: string | null;
    files: readonly SkillFileSummary[];
    icon: ReactNode;
    loading?: boolean;
    onOpenChange: (open: boolean) => void;
    open: boolean;
    subtitle?: ReactNode;
    title: string;
  }>,
) {
  return (
    <SettingDialog
      contentClassName="sm:max-w-4xl"
      onOpenChange={props.onOpenChange}
      open={props.open}
      title={
        <span className="flex w-full items-center justify-between gap-4 pr-10">
          <span className="flex min-w-0 items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg border bg-muted/50 text-label-secondary [&_svg]:size-5">
              {props.icon}
            </span>
            <span className="flex min-w-0 flex-col items-start gap-1">
              <span className="max-w-full truncate">{props.title}</span>
              {props.subtitle ? (
                <span className="max-w-full truncate text-footnote font-normal text-label-secondary">
                  {props.subtitle}
                </span>
              ) : null}
            </span>
          </span>
          {props.actions ? (
            <span className="inline-flex shrink-0 items-center gap-2 font-normal [&_svg:not([class*='size-'])]:size-4">
              {props.actions}
            </span>
          ) : null}
        </span>
      }
    >
      {props.loading ? (
        <div className="space-y-4" aria-hidden="true">
          <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
          <div className="h-44 animate-pulse rounded-xl bg-muted" />
        </div>
      ) : (
        <>
          {props.description ? (
            <p className="mb-4 text-body leading-6 text-label-secondary">{props.description}</p>
          ) : null}
          {props.belowDescription ? <div className="mb-4">{props.belowDescription}</div> : null}
          <WorkspaceSkillFileBrowser files={props.files} />
        </>
      )}
    </SettingDialog>
  );
}
