import { useEffect, useState } from "react";

import { usePreferencesStore } from "@/stores/use-preference-store";

export function usePrefersReducedMotion(): boolean {
  const userReduced = usePreferencesStore((s) => s.reduceMotion);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;

    const update = () => setReduced(mq.matches);
    update();

    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);

  return reduced || userReduced;
}
