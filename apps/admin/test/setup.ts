import "@testing-library/jest-dom/vitest";

/**
 * JSDOM (nwsapi) currently throws on some Selectors Level 4 patterns that Ant Design emits,
 * especially `:has()` with relative selectors like `> .ant-switch:only-child`.
 *
 * In browsers this is valid, but in tests it can surface as a runtime `SyntaxError` from
 * `Element#querySelector`. We defensively normalize selector lists by prefixing relative
 * selectors with `:scope` and dropping empty segments.
 */
function normalizeSelectorList(selector: string): string {
  if (!selector.includes(">")) return selector;
  if (!selector.includes(",")) return selector;

  const cleaned = selector.replace(/[\u200B-\u200D\uFEFF]/g, "");
  const parts = cleaned
    .split(",")
    .map((p) => p.replace(/[\u200B-\u200D\uFEFF]/g, "").trim())
    .filter((p) => p.length > 0)
    .map((p) => {
      // Relative selectors are valid inside `:has(...)`, but not valid for `querySelector(...)`
      // unless they're scoped. Normalize them to keep JSDOM from throwing.
      if (p.startsWith(">") || p.startsWith("+") || p.startsWith("~")) return `:scope ${p}`;
      return p;
    });

  const normalized = parts.join(", ");
  return normalized || cleaned || selector;
}

function patchSelectorApis() {
  const originalQuerySelector = Element.prototype.querySelector;
  const originalQuerySelectorAll = Element.prototype.querySelectorAll;

  Element.prototype.querySelector = function querySelectorPatched(selectors: string) {
    try {
      return originalQuerySelector.call(this, selectors);
    } catch {
      const normalized = normalizeSelectorList(selectors);
      if (normalized !== selectors) {
        try {
          return originalQuerySelector.call(this, normalized);
        } catch {
          // In tests, prefer a safe "no match" over throwing (JSDOM selector limitations).
          return this.ownerDocument?.createDocumentFragment().querySelector("*");
        }
      }

      // In tests, prefer a safe "no match" over throwing (JSDOM selector limitations).
      return this.ownerDocument?.createDocumentFragment().querySelector("*");
    }
  };

  Element.prototype.querySelectorAll = function querySelectorAllPatched(selectors: string) {
    try {
      return originalQuerySelectorAll.call(this, selectors);
    } catch {
      const normalized = normalizeSelectorList(selectors);
      if (normalized !== selectors) {
        try {
          return originalQuerySelectorAll.call(this, normalized);
        } catch {
          return (
            this.ownerDocument?.createDocumentFragment().querySelectorAll("*") ??
            ([] as unknown as NodeListOf<Element>)
          );
        }
      }

      return (
        this.ownerDocument?.createDocumentFragment().querySelectorAll("*") ??
        ([] as unknown as NodeListOf<Element>)
      );
    }
  };
}

patchSelectorApis();

// JSDOM does not provide ResizeObserver; Radix primitives rely on it for layout measurement.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

type ResizeObserverConstructor = typeof ResizeObserverStub;
const globalWithResizeObserver = globalThis as unknown as {
  ResizeObserver?: ResizeObserverConstructor;
};
if (!globalWithResizeObserver.ResizeObserver) {
  globalWithResizeObserver.ResizeObserver = ResizeObserverStub;
}

type PointerCaptureCapableElement = Element & {
  hasPointerCapture?: (pointerId: number) => boolean;
  setPointerCapture?: (pointerId: number) => void;
  releasePointerCapture?: (pointerId: number) => void;
};

const elementPrototype = Element.prototype as PointerCaptureCapableElement;

if (!elementPrototype.hasPointerCapture) {
  elementPrototype.hasPointerCapture = () => false;
}

if (!elementPrototype.setPointerCapture) {
  elementPrototype.setPointerCapture = () => undefined;
}

if (!elementPrototype.releasePointerCapture) {
  elementPrototype.releasePointerCapture = () => undefined;
}

if (!HTMLElement.prototype.scrollIntoView) {
  HTMLElement.prototype.scrollIntoView = () => undefined;
}
