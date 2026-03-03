import { useEffect, type RefObject } from "react";

export function useOutsideClick<T extends HTMLElement = HTMLDivElement>(
  ref: RefObject<T | null>,
  callback: (event: Event) => void,
) {
  useEffect(() => {
    const listener = (event: Event) => {
      const el = ref.current;
      if (!el) return;

      // Ignore clicks within the referenced element.
      const target = event.target;
      if (target instanceof Node && el.contains(target)) return;

      callback(event);
    };

    document.addEventListener("mousedown", listener);
    document.addEventListener("touchstart", listener);

    return () => {
      document.removeEventListener("mousedown", listener);
      document.removeEventListener("touchstart", listener);
    };
  }, [ref, callback]);
}
