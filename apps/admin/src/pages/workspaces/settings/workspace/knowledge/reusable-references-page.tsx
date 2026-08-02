import { BookOpenText } from "lucide-react";
import { useTranslation } from "react-i18next";

import { DefaultPage } from "@/layouts/page-shell/default-page";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@arclayer/ui/empty";

import { ReusableReferenceDirectory } from "./reusable-reference-directory";

export function ReusableReferencesPage() {
  const { t } = useTranslation("knowledge");
  const workspaceId = useWorkspaceStore((state) => state.currentWorkspaceId);

  return (
    <DefaultPage
      title={t("REFERENCES_DIRECTORY_TITLE")}
      description={t("REFERENCES_DIRECTORY_DESCRIPTION")}
      showFavoriteToggle={false}
    >
      {workspaceId ? (
        <ReusableReferenceDirectory workspaceId={workspaceId} />
      ) : (
        <Empty className="min-h-80 border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BookOpenText aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>{t("PROJECT_WORKSPACE_REQUIRED_TITLE")}</EmptyTitle>
            <EmptyDescription>{t("PROJECT_WORKSPACE_REQUIRED_DESCRIPTION")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </DefaultPage>
  );
}
