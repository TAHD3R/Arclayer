import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowUpRight, BookOpenText } from "lucide-react";
import { useTranslation } from "react-i18next";

import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { Alert, AlertDescription, AlertTitle } from "@arclayer/ui/alert";
import { Badge } from "@arclayer/ui/badge";
import { Button } from "@arclayer/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@arclayer/ui/empty";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";

import type { WorkspaceGuidanceController } from "./use-workspace-guidance-controller";

export function EffectivePreview({ controller }: { controller: WorkspaceGuidanceController }) {
  const { t } = useTranslation("knowledge");
  const effective = controller.effectiveQuery.data;

  return (
    <section
      className="rounded-xl border bg-card p-4 sm:p-5"
      aria-labelledby="guidance-effective-title"
    >
      <h2 id="guidance-effective-title" className="text-headline text-label-primary">
        {t("EFFECTIVE_TITLE")}
      </h2>
      <p className="mt-1 text-footnote leading-6 text-label-secondary">
        {t("EFFECTIVE_DESCRIPTION")}
      </p>

      <p className="mt-4 text-caption font-medium text-label-secondary">
        {t("EFFECTIVE_CURRENT_PROJECT")}
      </p>

      <ContentGuard
        className="mt-4"
        loading={controller.effectiveQuery.isLoading}
        error={controller.effectiveQuery.error}
        onRetry={() => void controller.effectiveQuery.refetch()}
        loadingVariant="form"
      >
        {effective ? <EffectiveContent controller={controller} /> : null}
      </ContentGuard>
    </section>
  );
}

