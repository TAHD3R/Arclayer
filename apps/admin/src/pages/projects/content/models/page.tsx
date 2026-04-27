import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { buildContentModelsQueryKey, createContentModel } from "@/api/content";
import { DefaultPage } from "@/layouts/page-shell/default-page";
import { notifyError } from "@/lib/notifications";
import { Button } from "@arclayer/ui/button";

import { CreateContentTypeDialog } from "./components/create-content-type-dialog";
import type { CreateContentTypeSubmitValues } from "./types";

type ContentModelsControlCenterPageProps = {
  projectId: string;
};

export function ContentModelsControlCenterPage({ projectId }: ContentModelsControlCenterPageProps) {
  const { t } = useTranslation("content");
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = React.useState(false);

  const createMutation = useMutation({
    mutationFn: (values: CreateContentTypeSubmitValues) =>
      createContentModel(projectId, values.payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: buildContentModelsQueryKey(projectId) });
      setCreateOpen(false);
    },
    onError: notifyError,
  });

  return (
    <>
      <DefaultPage
        title={t("CONTENT_MODELS_TITLE")}
        showFavoriteToggle
        action={
          <Button type="button" onClick={() => setCreateOpen(true)}>
            {t("CONTENT_MODELS_CREATE_CONTENT_TYPE_ACTION")}
          </Button>
        }
      />
      <CreateContentTypeDialog
        open={createOpen}
        pending={createMutation.isPending}
        onOpenChange={setCreateOpen}
        onSubmit={async (values) => {
          await createMutation.mutateAsync(values);
        }}
      />
    </>
  );
}
