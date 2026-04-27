import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { ArrowLeftIcon } from "lucide-react";
import { AnimatePresence, motion, MotionConfig, type Variants } from "motion/react";

import { cn } from "@arclayer/lib/utils";
import {
  focusInitialFloatingPanelTarget,
  trapFocusWithinFloatingPanel,
} from "./floating-panel-focus";
import { OVERLAY_LAYER_SHADOW_CLASSNAME } from "./layer-shadow";

const TRANSITION = {
  type: "spring" as const,
  bounce: 0.1,
  duration: 0.4,
};
const ACTIVATION_CLICK_SUPPRESSION_MS = 500;

interface FloatingPanelContextType {
  isOpen: boolean;
  openFloatingPanel: (triggerEl: HTMLElement) => void;
  closeFloatingPanel: () => void;
  uniqueId: string;
  note: string;
  setNote: (note: string) => void;
  triggerRect: DOMRect | null;
  triggerEl: HTMLElement | null;
  title: string;
  setTitle: (title: string) => void;
}

const FloatingPanelContext = createContext<FloatingPanelContextType | undefined>(undefined);

export function useFloatingPanel() {
  const context = useContext(FloatingPanelContext);
  if (!context) {
    throw new Error("useFloatingPanel must be used within a FloatingPanelProvider");
  }
  return context;
}

function useFloatingPanelLogic() {
  const uniqueId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [note, setNote] = useState("");
  const [triggerRect, setTriggerRect] = useState<DOMRect | null>(null);
  const [triggerEl, setTriggerEl] = useState<HTMLElement | null>(null);
  const [title, setTitle] = useState("");
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  const openFloatingPanel = (nextTriggerEl: HTMLElement) => {
    const activeElement =
      document.activeElement instanceof HTMLElement && document.activeElement !== document.body
        ? document.activeElement
        : null;
    previousFocusRef.current = activeElement ?? nextTriggerEl;
    setTriggerEl(nextTriggerEl);
    setTriggerRect(nextTriggerEl.getBoundingClientRect());
    setIsOpen(true);
  };
  const closeFloatingPanel = () => {
    restoreFocusRef.current = previousFocusRef.current ?? triggerEl;
    setIsOpen(false);
    setNote("");
  };

  useEffect(() => {
    if (isOpen) return;
    const restoreTarget = restoreFocusRef.current;
    if (!restoreTarget?.isConnected) return;

    restoreTarget.focus();
    restoreFocusRef.current = null;
  }, [isOpen]);

  return {
    isOpen,
    openFloatingPanel,
    closeFloatingPanel,
    uniqueId,
    note,
    setNote,
    triggerRect,
    triggerEl,
    title,
    setTitle,
  };
}

interface FloatingPanelRootProps {
  children: React.ReactNode;
  className?: string;
}

export function FloatingPanelRoot({ children, className }: FloatingPanelRootProps) {
  const floatingPanelLogic = useFloatingPanelLogic();

  return (
    <FloatingPanelContext.Provider value={floatingPanelLogic}>
      <MotionConfig transition={TRANSITION}>
        <div className={cn("relative", className)}>{children}</div>
      </MotionConfig>
    </FloatingPanelContext.Provider>
  );
}

interface FloatingPanelTriggerProps {
  children: React.ReactNode;
  className?: string;
  title: string;
  disableLayoutId?: boolean;
  onMouseEnter?: React.MouseEventHandler<HTMLButtonElement>;
  onMouseLeave?: React.MouseEventHandler<HTMLButtonElement>;
  onFocus?: React.FocusEventHandler<HTMLButtonElement>;
  onBlur?: React.FocusEventHandler<HTMLButtonElement>;
  disabled?: boolean;
  "aria-label"?: string;
}

function assignRef<T>(ref: React.Ref<T> | undefined, value: T | null) {
  if (typeof ref === "function") {
    ref(value);
    return;
  }
  if (!ref) return;
  (ref as React.MutableRefObject<T | null>).current = value;
}

