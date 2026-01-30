import * as React from "react";
import { motion } from "motion/react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

/**
 * Chrome-like tabs styling wrapper.
 * Rationale: keep Radix Tabs behavior but standardize the visual style for admin settings pages.
 */

const ChromeTabs = Tabs;

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
  const localRef = React.useRef<React.ElementRef<typeof TabsList> | null>(null);

  React.useImperativeHandle(ref, () => localRef.current as React.ElementRef<typeof TabsList>);

  const [indicator, setIndicator] = React.useState<{ x: number; width: number } | null>(null);

  const updateIndicator = React.useCallback(() => {
    const el = localRef.current as unknown as HTMLElement | null;
    if (!el) return;

    const active =
      (el.querySelector<HTMLElement>('[data-state="active"]') ??
        el.querySelector<HTMLElement>('[aria-selected="true"]')) ||
      null;

    if (!active) {
      setIndicator(null);
      return;
    }

    const listRect = el.getBoundingClientRect();
    const triggerRect = active.getBoundingClientRect();

    // Match the trigger's "after:left-8 after:right-8" requirement: underline is inset by 32px.
    const inset = 32;
    const rawX = triggerRect.left - listRect.left;
    const rawW = triggerRect.width;
    const width = Math.max(0, rawW - inset * 2);
    const x = rawX + inset;

    setIndicator((prev) => {
      if (prev && Math.abs(prev.x - x) < 0.5 && Math.abs(prev.width - width) < 0.5) return prev;
      return { x, width };
    });
  }, []);

  React.useLayoutEffect(() => {
    updateIndicator();
  }, [updateIndicator, children]);

  React.useEffect(() => {
    const el = localRef.current as unknown as HTMLElement | null;
    if (!el) return;

    const mo = new MutationObserver(() => updateIndicator());
    mo.observe(el, {
      subtree: true,
      attributes: true,
      attributeFilter: ["data-state", "aria-selected"],
    });

    const ro = new ResizeObserver(() => updateIndicator());
    ro.observe(el);

    return () => {
      mo.disconnect();
      ro.disconnect();
    };
  }, [updateIndicator]);

  return (
    <TabsList
      ref={localRef}
      className={cn(
        "relative",
        "w-full justify-start gap-2 rounded-none bg-transparent p-0",
        "border-b border-border/80",
        "h-auto",
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
        transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
        style={{ left: 0 }}
      />
    </TabsList>
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
      "[&[aria-selected=true]]:text-foreground",
      // Hover underline for inactive tabs (active underline is rendered by ChromeTabsList for animation).
      "after:absolute after:left-8 after:right-8 after:bottom-2 after:h-0.5 after:rounded-full after:bg-transparent after:transition-colors",
      "data-[state=inactive]:hover:after:bg-foreground/60",
      // Disable default focus ring from base TabsTrigger to match project style.
      "focus-visible:ring-0 focus-visible:ring-offset-0",
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
  <TabsContent
    ref={ref}
    className={cn("mt-0 pt-6", "focus-visible:ring-0 focus-visible:ring-offset-0", className)}
    {...props}
  />
));
ChromeTabsContent.displayName = "ChromeTabsContent";

export { ChromeTabs, ChromeTabsList, ChromeTabsTrigger, ChromeTabsContent };
