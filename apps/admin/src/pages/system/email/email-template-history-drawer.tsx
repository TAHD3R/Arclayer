import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { CircleUserRound, History, RotateCcw, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Avatar, AvatarFallback, AvatarImage } from "@arclayer/ui/avatar";
import { Button } from "@arclayer/ui/button";
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@arclayer/ui/drawer";
import { Skeleton } from "@arclayer/ui/skeleton";

import {
  getMailTemplateRevision,
  listMailTemplateHistory,
  type MailTemplateGroup,
  type MailTemplateRevision,
  type MailTemplateRevisionDetail,
} from "@/api/mail";
import { LocaleFlag } from "@/components/ui/tags";
import { BaseTag } from "@/components/ui/tags";
import { useAdminDateTimeFormatter } from "@/hooks/use-admin-date-time-formatter";
import { getLocaleMetadata } from "@/lib/i18n";

const HISTORY_PAGE_SIZE = 20;

type RevisionField = {
  key: string;
  labelKey: string;
  value: (revision: MailTemplateRevisionDetail) => string;
  multiline?: boolean;
};

type RevisionFieldComparison = {
  field: RevisionField;
  currentValue: string;
  baselineValue: string | null;
  changed: boolean;
};

const REVISION_FIELDS: RevisionField[] = [
  {
    key: "name",
    labelKey: "SETTINGS_SYSTEM_EMAIL_TEMPLATE_NAME_LABEL",
    value: (revision) => revision.name,
  },
  {
    key: "description",
    labelKey: "SETTINGS_SYSTEM_EMAIL_TEMPLATE_DESCRIPTION_LABEL",
    value: (revision) => revision.description ?? "-",
  },
  {
    key: "subject_template",
    labelKey: "SETTINGS_SYSTEM_EMAIL_TEMPLATE_SUBJECT_LABEL",
    value: (revision) => revision.subjectTemplate,
  },
  {
    key: "variables",
    labelKey: "SETTINGS_SYSTEM_EMAIL_TEMPLATE_VARIABLES_LABEL",
    value: (revision) => revision.variables.join(", ") || "-",
  },
  {
    key: "html_template",
    labelKey: "SETTINGS_SYSTEM_EMAIL_TEMPLATE_HTML_LABEL",
    value: (revision) => revision.htmlTemplate,
    multiline: true,
  },
  {
    key: "text_template",
    labelKey: "SETTINGS_SYSTEM_EMAIL_TEMPLATE_TEXT_LABEL",
    value: (revision) => revision.textTemplate,
    multiline: true,
  },
  {
    key: "is_enabled",
    labelKey: "SETTINGS_SYSTEM_EMAIL_TEMPLATE_ENABLED_LABEL",
    value: (revision) => String(revision.isEnabled),
  },
];

function compareRevisionFields(
  current: MailTemplateRevisionDetail,
  baseline: MailTemplateRevisionDetail | null,
): RevisionFieldComparison[] {
  return REVISION_FIELDS.map((field) => {
    const currentValue = field.value(current);
    const baselineValue = baseline ? field.value(baseline) : null;
    return {
      field,
      currentValue,
      baselineValue,
      changed: baselineValue === null || currentValue !== baselineValue,
    };
  });
}

function actionIcon(action: MailTemplateRevision["action"]) {
  if (action === "restored") return <RotateCcw className="size-3.5" />;
  if (action === "deleted") return <Trash2 className="size-3.5" />;
  return <History className="size-3.5" />;
}

function actorInitials(revision: MailTemplateRevision) {
  const value = revision.actor?.displayName || revision.actor?.username || "S";
  return value.slice(0, 2).toUpperCase();
}

function findPreviousLocaleRevision(
  revisions: readonly MailTemplateRevision[],
  selected: MailTemplateRevision | null,
) {
  if (!selected) return null;
  const selectedIndex = revisions.findIndex((revision) => revision.id === selected.id);
  if (selectedIndex < 0) return null;
  return (
    revisions.slice(selectedIndex + 1).find((revision) => revision.locale === selected.locale) ??
    null
  );
}

