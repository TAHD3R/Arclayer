"use client";

import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { PanelLeft as PanelLeftIcon } from "lucide-react";
import { type Transition } from "motion/react";

import { useIsMobile } from "@arclayer/hooks/use-is-mobile";
import { cn } from "@arclayer/lib/utils";
import { Button as ButtonPrimitive } from "@arclayer/ui/button-primitive";
import { Input } from "@arclayer/ui/input";
import { Separator } from "@arclayer/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@arclayer/ui/sheet";
import { TooltipProvider, Tooltip, TooltipContent, TooltipTrigger } from "@arclayer/ui/tooltip";
import { Highlight, HighlightItem } from "@arclayer/ui/highlight";
import {
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "./sidebar-menu";
import { getStrictContext } from "@arclayer/lib/get-strict-context";
import { buttonVariants } from "./button-variants";

const SIDEBAR_COOKIE_NAME = "sidebar_state";
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
const SIDEBAR_HOVER_OPEN_DELAY_MS = 70;
const SIDEBAR_HOVER_CLOSE_DELAY_MS = 180;
const SIDEBAR_EXPAND_TRANSITION_MS = 280;
const SIDEBAR_LABEL_ENTER_DELAY_MS = 170;
const SIDEBAR_WIDTH_MOBILE = "18rem";
const SIDEBAR_WIDTH_ICON = "3rem";
const SIDEBAR_KEYBOARD_SHORTCUT = "b";
const SIDEBAR_EXPAND_TRANSITION_CLASSNAME = "duration-[280ms] ease-[cubic-bezier(0.4,0,0.2,1)]";
const SIDEBAR_DEFAULT_WIDTH_PX = 280;
const SIDEBAR_MIN_WIDTH_PX = 273;
const SIDEBAR_MAX_WIDTH_PX = 320;

function clampSidebarWidthPx(value: number): number {
  return Math.max(SIDEBAR_MIN_WIDTH_PX, Math.min(SIDEBAR_MAX_WIDTH_PX, Math.round(value)));
}

type SidebarContextProps = {
  state: "expanded" | "collapsed";
  layoutState: "expanded" | "collapsed";
  motionPhase: "idle" | "expanding" | "collapsing";
  open: boolean;
  setOpen: (open: boolean) => void;
  widthPx: number;
  setWidthPx: (widthPx: number) => void;
  hoverOpen: boolean;
  hoverIntent: boolean;
  openMobile: boolean;
  setOpenMobile: (open: boolean) => void;
  isMobile: boolean;
  toggleSidebar: () => void;
  markHoverPointerEnter: () => void;
  markHoverPointerLeave: () => void;
};

const [LocalSidebarProvider, useSidebar] = getStrictContext<SidebarContextProps>("SidebarContext");

type SidebarHoverPreviewLockContextValue = {
  lockHoverPreview: () => () => void;
};

const SidebarHoverPreviewLockContext =
  React.createContext<SidebarHoverPreviewLockContextValue | null>(null);

function useSidebarHoverPreviewLock() {
  return React.useContext(SidebarHoverPreviewLockContext);
}

type SidebarProviderProps = React.ComponentProps<"div"> & {
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  defaultWidthPx?: number;
  widthPx?: number;
  onWidthChange?: (widthPx: number) => void;
};

function SidebarProvider({
  defaultOpen = true,
  open: openProp,
  onOpenChange: setOpenProp,
  defaultWidthPx = SIDEBAR_DEFAULT_WIDTH_PX,
  widthPx: widthPxProp,
  onWidthChange: setWidthPxProp,
  className,
  style,
  children,
  ...props
}: SidebarProviderProps) {
  const isMobile = useIsMobile();
  const [openMobile, setOpenMobile] = React.useState(false);
  const [hoverOpen, setHoverOpen] = React.useState(false);
  const [hoverIntent, setHoverIntent] = React.useState(false);
  const [motionPhase, setMotionPhase] = React.useState<"idle" | "expanding" | "collapsing">("idle");
  const [hoverPreviewLockCount, setHoverPreviewLockCount] = React.useState(0);
  const hoverOpenTimerRef = React.useRef<number | null>(null);
  const hoverCloseTimerRef = React.useRef<number | null>(null);
  const motionPhaseTimerRef = React.useRef<number | null>(null);
  const previousOpenRef = React.useRef(openProp ?? defaultOpen);
  const previousHoverOpenRef = React.useRef(false);
  const previousHoverPreviewLockCountRef = React.useRef(0);
  const hoverPreviewLockIdsRef = React.useRef(new Set<number>());
  const nextHoverPreviewLockIdRef = React.useRef(1);
  const [_widthPx, _setWidthPx] = React.useState(clampSidebarWidthPx(defaultWidthPx));

  // This is the internal state of the sidebar.
  // We use openProp and setOpenProp for control from outside the component.
  const [_open, _setOpen] = React.useState(defaultOpen);
  const open = openProp ?? _open;
  const widthPx = clampSidebarWidthPx(widthPxProp ?? _widthPx);
  const setOpen = React.useCallback(
    (value: boolean | ((value: boolean) => boolean)) => {
      const openState = typeof value === "function" ? value(open) : value;
      if (setOpenProp) {
        setOpenProp(openState);
      } else {
        _setOpen(openState);
      }

      // This sets the cookie to keep the sidebar state.
      document.cookie = `${SIDEBAR_COOKIE_NAME}=${openState}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`;
    },
    [setOpenProp, open],
  );
  const setWidthPx = React.useCallback(
    (value: number | ((value: number) => number)) => {
      const raw = typeof value === "function" ? value(widthPx) : value;
      const nextWidthPx = clampSidebarWidthPx(raw);
      if (setWidthPxProp) {
        setWidthPxProp(nextWidthPx);
      } else {
        _setWidthPx(nextWidthPx);
      }
    },
    [setWidthPxProp, widthPx],
  );

  const clearHoverOpenTimer = React.useCallback(() => {
    if (hoverOpenTimerRef.current === null) return;
    window.clearTimeout(hoverOpenTimerRef.current);
    hoverOpenTimerRef.current = null;
  }, []);

  const clearHoverCloseTimer = React.useCallback(() => {
    if (hoverCloseTimerRef.current === null) return;
    window.clearTimeout(hoverCloseTimerRef.current);
    hoverCloseTimerRef.current = null;
  }, []);

  const clearMotionPhaseTimer = React.useCallback(() => {
    if (motionPhaseTimerRef.current === null) return;
    window.clearTimeout(motionPhaseTimerRef.current);
    motionPhaseTimerRef.current = null;
  }, []);

  const startMotionPhase = React.useCallback(
    (phase: "expanding" | "collapsing", durationMs: number) => {
      setMotionPhase(phase);
      clearMotionPhaseTimer();
      motionPhaseTimerRef.current = window.setTimeout(() => {
        setMotionPhase("idle");
        motionPhaseTimerRef.current = null;
      }, durationMs);
    },
    [clearMotionPhaseTimer],
  );

  const scheduleHoverPreviewClose = React.useCallback(() => {
    clearHoverOpenTimer();
    clearHoverCloseTimer();
    hoverCloseTimerRef.current = window.setTimeout(() => {
      setHoverIntent(false);
      setHoverOpen(false);
      hoverCloseTimerRef.current = null;
    }, SIDEBAR_HOVER_CLOSE_DELAY_MS);
  }, [clearHoverCloseTimer, clearHoverOpenTimer]);

  const lockHoverPreview = React.useCallback(() => {
    const lockId = nextHoverPreviewLockIdRef.current++;
    hoverPreviewLockIdsRef.current.add(lockId);
    setHoverPreviewLockCount(hoverPreviewLockIdsRef.current.size);
    clearHoverCloseTimer();

    return () => {
      if (!hoverPreviewLockIdsRef.current.delete(lockId)) return;
      setHoverPreviewLockCount(hoverPreviewLockIdsRef.current.size);
    };
  }, [clearHoverCloseTimer]);

  const markHoverPointerEnter = React.useCallback(() => {
    clearHoverOpenTimer();
    clearHoverCloseTimer();
    if (isMobile || open) return;
    setHoverIntent(true);
    if (hoverOpen) return;
    hoverOpenTimerRef.current = window.setTimeout(() => {
      setHoverOpen(true);
      hoverOpenTimerRef.current = null;
    }, SIDEBAR_HOVER_OPEN_DELAY_MS);
  }, [clearHoverCloseTimer, clearHoverOpenTimer, hoverOpen, isMobile, open]);

  const markHoverPointerLeave = React.useCallback(() => {
    clearHoverOpenTimer();
    clearHoverCloseTimer();
    if (isMobile || open) {
      setHoverIntent(false);
      setHoverOpen(false);
      return;
    }
    setHoverIntent(false);
    if (hoverPreviewLockIdsRef.current.size > 0) {
      return;
    }
    scheduleHoverPreviewClose();
  }, [clearHoverCloseTimer, clearHoverOpenTimer, isMobile, open, scheduleHoverPreviewClose]);

  // Helper to toggle the sidebar.
  const toggleSidebar = React.useCallback(() => {
    return isMobile ? setOpenMobile((open) => !open) : setOpen((open) => !open);
  }, [isMobile, setOpen, setOpenMobile]);

  React.useEffect(() => {
    if (!open) return;
    setHoverIntent(false);
    setHoverOpen(false);
    clearHoverOpenTimer();
    clearHoverCloseTimer();
  }, [clearHoverCloseTimer, clearHoverOpenTimer, open]);

  React.useEffect(() => {
    if (!isMobile) return;
    setHoverIntent(false);
    setHoverOpen(false);
    setMotionPhase("idle");
    clearHoverOpenTimer();
    clearHoverCloseTimer();
    clearMotionPhaseTimer();
  }, [clearHoverCloseTimer, clearHoverOpenTimer, clearMotionPhaseTimer, isMobile]);

  React.useEffect(() => {
    const wasOpen = previousOpenRef.current;
    previousOpenRef.current = open;

    if (isMobile) return;
    if (open) {
      if (!wasOpen) {
        startMotionPhase("expanding", SIDEBAR_LABEL_ENTER_DELAY_MS);
      }
      return;
    }
    if (!wasOpen) return;

    startMotionPhase("collapsing", SIDEBAR_EXPAND_TRANSITION_MS);
  }, [isMobile, open, startMotionPhase]);

  React.useEffect(() => {
    const wasHoverOpen = previousHoverOpenRef.current;
    previousHoverOpenRef.current = hoverOpen;

    if (hoverOpen) {
      if (!wasHoverOpen && !open) {
        startMotionPhase("expanding", SIDEBAR_LABEL_ENTER_DELAY_MS);
      }
      return;
    }
    if (isMobile || open) return;
    if (!wasHoverOpen) return;

    startMotionPhase("collapsing", SIDEBAR_EXPAND_TRANSITION_MS);
  }, [hoverOpen, isMobile, open, startMotionPhase]);

  React.useEffect(() => {
    const previousLockCount = previousHoverPreviewLockCountRef.current;
    previousHoverPreviewLockCountRef.current = hoverPreviewLockCount;

    if (hoverPreviewLockCount > 0) {
      clearHoverCloseTimer();
      return;
    }
    if (previousLockCount === 0) return;
    if (isMobile || open) return;
    if (!hoverOpen) return;
    if (hoverIntent) return;

    scheduleHoverPreviewClose();
  }, [
    clearHoverCloseTimer,
    hoverIntent,
    hoverOpen,
    hoverPreviewLockCount,
    isMobile,
    open,
    scheduleHoverPreviewClose,
  ]);

  React.useEffect(() => {
    return () => {
      hoverPreviewLockIdsRef.current.clear();
      clearHoverOpenTimer();
      clearHoverCloseTimer();
      clearMotionPhaseTimer();
    };
  }, [clearHoverCloseTimer, clearHoverOpenTimer, clearMotionPhaseTimer]);

  // Adds a keyboard shortcut to toggle the sidebar.
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === SIDEBAR_KEYBOARD_SHORTCUT && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        toggleSidebar();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleSidebar]);

  // The sidebar has two desktop concerns:
  // - visual state drives labels, tooltips, and hover-preview presentation
  // - layout state drives the reserved page width
  const layoutState = open ? "expanded" : "collapsed";
  const visualState = open || hoverOpen ? "expanded" : "collapsed";

  const contextValue = React.useMemo<SidebarContextProps>(
    () => ({
      state: visualState,
      layoutState,
      motionPhase,
      open,
      setOpen,
      widthPx,
      setWidthPx,
      hoverOpen,
      hoverIntent,
      isMobile,
      openMobile,
      setOpenMobile,
      toggleSidebar,
      markHoverPointerEnter,
      markHoverPointerLeave,
    }),
    [
      visualState,
      layoutState,
      motionPhase,
      open,
      setOpen,
      widthPx,
      setWidthPx,
      hoverOpen,
      hoverIntent,
      isMobile,
      openMobile,
      setOpenMobile,
      toggleSidebar,
      markHoverPointerEnter,
      markHoverPointerLeave,
    ],
  );

  return (
    <LocalSidebarProvider value={contextValue}>
      <SidebarHoverPreviewLockContext.Provider value={{ lockHoverPreview }}>
        <TooltipProvider openDelay={0}>
          <div
            data-slot="sidebar-wrapper"
            style={
              {
                "--sidebar-width": `${widthPx}px`,
                "--sidebar-width-icon": SIDEBAR_WIDTH_ICON,
                ...style,
              } as React.CSSProperties
            }
            className={cn(
              "group/sidebar-wrapper has-data-[variant=inset]:bg-sidebar flex min-h-svh w-full",
              className,
            )}
            {...props}
          >
            {children}
          </div>
        </TooltipProvider>
      </SidebarHoverPreviewLockContext.Provider>
    </LocalSidebarProvider>
  );
}

