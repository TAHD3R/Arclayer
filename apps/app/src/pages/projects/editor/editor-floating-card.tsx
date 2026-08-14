import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@arclayer/ui/button";
import {
  FloatingPanelContent,
  FloatingPanelRoot,
  useFloatingPanel,
} from "@arclayer/ui/floating-panel";

/**
 * Controlled floating card built on FloatingPanel. Relume-style anchored
 * overlay: callers own `open`/`anchor` state instead of rendering a trigger,
 * so panels can be opened from canvas tools, node actions, and menus alike.
 */
export function EditorFloatingCard({
  open,
  anchor,
  onOpenChange,
  title,
  description,
  widthClass = "w-[min(26rem,calc(100vw-2rem))]",
  placement = "auto",
  bodyClassName,
  footer,
  children,
}: {
  open: boolean;
  anchor: HTMLElement | null;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  widthClass?: string;
  placement?: "auto" | "top" | "bottom" | "right-start";
  bodyClassName?: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const headerTitleId = useId();
  return (
    <FloatingPanelRoot>
      <FloatingCardController open={open} anchor={anchor} onOpenChange={onOpenChange} />
      <FloatingPanelContent
        placement={placement}
        showTitle={false}
        labelledBy={headerTitleId}
        className={`${widthClass} flex flex-col gap-0 p-0`}
      >
        <FloatingCardHeader
          titleId={headerTitleId}
          title={title}
          description={description}
          onClose={() => onOpenChange(false)}
        />
        <div className={`min-h-0 flex-1 overflow-y-auto ${bodyClassName ?? ""}`}>{children}</div>
        {footer ? (
          <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
            {footer}
          </div>
        ) : null}
      </FloatingPanelContent>
    </FloatingPanelRoot>
  );
}

function FloatingCardHeader({
  titleId,
  title,
  description,
  onClose,
}: {
  titleId: string;
  title: string;
  description?: string;
  onClose: () => void;
}) {
  const { t } = useTranslation("common");
  return (
    <div className="flex items-start gap-3 border-b border-border px-4 py-3.5">
      <div className="min-w-0 flex-1">
        <h2 id={titleId} className="text-callout font-semibold text-label-primary">
          {title}
        </h2>
        {description ? (
          <p className="mt-0.5 text-caption leading-5 text-label-secondary">{description}</p>
        ) : null}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-7 shrink-0"
        aria-label={t("CLOSE")}
        onClick={onClose}
      >
        <X className="size-4" aria-hidden="true" />
      </Button>
    </div>
  );
}

function FloatingCardController({
  open,
  anchor,
  onOpenChange,
}: {
  open: boolean;
  anchor: HTMLElement | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { isOpen, openFloatingPanel, closeFloatingPanel } = useFloatingPanel();
  const wasOpenRef = useRef(false);

  // openFloatingPanel re-creates its trigger DOMRect on every call, so it must
  // only run when the controlled open/anchor pair actually changes.
  useEffect(() => {
    if (open && anchor) openFloatingPanel(anchor);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see comment above
  }, [anchor, open]);

  useEffect(() => {
    if (!open && isOpen) closeFloatingPanel();
  }, [closeFloatingPanel, isOpen, open]);

  // FloatingPanel closes itself on Escape / outside mousedown; surface that
  // back to the controlled state so parent state stays in sync.
  useEffect(() => {
    if (wasOpenRef.current && !isOpen) onOpenChange(false);
    wasOpenRef.current = isOpen;
  }, [isOpen, onOpenChange]);

  return null;
}