function RevisionListItem(props: {
  revision: MailTemplateRevision;
  active: boolean;
  formatDateTime: (value: string) => string;
  onSelect: () => void;
}) {
  const { t } = useTranslation("settings");
  const actorName =
    props.revision.actor?.displayName ||
    props.revision.actor?.username ||
    t("SETTINGS_SYSTEM_EMAIL_TEMPLATE_HISTORY_SYSTEM_ACTOR");
  return (
    <button
      type="button"
      aria-pressed={props.active}
      onClick={props.onSelect}
      className="w-full rounded-lg border p-3 text-left transition-colors hover:bg-muted/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-pressed:border-primary/35 aria-pressed:bg-primary/5"
    >
      <div className="flex items-start gap-3">
        <Avatar className="size-8 shrink-0">
          {props.revision.actor?.avatarUrl ? (
            <AvatarImage src={props.revision.actor.avatarUrl} alt="" />
          ) : null}
          <AvatarFallback className="text-caption">{actorInitials(props.revision)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-footnote font-semibold text-label-primary">
              v{props.revision.version}
            </span>
            <BaseTag color={props.revision.action === "deleted" ? "red" : "default"}>
              {actionIcon(props.revision.action)}
              {t(
                `SETTINGS_SYSTEM_EMAIL_TEMPLATE_HISTORY_ACTION_${props.revision.action.toUpperCase()}`,
              )}
            </BaseTag>
            <BaseTag color="default">
              <LocaleFlag locale={props.revision.locale} />
              {props.revision.locale}
            </BaseTag>
          </div>
          <p className="mt-2 truncate text-footnote font-medium text-label-primary">{actorName}</p>
          <p className="mt-0.5 text-caption text-label-tertiary">
            {props.formatDateTime(props.revision.createdAt)}
          </p>
        </div>
      </div>
    </button>
  );
}

function DiffValue(props: { value: string; multiline?: boolean }) {
  return props.multiline ? (
    <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/45 p-3 font-mono text-caption leading-5 text-label-secondary">
      {props.value}
    </pre>
  ) : (
    <p className="break-words text-footnote leading-6 text-label-primary">{props.value}</p>
  );
}

function RevisionDiff(props: { comparisons: RevisionFieldComparison[] }) {
  const { t } = useTranslation("settings");
  return (
    <div className="space-y-3">
      {props.comparisons.map(({ field, currentValue, baselineValue, changed }) => {
        return (
          <section key={field.key} className="rounded-lg border p-3.5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h4 className="text-footnote font-semibold text-label-primary">
                {t(field.labelKey)}
              </h4>
              <BaseTag color={changed ? "blue" : "default"}>
                {t(
                  changed
                    ? "SETTINGS_SYSTEM_EMAIL_TEMPLATE_HISTORY_CHANGED"
                    : "SETTINGS_SYSTEM_EMAIL_TEMPLATE_HISTORY_UNCHANGED",
                )}
              </BaseTag>
            </div>
            {changed ? (
              <div className="grid gap-3 lg:grid-cols-2">
                <div className="min-w-0">
                  <p className="mb-1.5 text-caption text-label-tertiary">
                    {t("SETTINGS_SYSTEM_EMAIL_TEMPLATE_HISTORY_BEFORE")}
                  </p>
                  {baselineValue === null ? (
                    <p className="text-footnote text-label-tertiary">
                      {t("SETTINGS_SYSTEM_EMAIL_TEMPLATE_HISTORY_NO_BASELINE")}
                    </p>
                  ) : (
                    <DiffValue value={baselineValue} multiline={field.multiline} />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="mb-1.5 text-caption text-label-tertiary">
                    {t("SETTINGS_SYSTEM_EMAIL_TEMPLATE_HISTORY_AFTER")}
                  </p>
                  <DiffValue value={currentValue} multiline={field.multiline} />
                </div>
              </div>
            ) : (
              <p className="truncate text-footnote text-label-secondary">{currentValue}</p>
            )}
          </section>
        );
      })}
    </div>
  );
}

export function EmailTemplateHistoryDrawer(props: {
  open: boolean;
  group: MailTemplateGroup | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation("settings");
  const dateTime = useAdminDateTimeFormatter({ workspaceId: null });
  const [locale, setLocale] = useState<string | null>(null);
  const [selectedRevisionId, setSelectedRevisionId] = useState<string | null>(null);
  const group = props.group;
  const historyQuery = useInfiniteQuery({
    queryKey: ["system", "mail", "template-history", group?.key, locale],
    queryFn: ({ pageParam, signal }) => {
      if (!group) throw new Error("MAIL_TEMPLATE_HISTORY_GROUP_REQUIRED");
      return listMailTemplateHistory(
        group.key,
        { page: pageParam, size: HISTORY_PAGE_SIZE, ...(locale ? { locale } : {}) },
        signal,
      );
    },
    initialPageParam: 1,
    getNextPageParam: (page) => page.next ?? undefined,
    enabled: props.open && Boolean(group),
  });
  const revisions = useMemo(
    () => historyQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [historyQuery.data?.pages],
  );
  const selectedIndex = revisions.findIndex((item) => item.id === selectedRevisionId);
  const effectiveIndex = selectedIndex >= 0 ? selectedIndex : 0;
  const selected = revisions[effectiveIndex] ?? null;
  const baseline = findPreviousLocaleRevision(revisions, selected);
  const currentQuery = useQuery({
    queryKey: ["system", "mail", "template-revision", selected?.id],
    queryFn: ({ signal }) => {
      if (!selected) throw new Error("MAIL_TEMPLATE_REVISION_REQUIRED");
      return getMailTemplateRevision(selected.id, signal);
    },
    enabled: props.open && Boolean(selected),
  });
  const baselineQuery = useQuery({
    queryKey: ["system", "mail", "template-revision", baseline?.id],
    queryFn: ({ signal }) => {
      if (!baseline) throw new Error("MAIL_TEMPLATE_REVISION_REQUIRED");
      return getMailTemplateRevision(baseline.id, signal);
    },
    enabled: props.open && Boolean(baseline),
  });
  const comparisons = useMemo(() => {
    if (!currentQuery.data || (baseline && !baselineQuery.data)) return null;
    return compareRevisionFields(currentQuery.data, baselineQuery.data ?? null);
  }, [baseline, baselineQuery.data, currentQuery.data]);
  const changedFieldCount = comparisons?.filter((comparison) => comparison.changed).length ?? null;

  return (
    <Drawer open={props.open} onOpenChange={props.onOpenChange} direction="right">
      <DrawerContent className="w-full sm:max-w-5xl">
        <DrawerHeader className="max-w-none gap-1 rounded-none px-5 py-4 pr-14 text-left">
          <DrawerTitle>{t("SETTINGS_SYSTEM_EMAIL_TEMPLATE_HISTORY_TITLE")}</DrawerTitle>
          <DrawerDescription>
            {t("SETTINGS_SYSTEM_EMAIL_TEMPLATE_HISTORY_DESC", {
              name: group?.name ?? "",
            })}
          </DrawerDescription>
        </DrawerHeader>
        <DrawerBody className="min-h-0 max-w-none flex-1 overflow-hidden p-0">
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex flex-wrap gap-2 border-b px-5 py-3">
              <Button
                type="button"
                size="sm"
                variant={locale === null ? "secondary" : "ghost"}
                onClick={() => setLocale(null)}
              >
                {t("SETTINGS_SYSTEM_EMAIL_TEMPLATE_HISTORY_ALL_LANGUAGES")}
              </Button>
              {group?.locales.map((item) => {
                const metadata = getLocaleMetadata(item.locale, t);
                return (
                  <Button
                    key={item.locale}
                    type="button"
                    size="sm"
                    variant={locale === item.locale ? "secondary" : "ghost"}
                    onClick={() => setLocale(item.locale)}
                  >
                    <LocaleFlag locale={item.locale} />
                    {metadata.label}
                  </Button>
                );
              })}
            </div>

            {historyQuery.isLoading ? (
              <div className="grid min-h-0 flex-1 gap-0 md:grid-cols-[20rem_minmax(0,1fr)]">
                <div className="space-y-3 border-r p-4">
                  {Array.from({ length: 4 }, (_, index) => (
                    <Skeleton key={index} className="h-28 rounded-lg" />
                  ))}
                </div>
                <div className="space-y-3 p-5">
                  {Array.from({ length: 5 }, (_, index) => (
                    <Skeleton key={index} className="h-24 rounded-lg" />
                  ))}
                </div>
              </div>
            ) : historyQuery.error ? (
              <div className="m-auto flex max-w-sm flex-col items-center gap-3 p-8 text-center">
                <History className="size-8 text-label-tertiary" />
                <p className="text-body text-label-secondary">
                  {t("SETTINGS_SYSTEM_EMAIL_TEMPLATE_HISTORY_LOAD_ERROR")}
                </p>
                <Button type="button" variant="outline" onClick={() => void historyQuery.refetch()}>
                  {t("SETTINGS_SYSTEM_EMAIL_TEMPLATE_HISTORY_RETRY")}
                </Button>
              </div>
            ) : revisions.length === 0 ? (
              <div className="m-auto flex max-w-sm flex-col items-center gap-3 p-8 text-center">
                <CircleUserRound className="size-8 text-label-tertiary" />
                <p className="text-body text-label-secondary">
                  {t("SETTINGS_SYSTEM_EMAIL_TEMPLATE_HISTORY_EMPTY")}
                </p>
              </div>
            ) : (
              <div className="grid min-h-0 flex-1 md:grid-cols-[20rem_minmax(0,1fr)]">
                <aside className="min-h-0 overflow-y-auto border-b p-4 md:border-r md:border-b-0">
                  <div className="space-y-2">
                    {revisions.map((revision) => (
                      <RevisionListItem
                        key={revision.id}
                        revision={revision}
                        active={revision.id === selected?.id}
                        formatDateTime={dateTime.formatDateTime}
                        onSelect={() => setSelectedRevisionId(revision.id)}
                      />
                    ))}
                  </div>
                  {historyQuery.hasNextPage ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="mt-3 w-full"
                      loading={historyQuery.isFetchingNextPage}
                      onClick={() => void historyQuery.fetchNextPage()}
                    >
                      {t("SETTINGS_SYSTEM_EMAIL_TEMPLATE_HISTORY_LOAD_MORE")}
                    </Button>
                  ) : null}
                </aside>
                <main className="min-h-0 overflow-y-auto p-5">
                  <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b pb-4">
                    <div>
                      <h3 className="text-headline text-label-primary">
                        {t("SETTINGS_SYSTEM_EMAIL_TEMPLATE_HISTORY_COMPARE_TITLE", {
                          version: selected?.version ?? "-",
                        })}
                      </h3>
                      <p className="mt-1 text-footnote text-label-secondary">
                        {baseline
                          ? t("SETTINGS_SYSTEM_EMAIL_TEMPLATE_HISTORY_COMPARE_DESC", {
                              before: baseline.version,
                              after: selected?.version ?? "-",
                            })
                          : t("SETTINGS_SYSTEM_EMAIL_TEMPLATE_HISTORY_COMPARE_INITIAL")}
                      </p>
                    </div>
                    {changedFieldCount !== null ? (
                      <BaseTag color="default">
                        {changedFieldCount
                          ? t("SETTINGS_SYSTEM_EMAIL_TEMPLATE_HISTORY_CHANGED_COUNT", {
                              count: changedFieldCount,
                            })
                          : t("SETTINGS_SYSTEM_EMAIL_TEMPLATE_HISTORY_LIFECYCLE_ONLY")}
                      </BaseTag>
                    ) : null}
                  </div>
                  {currentQuery.isLoading || (baseline && baselineQuery.isLoading) ? (
                    <div className="space-y-3">
                      {Array.from({ length: 5 }, (_, index) => (
                        <Skeleton key={index} className="h-24 rounded-lg" />
                      ))}
                    </div>
                  ) : currentQuery.error || baselineQuery.error ? (
                    <div className="rounded-lg border border-destructive/25 bg-destructive/5 p-4">
                      <p className="text-footnote text-destructive">
                        {t("SETTINGS_SYSTEM_EMAIL_TEMPLATE_HISTORY_DETAIL_ERROR")}
                      </p>
                    </div>
                  ) : comparisons ? (
                    <RevisionDiff comparisons={comparisons} />
                  ) : null}
                </main>
              </div>
            )}
          </div>
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}