type SidebarProps = React.ComponentProps<"div"> & {
  side?: "left" | "right";
  variant?: "sidebar" | "floating" | "inset";
  collapsible?: "offcanvas" | "icon" | "none";
  enableHoverPreview?: boolean;
  containerClassName?: string;
  animateOnHover?: boolean;
  transition?: Transition;
};

function Sidebar({
  side = "left",
  variant = "sidebar",
  collapsible = "offcanvas",
  enableHoverPreview = true,
  className,
  children,
  animateOnHover = true,
  containerClassName,
  transition = { type: "spring", stiffness: 350, damping: 35 },
  ...props
}: SidebarProps) {
  const {
    isMobile,
    state,
    layoutState,
    motionPhase,
    open,
    hoverOpen,
    openMobile,
    setOpenMobile,
    markHoverPointerEnter,
    markHoverPointerLeave,
  } = useSidebar();

  if (collapsible === "none") {
    return (
      <Highlight
        enabled={animateOnHover}
        hover
        controlledItems
        mode="parent"
        containerClassName={containerClassName}
        transition={transition}
      >
        <div
          data-slot="sidebar"
          className={cn(
            "bg-sidebar text-sidebar-foreground flex h-full w-(--sidebar-width) flex-col",
            side === "left" ? "border-r border-border" : "border-l border-border",
            className,
          )}
          {...props}
        >
          {children}
        </div>
      </Highlight>
    );
  }

  if (isMobile) {
    return (
      <Sheet open={openMobile} onOpenChange={setOpenMobile} {...props}>
        <SheetContent
          data-sidebar="sidebar"
          data-slot="sidebar"
          data-mobile="true"
          className="bg-sidebar text-sidebar-foreground w-(--sidebar-width) p-0 [&>button]:hidden"
          style={
            {
              "--sidebar-width": SIDEBAR_WIDTH_MOBILE,
            } as React.CSSProperties
          }
          side={side}
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Sidebar</SheetTitle>
            <SheetDescription>Displays the mobile sidebar.</SheetDescription>
          </SheetHeader>
          <Highlight
            enabled={animateOnHover}
            hover
            controlledItems
            mode="parent"
            containerClassName={cn("h-full", containerClassName)}
            transition={transition}
          >
            <div className="flex h-full w-full flex-col">{children}</div>
          </Highlight>
        </SheetContent>
      </Sheet>
    );
  }

  const isHoverPreviewExpanded = enableHoverPreview && collapsible === "icon" && !open && hoverOpen;

  return (
    <div
      className={cn(
        "group peer text-sidebar-foreground relative hidden shrink-0 md:block",
        "w-(--sidebar-width) origin-left transition-[width] motion-reduce:transition-none",
        SIDEBAR_EXPAND_TRANSITION_CLASSNAME,
        "data-[layout-collapsible=offcanvas]:w-0",
        variant === "floating" || variant === "inset"
          ? "data-[layout-collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4)))]"
          : "data-[layout-collapsible=icon]:w-(--sidebar-width-icon)",
      )}
      data-state={state}
      data-layout-state={layoutState}
      data-motion-phase={motionPhase}
      data-hover-preview={isHoverPreviewExpanded ? "true" : ""}
      data-collapsible={state === "collapsed" ? collapsible : ""}
      data-layout-collapsible={layoutState === "collapsed" ? collapsible : ""}
      data-variant={variant}
      data-side={side}
      data-slot="sidebar"
    >
      {/* This is what handles the sidebar gap on desktop */}
      <div
        data-slot="sidebar-gap"
        className={cn(
          "relative w-(--sidebar-width) origin-left bg-transparent transition-[width] motion-reduce:transition-none",
          SIDEBAR_EXPAND_TRANSITION_CLASSNAME,
          "group-data-[layout-collapsible=offcanvas]:w-0",
          "group-data-[side=right]:rotate-180",
          variant === "floating" || variant === "inset"
            ? "group-data-[layout-collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4)))]"
            : "group-data-[layout-collapsible=icon]:w-(--sidebar-width-icon)",
        )}
      />
      <div
        data-slot="sidebar-container"
        className={cn(
          "fixed inset-y-0 z-10 hidden h-svh w-(--sidebar-width) transition-[left,right,width] motion-reduce:transition-none md:flex",
          SIDEBAR_EXPAND_TRANSITION_CLASSNAME,
          isHoverPreviewExpanded && "z-30",
          side === "left"
            ? "left-0 group-data-[layout-collapsible=offcanvas]:left-[calc(var(--sidebar-width)*-1)]"
            : "right-0 group-data-[layout-collapsible=offcanvas]:right-[calc(var(--sidebar-width)*-1)]",
          side === "left" ? "origin-left" : "origin-right",
          // Adjust the padding for floating and inset variants.
          variant === "floating" || variant === "inset"
            ? cn(
                "p-2",
                !isHoverPreviewExpanded &&
                  "group-data-[layout-collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4))+2px)]",
              )
            : cn(
                !isHoverPreviewExpanded &&
                  "group-data-[layout-collapsible=icon]:w-(--sidebar-width-icon)",
                "group-data-[side=left]:border-r group-data-[side=right]:border-l",
              ),
          className,
        )}
        onPointerEnter={
          enableHoverPreview && collapsible === "icon" && !open ? markHoverPointerEnter : undefined
        }
        onPointerMove={
          enableHoverPreview && collapsible === "icon" && !open ? markHoverPointerEnter : undefined
        }
        onPointerLeave={
          enableHoverPreview && collapsible === "icon" && !open ? markHoverPointerLeave : undefined
        }
        {...props}
      >
        <Highlight
          containerClassName={cn("size-full", containerClassName)}
          enabled={animateOnHover}
          hover
          controlledItems
          mode="parent"
          forceUpdateBounds
          transition={transition}
        >
          <div
            data-sidebar="sidebar"
            data-slot="sidebar-inner"
            className={cn(
              "bg-sidebar flex h-full w-full origin-left flex-col overflow-hidden group-data-[variant=floating]:border-border group-data-[variant=floating]:rounded-lg group-data-[variant=floating]:border",
            )}
          >
            {children}
          </div>
        </Highlight>
      </div>
    </div>
  );
}

