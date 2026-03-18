import * as React from "react";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@arclayer/ui/button";

import { ContentLibraryCreateDialog } from "./content-library-create-dialog";

export function ContentLibraryEmptyStateAction(props: {
  visible: boolean;
  workspaceId: string | null;
  models: Array<{ key: string; name: string }>;
  onCreated: () => void;
}) {
  const { t } = useTranslation("content");
  const [open, setOpen] = React.useState(false);

  return (
    <>
      {props.visible ? (
        <Button size="lg" onClick={() => setOpen(true)}>
          <Plus className="size-4" aria-hidden="true" />
          {t("CONTENT_LIBRARY_ACTION_NEW_CONTENT")}
        </Button>
      ) : null}
      <ContentLibraryCreateDialog
        open={open}
        workspaceId={props.workspaceId}
        models={props.models}
        onOpenChange={setOpen}
        onCreated={props.onCreated}
      />
    </>
  );
}
