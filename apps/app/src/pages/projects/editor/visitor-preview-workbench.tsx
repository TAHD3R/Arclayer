import { useQuery } from "@tanstack/react-query";
import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { SiteRenderer } from "@arclayer/site-renderer";
import { Button } from "@arclayer/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@arclayer/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";
import { Laptop, LoaderCircle, Monitor, RefreshCw, Smartphone, Tablet } from "lucide-react";

import {
  buildProjectBuilderPageRenderDocumentQueryKey,
  getProjectBuilderPageRenderDocument,
} from "@/api/project-builder";
import { getErrorMessage } from "@/lib/notifications";

type PreviewViewport = "desktop" | "tablet" | "mobile";

const VIEWPORTS = [
  { key: "desktop", icon: Monitor, widthClassName: "max-w-[90rem]" },
  { key: "tablet", icon: Tablet, widthClassName: "max-w-[48rem]" },
  { key: "mobile", icon: Smartphone, widthClassName: "max-w-[24rem]" },
] as const satisfies ReadonlyArray<{
  key: PreviewViewport;
  icon: typeof Monitor;
  widthClassName: string;
}>;

interface VisitorPreviewWorkbenchProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectName: string;
  revisionId: string;
  revisionNumber: number;
  pageItemId: string;
  pageTitle: string;
  availableLocales: readonly string[];
}