type SidebarTriggerProps = Omit<
  React.ComponentProps<typeof ButtonPrimitive>,
  "asChild" | "children"
>;

function SidebarTrigger({ className, onClick, ...props }: SidebarTriggerProps) {
  const { toggleSidebar } = useSidebar();

  return (
    <ButtonPrimitive
      data-sidebar="trigger"
      data-slot="sidebar-trigger"
      type="button"
      tapScale={1}
      className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "size-7", className)}
      onClick={(event) => {
        onClick?.(event);
        toggleSidebar();
      }}
      {...props}
    >
      <PanelLeftIcon aria-hidden="true" />
      <span className="sr-only">Toggle Sidebar</span>
    </ButtonPrimitive>
  );
}

type SidebarRailProps = React.ComponentProps<typeof ButtonPrimitive>;

function SidebarRail({
  className,
  "aria-label": ariaLabel,
  onClick,
  onMouseEnter,
  onMouseMove,
  onMouseLeave,
  ...props
}: SidebarRailProps) {
  const { toggleSidebar } = useSidebar();
  const label = ariaLabel ?? "Toggle Sidebar";

  return (
    <ButtonPrimitive
      data-sidebar="rail"
      data-slot="sidebar-rail"
      aria-label={label}
      tabIndex={-1}
      onClick={(event) => {
        onClick?.(event);
        toggleSidebar();
      }}
      onMouseEnter={(event) => {
        onMouseEnter?.(event);
      }}
      onMouseMove={(event) => {
        onMouseMove?.(event);
      }}
      onMouseLeave={(event) => {
        onMouseLeave?.(event);
      }}
      tapScale={1}
      className={cn(
        "hover:after:bg-sidebar-border absolute inset-y-0 z-20 hidden w-4 -translate-x-1/2 transition-[transform,background-color] ease-linear group-data-[side=left]:-right-4 group-data-[side=right]:left-0 after:absolute after:inset-y-0 after:left-1/2 after:w-0.5 sm:flex",
        "cursor-pointer",
        "hover:group-data-[collapsible=offcanvas]:bg-sidebar group-data-[collapsible=offcanvas]:translate-x-0 group-data-[collapsible=offcanvas]:after:left-full",
        "[[data-side=left][data-collapsible=offcanvas]_&]:-right-2",
        "[[data-side=right][data-collapsible=offcanvas]_&]:-left-2",
        className,
      )}
      {...props}
    />
  );
}

