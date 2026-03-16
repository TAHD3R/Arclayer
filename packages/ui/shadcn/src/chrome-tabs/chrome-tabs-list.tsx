import { ChevronLeft, ChevronRight } from "@arclayer/ui/icons/lucide-animated";
import { motion } from "motion/react";
import * as React from "react";

import { Button as ButtonPrimitive } from "@arclayer/ui/button-primitive";
import { cn } from "@arclayer/lib/utils";
import { TabsList } from "../tabs";
import { useChromeTabsLabels, useChromeTabsReducedMotion } from "./chrome-tabs-provider";

const SCROLL_DELTA_PX = 240;
const SCROLL_THRESHOLD_PX = 1;

type Indicator = Readonly<{ x: number; width: number }>;
type ScrollState = Readonly<{ canLeft: boolean; canRight: boolean }>;

const SCROLL_BUTTON_CLASSNAME = cn(
  "absolute top-1/2 z-10 -translate-y-1/2",
  "h-8 w-8 rounded-md border bg-background/80 backdrop-blur",
  "text-label-secondary hover:text-foreground",
  "transition-colors",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
);

const TABS_LIST_BASE_CLASSNAME = cn(
  "relative",
  "w-full justify-start gap-2 rounded-none bg-transparent p-0 text-label-primary",
  "h-auto",
  "overflow-x-auto overflow-y-hidden",
);

type ScrollButtonProps = Readonly<{
  ariaLabel: string;
  direction: "left" | "right";
  onClick: () => void;
}>;

function ScrollButton({ ariaLabel, direction, onClick }: ScrollButtonProps) {
  const Icon = direction === "left" ? ChevronLeft : ChevronRight;
  const sideClassName = direction === "left" ? "left-0" : "right-0";

  return (
    <ButtonPrimitive
      type="button"
      className={cn(SCROLL_BUTTON_CLASSNAME, sideClassName)}
      aria-label={ariaLabel}
      onClick={onClick}
      tapScale={1}
    >
      <Icon className="mx-auto size-4" />
    </ButtonPrimitive>
  );
}

type IndicatorBarProps = Readonly<{ indicator: Indicator | null; reducedMotion: boolean }>;

function IndicatorBar({ indicator, reducedMotion }: IndicatorBarProps) {
  return (
    <motion.span
      aria-hidden="true"
      className={cn("pointer-events-none absolute bottom-2 h-0.5 rounded-full bg-foreground")}
      initial={false}
      animate={
        indicator
          ? { opacity: 1, x: indicator.x, width: indicator.width }
          : { opacity: 0, x: 0, width: 0 }
      }
      transition={reducedMotion ? { duration: 0 } : { duration: 0.22, ease: [0.2, 0, 0, 1] }}
      style={{ left: 0 }}
    />
  );
}

function getActiveTabTrigger(container: HTMLElement): HTMLElement | null {
  return (
    container.querySelector<HTMLElement>('[data-state="active"]') ??
    container.querySelector<HTMLElement>('[aria-selected="true"]') ??
    null
  );
}

function computeScrollState(container: HTMLElement): ScrollState {
  const canLeft = container.scrollLeft > SCROLL_THRESHOLD_PX;
  const canRight =
    container.scrollLeft + container.clientWidth < container.scrollWidth - SCROLL_THRESHOLD_PX;
  return { canLeft, canRight };
}

function computeIndicator(container: HTMLElement, active: HTMLElement): Indicator {
  const listRect = container.getBoundingClientRect();
  const triggerRect = active.getBoundingClientRect();

  const rawX = triggerRect.left - listRect.left + container.scrollLeft;
  const rawWidth = triggerRect.width;

  const style = window.getComputedStyle(active);
  const paddingLeft = Number.parseFloat(style.paddingLeft);
  const paddingRight = Number.parseFloat(style.paddingRight);
  const insetLeft = Number.isFinite(paddingLeft) ? paddingLeft : 0;
  const insetRight = Number.isFinite(paddingRight) ? paddingRight : 0;

  const width = Math.round(Math.max(0, rawWidth - insetLeft - insetRight));
  const x = Math.round(rawX + insetLeft);

  return { x, width };
}

function useRafScheduler(callback: () => void) {
  const rafIdRef = React.useRef<number | null>(null);

  const schedule = React.useCallback(() => {
    if (rafIdRef.current !== null) {
      window.cancelAnimationFrame(rafIdRef.current);
    }
    rafIdRef.current = window.requestAnimationFrame(() => {
      rafIdRef.current = null;
      callback();
    });
  }, [callback]);

  React.useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        window.cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, []);

  return schedule;
}

function useTabListObservers(options: Readonly<{ el: HTMLElement | null; onChange: () => void }>) {
  React.useEffect(() => {
    const el = options.el;
    if (!el) return;

    const mo = new MutationObserver(() => options.onChange());
    mo.observe(el, {
      subtree: true,
      attributes: true,
      attributeFilter: ["data-state", "aria-selected"],
    });

    const ro = new ResizeObserver(() => options.onChange());
    ro.observe(el);
    el.addEventListener("scroll", options.onChange, { passive: true });

    return () => {
      mo.disconnect();
      ro.disconnect();
      el.removeEventListener("scroll", options.onChange);
    };
  }, [options.el, options.onChange]);
}

