import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@arclayer/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@arclayer/ui/sheet";

import { BaseTag } from "@/components/ui/tags";

import { ContentLibraryEditWithTag } from "./content-library-edit-with-tag";
import { ContentLibraryRoleTag, getContentLibraryRoleLabelKey } from "./content-library-role-tag";
import { ContentLibraryStatusTag } from "./content-library-status-tag";
import type {
  ContentLibrarySelectedPublishImpact,
  ContentLibrarySelectedSeo,
  ContentLibrarySelectedVersions,
  ContentLibraryTableRow,
} from "../types";
import { contentHasAddress } from "../utils";

function getLibraryGroupLabelKey(row: ContentLibraryTableRow) {
  if (row.libraryGroup === "site-content") return "CONTENT_LIBRARY_GROUP_SITE_CONTENT";
  if (row.libraryGroup === "structured-content") {
    return "CONTENT_LIBRARY_GROUP_STRUCTURED_CONTENT";
  }
  return "CONTENT_LIBRARY_GROUP_GENERAL_CONTENT";
}

function getVisibilityLabelKey(row: ContentLibraryTableRow) {
  if (row.visibility === "public") return "CONTENT_LIBRARY_VISIBILITY_PUBLIC";
  return "CONTENT_LIBRARY_VISIBILITY_PRIVATE";
}

function DrawerField(props: { label: string; value: ReactNode }) {
  return (
    <div className="grid gap-1">
      <div className="text-caption uppercase tracking-[0.16em] text-label-tertiary">
        {props.label}
      </div>
      <div className="text-body text-label-primary">{props.value}</div>
    </div>
  );
}

function DrawerStateText(props: { children: ReactNode }) {
  return <div className="text-footnote text-label-secondary">{props.children}</div>;
}

function VersionSummaryBlock(props: {
  label: string;
  version: ContentLibrarySelectedVersions["draft"];
  formatDateTimeOrNull?: (value: string | null | undefined) => string | null;
  t: (key: string) => string;
}) {
  if (!props.version) return <DrawerStateText>—</DrawerStateText>;

  return (
    <div className="grid gap-2 rounded-lg border border-border/70 bg-card/70 p-3">
      <div className="text-body font-medium text-label-primary">{props.label}</div>
      <DrawerField
        label={props.t("CONTENT_LIBRARY_FIELD_VERSION_NUMBER")}
        value={props.version.versionNumber}
      />
      <DrawerField
        label={props.t("CONTENT_LIBRARY_FIELD_VERSION_STATE")}
        value={props.version.state}
      />
      <DrawerField
        label={props.t("CONTENT_LIBRARY_FIELD_VERSION_CREATED")}
        value={props.formatDateTimeOrNull?.(props.version.createdAt) || props.version.createdAt}
      />
      {props.version.changeSummary ? (
        <DrawerField
          label={props.t("CONTENT_LIBRARY_FIELD_CHANGE_SUMMARY")}
          value={props.version.changeSummary}
        />
      ) : null}
    </div>
  );
}

