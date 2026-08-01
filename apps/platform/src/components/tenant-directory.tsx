import { useEffect, useState, type ReactNode } from "react";
import { AlertCircle, ChevronLeft, ChevronRight, RefreshCw, Search } from "lucide-react";
import { useTranslation } from "react-i18next";

import { TenantDirectoryApiError } from "@/api/tenant-directory";
import { SavedViewsControl } from "@/saved-views/saved-views-control";
import type { SavedViewDefinition, SavedViewState } from "@/saved-views/saved-view-contracts";
import { Alert, AlertDescription, AlertTitle } from "@arclayer/ui/alert";
import { Button } from "@arclayer/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@arclayer/ui/empty";
import { Input } from "@arclayer/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@arclayer/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@arclayer/ui/table";

export type DirectoryPage<T> = Readonly<{
  items?: T[];
  page: number;
  pages: number;
  total: number;
}>;

export type DirectoryColumn<T> = Readonly<{
  label: string;
  render: (item: T) => ReactNode;
}>;

type DirectoryRequestState<T> =
  | Readonly<{ type: "loading" }>
  | Readonly<{ type: "ready"; page: DirectoryPage<T>; refreshing: boolean }>
  | Readonly<{
      type: "error";
      error: TenantDirectoryApiError;
      previous?: DirectoryPage<T>;
    }>;

export function normalizeDirectoryError(error: unknown): TenantDirectoryApiError {
  if (error instanceof TenantDirectoryApiError) return error;
  return new TenantDirectoryApiError(
    error instanceof TypeError
      ? "TENANT_DIRECTORY_NETWORK_ERROR"
      : "TENANT_DIRECTORY_REQUEST_FAILED",
  );
}