type SidebarInsetProps = React.ComponentProps<"main">;

function SidebarInset({ className, ...props }: SidebarInsetProps) {
  return (
    <main
      data-slot="sidebar-inset"
      className={cn(
        "bg-card relative flex w-full flex-1 flex-col",
        "md:peer-data-[variant=inset]:m-2 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:rounded-xl md:peer-data-[variant=inset]: md:peer-data-[variant=inset]:peer-data-[layout-state=collapsed]:ml-2",
        className,
      )}
      {...props}
    />
  );
}

type SidebarInputProps = React.ComponentProps<typeof Input>;

function SidebarInput({ className, ...props }: SidebarInputProps) {
  return (
    <Input
      data-slot="sidebar-input"
      data-sidebar="input"
      className={cn("bg-card h-8 w-full ", className)}
      {...props}
    />
  );
}

type SidebarHeaderProps = React.ComponentProps<"div">;

function SidebarHeader({ className, ...props }: SidebarHeaderProps) {
  return (
    <div
      data-slot="sidebar-header"
      data-sidebar="header"
      className={cn("flex flex-col gap-2 p-2", className)}
      {...props}
    />
  );
}

type SidebarFooterProps = React.ComponentProps<"div">;

function SidebarFooter({ className, ...props }: SidebarFooterProps) {
  return (
    <div
      data-slot="sidebar-footer"
      data-sidebar="footer"
      className={cn("flex flex-col gap-2 p-2", className)}
      {...props}
    />
  );
}

