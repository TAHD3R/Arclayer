import { useProgress } from "@bprogress/react";
import { useRouterState } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

export function RouteProgress() {
  const isLoading = useRouterState({ select: (s) => s.isLoading });
  const { start, stop } = useProgress();
  const started = useRef(false);

  useEffect(() => {
    if (isLoading && !started.current) {
      started.current = true;
      start();
      return;
    }

    if (!isLoading && started.current) {
      started.current = false;
      stop();
    }
  }, [isLoading, start, stop]);

  return null;
}
