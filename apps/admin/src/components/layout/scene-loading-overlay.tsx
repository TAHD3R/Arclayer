import { AnimatePresence, motion } from "motion/react";

interface SceneLoadingOverlayProps {
  visible: boolean;
}

/**
 * Full-screen overlay that masks layout switches (auth → admin, admin → editor, etc.).
 * Reuses the same conic-gradient square animation as the Vite-injected first-paint loader
 * so the visual language stays consistent.
 */
export function SceneLoadingOverlay({ visible }: SceneLoadingOverlayProps) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="scene-loading-overlay"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="fixed inset-0 z-2147483646 flex items-center justify-center bg-card pointer-events-none"
        >
          <div className="scene-loader" role="status" aria-label="Loading" />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
