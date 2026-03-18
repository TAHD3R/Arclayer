import { useState, type ReactNode } from "react";
import {
  ChevronRight,
  CheckCircle2,
  FileStack,
  Folder,
  History,
  Layers3,
  PenSquare,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button as ButtonPrimitive } from "@arclayer/ui/button-primitive";
import { MiniCategoryNav, type MiniCategoryNavItem } from "@arclayer/ui/mini-category-nav";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@arclayer/ui/collapsible";
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
} from "@arclayer/ui/sidebar-menu";
import { cn } from "@arclayer/lib/utils";

import type {
  ContentLibraryScopeId,
  ContentLibrarySidebarCounts,
  ContentLibrarySidebarModel,
} from "../types";
import { isTypeScopeActive } from "../utils";

function TreeLeafButton(props: {
  active: boolean;
  icon: ReactNode;
  label: string;
  count?: number | null;
  onClick: () => void;
}) {
  return (
    <ButtonPrimitive
      type="button"
      onClick={props.onClick}
      data-active={props.active ? "true" : "false"}
      tapScale={1}
      className={cn(
        "flex h-9 w-full min-w-0 items-center gap-3 rounded-lg px-3 text-left",
        "text-sm transition-colors",
        "text-label-secondary hover:bg-accent/40 hover:text-foreground",
        "data-[active=true]:bg-accent/50 data-[active=true]:font-medium data-[active=true]:text-foreground",
      )}
    >
      <span className="inline-flex size-4 shrink-0 items-center justify-center">{props.icon}</span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{props.label}</span>
      {typeof props.count === "number" ? (
        <span className="text-caption text-label-secondary tabular-nums">{props.count}</span>
      ) : null}
    </ButtonPrimitive>
  );
}

function SidebarSectionLabel(props: { label: string }) {
  return (
    <div className="px-3 pt-4 pb-2 text-[0.7rem] font-semibold tracking-[0.18em] text-label-secondary/80 uppercase">
      {props.label}
    </div>
  );
}

function MiniNavLabel(props: { label: string; count?: number | null }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="min-w-0 flex-1 truncate">{props.label}</span>
      {typeof props.count === "number" ? (
        <span className="shrink-0 text-caption text-label-secondary tabular-nums">
          {props.count}
        </span>
      ) : null}
    </span>
  );
}

function TreeBranch(props: {
  icon: ReactNode;
  label: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(props.defaultOpen ?? true);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <ButtonPrimitive
            type="button"
            tapScale={1}
            className={cn(
              "flex h-9 w-full min-w-0 items-center gap-3 rounded-lg px-3 text-left",
              "text-sm font-medium text-label-secondary transition-colors",
              "hover:bg-accent/35 hover:text-foreground",
            )}
          >
            <ChevronRight
              className={cn("size-4 shrink-0 transition-transform", open ? "rotate-90" : "")}
            />
            <span className="inline-flex size-4 shrink-0 items-center justify-center">
              {props.icon}
            </span>
            <span className="min-w-0 flex-1 truncate">{props.label}</span>
          </ButtonPrimitive>
        </CollapsibleTrigger>
      </SidebarMenuItem>
      <CollapsibleContent className="overflow-hidden data-[state=open]:animate-[arclayer-collapsible-down_180ms_ease-out] data-[state=closed]:animate-[arclayer-collapsible-up_160ms_ease-in] motion-reduce:animate-none">
        <SidebarMenuSub className="mx-0 border-l-0 pl-6">{props.children}</SidebarMenuSub>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function ContentLibrarySidebar(props: {
  activeScope: ContentLibraryScopeId;
  counts: ContentLibrarySidebarCounts;
  models: ContentLibrarySidebarModel[];
  contentTypesLoading?: boolean;
  onScopeChange: (next: ContentLibraryScopeId) => void;
}) {
  const { t } = useTranslation(["content", "common"]);
  const quickNavItems = [
    {
      key: "quick:all",
      icon: <Layers3 className="size-4" />,
      label: (
        <MiniNavLabel label={t("content:CONTENT_LIBRARY_MENU_ALL")} count={props.counts.all} />
      ),
    },
    {
      key: "quick:recent",
      icon: <History className="size-4" />,
      label: (
        <MiniNavLabel
          label={t("content:CONTENT_LIBRARY_MENU_RECENT")}
          count={props.counts.recent}
        />
      ),
    },
    {
      key: "quick:draft",
      icon: <PenSquare className="size-4" />,
      label: (
        <MiniNavLabel
          label={t("content:CONTENT_LIBRARY_MENU_DRAFT")}
          count={props.counts.statuses.draft}
        />
      ),
    },
    {
      key: "quick:published",
      icon: <CheckCircle2 className="size-4" />,
      label: (
        <MiniNavLabel
          label={t("content:CONTENT_LIBRARY_MENU_PUBLISHED")}
          count={props.counts.statuses.published}
        />
      ),
    },
  ] satisfies readonly MiniCategoryNavItem[];
  const quickSelectedKey = props.activeScope.startsWith("quick:") ? props.activeScope : "";
  const showTypeBranch = props.contentTypesLoading || props.models.length > 0;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background/90">
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-4">
        <MiniCategoryNav
          items={quickNavItems}
          selectedKey={quickSelectedKey}
          onSelect={(key) => props.onScopeChange(key as ContentLibraryScopeId)}
        />

        <div className="my-4 border-t border-border/70" />

        <SidebarSectionLabel label={t("content:CONTENT_LIBRARY_SECTION_VIEWS")} />
        <SidebarMenu className="gap-1.5">
          {showTypeBranch ? (
            <TreeBranch
              icon={<Folder className="size-4" />}
              label={t("content:CONTENT_LIBRARY_SECTION_BY_TYPE")}
            >
              {props.contentTypesLoading ? (
                <SidebarMenuSubItem>
                  <div className="px-3 py-2 text-sm text-label-secondary">
                    {t("common:LOADING")}
                  </div>
                </SidebarMenuSubItem>
              ) : (
                props.models.map((model) => (
                  <SidebarMenuSubItem key={model.id}>
                    <TreeLeafButton
                      active={isTypeScopeActive(props.activeScope, model.key)}
                      icon={<FileStack className="size-4" />}
                      label={model.name}
                      count={props.counts.models[model.key] ?? 0}
                      onClick={() => props.onScopeChange(`tree:type:${model.key}`)}
                    />
                  </SidebarMenuSubItem>
                ))
              )}
            </TreeBranch>
          ) : null}
        </SidebarMenu>
      </div>
    </div>
  );
}
