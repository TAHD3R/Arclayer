import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, BookmarkPlus, Save, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { PlatformSavedViewReadOut } from "@arclayer/platform-openapi";

import {
  createSavedView,
  deleteSavedView,
  listSavedViews,
  updateSavedView,
} from "@/saved-views/saved-views-api";
import {
  type SavedViewDefinition,
  type SavedViewState,
  toSavedViewCommand,
} from "@/saved-views/saved-view-contracts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type SavedViewControlProps = Readonly<{
  definition: SavedViewDefinition;
  state: SavedViewState;
  onApply: (state: SavedViewState) => void;
}>;

function sameState(left: SavedViewState, right: SavedViewState): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function effectiveState(
  view: PlatformSavedViewReadOut,
  definition: SavedViewDefinition,
): SavedViewState | null {
  if (!view.effective) return null;
  return {
    filters: view.effective.filters,
    ordering: view.effective.ordering ?? definition.defaultState.ordering,
    visibleColumns: view.effective.visibleColumns,
    columnOrder: view.effective.columnOrder,
    density: view.effective.density ?? definition.defaultState.density,
  };
}

export function SavedViewsControl({ definition, state, onApply }: SavedViewControlProps) {
  const { t } = useTranslation("savedViews");
  const [views, setViews] = useState<PlatformSavedViewReadOut[]>([]);
  const [selectedId, setSelectedId] = useState("default");
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [omissions, setOmissions] = useState<PlatformSavedViewReadOut["omissions"]>([]);

  const reload = useCallback(
    async () => setViews(await listSavedViews(definition.capabilityId)),
    [definition.capabilityId],
  );
  useEffect(() => {
    void reload();
  }, [reload]);
  const selected = useMemo(
    () => views.find((item) => item.view.id === selectedId) ?? null,
    [selectedId, views],
  );
  const selectedState = selected ? effectiveState(selected, definition) : definition.defaultState;
  const unsaved = selectedState ? !sameState(state, selectedState) : false;

  const apply = (id: string) => {
    setSelectedId(id);
    if (id === "default") {
      setOmissions([]);
      onApply(definition.defaultState);
      return;
    }
    const view = views.find((item) => item.view.id === id);
    if (!view) return;
    setOmissions(view.omissions);
    const next = effectiveState(view, definition);
    if (next) onApply(next);
  };

  const save = async () => {
    if (!name.trim()) return;
    setPending(true);
    try {
      const created = await createSavedView(
        definition.capabilityId,
        toSavedViewCommand(name.trim(), definition, state),
      );
      await reload();
      setSelectedId(created.id);
      setName("");
    } finally {
      setPending(false);
    }
  };
  const update = async () => {
    if (!selected) return;
    setPending(true);
    try {
      await updateSavedView(selected.view.id, {
        ...toSavedViewCommand(selected.view.name, definition, state),
        expectedRevision: selected.view.revision,
      });
      await reload();
    } finally {
      setPending(false);
    }
  };
  const remove = async () => {
    if (!selected) return;
    setPending(true);
    try {
      await deleteSavedView(selected.view.id, selected.view.revision);
      setSelectedId("default");
      setOmissions([]);
      await reload();
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex flex-1 flex-wrap items-center gap-2">
      <Select onValueChange={apply} value={selectedId}>
        <SelectTrigger aria-label={t("LABEL")} className="w-full sm:w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="default">{t("DEFAULT_VIEW")}</SelectItem>
          {views.map((item) => (
            <SelectItem key={item.view.id} value={item.view.id}>
              {item.view.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {unsaved ? (
        <span className="text-sm text-amber-600 dark:text-amber-400">{t("UNSAVED")}</span>
      ) : null}
      <Input
        aria-label={t("NAME")}
        className="w-full sm:w-40"
        onChange={(event) => setName(event.target.value)}
        placeholder={t("NAME")}
        value={name}
      />
      <Button
        disabled={!name.trim()}
        loading={pending}
        onClick={() => void save()}
        size="sm"
        type="button"
        variant="outline"
      >
        <BookmarkPlus aria-hidden="true" />
        {t("SAVE_AS")}
      </Button>
      {selected ? (
        <>
          <Button
            disabled={!unsaved}
            loading={pending}
            onClick={() => void update()}
            size="sm"
            type="button"
            variant="outline"
          >
            <Save aria-hidden="true" />
            {t("UPDATE")}
          </Button>
          <Button
            loading={pending}
            onClick={() => void remove()}
            size="sm"
            type="button"
            variant="outline"
          >
            <Trash2 aria-hidden="true" />
            {t("DELETE")}
          </Button>
        </>
      ) : null}
      {omissions.length ? (
        <Alert className="basis-full border-amber-500/40 bg-amber-500/10">
          <AlertTriangle aria-hidden="true" />
          <AlertTitle>{t("OMISSIONS_TITLE")}</AlertTitle>
          <AlertDescription>{t("OMISSIONS_DESCRIPTION")}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