export function TenantDirectoryTable<T>(props: {
  title: string;
  description: string;
  detailTitle: string;
  detailDescription: string;
  searchPlaceholder: string;
  searchValue?: string;
  hasFilters: boolean;
  filters: ReactNode;
  columns: readonly DirectoryColumn<T>[];
  load: () => Promise<DirectoryPage<T>>;
  onSearchChange: (value: string | undefined) => void;
  onPageChange: (page: number) => void;
  itemKey: (item: T) => string;
  identity: (item: T) => ReactNode;
  loadDetail: (item: T, onChanged: () => void) => Promise<ReactNode>;
  partial?: (items: readonly T[]) => ReactNode;
  savedViews?: Readonly<{
    definition: SavedViewDefinition;
    state: SavedViewState;
    onApply: (state: SavedViewState) => void;
  }>;
}) {
  const { t } = useTranslation("tenants");
  const [request, setRequest] = useState<DirectoryRequestState<T>>({ type: "loading" });
  const [reloadRevision, setReloadRevision] = useState(0);
  const [search, setSearch] = useState(props.searchValue ?? "");
  const [selected, setSelected] = useState<T | null>(null);
  const [detail, setDetail] = useState<
    | Readonly<{ type: "loading" }>
    | Readonly<{ type: "ready"; content: ReactNode }>
    | Readonly<{ type: "error"; error: TenantDirectoryApiError }>
  >({ type: "loading" });

  useEffect(() => setSearch(props.searchValue ?? ""), [props.searchValue]);
  useEffect(() => {
    let current = true;
    setRequest((current) =>
      current.type === "ready" ? { ...current, refreshing: true } : { type: "loading" },
    );
    void props.load().then(
      (page) => current && setRequest({ type: "ready", page, refreshing: false }),
      (error: unknown) =>
        current &&
        setRequest((previous) => ({
          type: "error",
          error: normalizeDirectoryError(error),
          previous: previous.type === "ready" ? previous.page : undefined,
        })),
    );
    return () => {
      current = false;
    };
  }, [props.load, reloadRevision]);
  useEffect(() => {
    if (!selected) return;
    let current = true;
    setDetail({ type: "loading" });
    void props
      .loadDetail(selected, () => setReloadRevision((current) => current + 1))
      .then(
        (content) => current && setDetail({ type: "ready", content }),
        (error: unknown) =>
          current && setDetail({ type: "error", error: normalizeDirectoryError(error) }),
      );
    return () => {
      current = false;
    };
  }, [props.loadDetail, selected]);

  const displayedPage =
    request.type === "ready"
      ? request.page
      : request.type === "error"
        ? request.previous
        : undefined;
  const isEmpty = Boolean(displayedPage && (displayedPage.items?.length ?? 0) === 0);
  const errorKey =
    request.type !== "error"
      ? null
      : request.error.status === 401 || request.error.status === 403
        ? "PERMISSION_ERROR"
        : request.error.code === "TENANT_DIRECTORY_NETWORK_ERROR"
          ? "NETWORK_ERROR"
          : "SERVER_ERROR";

  return (
    <section className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-5 py-8 md:px-8 md:py-10">
      <header className="max-w-3xl space-y-2">
        <h1 className="text-largetitle">{props.title}</h1>
        <p className="text-body text-label-secondary">{props.description}</p>
      </header>
      <form
        className="flex flex-col gap-3 border-y py-4 sm:flex-row sm:items-center"
        onSubmit={(event) => {
          event.preventDefault();
          props.onSearchChange(search.trim() || undefined);
        }}
      >
        <div className="relative min-w-0 flex-1">
          <Search
            aria-hidden="true"
            className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-label-secondary"
          />
          <Input
            aria-label={t("SEARCH")}
            className="pl-9"
            onChange={(event) => setSearch(event.target.value)}
            placeholder={props.searchPlaceholder}
            value={search}
          />
        </div>
        {props.filters}
        {props.savedViews ? <SavedViewsControl {...props.savedViews} /> : null}
        <Button
          aria-label={t("REFRESH")}
          disabled={request.type === "ready" && request.refreshing}
          onClick={() => setReloadRevision((current) => current + 1)}
          size="icon"
          type="button"
          variant="outline"
        >
          <RefreshCw
            aria-hidden="true"
            className={request.type === "ready" && request.refreshing ? "animate-spin" : undefined}
          />
        </Button>
        <Button type="submit" variant="secondary">
          {t("SEARCH")}
        </Button>
      </form>
      {displayedPage && props.partial?.(displayedPage.items ?? [])}
      {request.type === "error" ? (
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertTitle>{t(errorKey!)}</AlertTitle>
          <AlertDescription>{t(`${errorKey}_DESCRIPTION`)}</AlertDescription>
        </Alert>
      ) : null}
      {request.type === "loading" ? <DirectoryLoading /> : null}
      {isEmpty ? <DirectoryEmpty filtered={props.hasFilters} /> : null}
      {displayedPage && !isEmpty ? (
        <div className="overflow-hidden rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("IDENTITY")}</TableHead>
                {props.columns.map((column) => (
                  <TableHead key={column.label}>{column.label}</TableHead>
                ))}
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayedPage.items?.map((item) => (
                <TableRow key={props.itemKey(item)}>
                  <TableCell>{props.identity(item)}</TableCell>
                  {props.columns.map((column) => (
                    <TableCell key={column.label}>{column.render(item)}</TableCell>
                  ))}
                  <TableCell>
                    <Button onClick={() => setSelected(item)} size="sm" variant="ghost">
                      {t("OPEN")}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
      {displayedPage && !isEmpty ? (
        <nav
          aria-label={t("PAGINATION")}
          className="flex items-center justify-end gap-3 text-footnote text-label-secondary"
        >
          <span>
            {t("PAGE_OF", {
              page: displayedPage.page,
              pages: displayedPage.pages,
              total: displayedPage.total,
            })}
          </span>
          <Button
            aria-label={t("PREVIOUS_PAGE")}
            disabled={displayedPage.page <= 1 || (request.type === "ready" && request.refreshing)}
            onClick={() => props.onPageChange(displayedPage.page - 1)}
            size="icon-sm"
            variant="outline"
          >
            <ChevronLeft />
          </Button>
          <Button
            aria-label={t("NEXT_PAGE")}
            disabled={
              displayedPage.page >= displayedPage.pages ||
              (request.type === "ready" && request.refreshing)
            }
            onClick={() => props.onPageChange(displayedPage.page + 1)}
            size="icon-sm"
            variant="outline"
          >
            <ChevronRight />
          </Button>
        </nav>
      ) : null}
      <Sheet onOpenChange={(open) => !open && setSelected(null)} open={selected !== null}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{props.detailTitle}</SheetTitle>
            <SheetDescription>{props.detailDescription}</SheetDescription>
          </SheetHeader>
          {selected && detail.type === "loading" ? (
            <div className="mt-6" role="status">
              {t("LOADING")}
            </div>
          ) : null}
          {selected && detail.type === "ready" ? (
            <div className="mt-6">{detail.content}</div>
          ) : null}
          {selected && detail.type === "error" ? (
            <Alert className="mt-6" variant="destructive">
              <AlertCircle aria-hidden="true" />
              <AlertTitle>
                {t(
                  detail.error.status === 401 || detail.error.status === 403
                    ? "PERMISSION_ERROR"
                    : "SERVER_ERROR",
                )}
              </AlertTitle>
              <AlertDescription>{t("DETAIL_ERROR_DESCRIPTION")}</AlertDescription>
            </Alert>
          ) : null}
        </SheetContent>
      </Sheet>
    </section>
  );
}

function DirectoryLoading() {
  const { t } = useTranslation("tenants");
  return (
    <div className="rounded-lg border bg-card p-8 text-body text-label-secondary" role="status">
      {t("LOADING")}
    </div>
  );
}

function DirectoryEmpty(props: { filtered: boolean }) {
  const { t } = useTranslation("tenants");
  return (
    <Empty className="border bg-card">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Search />
        </EmptyMedia>
        <EmptyTitle>{t(props.filtered ? "FILTERED_EMPTY_TITLE" : "EMPTY_TITLE")}</EmptyTitle>
        <EmptyDescription>
          {t(props.filtered ? "FILTERED_EMPTY_DESCRIPTION" : "EMPTY_DESCRIPTION")}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