export const FloatingPanelTrigger = React.forwardRef<HTMLButtonElement, FloatingPanelTriggerProps>(
  function FloatingPanelTrigger(
    { children, className, title, disableLayoutId = false, ...buttonProps },
    forwardedRef,
  ) {
    const { isOpen, openFloatingPanel, closeFloatingPanel, uniqueId, setTitle } =
      useFloatingPanel();
    const triggerRef = useRef<HTMLButtonElement>(null);
    const suppressNextClickRef = useRef(false);
    const suppressTimeoutRef = useRef<number | null>(null);

    useEffect(() => {
      return () => {
        if (suppressTimeoutRef.current !== null) {
          window.clearTimeout(suppressTimeoutRef.current);
        }
      };
    }, []);

    const toggleOpen = (triggerEl: HTMLButtonElement) => {
      if (isOpen) {
        closeFloatingPanel();
        return;
      }
      openFloatingPanel(triggerEl);
      setTitle(title);
    };

    const handleClick: React.MouseEventHandler<HTMLButtonElement> = (e) => {
      if (suppressNextClickRef.current) {
        suppressNextClickRef.current = false;
        return;
      }
      toggleOpen(e.currentTarget);
    };

    const handlePointerUp: React.PointerEventHandler<HTMLButtonElement> = (e) => {
      if (buttonProps.disabled) return;
      if (e.button > 0) return;

      suppressNextClickRef.current = true;
      if (suppressTimeoutRef.current !== null) {
        window.clearTimeout(suppressTimeoutRef.current);
      }
      suppressTimeoutRef.current = window.setTimeout(() => {
        suppressNextClickRef.current = false;
        suppressTimeoutRef.current = null;
      }, ACTIVATION_CLICK_SUPPRESSION_MS);

      toggleOpen(e.currentTarget);
    };

    return (
      <motion.button
        ref={(node) => {
          triggerRef.current = node;
          assignRef(forwardedRef, node);
        }}
        layoutId={disableLayoutId ? undefined : `floating-panel-trigger-${uniqueId}`}
        className={cn(
          "flex items-center",
          "border border-border bg-card text-label-primary",
          className,
        )}
        {...buttonProps}
        type="button"
        onPointerUp={handlePointerUp}
        onClick={handleClick}
        data-state={isOpen ? "open" : "closed"}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={`floating-panel-content-${uniqueId}`}
      >
        {children}
      </motion.button>
    );
  },
);

interface FloatingPanelContentProps {
  children: React.ReactNode;
  className?: string;
  placement?: "auto" | "top" | "bottom" | "right-start";
  offset?: number;
  viewportPadding?: number;
  showTitle?: boolean;
  description?: React.ReactNode;
  titleClassName?: string;
  descriptionClassName?: string;
}

