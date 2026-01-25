import { type Plugin } from "vite";

export interface InjectLoadingScreenOptions {
  // Reserved for future (e.g. accessibility text or custom markup).
  appName?: string;
}

export function injectLoadingScreen(options: InjectLoadingScreenOptions = {}): Plugin {
  void options;

  const style = `
#app-loading {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  background: var(--background, #ffffff);
  color: var(--primary, #1677ff);
  font-family: var(--font-sans, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif);
  z-index: 9999;
  opacity: 1;
  transform: translateZ(0);
  transition: opacity 360ms ease-out;
}
[data-theme="dark"] #app-loading {
  background: var(--background, #000000);
  color: var(--primary, #1677ff);
}
#app-loading.is-hiding {
  opacity: 0;
}

#app-loading figure {
  margin: 0;
  position: relative;
  width: 120px;
  height: 120px;
  border-radius: 150px;
  box-sizing: border-box;
  transform-origin: 50% 50%;
  will-change: transform;
  transform: rotate(0deg) scale(1.4, 1.4);
  /* 10s/round: visible but not too distracting. */
  animation: app-loading-rotation 10s infinite linear;
}

#app-loading figure div {
  position: absolute;
  inset: 0;
}

#app-loading figure div:after {
  content: "";
  width: 20px;
  height: 20px;
  border: 1px solid currentColor;
  box-sizing: border-box;
  position: absolute;
  left: 20px;
  top: 20px;
  animation: app-loading-shuffle 2s infinite;
}

#app-loading figure div:nth-child(1) {
  transform: rotate(0deg);
}
#app-loading figure div:nth-child(1):after {
  animation-delay: -0.5s;
}
#app-loading figure div:nth-child(2) {
  transform: rotate(45deg);
}
#app-loading figure div:nth-child(2):after {
  animation-delay: -1s;
}
#app-loading figure div:nth-child(3) {
  transform: rotate(90deg);
}
#app-loading figure div:nth-child(3):after {
  animation-delay: -1.5s;
}
#app-loading figure div:nth-child(4) {
  transform: rotate(135deg);
}
#app-loading figure div:nth-child(4):after {
  animation-delay: -2s;
}
#app-loading figure div:nth-child(5) {
  transform: rotate(180deg);
}
#app-loading figure div:nth-child(5):after {
  animation-delay: -2.5s;
}
#app-loading figure div:nth-child(6) {
  transform: rotate(225deg);
}
#app-loading figure div:nth-child(6):after {
  animation-delay: -3s;
}
#app-loading figure div:nth-child(7) {
  transform: rotate(270deg);
}
#app-loading figure div:nth-child(7):after {
  animation-delay: -3.5s;
}
#app-loading figure div:nth-child(8) {
  transform: rotate(315deg);
}
#app-loading figure div:nth-child(8):after {
  animation-delay: -4s;
}

@keyframes app-loading-rotation {
  100% {
    transform: rotate(-360deg) scale(1.4, 1.4);
  }
}

@keyframes app-loading-shuffle {
  50% {
    transform: scale(0.4, 0.4) rotate(-90deg);
    border-radius: 50%;
  }
}

@media (prefers-reduced-motion: reduce) {
  #app-loading figure {
    animation: none;
  }
  #app-loading figure div:after {
    animation: none;
  }
  #app-loading {
    transition: opacity 0ms linear;
  }
}
`.trim();

  const innerHtml = `
<figure aria-hidden="true">
  <div></div><div></div>
  <div></div><div></div>
  <div></div><div></div>
  <div></div><div></div>
</figure>
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
        var minVisible = 320;
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
