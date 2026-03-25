import * as React from "react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  PinIcon,
  PinOffIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@arclayer/ui/button";
import { Input } from "@arclayer/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@arclayer/ui/sheet";

import type { ContentLibrarySavedView } from "../types";

export function ContentLibraryViewsManager(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  systemViews: Array<{ id: string; label: string; active?: boolean; onSelect?: () => void }>;
  facetGroups?: Array<{
    id: string;
    title: string;
    items: Array<{ id: string; label: string; active?: boolean; onSelect?: () => void }>;
  }>;
  savedViews: ContentLibrarySavedView[];
  onSelectSavedView: (viewId: string) => void;
  onCreateSavedView: (name: string) => void;
  onRenameSavedView: (viewId: string, name: string) => void;
  onTogglePinSavedView: (viewId: string) => void;
  onMoveSavedView: (viewId: string, direction: "up" | "down") => void;
  onDeleteSavedView: (viewId: string) => void;
}) {
  const { t } = useTranslation("content");
  const [createName, setCreateName] = React.useState("");
  const [renamingViewId, setRenamingViewId] = React.useState<string | null>(null);
  const [renameName, setRenameName] = React.useState("");

  const handleCreateSavedView = React.useCallback(() => {
    const nextName = createName.trim();
    if (!nextName) return;
    props.onCreateSavedView(nextName);
    setCreateName("");
  }, [createName, props]);

  const beginRename = React.useCallback((view: ContentLibrarySavedView) => {
    setRenamingViewId(view.id);
    setRenameName(view.name);
  }, []);

  const handleRename = React.useCallback(() => {
    const nextName = renameName.trim();
    if (!renamingViewId || !nextName) return;
    props.onRenameSavedView(renamingViewId, nextName);
    setRenamingViewId(null);
    setRenameName("");
  }, [props, renameName, renamingViewId]);

  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent side="right" className="w-[min(92vw,34rem)] sm:w-[34rem]">
        <div className="flex min-h-0 flex-1 flex-col gap-6 px-4 pb-4">
          <SheetHeader>
            <SheetTitle>{t("CONTENT_LIBRARY_VIEWS_MANAGER_TITLE")}</SheetTitle>
            <SheetDescription>{t("CONTENT_LIBRARY_VIEWS_MANAGER_DESC")}</SheetDescription>
          </SheetHeader>

          <section className="grid gap-3">
            <div className="text-caption uppercase tracking-[0.16em] text-label-tertiary">
              {t("CONTENT_LIBRARY_VIEWS_MANAGER_SECTION_CREATE")}
            </div>
            <div className="flex gap-2">
              <Input
                aria-label={t("CONTENT_LIBRARY_VIEW_CREATE_NAME")}
                value={createName}
                onChange={(event) => setCreateName(event.target.value)}
                placeholder={t("CONTENT_LIBRARY_VIEW_CREATE_PLACEHOLDER")}
              />
              <Button type="button" onClick={handleCreateSavedView}>
                {t("CONTENT_LIBRARY_ACTION_SAVE_VIEW")}
              </Button>
            </div>
          </section>

          <section className="grid gap-3">
            <div className="text-caption uppercase tracking-[0.16em] text-label-tertiary">
              {t("CONTENT_LIBRARY_VIEWS_MANAGER_SECTION_SYSTEM")}
            </div>
            <div className="grid gap-2">
              {props.systemViews.map((view) => (
                <Button
                  key={view.id}
                  type="button"
                  variant={view.active ? "secondary" : "ghost"}
                  className="justify-start"
                  onClick={view.onSelect}
                >
                  {view.label}
                </Button>
              ))}
            </div>
          </section>

          {(props.facetGroups ?? []).map((group) => (
            <section key={group.id} className="grid gap-3">
              <div className="text-caption uppercase tracking-[0.16em] text-label-tertiary">
                {group.title}
              </div>
              <div className="flex flex-wrap gap-2">
                {group.items.map((item) => (
                  <Button
                    key={item.id}
                    type="button"
                    size="sm"
                    variant={item.active ? "secondary" : "outline"}
                    onClick={item.onSelect}
                  >
                    {item.label}
                  </Button>
                ))}
              </div>
            </section>
          ))}

          <section className="grid gap-3">
            <div className="text-caption uppercase tracking-[0.16em] text-label-tertiary">
              {t("CONTENT_LIBRARY_VIEWS_MANAGER_SECTION_SAVED")}
            </div>
            {props.savedViews.length ? (
              <div className="grid gap-3">
                {props.savedViews.map((view, index) => (
                  <div key={view.id} className="rounded-lg border border-border/70 bg-card/80 p-3">
                    {renamingViewId === view.id ? (
                      <div className="grid gap-2">
                        <Input
                          aria-label={t("CONTENT_LIBRARY_VIEW_RENAME_NAME")}
                          value={renameName}
                          onChange={(event) => setRenameName(event.target.value)}
                        />
                        <div className="flex flex-wrap gap-2">
                          <Button type="button" size="sm" onClick={handleRename}>
                            {t("CONTENT_LIBRARY_ACTION_CONFIRM_RENAME_VIEW")}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setRenamingViewId(null);
                              setRenameName("");
                            }}
                          >
                            {t("common:CANCEL")}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <Button
                              type="button"
                              variant="ghost"
                              className="h-auto justify-start px-0 text-left text-body text-label-primary"
                              onClick={() => props.onSelectSavedView(view.id)}
                            >
                              {view.name}
                            </Button>
                            <div className="text-footnote text-label-secondary">
                              {t("CONTENT_LIBRARY_VIEWS_MANAGER_BASE_VIEW")}: {view.baseViewId}
                            </div>
                          </div>
                          {view.pinned ? (
                            <div className="text-footnote text-label-secondary">
                              {t("CONTENT_LIBRARY_VIEW_PINNED")}
                            </div>
                          ) : null}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            aria-label={t(
                              view.pinned
                                ? "CONTENT_LIBRARY_ACTION_UNPIN_VIEW"
                                : "CONTENT_LIBRARY_ACTION_PIN_VIEW",
                            )}
                            onClick={() => props.onTogglePinSavedView(view.id)}
                          >
                            {view.pinned ? (
                              <PinOffIcon className="size-4" />
                            ) : (
                              <PinIcon className="size-4" />
                            )}
                            {t(
                              view.pinned
                                ? "CONTENT_LIBRARY_ACTION_UNPIN_VIEW"
                                : "CONTENT_LIBRARY_ACTION_PIN_VIEW",
                            )}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            aria-label={t("CONTENT_LIBRARY_ACTION_RENAME_VIEW")}
                            onClick={() => beginRename(view)}
                          >
                            <PencilIcon className="size-4" />
                            {t("CONTENT_LIBRARY_ACTION_RENAME_VIEW")}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            aria-label={t("CONTENT_LIBRARY_ACTION_MOVE_VIEW_UP")}
                            disabled={index === 0}
                            onClick={() => props.onMoveSavedView(view.id, "up")}
                          >
                            <ArrowUpIcon className="size-4" />
                            {t("CONTENT_LIBRARY_ACTION_MOVE_VIEW_UP")}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            aria-label={t("CONTENT_LIBRARY_ACTION_MOVE_VIEW_DOWN")}
                            disabled={index === props.savedViews.length - 1}
                            onClick={() => props.onMoveSavedView(view.id, "down")}
                          >
                            <ArrowDownIcon className="size-4" />
                            {t("CONTENT_LIBRARY_ACTION_MOVE_VIEW_DOWN")}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            aria-label={t("CONTENT_LIBRARY_ACTION_DELETE_VIEW")}
                            onClick={() => props.onDeleteSavedView(view.id)}
                          >
                            <Trash2Icon className="size-4" />
                            {t("CONTENT_LIBRARY_ACTION_DELETE_VIEW")}
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border/70 bg-muted/35 p-4 text-footnote text-label-secondary">
                {t("CONTENT_LIBRARY_VIEWS_MANAGER_EMPTY")}
              </div>
            )}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