export function FloatingPanelContent({
  children,
  className,
  placement = "auto",
  offset = 8,
  viewportPadding = 12,
  showTitle = true,
  description,
  titleClassName,
  descriptionClassName,
}: FloatingPanelContentProps) {
  const { isOpen, closeFloatingPanel, uniqueId, triggerRect, triggerEl, title } =
    useFloatingPanel();
  const contentRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const computePosition = useCallback(() => {
    if (!isOpen) return;

    const panelEl = contentRef.current;
    const anchorRect = triggerEl?.getBoundingClientRect() ?? triggerRect;
    if (!panelEl || !anchorRect) return;

    // Use layout metrics that are not affected by transform animations.
    const panelWidth =
      panelEl.offsetWidth || panelEl.clientWidth || panelEl.getBoundingClientRect().width;
    const panelHeight =
      panelEl.offsetHeight || panelEl.clientHeight || panelEl.getBoundingClientRect().height;
    if (!panelWidth || !panelHeight) return;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

    const leftMin = viewportPadding;
    const leftMax = Math.max(leftMin, vw - panelWidth - viewportPadding);
    let left = clamp(anchorRect.left, leftMin, leftMax);

    if (placement === "right-start") {
      left = clamp(anchorRect.right + offset, leftMin, leftMax);
      const top = clamp(
        anchorRect.top,
        viewportPadding,
        Math.max(viewportPadding, vh - panelHeight - viewportPadding),
      );
      setPosition((prev) => {
        if (prev && Math.abs(prev.left - left) < 0.5 && Math.abs(prev.top - top) < 0.5) return prev;
        return { left, top };
      });
      return;
    }

    const spaceBottom = vh - anchorRect.bottom;
    const spaceTop = anchorRect.top;
    const wantsBottom = placement === "bottom";
    const wantsTop = placement === "top";
    const canBottom = spaceBottom >= panelHeight + offset + viewportPadding;
    const canTop = spaceTop >= panelHeight + offset + viewportPadding;

    let top: number;
    if (wantsBottom) {
      top = anchorRect.bottom + offset;
    } else if (wantsTop) {
      top = anchorRect.top - panelHeight - offset;
    } else {
      top =
        canBottom || !canTop ? anchorRect.bottom + offset : anchorRect.top - panelHeight - offset;
    }

    const topMin = viewportPadding;
    const topMax = Math.max(topMin, vh - panelHeight - viewportPadding);
    top = clamp(top, topMin, topMax);

    setPosition((prev) => {
      if (prev && Math.abs(prev.left - left) < 0.5 && Math.abs(prev.top - top) < 0.5) {
        return prev;
      }
      return { left, top };
    });
  }, [isOpen, offset, placement, triggerEl, triggerRect, viewportPadding]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (contentRef.current?.contains(target)) return;
      if (triggerEl?.contains(target)) return;
      closeFloatingPanel();
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [closeFloatingPanel, triggerEl]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeFloatingPanel();
        return;
      }
      if (!contentRef.current) return;
      trapFocusWithinFloatingPanel(contentRef.current, event);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [closeFloatingPanel]);

  const variants: Variants = {
    hidden: { opacity: 0, scale: 0.9, y: 10 },
    visible: { opacity: 1, scale: 1, y: 0 },
  };

  useLayoutEffect(() => {
    if (!isOpen) return;
    const el = contentRef.current;
    if (!el) return;

    const raf = window.requestAnimationFrame(computePosition);
    const ro =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => computePosition()) : null;
    ro?.observe(el);

    return () => {
      window.cancelAnimationFrame(raf);
      ro?.disconnect();
    };
  }, [computePosition, isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    computePosition();
    window.addEventListener("resize", computePosition);
    window.addEventListener("scroll", computePosition, true);
    return () => {
      window.removeEventListener("resize", computePosition);
      window.removeEventListener("scroll", computePosition, true);
    };
  }, [computePosition, isOpen]);

  useEffect(() => {
    if (!isOpen || !contentRef.current) return;
    focusInitialFloatingPanelTarget(contentRef.current);
  }, [isOpen]);

  const panelNode = (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={cn("fixed inset-0 z-40 pointer-events-auto")}
          />
          <motion.div
            ref={contentRef}
            layoutId={`floating-panel-${uniqueId}`}
            className={cn(
              "fixed z-50 overflow-hidden outline-none",
              "rounded-xl border border-border bg-popover text-popover-foreground ",
              OVERLAY_LAYER_SHADOW_CLASSNAME,
              className,
            )}
            style={{
              left: position ? position.left : triggerRect ? triggerRect.left : "50%",
              top: position ? position.top : triggerRect ? triggerRect.bottom + offset : "50%",
              transformOrigin: "top left",
            }}
            initial="hidden"
            animate="visible"
            exit="hidden"
            variants={variants}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`floating-panel-title-${uniqueId}`}
            aria-describedby={description ? `floating-panel-desc-${uniqueId}` : undefined}
            id={`floating-panel-content-${uniqueId}`}
            tabIndex={-1}
          >
            {showTitle ? (
              <FloatingPanelTitle
                description={description}
                titleClassName={titleClassName}
                descriptionClassName={descriptionClassName}
              >
                {title}
              </FloatingPanelTitle>
            ) : null}
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  if (typeof document === "undefined") return null;
  return createPortal(panelNode, document.body);
}

interface FloatingPanelTitleProps {
  children: React.ReactNode;
  description?: React.ReactNode;
  titleClassName?: string;
  descriptionClassName?: string;
}

function FloatingPanelTitle({
  children,
  description,
  titleClassName,
  descriptionClassName,
}: FloatingPanelTitleProps) {
  const { uniqueId } = useFloatingPanel();

  return (
    <motion.div
      layoutId={`floating-panel-label-container-${uniqueId}`}
      className={cn("p-4", "border-b border-border/60")}
    >
      <motion.div
        layoutId={`floating-panel-label-${uniqueId}`}
        className={cn("text-title3! font-bold! text-label-primary", titleClassName)}
        id={`floating-panel-title-${uniqueId}`}
      >
        {children}
      </motion.div>
      {description ? (
        <div
          className={cn("mt-1 text-callout text-label-secondary!", descriptionClassName)}
          id={`floating-panel-desc-${uniqueId}`}
        >
          {description}
        </div>
      ) : null}
    </motion.div>
  );
}

interface FloatingPanelFormProps {
  children: React.ReactNode;
  onSubmit?: (note: string) => void;
  className?: string;
}

export function FloatingPanelForm({ children, onSubmit, className }: FloatingPanelFormProps) {
  const { note, closeFloatingPanel } = useFloatingPanel();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit?.(note);
    closeFloatingPanel();
  };

  return (
    <form className={cn("flex h-full flex-col", className)} onSubmit={handleSubmit}>
      {children}
    </form>
  );
}

