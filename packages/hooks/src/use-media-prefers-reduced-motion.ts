import { useEffect, useState } from "react";

const REDUCED_MOTION_MEDIA_QUERY = "(prefers-reduced-motion: reduce)";

function readReducedMotionPreference(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.(REDUCED_MOTION_MEDIA_QUERY).matches === true
  );
}

export function useMediaPrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(readReducedMotionPreference);

  useEffect(() => {
    const mq = window.matchMedia?.(REDUCED_MOTION_MEDIA_QUERY);
    if (!mq) return;

    const update = () => setReduced(mq.matches);
    update();

    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);

  return reduced;
}
