import { type Plugin } from "vite";

export interface InjectLoadingScreenOptions {
  /**
   * Text shown on the pre-React loading screen (usually product/app name).
   * Keep it simple: this runs before React, so avoid WebFont-only designs and heavy JS animation.
   */
  appName?: string;

  /**
   * Minimum duration (ms) the loading screen stays visible once it becomes visible.
   * Default: 320
   */
  minVisibleMs?: number;
}

export function injectLoadingScreen(options: InjectLoadingScreenOptions = {}): Plugin {
  const appName = options.appName?.trim() ? options.appName.trim() : "Loading";
  const minVisibleMsRaw = options.minVisibleMs;
  const minVisibleMs =
    typeof minVisibleMsRaw === "number" && Number.isFinite(minVisibleMsRaw)
      ? Math.max(0, Math.min(5_000, Math.floor(minVisibleMsRaw)))
      : 320;

  const style = `
#app-loading {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  background: hsl(var(--background, 0 0% 100%));
  color: hsl(var(--foreground, 0 0% 6.7%));
  font-family: var(--font-sans, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif);
  z-index: 9999;
  opacity: 1;
  transform: translateZ(0);
  transition: opacity 360ms ease-out;
}
[data-theme="dark"] #app-loading {
  background: hsl(var(--background, 0 0% 0%));
  color: hsl(var(--foreground, 0 0% 89.8%));
}
#app-loading.is-hiding {
  opacity: 0;
}
#app-loading .spinner {
  width: 16px;
  height: 16px;
  color: hsl(var(--muted-foreground, 215 16% 47%));
  animation: app-loading-spin 1s linear infinite;
}
#app-loading .spinner circle {
  opacity: 0.25;
}
#app-loading .spinner path {
  opacity: 1;
}

@keyframes app-loading-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  #app-loading {
    transition: opacity 0ms linear;
  }
  #app-loading .spinner {
    animation: none;
  }
}
`.trim();

  const innerHtml = `
<svg
  class="spinner"
  viewBox="0 0 24 24"
  role="status"
  aria-label="${escapeHtml(appName)}"
  aria-live="polite"
>
  <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="4"></circle>
  <path
    d="M12 2a10 10 0 0 1 10 10"
    fill="none"
    stroke="currentColor"
    stroke-width="4"
    stroke-linecap="round"
  ></path>
</svg>
`.trim();

  const script = `
(function () {
  try {
    // Record a "visible time" after the first paint so transitions always have a start state.
    var visibleAt = 0;
    var hiding = false;

    var markVisible = function () {
      try {
        visibleAt = Date.now();
      } catch (e) {}
    };

    // This runs before the first paint; the nested RAF runs after at least one paint.
    requestAnimationFrame(function () {
      requestAnimationFrame(markVisible);
    });

    window.__hideAppLoading = function () {
      try {
        var el = document.getElementById("app-loading");
        if (!el) return;
        if (hiding) return;
        hiding = true;

        // Keep it visible for a minimum duration so it feels like a real splash,
        // but still hide quickly once the app is ready.
        var now = Date.now();
        var base = visibleAt || now;
        var elapsed = now - base;
        var minVisible = ${minVisibleMs};
        var delay = elapsed >= minVisible ? 0 : (minVisible - elapsed);

        setTimeout(function () {
          try {
            el.classList.add("is-hiding");
            setTimeout(function () {
              el.remove();
            }, 420);
          } catch (e) {}
        }, delay);
      } catch (e) {}
    };
  } catch (e) {}
})();
`.trim();

  return {
    name: "arclayer-inject-loading-screen",
    enforce: "pre",
    transformIndexHtml() {
      return [
        {
          tag: "style",
          attrs: { id: "app-loading-style" },
          children: style,
          injectTo: "head",
        },
        {
          tag: "script",
          attrs: {},
          children: script,
          injectTo: "head",
        },
        {
          tag: "div",
          attrs: { id: "app-loading", "aria-hidden": "true" },
          children: innerHtml,
          injectTo: "body-prepend",
        },
      ];
    },
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