function scrollActiveIntoView(options: Readonly<{ el: HTMLElement; reducedMotion: boolean }>) {
  const active = getActiveTabTrigger(options.el);
  if (!active) return;

  const listRect = options.el.getBoundingClientRect();
  const activeRect = active.getBoundingClientRect();

  const targetLeft =
    options.el.scrollLeft +
    (activeRect.left - listRect.left) -
    Math.max(0, (options.el.clientWidth - activeRect.width) / 2);
  const maxLeft = Math.max(0, options.el.scrollWidth - options.el.clientWidth);
  const nextLeft = Math.min(maxLeft, Math.max(0, Math.round(targetLeft)));

  const threshold = 2;
  if (Math.abs(nextLeft - options.el.scrollLeft) <= threshold) return;

  options.el.scrollTo({ left: nextLeft, behavior: options.reducedMotion ? "auto" : "smooth" });
}

function useTabListMetrics(options: Readonly<{ elRef: React.RefObject<HTMLElement | null> }>) {
  const reducedMotion = useChromeTabsReducedMotion();
  const [indicator, setIndicator] = React.useState<Indicator | null>(null);
  const [scrollState, setScrollState] = React.useState<ScrollState>({
    canLeft: false,
    canRight: false,
  });

  const updateMetrics = React.useCallback(() => {
    const el = options.elRef.current;
    if (!el) return;

    const active = getActiveTabTrigger(el);
    if (active) {
      const next = computeIndicator(el, active);
      setIndicator((prev) =>
        prev && prev.x === next.x && prev.width === next.width ? prev : next,
      );
    }

    const nextScroll = computeScrollState(el);
    setScrollState((prev) =>
      prev.canLeft === nextScroll.canLeft && prev.canRight === nextScroll.canRight
        ? prev
        : nextScroll,
    );
  }, [options.elRef]);

  const scheduleUpdate = useRafScheduler(updateMetrics);
  useTabListObservers({ el: options.elRef.current, onChange: scheduleUpdate });

  React.useLayoutEffect(() => {
    scheduleUpdate();
  }, [scheduleUpdate]);

  React.useEffect(() => {
    const el = options.elRef.current;
    if (!el) return;
    scrollActiveIntoView({ el, reducedMotion });
  }, [reducedMotion, options.elRef]);

  return { indicator, reducedMotion, scrollState } as const;
}

function useScrollBy(options: Readonly<{ elRef: React.RefObject<HTMLElement | null> }>) {
  const reducedMotion = useChromeTabsReducedMotion();
  return React.useCallback(
    (delta: number) => {
      const el = options.elRef.current;
      if (!el) return;
      el.scrollBy({ left: delta, behavior: reducedMotion ? "auto" : "smooth" });
    },
    [options.elRef, reducedMotion],
  );
}

type ChromeTabsWidthMode = "fill" | "content";

type ChromeTabsListProps = React.ComponentPropsWithoutRef<typeof TabsList> & {
  wrapperClassName?: string;
  wrapperRef?: React.Ref<HTMLDivElement>;
  widthMode?: ChromeTabsWidthMode;
};

function ChromeTabsListImpl(
  {
    className,
    children,
    widthMode = "fill",
    wrapperClassName,
    wrapperRef,
    ...rest
  }: ChromeTabsListProps,
  ref: React.ForwardedRef<React.ElementRef<typeof TabsList>>,
) {
  const labels = useChromeTabsLabels();
  const localRef = React.useRef<React.ElementRef<typeof TabsList> | null>(null);
  const elRef = localRef as unknown as React.RefObject<HTMLElement | null>;

  React.useImperativeHandle(ref, () => localRef.current as React.ElementRef<typeof TabsList>);

  const { indicator, reducedMotion, scrollState } = useTabListMetrics({ elRef });
  const scrollBy = useScrollBy({ elRef });

  return (
    <div
      ref={wrapperRef}
      className={cn(
        "relative",
        widthMode === "content" ? "inline-block max-w-full align-top" : undefined,
        wrapperClassName,
      )}
    >
      {scrollState.canLeft ? (
        <ScrollButton
          direction="left"
          ariaLabel={labels.scrollLeftAriaLabel}
          onClick={() => scrollBy(-SCROLL_DELTA_PX)}
        />
      ) : null}
      {scrollState.canRight ? (
        <ScrollButton
          direction="right"
          ariaLabel={labels.scrollRightAriaLabel}
          onClick={() => scrollBy(SCROLL_DELTA_PX)}
        />
      ) : null}
      <TabsList
        ref={localRef}
        className={cn(
          TABS_LIST_BASE_CLASSNAME,
          widthMode === "content" ? "min-w-full w-max" : undefined,
          scrollState.canLeft ? "pl-10" : undefined,
          scrollState.canRight ? "pr-10" : undefined,
          className,
        )}
        {...rest}
      >
        {children}
        <IndicatorBar indicator={indicator} reducedMotion={reducedMotion} />
      </TabsList>
    </div>
  );
}

export const ChromeTabsList = React.forwardRef(ChromeTabsListImpl);
ChromeTabsList.displayName = "ChromeTabsList";