type SidebarSeparatorProps = React.ComponentProps<typeof Separator>;

function SidebarSeparator({ className, ...props }: SidebarSeparatorProps) {
  return (
    <Separator
      data-slot="sidebar-separator"
      data-sidebar="separator"
      className={cn("bg-sidebar-border mx-2 w-auto ", className)}
      {...props}
    />
  );
}

type SidebarContentProps = React.ComponentProps<"div">;

function SidebarContent({ className, ...props }: SidebarContentProps) {
  return (
    <div
      data-slot="sidebar-content"
      data-sidebar="content"
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-2 overflow-auto group-data-[collapsible=icon]:overflow-hidden",
        className,
      )}
      {...props}
    />
  );
}

type SidebarGroupProps = React.ComponentProps<"div">;

function SidebarGroup({ className, ...props }: SidebarGroupProps) {
  return (
    <div
      data-slot="sidebar-group"
      data-sidebar="group"
      className={cn("relative flex w-full min-w-0 flex-col p-2", className)}
      {...props}
    />
  );
}

type SidebarGroupLabelProps = React.ComponentProps<"div"> & {
  asChild?: boolean;
};

function SidebarGroupLabel({ className, asChild = false, ...props }: SidebarGroupLabelProps) {
  const Comp = asChild ? Slot.Root : "div";

  return (
    <Comp
      data-slot="sidebar-group-label"
      data-sidebar="group-label"
      className={cn(
        "text-sidebar-foreground/70 ring-sidebar-ring flex h-8 shrink-0 items-center rounded-md px-2 text-callout font-semibold outline-hidden focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
        className,
      )}
      {...props}
    />
  );
}

