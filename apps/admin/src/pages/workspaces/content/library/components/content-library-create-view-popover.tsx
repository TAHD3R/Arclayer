import * as React from "react";
import { PlusIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@arclayer/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@arclayer/ui/popover";

import {
  ContentLibraryViewFormFields,
  ContentLibraryViewFormHeader,
  createContentLibraryPrototypeViewDraft,
} from "./content-library-view-form";
import type { ContentLibraryPrototypeViewDraft } from "./content-library-view-form";

export function ContentLibraryCreateViewPopover(props: {
  onCreate: (draft: ContentLibraryPrototypeViewDraft) => Promise<void> | void;
}) {
  const { t } = useTranslation("content");
  const [open, setOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [draft, setDraft] = React.useState<ContentLibraryPrototypeViewDraft>(() =>
    createContentLibraryPrototypeViewDraft(),
  );

  const resetForm = React.useCallback(() => {
    setDraft(createContentLibraryPrototypeViewDraft());
  }, []);

  const handleOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      setOpen(nextOpen);
      if (!nextOpen) resetForm();
    },
    [resetForm],
  );

  const trimmedName = draft.name.trim();
  const triggerLabel = trimmedName || t("CONTENT_LIBRARY_ACTION_CREATE_VIEW");

  const handleSave = React.useCallback(async () => {
    if (!trimmedName) return;
    setSubmitting(true);
    try {
      await props.onCreate({ ...draft, name: trimmedName });
      setOpen(false);
      resetForm();
    } finally {
      setSubmitting(false);
    }
  }, [draft, props, resetForm, trimmedName]);

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="shrink-0 border-dashed bg-muted/25 text-label-secondary hover:bg-muted/50 hover:text-label-primary"
        >
          <PlusIcon className="size-4" />
          {triggerLabel}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        collisionPadding={16}
        className="w-[min(92vw,28rem)] overflow-hidden p-0"
      >
        <div className="border-b px-5 py-4">
          <ContentLibraryViewFormHeader
            title={t("CONTENT_LIBRARY_ACTION_CREATE_VIEW")}
            description={t("CONTENT_LIBRARY_VIEW_CREATE_POPOVER_DESC")}
          />
        </div>
        <div className="grid gap-4 px-5 py-4">
          <ContentLibraryViewFormFields
            value={draft}
            onChange={setDraft}
            disabled={submitting}
            fieldIdPrefix="content-library-create-view"
          />
        </div>
        <div className="flex justify-end gap-2 border-t bg-card px-5 py-4">
          <Button
            type="button"
            variant="ghost"
            disabled={submitting}
            onClick={() => handleOpenChange(false)}
          >
            {t("common:CANCEL")}
          </Button>
          <Button
            type="button"
            disabled={!trimmedName || submitting}
            onClick={() => void handleSave()}
          >
            {t("CONTENT_LIBRARY_ACTION_SAVE_VIEW")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
