import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "@arclayer/ui/icons/lucide-animated";
import { AnimatePresence, motion } from "motion/react";

interface ExpandableScreenContextValue {
  isExpanded: boolean;
  expand: () => void;
  collapse: () => void;
  layoutId: string;
  triggerRadius: string;
  contentRadius: string;
  animationDuration: number;
  overlayZIndexClassName: string;
}

const ExpandableScreenContext = createContext<ExpandableScreenContextValue | null>(null);

function useExpandableScreen() {
  const context = useContext(ExpandableScreenContext);
  if (!context) {
    throw new Error("useExpandableScreen must be used within an ExpandableScreen");
  }
  return context;
}

interface ExpandableScreenProps {
  children: ReactNode;
  defaultExpanded?: boolean;
  expanded?: boolean;
  onExpandChange?: (expanded: boolean) => void;
  layoutId?: string;
  triggerRadius?: string;
  contentRadius?: string;
  animationDuration?: number;
  lockScroll?: boolean;
  overlayZIndexClassName?: string;
}

export function ExpandableScreen({
  children,
  defaultExpanded = false,
  expanded,
  onExpandChange,
  layoutId = "expandable-card",
  triggerRadius = "100px",
  contentRadius = "24px",
  animationDuration = 0.3,
  lockScroll = true,
  overlayZIndexClassName = "z-[2200]",
}: ExpandableScreenProps) {
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded);
  const isControlled = expanded !== undefined;
  const isExpanded = isControlled ? expanded : internalExpanded;

  const setExpanded = (next: boolean) => {
    if (!isControlled) {
      setInternalExpanded(next);
    }
    onExpandChange?.(next);
  };

  const expand = () => setExpanded(true);
  const collapse = () => setExpanded(false);

  useEffect(() => {
    if (!lockScroll) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = isExpanded ? "hidden" : prevOverflow || "unset";

    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isExpanded, lockScroll]);

  useEffect(() => {
    document.body.dataset.expandableScreen = isExpanded ? "open" : "closed";
    return () => {
      delete document.body.dataset.expandableScreen;
    };
  }, [isExpanded]);

  const contextValue = useMemo(
    () => ({
      isExpanded,
      expand,
      collapse,
      layoutId,
      triggerRadius,
      contentRadius,
      animationDuration,
      overlayZIndexClassName,
    }),
    [isExpanded, layoutId, triggerRadius, contentRadius, animationDuration, overlayZIndexClassName],
  );

  return (
    <ExpandableScreenContext.Provider value={contextValue}>
      {children}
    </ExpandableScreenContext.Provider>
  );
}

interface ExpandableScreenTriggerProps {
  children: ReactNode;
  className?: string;
}

export function ExpandableScreenTrigger({
  children,
  className = "",
}: ExpandableScreenTriggerProps) {
  const { isExpanded, expand, layoutId, triggerRadius } = useExpandableScreen();

  return (
    <AnimatePresence initial={false}>
      {!isExpanded && (
        <motion.div className={`relative inline-block ${className}`}>
          <motion.div
            style={{ borderRadius: triggerRadius }}
            layout
            layoutId={layoutId}
            className="absolute inset-0 transform-gpu will-change-transform"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            exit={{ opacity: 0, scale: 0.8 }}
            layout={false}
            onClick={expand}
            className="relative cursor-pointer"
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface ExpandableScreenContentProps {
  children: ReactNode;
  className?: string;
  showCloseButton?: boolean;
  closeButtonClassName?: string;
}

export function ExpandableScreenContent({
  children,
  className = "",
  showCloseButton = true,
  closeButtonClassName = "",
}: ExpandableScreenContentProps) {
  const {
    isExpanded,
    collapse,
    layoutId,
    contentRadius,
    animationDuration,
    overlayZIndexClassName,
  } = useExpandableScreen();

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence initial={false}>
      {isExpanded && (
        <div className={`fixed inset-0 ${overlayZIndexClassName} p-2 sm:p-3`}>
          <motion.button
            type="button"
            aria-label="Close overlay"
            className="absolute inset-0 h-full w-full bg-background/90 backdrop-blur-[1px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={collapse}
          />

          <motion.div
            layoutId={layoutId}
            transition={{ duration: animationDuration }}
            style={{ borderRadius: contentRadius }}
            layout
            className={`relative z-10 flex h-full w-full overflow-hidden transform-gpu will-change-transform ${className}`}
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1, duration: 0.3 }}
              className="relative h-full w-full"
            >
              {children}
            </motion.div>
          </motion.div>

          {showCloseButton ? (
            <motion.button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                collapse();
              }}
              className={`absolute right-5 top-5 z-20 flex h-11 w-11 items-center justify-center rounded-full pointer-events-auto transition-colors ${
                closeButtonClassName || "bg-transparent text-white hover:bg-white/10"
              }`}
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </motion.button>
          ) : null}
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

interface ExpandableScreenBackgroundProps {
  trigger?: ReactNode;
  content?: ReactNode;
  className?: string;
}

export function ExpandableScreenBackground({
  trigger,
  content,
  className = "",
}: ExpandableScreenBackgroundProps) {
  const { isExpanded } = useExpandableScreen();

  if (isExpanded && content) {
    return <div className={className}>{content}</div>;
  }

  if (!isExpanded && trigger) {
    return <div className={className}>{trigger}</div>;
  }

  return null;
}

export { useExpandableScreen };
