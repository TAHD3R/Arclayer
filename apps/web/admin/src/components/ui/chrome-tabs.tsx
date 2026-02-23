import * as React from "react";
import { motion } from "motion/react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { cn } from "@/lib/utils";

/**
 * Chrome-like tabs styling wrapper.
 * Rationale: keep Radix Tabs behavior but standardize the visual style for admin settings pages.
 */

const ChromeTabs = Tabs;

export function ChromeTabsBar(props: {
  left: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-3", props.className)}>
      <div className="min-w-0 flex-1">{props.left}</div>
      {props.right ? <div className="shrink-0">{props.right}</div> : null}
    </div>
  );
}

const ChromeTabsList = React.forwardRef<
  React.ElementRef<typeof TabsList>,
  React.ComponentPropsWithoutRef<typeof TabsList>
>(({ className, ...props }, ref) => (
  <ChromeTabsListInner className={className} {...props} ref={ref} />
));
ChromeTabsList.displayName = "ChromeTabsList";

function ChromeTabsListImpl(
  props: React.ComponentPropsWithoutRef<typeof TabsList>,
  ref: React.Ref<React.ElementRef<typeof TabsList>>,
) {
  const { className, children, ...rest } = props;
  const { t } = useTranslation("common");
  const localRef = React.useRef<React.ElementRef<typeof TabsList> | null>(null);
  const reducedMotion = usePrefersReducedMotion();

  React.useImperativeHandle(ref, () => localRef.current as React.ElementRef<typeof TabsList>);

  const [indicator, setIndicator] = React.useState<{ x: number; width: number } | null>(null);
  const [scrollState, setScrollState] = React.useState<{ canLeft: boolean; canRight: boolean }>({
    canLeft: false,
    canRight: false,
  });
  const rafIdRef = React.useRef<number | null>(null);

  const updateScrollState = React.useCallback(() => {
    const el = localRef.current as unknown as HTMLElement | null;
    if (!el) return;

    // Use a small threshold to avoid flickering when scrollLeft is within sub-pixel range.
    const threshold = 1;
    const canLeft = el.scrollLeft > threshold;
    const canRight = el.scrollLeft + el.clientWidth < el.scrollWidth - threshold;

    setScrollState((prev) => {
      if (prev.canLeft === canLeft && prev.canRight === canRight) return prev;
      return { canLeft, canRight };
    });
  }, []);

  const updateIndicator = React.useCallback(() => {
    const el = localRef.current as unknown as HTMLElement | null;
    if (!el) return;

    const active =
      (el.querySelector<HTMLElement>('[data-state="active"]') ??
        el.querySelector<HTMLElement>('[aria-selected="true"]')) ||
      null;

    // During React re-rendering, the active trigger can briefly disappear.
    // Don't aggressively reset indicator to null; it can cause a null/value oscillation
    // when observers fire rapidly.
    if (!active) return;

    const listRect = el.getBoundingClientRect();
    const triggerRect = active.getBoundingClientRect();

    // Match the trigger's "after:left-8 after:right-8" requirement: underline is inset by 32px.
    const inset = 32;
    // When the tab list is scrollable, `getBoundingClientRect()` reflects viewport coordinates.
    // Convert it back to the scroll container's content coordinates by adding `scrollLeft`.
    const rawX = triggerRect.left - listRect.left + el.scrollLeft;
    const rawW = triggerRect.width;
    // Round to whole pixels to avoid sub-pixel jitter causing endless update loops
    // in layouts where fonts/sizes settle after the first paint.
    const width = Math.round(Math.max(0, rawW - inset * 2));
    const x = Math.round(rawX + inset);

    setIndicator((prev) => {
      if (prev && prev.x === x && prev.width === width) return prev;
      return { x, width };
    });
  }, []);

  const scheduleUpdate = React.useCallback(() => {
    if (rafIdRef.current !== null) {
      window.cancelAnimationFrame(rafIdRef.current);
    }
    rafIdRef.current = window.requestAnimationFrame(() => {
      rafIdRef.current = null;
      updateIndicator();
      updateScrollState();
    });
  }, [updateIndicator, updateScrollState]);

  React.useLayoutEffect(() => {
    scheduleUpdate();
    // `children` is typically a new React element tree every render.
    // Rely on MutationObserver/ResizeObserver to react to actual DOM changes instead.
  }, [scheduleUpdate]);

  React.useEffect(() => {
    const el = localRef.current as unknown as HTMLElement | null;
    if (!el) return;

    const mo = new MutationObserver(() => scheduleUpdate());
    mo.observe(el, {
      subtree: true,
      attributes: true,
      attributeFilter: ["data-state", "aria-selected"],
    });

    const ro = new ResizeObserver(() => scheduleUpdate());
    ro.observe(el);
    el.addEventListener("scroll", scheduleUpdate, { passive: true });

    return () => {
      if (rafIdRef.current !== null) {
        window.cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      mo.disconnect();
      ro.disconnect();
      el.removeEventListener("scroll", scheduleUpdate);
    };
  }, [scheduleUpdate]);

  const scrollBy = React.useCallback(
    (delta: number) => {
      const el = localRef.current as unknown as HTMLElement | null;
      if (!el) return;
      el.scrollBy({
        left: delta,
        behavior: reducedMotion ? "auto" : "smooth",
      });
    },
    [reducedMotion],
  );

  const scrollActiveIntoView = React.useCallback(() => {
    const el = localRef.current as unknown as HTMLElement | null;
    if (!el) return;
    const active =
      (el.querySelector<HTMLElement>('[data-state="active"]') ??
        el.querySelector<HTMLElement>('[aria-selected="true"]')) ||
      null;
    if (!active) return;
    active.scrollIntoView({
      behavior: reducedMotion ? "auto" : "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [reducedMotion]);

  React.useEffect(() => {
    // Keep the active tab reachable when the list overflows (e.g. long category list).
    scrollActiveIntoView();
  }, [scrollActiveIntoView, children]);

  return (
    <div className="relative">
      {scrollState.canLeft ? (
        <button
          type="button"
          className={cn(
            "absolute left-0 top-1/2 z-10 -translate-y-1/2",
            "h-8 w-8 rounded-md border bg-background/80 backdrop-blur",
            "text-muted-foreground hover:text-foreground",
            "transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          )}
          aria-label={t("TABS_SCROLL_LEFT")}
          onClick={() => scrollBy(-240)}
        >
          <ChevronLeft className="mx-auto size-4" />
        </button>
      ) : null}

      {scrollState.canRight ? (
        <button
          type="button"
          className={cn(
            "absolute right-0 top-1/2 z-10 -translate-y-1/2",
            "h-8 w-8 rounded-md border bg-background/80 backdrop-blur",
            "text-muted-foreground hover:text-foreground",
            "transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          )}
          aria-label={t("TABS_SCROLL_RIGHT")}
          onClick={() => scrollBy(240)}
        >
          <ChevronRight className="mx-auto size-4" />
        </button>
      ) : null}

      <TabsList
        ref={localRef}
        className={cn(
          "relative",
          "w-full justify-start gap-2 rounded-none bg-transparent p-0 text-label-primary",
          // "border-b border-border/80",
          "h-auto",
          // Overflow handling
          "overflow-x-auto overflow-y-hidden",
          // Keep the scroll buttons from covering the first/last trigger.
          scrollState.canLeft ? "pl-10" : undefined,
          scrollState.canRight ? "pr-10" : undefined,
          className,
        )}
        {...rest}
      >
        {children}
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
      </TabsList>
    </div>
  );
}

const ChromeTabsListInner = React.forwardRef(ChromeTabsListImpl);

const ChromeTabsTrigger = React.forwardRef<
  React.ComponentRef<typeof TabsTrigger>,
  React.ComponentPropsWithoutRef<typeof TabsTrigger>
>(({ className, ...props }, ref) => (
  <TabsTrigger
    ref={ref}
    className={cn(
      // Base
      "relative",
      "rounded-t-md rounded-b-none",
      // Padding requirement: 12px 32px
      "px-8 py-3",
      "text-sm font-bold",
      "text-muted-foreground",
      "transition-colors",
      "hover:text-foreground",
      // Fallback when the trigger is wrapped by other Radix primitives that also set data-state.
      "aria-selected:text-foreground",
      // Hover underline for inactive tabs (active underline is rendered by ChromeTabsList for animation).
      "after:absolute after:left-8 after:right-8 after:bottom-2 after:h-0.5 after:rounded-full after:bg-transparent after:transition-colors",
      "data-[state=inactive]:hover:after:bg-foreground/60",
      // Keep focus visible for keyboard navigation.
      // Avoid outer rings here because the scroll container clips shadows; use an in-bounds focus style instead.
      "focus-visible:outline-none focus-visible:bg-muted/40 focus-visible:text-foreground focus-visible:after:bg-foreground/80",
      className,
    )}
    {...props}
  />
));
ChromeTabsTrigger.displayName = "ChromeTabsTrigger";

const ChromeTabsContent = React.forwardRef<
  React.ElementRef<typeof TabsContent>,
  React.ComponentPropsWithoutRef<typeof TabsContent>
>(({ className, ...props }, ref) => (
  <TabsContent ref={ref} className={cn("mt-0 pt-6", className)} {...props} />
));
ChromeTabsContent.displayName = "ChromeTabsContent";

export { ChromeTabs, ChromeTabsList, ChromeTabsTrigger, ChromeTabsContent };