function EffectiveContent({ controller }: { controller: WorkspaceGuidanceController }) {
  const { t } = useTranslation("knowledge");
  const effective = controller.effectiveQuery.data!;
  return (
    <div className="space-y-4">
      <div
        className="flex flex-wrap items-center gap-2"
        aria-label={t("EFFECTIVE_PRECEDENCE_LABEL")}
      >
        <span className="text-caption font-medium text-label-secondary">
          {t("EFFECTIVE_PRECEDENCE_LABEL")}
        </span>
        {(effective.precedence ?? []).map((scope) => (
          <Badge key={scope} variant="outline">
            {scope === "project" ? t("PRECEDENCE_PROJECT") : t("PRECEDENCE_WORKSPACE")}
          </Badge>
        ))}
      </div>
      {effective.conflicts?.map((conflict) => (
        <Alert key={conflict.code} variant="destructive">
          <AlertTitle>{t("CONFLICT_OVERRIDE_TITLE")}</AlertTitle>
          <AlertDescription>{t("CONFLICT_OVERRIDE_DESCRIPTION")}</AlertDescription>
        </Alert>
      ))}
      {effective.unavailable?.map((unavailable) => (
        <Alert key={unavailable.code}>
          <AlertTitle>{unavailableTitle(t, unavailable.code)}</AlertTitle>
          <AlertDescription>{unavailableDescription(t, unavailable.code)}</AlertDescription>
        </Alert>
      ))}
      {effective.effectiveContent ? (
        <div className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg border bg-muted/30 p-4 text-footnote leading-6 text-label-primary">
          {effective.effectiveContent}
        </div>
      ) : (
        <Empty className="min-h-40 border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BookOpenText aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>{t("EFFECTIVE_EMPTY_TITLE")}</EmptyTitle>
            <EmptyDescription>{t("EFFECTIVE_EMPTY_DESCRIPTION")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  );
}

export function GuidanceReferences({ controller }: { controller: WorkspaceGuidanceController }) {
  const { t } = useTranslation("knowledge");
  const [selectedReferenceId, setSelectedReferenceId] = useState<string | null>(null);
  const layer = controller.layer!;
  const bases = controller.referenceBasesQuery.data?.items ?? [];
  const baseById = useMemo(() => new Map(bases.map((base) => [base.id, base])), [bases]);
  const attachedIds = new Set(
    (layer.references ?? []).map((reference) => reference.knowledgeBaseId),
  );
  const availableBases = bases.filter(
    (base) => base.status === "active" && !attachedIds.has(base.id),
  );

  return (
    <section
      className="rounded-xl border bg-card p-4 sm:p-5"
      aria-labelledby="guidance-references-title"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="guidance-references-title" className="text-headline text-label-primary">
            {t("REFERENCES_TITLE")}
          </h2>
          <p className="mt-1 text-footnote leading-6 text-label-secondary">
            {t("REFERENCES_DESCRIPTION")}
          </p>
        </div>
        <Button asChild size="inline" variant="link" className="shrink-0">
          <Link to="/customization/knowledge/references">
            {t("REFERENCES_MANAGE_ACTION")}
            <ArrowUpRight aria-hidden="true" />
          </Link>
        </Button>
      </div>

      <ContentGuard
        className="mt-4"
        loading={controller.referenceBasesQuery.isLoading}
        error={controller.referenceBasesQuery.error}
        onRetry={() => void controller.referenceBasesQuery.refetch()}
        loadingVariant="form"
      >
        <div className="space-y-3">
          <Select value={selectedReferenceId ?? undefined} onValueChange={setSelectedReferenceId}>
            <SelectTrigger aria-label={t("REFERENCE_PICKER_LABEL")}>
              <SelectValue placeholder={t("REFERENCE_PICKER_PLACEHOLDER")} />
            </SelectTrigger>
            <SelectContent>
              {availableBases.map((base) => (
                <SelectItem key={base.id} value={base.id}>
                  {base.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            className="w-full"
            variant="outline"
            disabled={!selectedReferenceId || controller.attachReferenceMutation.isPending}
            loading={controller.attachReferenceMutation.isPending}
            onClick={() => {
              if (!selectedReferenceId) return;
              controller.attachReferenceMutation.mutate(selectedReferenceId, {
                onSuccess: () => setSelectedReferenceId(null),
              });
            }}
          >
            {t("REFERENCE_ATTACH_ACTION")}
          </Button>
        </div>

        {(layer.references ?? []).length ? (
          <div className="mt-4 space-y-2">
            {(layer.references ?? []).map((reference) => {
              const base = baseById.get(reference.knowledgeBaseId);
              return (
                <div key={reference.id} className="rounded-lg border p-3">
                  <p className="truncate text-footnote font-semibold text-label-primary">
                    {base?.name ?? reference.knowledgeBaseId}
                  </p>
                  <p className="mt-1 text-caption text-label-secondary">
                    {base
                      ? t("REFERENCE_FRESHNESS", {
                          ready: base.readySourceCount,
                          total: base.sourceCount,
                        })
                      : t("REFERENCE_METADATA_UNAVAILABLE")}
                  </p>
                  <Button
                    className="mt-2"
                    size="xs"
                    variant="ghost"
                    disabled={controller.detachReferenceMutation.isPending}
                    loading={controller.detachReferenceMutation.isPending}
                    onClick={() =>
                      controller.detachReferenceMutation.mutate(reference.knowledgeBaseId)
                    }
                  >
                    {t("REFERENCE_DETACH_ACTION")}
                  </Button>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mt-4 rounded-lg border border-dashed p-4 text-caption leading-5 text-label-secondary">
            {t("REFERENCES_EMPTY")}
          </p>
        )}
      </ContentGuard>
    </section>
  );
}

function unavailableTitle(t: (key: string) => string, code: string): string {
  return code.endsWith("removed")
    ? t("UNAVAILABLE_REMOVED_TITLE")
    : t("UNAVAILABLE_UNPUBLISHED_TITLE");
}

function unavailableDescription(t: (key: string) => string, code: string): string {
  return code.endsWith("removed")
    ? t("UNAVAILABLE_REMOVED_DESCRIPTION")
    : t("UNAVAILABLE_UNPUBLISHED_DESCRIPTION");
}
