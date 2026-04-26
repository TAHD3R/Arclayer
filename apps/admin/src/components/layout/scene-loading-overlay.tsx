import { AnimatePresence, motion } from "motion/react";
import { createPortal } from "react-dom";
import { Spinner } from "@arclayer/ui/spinner";

interface SceneLoadingOverlayProps {
  visible: boolean;
}

export function SceneLoadingOverlay({ visible }: SceneLoadingOverlayProps) {
  const overlay = (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="scene-loading-overlay"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="fixed inset-0 z-[2147483646] flex items-center justify-center bg-background pointer-events-none"
        >
          <Spinner
            role="status"
            aria-live="polite"
            aria-label="Loading"
            className="size-4 text-label-secondary"
          />
        </motion.div>
      )}
    </AnimatePresence>
  );

  if (typeof document === "undefined") {
    return overlay;
  }

  return createPortal(overlay, document.body);
}
