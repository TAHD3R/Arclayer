import { AnimatePresence, motion } from "motion/react";
import { createPortal } from "react-dom";

import { ArcWeaveLoader } from "@/components/layout/arc-weave-loader";

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
          <ArcWeaveLoader className="size-16 text-label-primary" />
        </motion.div>
      )}
    </AnimatePresence>
  );

  if (typeof document === "undefined") {
    return overlay;
  }

  return createPortal(overlay, document.body);
}
