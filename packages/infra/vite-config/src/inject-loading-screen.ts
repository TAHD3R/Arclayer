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
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  pointer-events: none;
  background: var(--background, #ffffff);
  color: var(--foreground, #111111);
  --app-loading-ink: var(--primary, #1677ff);
  font-family: var(--font-sans, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif);
  z-index: 9999;
  opacity: 1;
  transform: translateZ(0);
  transition: opacity 360ms ease-out;
}
[data-theme="dark"] #app-loading {
  background: var(--background, #000000);
  color: var(--foreground, #e5e5e5);
}
#app-loading.is-hiding {
  opacity: 0;
}

/* HTML: <div class="loader"></div> */
#app-loading .loader {
  width: 55px;
  aspect-ratio: 1;
  --g1: conic-gradient(from 90deg at top 3px left 3px, transparent 90deg, var(--app-loading-ink) 0);
  --g2: conic-gradient(from -90deg at bottom 3px right 3px, transparent 90deg, var(--app-loading-ink) 0);
  background:
    var(--g1), var(--g1), var(--g1), var(--g1),
    var(--g2), var(--g2), var(--g2), var(--g2);
  background-position: 0 0, 100% 0, 100% 100%, 0 100%;
  background-size: 25px 25px;
  background-repeat: no-repeat;
  animation: l11 1.5s infinite;
}

@keyframes l11 {
  0% {
    background-size: 35px 15px, 15px 15px, 15px 35px, 35px 35px;
  }
  25% {
    background-size: 35px 35px, 15px 35px, 15px 15px, 35px 15px;
  }
  50% {
    background-size: 15px 35px, 35px 35px, 35px 15px, 15px 15px;
  }
  75% {
    background-size: 15px 15px, 35px 15px, 35px 35px, 15px 35px;
  }
  100% {
    background-size: 35px 15px, 15px 15px, 15px 35px, 35px 35px;
  }
}

@media (max-width: 480px) {
  #app-loading .loader {
    width: 48px;
  }
}

@media (prefers-reduced-motion: reduce) {
  #app-loading {
    transition: opacity 0ms linear;
  }
  #app-loading .loader {
    animation: none;
  }
}
`.trim();

  const innerHtml = `
<div class="loader" role="status" aria-label="${escapeHtml(appName)}" aria-live="polite"></div>
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
    name: "celestial-inject-loading-screen",
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
