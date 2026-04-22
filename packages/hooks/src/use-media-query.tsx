import * as React from "react";

function getMatchMedia(query: string): MediaQueryList | null {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return null;
  }
  return window.matchMedia(query);
}

function getSnapshot(query: string): boolean {
  return getMatchMedia(query)?.matches ?? false;
}

function subscribe(query: string, onStoreChange: () => void): () => void {
  const mediaQueryList = getMatchMedia(query);
  if (!mediaQueryList) {
    return () => {};
  }

  const onChange = () => onStoreChange();
  if (typeof mediaQueryList.addEventListener === "function") {
    mediaQueryList.addEventListener("change", onChange);
    return () => {
      mediaQueryList.removeEventListener("change", onChange);
    };
  }

  mediaQueryList.addListener(onChange);

  return () => {
    mediaQueryList.removeListener(onChange);
  };
}

export function useMediaQuery(query: string): boolean {
  const subscribeToQuery = React.useCallback(
    (onStoreChange: () => void) => subscribe(query, onStoreChange),
    [query],
  );
  const getQuerySnapshot = React.useCallback(() => getSnapshot(query), [query]);

  return React.useSyncExternalStore(subscribeToQuery, getQuerySnapshot, () => false);
}