export function ContentLibraryRecordDrawer(props: {
  row: ContentLibraryTableRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onContinue: (row: ContentLibraryTableRow) => void;
  continuePending?: boolean;
  formatDateTimeOrNull?: (value: string | null | undefined) => string | null;
  versions?: ContentLibrarySelectedVersions;
  seo?: ContentLibrarySelectedSeo;
  publishImpact?: ContentLibrarySelectedPublishImpact;
}) {
  const { t } = useTranslation("content");
  const row = props.row;

  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent side="right" className="w-[min(90vw,32rem)] sm:w-[32rem]">
        {row ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <SheetHeader>
              <SheetTitle>{t("CONTENT_LIBRARY_RECORD_DRAWER_TITLE")}</SheetTitle>
              <SheetDescription>{t("CONTENT_LIBRARY_RECORD_DRAWER_DESC")}</SheetDescription>
            </SheetHeader>

            <div className="flex flex-1 flex-col gap-6 px-4 pb-4">
              <section className="grid gap-3">
                <div className="text-caption uppercase tracking-[0.16em] text-label-tertiary">
                  {t("CONTENT_LIBRARY_RECORD_DRAWER_SECTION_IDENTITY")}
                </div>
                <div className="grid gap-2">
                  <div className="text-title3 text-label-primary">{row.name}</div>
                  <div className="flex flex-wrap gap-2">
                    <ContentLibraryRoleTag role={row.role} />
                    <BaseTag>{row.modelName || t("CONTENT_LIBRARY_ROW_UNTYPED")}</BaseTag>
                    <BaseTag color="blue">{t(getLibraryGroupLabelKey(row))}</BaseTag>
                    <ContentLibraryEditWithTag editWith={row.editWith} />
                  </div>
                </div>
                <DrawerField
                  label={t("CONTENT_LIBRARY_FIELD_ROLE")}
                  value={t(getContentLibraryRoleLabelKey(row.role))}
                />
                <DrawerField
                  label={t("CONTENT_LIBRARY_FIELD_MODEL")}
                  value={row.modelName || "—"}
                />
                <DrawerField
                  label={t("CONTENT_LIBRARY_FIELD_LIBRARY_GROUP")}
                  value={t(getLibraryGroupLabelKey(row))}
                />
                {row.modelDescription ? (
                  <DrawerField
                    label={t("CONTENT_LIBRARY_FIELD_MODEL_DESCRIPTION")}
                    value={row.modelDescription}
                  />
                ) : null}
              </section>

              <section className="grid gap-3">
                <div className="text-caption uppercase tracking-[0.16em] text-label-tertiary">
                  {t("CONTENT_LIBRARY_RECORD_DRAWER_SECTION_METADATA")}
                </div>
                {contentHasAddress(row) ? (
                  <DrawerField label={t("CONTENT_LIBRARY_FIELD_ADDRESS")} value={`/${row.slug}`} />
                ) : null}
                <DrawerField label={t("CONTENT_LIBRARY_FIELD_LOCALE")} value={row.locale} />
                <DrawerField
                  label={t("CONTENT_LIBRARY_FIELD_VISIBILITY")}
                  value={t(getVisibilityLabelKey(row))}
                />
              </section>

              <section className="grid gap-3">
                <div className="text-caption uppercase tracking-[0.16em] text-label-tertiary">
                  {t("CONTENT_LIBRARY_RECORD_DRAWER_SECTION_WORKFLOW")}
                </div>
                <DrawerField
                  label={t("CONTENT_LIBRARY_FIELD_STATUS")}
                  value={<ContentLibraryStatusTag status={row.derivedStatus} />}
                />
                <DrawerField
                  label={t("CONTENT_LIBRARY_FIELD_UPDATED")}
                  value={props.formatDateTimeOrNull?.(row.updatedAt) || row.updatedAt}
                />
              </section>

              <section className="grid gap-3">
                <div className="text-caption uppercase tracking-[0.16em] text-label-tertiary">
                  {t("CONTENT_LIBRARY_RECORD_DRAWER_SECTION_VERSIONS")}
                </div>
                {props.versions?.loading ? (
                  <DrawerStateText>{t("CONTENT_LIBRARY_SECONDARY_STATE_LOADING")}</DrawerStateText>
                ) : props.versions?.error ? (
                  <DrawerStateText>
                    {t("CONTENT_LIBRARY_SECONDARY_STATE_UNAVAILABLE")}
                  </DrawerStateText>
                ) : (
                  <div className="grid gap-3">
                    <VersionSummaryBlock
                      label={t("CONTENT_LIBRARY_VERSION_DRAFT")}
                      version={props.versions?.draft ?? null}
                      formatDateTimeOrNull={props.formatDateTimeOrNull}
                      t={t}
                    />
                    <VersionSummaryBlock
                      label={t("CONTENT_LIBRARY_VERSION_PUBLISHED")}
                      version={props.versions?.published ?? null}
                      formatDateTimeOrNull={props.formatDateTimeOrNull}
                      t={t}
                    />
                  </div>
                )}
              </section>

              <section className="grid gap-3">
                <div className="text-caption uppercase tracking-[0.16em] text-label-tertiary">
                  {t("CONTENT_LIBRARY_RECORD_DRAWER_SECTION_SEO")}
                </div>
                {!props.seo?.supported ? (
                  <DrawerStateText>{t("CONTENT_LIBRARY_SEO_UNSUPPORTED")}</DrawerStateText>
                ) : props.seo.loading ? (
                  <DrawerStateText>{t("CONTENT_LIBRARY_SECONDARY_STATE_LOADING")}</DrawerStateText>
                ) : props.seo.error ? (
                  <DrawerStateText>
                    {t("CONTENT_LIBRARY_SECONDARY_STATE_UNAVAILABLE")}
                  </DrawerStateText>
                ) : props.seo.data ? (
                  <div className="grid gap-2 rounded-lg border border-border/70 bg-card/70 p-3">
                    <DrawerField
                      label={t("CONTENT_LIBRARY_SEO_META_TITLE")}
                      value={props.seo.data.metaTitle || "—"}
                    />
                    <DrawerField
                      label={t("CONTENT_LIBRARY_SEO_META_DESCRIPTION")}
                      value={props.seo.data.metaDescription || "—"}
                    />
                    {props.seo.data.canonicalUrl ? (
                      <DrawerField
                        label={t("CONTENT_LIBRARY_SEO_CANONICAL_URL")}
                        value={props.seo.data.canonicalUrl}
                      />
                    ) : null}
                    {props.seo.data.robotsDirective ? (
                      <DrawerField
                        label={t("CONTENT_LIBRARY_SEO_ROBOTS")}
                        value={props.seo.data.robotsDirective}
                      />
                    ) : null}
                  </div>
                ) : (
                  <DrawerStateText>{t("CONTENT_LIBRARY_SEO_EMPTY")}</DrawerStateText>
                )}
              </section>

              <section className="grid gap-3">
                <div className="text-caption uppercase tracking-[0.16em] text-label-tertiary">
                  {t("CONTENT_LIBRARY_RECORD_DRAWER_SECTION_PUBLISH_IMPACT")}
                </div>
                {props.publishImpact?.loading ? (
                  <DrawerStateText>{t("CONTENT_LIBRARY_SECONDARY_STATE_LOADING")}</DrawerStateText>
                ) : props.publishImpact?.error ? (
                  <DrawerStateText>
                    {t("CONTENT_LIBRARY_SECONDARY_STATE_UNAVAILABLE")}
                  </DrawerStateText>
                ) : props.publishImpact?.hasBlockers ? (
                  <div className="flex flex-wrap gap-2">
                    {props.publishImpact.missingRoute ? (
                      <BaseTag color="red">
                        {t("CONTENT_LIBRARY_PUBLISH_IMPACT_MISSING_ROUTE")}
                      </BaseTag>
                    ) : null}
                    {props.publishImpact.unresolvedRelations ? (
                      <BaseTag color="red">
                        {t("CONTENT_LIBRARY_PUBLISH_IMPACT_UNRESOLVED_RELATIONS")}
                      </BaseTag>
                    ) : null}
                    {props.publishImpact.unpublishedDependencies ? (
                      <BaseTag color="red">
                        {t("CONTENT_LIBRARY_PUBLISH_IMPACT_UNPUBLISHED_DEPENDENCIES")}
                      </BaseTag>
                    ) : null}
                  </div>
                ) : (
                  <DrawerStateText>{t("CONTENT_LIBRARY_PUBLISH_IMPACT_CLEAR")}</DrawerStateText>
                )}
              </section>

              <section className="grid gap-3">
                <div className="text-caption uppercase tracking-[0.16em] text-label-tertiary">
                  {t("CONTENT_LIBRARY_RECORD_DRAWER_SECTION_CONTINUE")}
                </div>
                <DrawerField
                  label={t("CONTENT_LIBRARY_FIELD_NEXT_SURFACE")}
                  value={<ContentLibraryEditWithTag editWith={row.editWith} />}
                />
                <Button
                  type="button"
                  onClick={() => props.onContinue(row)}
                  loading={props.continuePending}
                >
                  {t("CONTENT_LIBRARY_ACTION_CONTINUE")}
                </Button>
              </section>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