type SidebarGroupActionProps = React.ComponentProps<"button"> & {
  asChild?: boolean;
};

function SidebarGroupAction({ className, asChild = false, ...props }: SidebarGroupActionProps) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="sidebar-group-action"
      data-sidebar="group-action"
      className={cn(
        "text-sidebar-foreground ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground absolute top-3.5 right-3 flex aspect-square w-5 items-center justify-center rounded-md p-0 outline-hidden transition-transform focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
        // Increases the hit area of the button on mobile.
        "after:absolute after:-inset-2 md:after:hidden",
        "group-data-[collapsible=icon]:hidden",
        className,
      )}
      {...props}
    />
  );
}

type SidebarGroupContentProps = React.ComponentProps<"div">;

function SidebarGroupContent({ className, ...props }: SidebarGroupContentProps) {
  return (
    <div
      data-slot="sidebar-group-content"
      data-sidebar="group-content"
      className={cn("w-full text-callout", className)}
      {...props}
    />
  );
}

const sidebarMenuButtonActiveVariants = cva(
  "bg-sidebar-accent text-sidebar-accent-foreground rounded-md",
  {
    variants: {
      variant: {
        default: "bg-sidebar-accent text-sidebar-accent-foreground",
        outline: "bg-sidebar-accent text-sidebar-accent-foreground ",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

const sidebarMenuButtonVariants = cva(
  "peer/menu-button flex w-full min-w-0 items-center gap-2 overflow-hidden rounded-md p-2 text-left text-callout outline-hidden ring-sidebar-ring transition-[color,background-color,box-shadow,border-color] duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] [&:not([data-highlight])]:hover:bg-sidebar-accent [&:not([data-highlight])]:hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 group-has-data-[sidebar=menu-action]/menu-item:pr-8 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground [&:not([data-highlight])]:data-[state=open]:hover:bg-sidebar-accent [&:not([data-highlight])]:data-[state=open]:hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:gap-0 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "[&:not([data-highlight])]:hover:bg-sidebar-accent [&:not([data-highlight])]:hover:text-sidebar-accent-foreground",
        outline:
          "bg-card  [&:not([data-highlight])]:hover:bg-sidebar-accent [&:not([data-highlight])]:hover:text-sidebar-accent-foreground [&:not([data-highlight])]:hover:",
      },
      size: {
        default: "h-8 text-callout",
        sm: "h-7 text-caption",
        lg: "h-12 text-callout group-data-[collapsible=icon]:p-0!",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

type SidebarMenuButtonProps = React.ComponentProps<"button"> & {
  asChild?: boolean;
  isActive?: boolean;
  tooltip?: string | React.ComponentProps<typeof TooltipContent>;
} & VariantProps<typeof sidebarMenuButtonVariants>;

const SidebarMenuButton = React.forwardRef<HTMLButtonElement, SidebarMenuButtonProps>(
  function SidebarMenuButton(
    {
      asChild = false,
      isActive = false,
      variant = "default",
      size = "default",
      tooltip,
      className,
      ...props
    }: SidebarMenuButtonProps,
    ref,
  ) {
    const Comp = asChild ? Slot.Root : "button";
    const { isMobile, state, hoverIntent } = useSidebar();

    const button = (
      <HighlightItem
        asChild
        emitAriaSelected={false}
        activeClassName={sidebarMenuButtonActiveVariants({ variant })}
      >
        <Comp
          ref={ref}
          data-slot="sidebar-menu-button"
          data-sidebar="menu-button"
          data-size={size}
          data-active={isActive}
          className={cn(sidebarMenuButtonVariants({ variant, size }), className)}
          {...props}
        />
      </HighlightItem>
    );

    if (!tooltip || (!isMobile && state === "collapsed")) {
      return button;
    }

    if (typeof tooltip === "string") {
      tooltip = {
        children: tooltip,
      };
    }

    const tooltipKey = typeof tooltip.children === "string" ? tooltip.children : undefined;

    return (
      <Tooltip key={tooltipKey} side="right" align="center">
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent hidden={state !== "collapsed" || isMobile || hoverIntent} {...tooltip} />
      </Tooltip>
    );
  },
);

export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
  useSidebarHoverPreviewLock,
};