export function VisitorPreviewWorkbench({
  open,
  onOpenChange,
  projectId,
  projectName,
  revisionId,
  revisionNumber,
  pageItemId,
  pageTitle,
  availableLocales,
}: VisitorPreviewWorkbenchProps) {
  const { t } = useTranslation("account");
  const [viewport, setViewport] = useState<PreviewViewport>("desktop");
  const [locale, setLocale] = useState(availableLocales[0] ?? "");
  const online = useOnlineStatus();
  const selectedViewport = VIEWPORTS.find((item) => item.key === viewport) ?? VIEWPORTS[0];

  useEffect(() => {
    if (availableLocales.includes(locale)) return;
    setLocale(availableLocales[0] ?? "");
  }, [availableLocales, locale]);

  const renderQuery = useQuery({
    queryKey: buildProjectBuilderPageRenderDocumentQueryKey(
      projectId,
      revisionId,
      pageItemId,
      locale || null,
      null,
    ),
    queryFn: ({ signal }) =>
      getProjectBuilderPageRenderDocument(projectId, revisionId, pageItemId, locale, null, signal),
    enabled: open && online && Boolean(locale),
    retry: false,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="h-[calc(100dvh-1rem)] max-h-none w-[calc(100vw-1rem)] max-w-none! gap-0 overflow-hidden rounded-xl border-white/10 bg-[#101114] p-0 text-white shadow-2xl"
        closeButtonClassName="text-white/70 hover:bg-white/10 hover:text-white"
        closeButtonLabel={t("CREATION_EDITOR_PREVIEW_CLOSE")}
        overlayClassName="bg-black/65 backdrop-blur-md"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{t("CREATION_EDITOR_PREVIEW_TITLE", { page: pageTitle })}</DialogTitle>
          <DialogDescription>{t("CREATION_EDITOR_PREVIEW_DESC")}</DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col">
          <PreviewToolbar
            projectName={projectName}
            pageTitle={pageTitle}
            revisionNumber={revisionNumber}
            locale={locale}
            locales={availableLocales}
            viewport={viewport}
            theme={renderQuery.data?.theme.key ?? null}
            onLocaleChange={setLocale}
            onViewportChange={setViewport}
          />
          <div className="relative min-h-0 flex-1 overflow-auto bg-[#0b0c0f] px-3 py-4 sm:px-6 sm:py-7">
            <div
              className={`mx-auto min-h-full w-full overflow-hidden rounded-lg border border-white/10 bg-white shadow-[0_24px_90px_rgba(0,0,0,0.45)] transition-[max-width] duration-300 ease-out motion-reduce:transition-none ${selectedViewport.widthClassName}`}
              data-testid="visitor-preview-plane"
              data-viewport={viewport}
            >
              {!online ? (
                <PreviewState
                  icon={Laptop}
                  title={t("CREATION_EDITOR_PREVIEW_OFFLINE_TITLE")}
                  description={t("CREATION_EDITOR_PREVIEW_OFFLINE_DESC")}
                />
              ) : renderQuery.isPending ? (
                <PreviewState
                  spinning
                  icon={LoaderCircle}
                  title={t("CREATION_EDITOR_PREVIEW_LOADING_TITLE")}
                  description={t("CREATION_EDITOR_PREVIEW_LOADING_DESC")}
                />
              ) : renderQuery.error ? (
                <PreviewState
                  icon={RefreshCw}
                  title={t("CREATION_EDITOR_PREVIEW_ERROR_TITLE")}
                  description={getErrorMessage(
                    renderQuery.error,
                    t("CREATION_EDITOR_PREVIEW_ERROR_DESC"),
                  )}
                  action={
                    <Button size="sm" onClick={() => void renderQuery.refetch()}>
                      {t("CREATION_EDITOR_RETRY")}
                    </Button>
                  }
                />
              ) : renderQuery.data ? (
                <PreviewRendererBoundary
                  documentHash={renderQuery.data.documentHash}
                  title={t("CREATION_EDITOR_PREVIEW_RENDER_ERROR_TITLE")}
                  description={t("CREATION_EDITOR_PREVIEW_RENDER_ERROR_DESC")}
                  retryLabel={t("CREATION_EDITOR_RETRY")}
                  onRetry={() => void renderQuery.refetch()}
                >
                  <SiteRenderer document={renderQuery.data} interactionMode="read-only" />
                </PreviewRendererBoundary>
              ) : (
                <PreviewState
                  icon={Monitor}
                  title={t("CREATION_EDITOR_PREVIEW_EMPTY_TITLE")}
                  description={t("CREATION_EDITOR_PREVIEW_EMPTY_DESC")}
                />
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PreviewToolbar({
  projectName,
  pageTitle,
  revisionNumber,
  locale,
  locales,
  viewport,
  theme,
  onLocaleChange,
  onViewportChange,
}: Readonly<{
  projectName: string;
  pageTitle: string;
  revisionNumber: number;
  locale: string;
  locales: readonly string[];
  viewport: PreviewViewport;
  theme: string | null;
  onLocaleChange: (locale: string) => void;
  onViewportChange: (viewport: PreviewViewport) => void;
}>) {
  const { t } = useTranslation("account");
  return (
    <div className="flex min-h-14 shrink-0 flex-wrap items-center gap-2 border-b border-white/10 bg-[#141519] px-3 py-2 pr-12 sm:px-4">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white">{pageTitle}</p>
        <p className="truncate text-xs text-white/45">{projectName}</p>
      </div>
      <div className="flex items-center rounded-md border border-white/10 bg-black/20 p-0.5">
        {VIEWPORTS.map(({ key, icon: Icon }) => (
          <button
            key={key}
            type="button"
            className="inline-flex size-8 items-center justify-center rounded-sm text-white/50 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70 aria-pressed:bg-white/10 aria-pressed:text-white motion-reduce:transition-none"
            aria-label={t(`CREATION_EDITOR_PREVIEW_VIEWPORT_${key.toUpperCase()}`)}
            aria-pressed={viewport === key}
            onClick={() => onViewportChange(key)}
          >
            <Icon className="size-4" />
          </button>
        ))}
      </div>
      <Select value={locale} onValueChange={onLocaleChange}>
        <SelectTrigger
          size="sm"
          className="border-white/10 bg-black/20 text-white hover:bg-white/5 focus-visible:ring-white/20"
          aria-label={t("CREATION_EDITOR_PREVIEW_LOCALE")}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {locales.map((item) => (
            <SelectItem key={item} value={item}>
              {item}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="rounded-md border border-white/10 bg-black/20 px-2 py-1.5 font-mono text-[11px] text-white/60">
        {theme ?? t("CREATION_EDITOR_PREVIEW_THEME_LOADING")}
      </span>
      <span className="rounded-md border border-white/10 bg-black/20 px-2 py-1.5 font-mono text-[11px] text-white/60">
        {t("CREATION_EDITOR_PREVIEW_REVISION", { revision: revisionNumber })}
      </span>
      <span className="sr-only">{t("CREATION_EDITOR_PREVIEW_READ_ONLY")}</span>
    </div>
  );
}

function PreviewState({
  icon: Icon,
  title,
  description,
  action,
  spinning = false,
}: Readonly<{
  icon: typeof Monitor;
  title: string;
  description: string;
  action?: ReactNode;
  spinning?: boolean;
}>) {
  return (
    <div className="flex min-h-[32rem] items-center justify-center p-8 text-center text-slate-950">
      <div className="max-w-sm">
        <Icon className={`mx-auto mb-4 size-5 text-slate-400 ${spinning ? "animate-spin" : ""}`} />
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
        {action ? <div className="mt-5">{action}</div> : null}
      </div>
    </div>
  );
}

function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  useEffect(() => {
    const markOnline = () => setOnline(true);
    const markOffline = () => setOnline(false);
    window.addEventListener("online", markOnline);
    window.addEventListener("offline", markOffline);
    return () => {
      window.removeEventListener("online", markOnline);
      window.removeEventListener("offline", markOffline);
    };
  }, []);
  return online;
}

interface PreviewRendererBoundaryProps {
  documentHash: string;
  title: string;
  description: string;
  retryLabel: string;
  onRetry: () => void;
  children: ReactNode;
}

interface PreviewRendererBoundaryState {
  error: Error | null;
}

class PreviewRendererBoundary extends Component<
  PreviewRendererBoundaryProps,
  PreviewRendererBoundaryState
> {
  state: PreviewRendererBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): PreviewRendererBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Visitor preview renderer failed", {
      error,
      componentStack: info.componentStack,
    });
  }

  componentDidUpdate(previous: PreviewRendererBoundaryProps) {
    if (previous.documentHash !== this.props.documentHash && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <PreviewState
        icon={RefreshCw}
        title={this.props.title}
        description={this.props.description}
        action={
          <Button
            size="sm"
            onClick={() => {
              this.setState({ error: null });
              this.props.onRetry();
            }}
          >
            {this.props.retryLabel}
          </Button>
        }
      />
    );
  }
}