interface FloatingPanelLabelProps {
  children: React.ReactNode;
  htmlFor: string;
  className?: string;
}

export function FloatingPanelLabel({ children, htmlFor, className }: FloatingPanelLabelProps) {
  const { note } = useFloatingPanel();

  return (
    <motion.label
      htmlFor={htmlFor}
      style={{ opacity: note ? 0 : 1 }}
      className={cn("block mb-2 text-footnote font-medium", className)}
    >
      {children}
    </motion.label>
  );
}

interface FloatingPanelTextareaProps {
  className?: string;
  id?: string;
}

export function FloatingPanelTextarea({ className, id }: FloatingPanelTextareaProps) {
  const { note, setNote } = useFloatingPanel();

  return (
    <textarea
      id={id}
      className={cn(
        "h-full w-full resize-none rounded-md bg-transparent px-4 py-3 text-footnote outline-none",
        className,
      )}
      autoFocus
      value={note}
      onChange={(e) => setNote(e.target.value)}
    />
  );
}

interface FloatingPanelHeaderProps {
  children: React.ReactNode;
  className?: string;
}

export function FloatingPanelHeader({ children, className }: FloatingPanelHeaderProps) {
  return (
    <motion.div
      className={cn("px-4 py-2 font-semibold", className)}
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
    >
      {children}
    </motion.div>
  );
}

interface FloatingPanelBodyProps {
  children: React.ReactNode;
  className?: string;
}

export function FloatingPanelBody({ children, className }: FloatingPanelBodyProps) {
  return (
    <motion.div
      className={cn("p-4", className)}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
    >
      {children}
    </motion.div>
  );
}

interface FloatingPanelFooterProps {
  children: React.ReactNode;
  className?: string;
}

export function FloatingPanelFooter({ children, className }: FloatingPanelFooterProps) {
  return (
    <motion.div
      className={cn("flex justify-between px-4 py-3", className)}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
    >
      {children}
    </motion.div>
  );
}

interface FloatingPanelCloseButtonProps {
  className?: string;
}

export function FloatingPanelCloseButton({ className }: FloatingPanelCloseButtonProps) {
  const { closeFloatingPanel } = useFloatingPanel();

  return (
    <motion.button
      type="button"
      className={cn("flex items-center", className)}
      onClick={closeFloatingPanel}
      aria-label="Close floating panel"
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.9 }}
    >
      <ArrowLeftIcon size={16} />
    </motion.button>
  );
}

interface FloatingPanelSubmitButtonProps {
  className?: string;
}

export function FloatingPanelSubmitButton({ className }: FloatingPanelSubmitButtonProps) {
  return (
    <motion.button
      className={cn(
        "relative ml-1 flex h-8 shrink-0 scale-100 select-none appearance-none items-center justify-center rounded-lg border border-zinc-950/10 bg-transparent px-2 text-footnote text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 focus-visible:ring-2 active:scale-[0.98] dark:border-zinc-50/10 dark:text-zinc-50 dark:hover:bg-zinc-800",
        className,
      )}
      type="submit"
      aria-label="Submit note"
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
    >
      Submit Note
    </motion.button>
  );
}

interface FloatingPanelButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  onMouseEnter?: React.MouseEventHandler<HTMLButtonElement>;
  onMouseLeave?: React.MouseEventHandler<HTMLButtonElement>;
  onFocus?: React.FocusEventHandler<HTMLButtonElement>;
  onBlur?: React.FocusEventHandler<HTMLButtonElement>;
}

export function FloatingPanelButton({
  children,
  onClick,
  className,
  onMouseEnter,
  onMouseLeave,
  onFocus,
  onBlur,
}: FloatingPanelButtonProps) {
  return (
    <motion.button
      className={cn(
        "flex w-full items-center gap-2 rounded-sm px-4 py-2 text-left text-footnote",
        "hover:bg-muted",
        className,
      )}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onFocus={onFocus}
      onBlur={onBlur}
      whileTap={{ scale: 0.98 }}
    >
      {children}
    </motion.button>
  );
}

export default {
  Root: FloatingPanelRoot,
  Trigger: FloatingPanelTrigger,
  Content: FloatingPanelContent,
  Form: FloatingPanelForm,
  Label: FloatingPanelLabel,
  Textarea: FloatingPanelTextarea,
  Header: FloatingPanelHeader,
  Body: FloatingPanelBody,
  Footer: FloatingPanelFooter,
  CloseButton: FloatingPanelCloseButton,
  SubmitButton: FloatingPanelSubmitButton,
  Button: FloatingPanelButton,
};
