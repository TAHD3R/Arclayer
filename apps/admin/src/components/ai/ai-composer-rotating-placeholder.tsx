import { useAuiState } from "@assistant-ui/react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { cn } from "@arclayer/lib/utils";

const PLACEHOLDER_INTERVAL_MS = 3_200;

const PLACEHOLDER_KEYS = [
  "AI_CHAT_PLACEHOLDER_CREATE_SITE",
  "AI_CHAT_PLACEHOLDER_REVIEW_PROJECT",
  "AI_CHAT_PLACEHOLDER_MENTION_AGENT",
  "AI_CHAT_PLACEHOLDER_COMMAND_OR_SKILL",
  "AI_CHAT_PLACEHOLDER_BRAND_DIRECTION",
  "AI_CHAT_PLACEHOLDER_PROJECT_CONTEXT",
] as const;

export function AIComposerRotatingPlaceholder(props: { className?: string; multiline?: boolean }) {
  const { t } = useTranslation("ai");
  const composerText = useAuiState((state) => state.composer.text);
  const reducedMotion = usePrefersReducedMotion();
  const placeholders = useMemo(() => PLACEHOLDER_KEYS.map((key) => t(key)), [t]);
  const [position, setPosition] = useState(0);
  const [pageVisible, setPageVisible] = useState(() => document.visibilityState !== "hidden");

  useEffect(() => {
    const handleVisibilityChange = () => {
      setPageVisible(document.visibilityState !== "hidden");
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  useEffect(() => {
    if (reducedMotion || !pageVisible || placeholders.length < 2) return undefined;
    const intervalId = window.setInterval(() => {
      setPosition((current) => (current + 1) % placeholders.length);
    }, PLACEHOLDER_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [pageVisible, placeholders.length, reducedMotion]);

  const activePlaceholder = placeholders[position % placeholders.length] ?? "";

  return (
    <span
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-x-3 top-2 overflow-hidden text-callout leading-6 text-label-secondary",
        props.multiline ? "h-12" : "h-6",
        composerText.length === 0 ? "opacity-100" : "opacity-0",
        props.className,
      )}
    >
      <span
        key={`${position}:${activePlaceholder}`}
        data-placeholder-index={position}
        className={cn(
          "fade-in slide-in-from-bottom-1 block animate-in duration-300 motion-reduce:animate-none",
          props.multiline ? "line-clamp-2 whitespace-normal" : "truncate",
        )}
      >
        {activePlaceholder}
      </span>
    </span>
  );
}
