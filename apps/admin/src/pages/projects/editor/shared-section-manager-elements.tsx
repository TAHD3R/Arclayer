import { useTranslation } from "react-i18next";

import type { BuilderChangeSetPreviewOut } from "@arclayer/openapi";

export function SharedSectionIssueList({ preview }: { preview: BuilderChangeSetPreviewOut }) {
  const { t } = useTranslation(["account", "errors"]);
  if (preview.issues.length === 0) return null;
  return (
    <ul className="mt-4 space-y-2 border-t border-border pt-4 text-caption">
      {preview.issues.map((issue, index) => (
        <li
          key={`${issue.code}:${issue.operationId ?? index}`}
          className={issue.severity === "blocker" ? "text-negative" : "text-label-secondary"}
        >
          {t(issue.messageKey, { ns: "errors" })}
        </li>
      ))}
    </ul>
  );
}

export function SharedSectionNotice({
  tone,
  text,
}: {
  tone: "neutral" | "warning" | "danger";
  text: string;
}) {
  const toneClass =
    tone === "danger"
      ? "border-destructive/30 bg-destructive/5 text-destructive"
      : tone === "warning"
        ? "border-warning/30 bg-warning/5 text-label-primary"
        : "border-border bg-muted/35 text-label-secondary";
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={`mx-6 mt-5 rounded-md border px-3 py-2 text-footnote ${toneClass}`}
    >
      {text}
    </div>
  );
}
