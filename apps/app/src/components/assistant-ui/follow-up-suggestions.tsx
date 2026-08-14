"use client";

import { AuiIf, ThreadPrimitive, useAuiState } from "@assistant-ui/react";
import { useCallback, useEffect, useRef, useState, type FC } from "react";

const FollowupSuggestionsRow: FC = () => {
  const suggestions = useAuiState((state) => state.thread.suggestions);
  const scrollRef = useRef<HTMLDivElement>(null);
  const rtlRef = useRef<boolean | null>(null);
  const [fades, setFades] = useState({ left: false, right: false });

  const updateFades = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;
    const maxScroll = element.scrollWidth - element.clientWidth;
    const fromStart = Math.abs(element.scrollLeft);
    const rtl = (rtlRef.current ??= getComputedStyle(element).direction === "rtl");
    const [left, right] = rtl
      ? [maxScroll - fromStart, fromStart]
      : [fromStart, maxScroll - fromStart];
    setFades((previous) => {
      const next = { left: left > 1, right: right > 1 };
      return previous.left === next.left && previous.right === next.right ? previous : next;
    });
  }, []);

  useEffect(() => {
    updateFades();
    const element = scrollRef.current;
    if (!element?.firstElementChild) return undefined;
    const observer = new ResizeObserver(updateFades);
    observer.observe(element);
    observer.observe(element.firstElementChild);
    return () => observer.disconnect();
  }, [updateFades]);

  const maskImage = `linear-gradient(to right, ${
    fades.left ? "transparent, black 2rem" : "black"
  }, ${fades.right ? "black calc(100% - 2rem), transparent" : "black"})`;

  return (
    <div
      ref={scrollRef}
      onScroll={updateFades}
      className="aui-thread-followup-suggestions -my-1 w-full overflow-x-auto py-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      style={{ maskImage, WebkitMaskImage: maskImage }}
    >
      <div className="mx-auto flex min-h-8 w-max items-center gap-2 px-0.5">
        {suggestions.map((suggestion, index) => (
          <ThreadPrimitive.Suggestion
            key={`${suggestion.prompt}:${index}`}
            className="aui-thread-followup-suggestion rounded-full border border-border/70 bg-background px-3 py-1 text-sm whitespace-nowrap transition-colors ease-in hover:bg-muted/80"
            prompt={suggestion.prompt}
            method="replace"
            send
          >
            {suggestion.prompt}
          </ThreadPrimitive.Suggestion>
        ))}
      </div>
    </div>
  );
};

export const ThreadFollowupSuggestions: FC = () => (
  <AuiIf
    condition={(state) =>
      !state.thread.isEmpty && !state.thread.isRunning && state.thread.suggestions.length > 0
    }
  >
    <FollowupSuggestionsRow />
  </AuiIf>
);
