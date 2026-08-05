import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";

import { Button } from "@arclayer/ui/button";
import { Spinner } from "@arclayer/ui/spinner";

import type { AssetMasonryItem } from "@/types/assets-masonry";

import { buildAssetAuthHeaders } from "./asset-preview-file-utils";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

type AssetPreviewPdfViewerProps = {
  active: AssetMasonryItem;
  t: (key: string, options?: Record<string, unknown>) => string;
};

function useContainerWidth() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(960);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const observer = new ResizeObserver((entries) => {
      const nextWidth = entries[0]?.contentRect.width;
      if (!nextWidth) return;
      setContainerWidth(Math.max(320, Math.floor(nextWidth)));
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return { containerRef, containerWidth };
}

export function AssetPreviewPdfViewer(props: AssetPreviewPdfViewerProps) {
  const { containerRef, containerWidth } = useContainerWidth();
  const [pageCount, setPageCount] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [loadFailed, setLoadFailed] = useState(false);
  const file = useMemo(() => {
    if (!props.active.contentUrl) return null;
    return {
      url: props.active.contentUrl,
      httpHeaders: Object.fromEntries(buildAssetAuthHeaders().entries()),
      withCredentials: true,
    };
  }, [props.active.contentUrl]);

  useEffect(() => {
    setPageCount(0);
    setPageNumber(1);
    setLoadFailed(false);
  }, [props.active.id]);

  if (!file) return null;

  return (
    <div className="flex h-full min-h-80 flex-col">
      <div className="flex items-center justify-between py-3">
        <Button
          variant="ghost"
          size="sm"
          disabled={pageNumber <= 1}
          onClick={() => setPageNumber((value) => Math.max(1, value - 1))}
        >
          <ChevronLeft className="size-4" />
          {props.t("common:PREVIOUS")}
        </Button>
        <div>
          <div className="text-callout font-semibold text-label-secondary">
            {pageCount > 0
              ? props.t("assets:ASSET_PDF_PAGE_STATUS", {
                  current: pageNumber,
                  total: pageCount,
                })
              : props.t("assets:ASSET_PDF_LOADING")}
          </div>
        </div>

        <Button
          variant="ghost"
          size="sm"
          disabled={pageCount === 0 || pageNumber >= pageCount}
          onClick={() => setPageNumber((value) => Math.min(pageCount, value + 1))}
        >
          {props.t("common:NEXT")}
          <ChevronRight className="size-4" />
        </Button>
      </div>

      <div
        ref={containerRef}
        className="flex min-h-0 flex-1 items-start justify-center overflow-auto"
      >
        <Document
          file={file}
          loading={<Spinner className="mt-10 size-5 text-label-secondary" />}
          onLoadSuccess={({ numPages }) => {
            setPageCount(numPages);
            setPageNumber((value) => Math.min(Math.max(1, value), numPages));
          }}
          onLoadError={(error) => {
            console.error("PDF preview failed to load", error);
            setLoadFailed(true);
          }}
        >
          {loadFailed ? null : (
            <Page
              pageNumber={pageNumber}
              width={Math.max(320, Math.min(containerWidth, 1040))}
              renderAnnotationLayer={false}
              renderTextLayer={false}
            />
          )}
        </Document>

        {loadFailed ? (
          <div className="flex min-h-80 items-center justify-center text-center">
            <div className="space-y-2">
              <div className="text-title3 font-semibold text-label-primary">
                {props.t("assets:ASSET_PREVIEW_LOAD_FAILED")}
              </div>
              <div className="text-footnote text-label-secondary">
                {props.t("assets:ASSET_PDF_LOAD_FAILED_DESC")}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
