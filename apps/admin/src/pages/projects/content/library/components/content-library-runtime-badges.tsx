import {
  AlertTriangle,
  CheckCircle2,
  FilePenLine,
  Layers3,
  PenSquare,
  Sparkles,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { BaseTag, lucideTagIcon } from "@/components/ui/tags";
import {
  buildContentLibraryRuntimeBadges,
  buildContentLibraryRuntimeDiagnostics,
  type ContentLibraryRuntimeBadge,
  type ContentLibraryRuntimeDiagnostic,
} from "@/pages/projects/content/library/runtime";
import type { ContentLibraryTableRow } from "../types";

function getBadgeIcon(badge: ContentLibraryRuntimeBadge | ContentLibraryRuntimeDiagnostic) {
  if (badge.id === "published" || badge.id === "shape-ready") return lucideTagIcon(CheckCircle2);
  if (badge.id === "changed" || badge.id === "has-draft") return lucideTagIcon(FilePenLine);
  if (badge.id === "archived" || badge.id === "shape-blocked") return lucideTagIcon(AlertTriangle);
  if (badge.id === "bootstrap-customized") return lucideTagIcon(Sparkles);
  if (badge.id === "shape-unshaped") return lucideTagIcon(Layers3);
  return lucideTagIcon(PenSquare);
}

function RuntimeBadgeList(props: {
  items: ReadonlyArray<ContentLibraryRuntimeBadge | ContentLibraryRuntimeDiagnostic>;
}) {
  const { t } = useTranslation("content");

  return (
    <>
      {props.items.map((item) => (
        <BaseTag key={item.id} color={item.tone} icon={getBadgeIcon(item)}>
          {t(item.labelKey)}
        </BaseTag>
      ))}
    </>
  );
}

export function ContentLibraryRuntimeBadgeList(props: {
  row: Pick<
    ContentLibraryTableRow,
    "bootstrapPresetState" | "derivedStatus" | "draftVersion" | "publishedVersion" | "shapeState"
  >;
}) {
  return <RuntimeBadgeList items={buildContentLibraryRuntimeBadges(props.row)} />;
}

export function ContentLibraryRuntimeDiagnosticList(props: {
  row: Pick<
    ContentLibraryTableRow,
    "bootstrapPresetState" | "draftVersion" | "publishedVersion" | "shapeState"
  >;
}) {
  return <RuntimeBadgeList items={buildContentLibraryRuntimeDiagnostics(props.row)} />;
}
