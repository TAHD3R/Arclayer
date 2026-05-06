import { useTranslation } from "react-i18next";

import { projectContentLibraryItemPath } from "@/lib/routing/project-content-routing";
import type { AdminContentItem } from "@arclayer/openapi/admin-types";
import { Button } from "@arclayer/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@arclayer/ui/card";

function formatCapabilities(value: AdminContentItem["capabilityPackIds"]) {
  return value.length > 0 ? value.join(", ") : "none";
}

export function SurfaceBoundaryCard(props: {
  item: AdminContentItem;
  titleKey: string;
  descriptionKey: string;
  requiredCapabilities: string[];
  testId: string;
}) {
  const { t } = useTranslation("content");

  return (
    <Card data-testid={props.testId}>
      <CardHeader>
        <CardTitle>{t(props.titleKey)}</CardTitle>
        <CardDescription>{t(props.descriptionKey)}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <div className="text-footnote text-label-secondary">
              {t("CONTENT_SURFACE_BOUNDARY_REQUIRED_CAPABILITIES")}
            </div>
            <div className="text-body text-label-primary">
              {props.requiredCapabilities.join(", ")}
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-footnote text-label-secondary">
              {t("CONTENT_SURFACE_BOUNDARY_ITEM_CAPABILITIES")}
            </div>
            <div className="text-body text-label-primary">
              {formatCapabilities(props.item.capabilityPackIds)}
            </div>
          </div>
        </div>
      </CardContent>
      <CardFooter>
        <Button asChild type="button" variant="outline">
          <a href={projectContentLibraryItemPath(props.item.workspaceId, props.item.id)}>
            {t("CONTENT_ITEM_CONTINUATION_ACTION_BACK_TO_LIBRARY")}
          </a>
        </Button>
      </CardFooter>
    </Card>
  );
}
