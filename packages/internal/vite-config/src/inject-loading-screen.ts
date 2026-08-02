import { type Plugin } from "vite";

const VIEWBOX_SIZE = 100;
const CURVE_CENTER = VIEWBOX_SIZE / 2;
const BASE_RADIUS = 7;
const DETAIL_AMPLITUDE = 3;
const WEAVE_FREQUENCY = 5;
const CURVE_SCALE = 3.9;
const CURVE_SAMPLE_COUNT = 360;
const PARTICLE_COUNT = 64;
const TRAIL_SPAN = 0.38;
const LOOP_DURATION_MS = 4_600;
const PULSE_DURATION_MS = 4_200;
const ROTATION_DURATION_MS = 28_000;

function normalizeProgress(progress: number): number {
  return ((progress % 1) + 1) % 1;
}

function getPoint(progress: number, detailScale: number): { x: number; y: number } {
  const angle = normalizeProgress(progress) * Math.PI * 2;
  const x =
    BASE_RADIUS * Math.cos(angle) -
    DETAIL_AMPLITUDE * detailScale * Math.cos(WEAVE_FREQUENCY * angle);
  const y =
    BASE_RADIUS * Math.sin(angle) -
    DETAIL_AMPLITUDE * detailScale * Math.sin(WEAVE_FREQUENCY * angle);

  return { x: CURVE_CENTER + x * CURVE_SCALE, y: CURVE_CENTER + y * CURVE_SCALE };
}

function getDetailScale(time: number): number {
  const pulseAngle = ((time % PULSE_DURATION_MS) / PULSE_DURATION_MS) * Math.PI * 2;
  return 0.5 + ((Math.sin(pulseAngle + 0.55) + 1) / 2) * 0.45;
}

function createArcWeavePath(detailScale: number): string {
  return Array.from({ length: CURVE_SAMPLE_COUNT + 1 }, (_, index) => {
    const point = getPoint(index / CURVE_SAMPLE_COUNT, detailScale);

    return `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
  }).join(" ");
}

function createParticleMarkup(detailScale: number): string {
  return Array.from({ length: PARTICLE_COUNT }, (_, index) => {
    const tailOffset = index / (PARTICLE_COUNT - 1);
    const point = getPoint(-tailOffset * TRAIL_SPAN, detailScale);
    const fade = Math.pow(1 - tailOffset, 0.58);
    const radius = 1.05 + fade * 2.75;
    const opacity = 0.08 + fade * 0.92;

    return `<circle data-arc-weave-particle cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="${radius.toFixed(2)}" fill="currentColor" opacity="${opacity.toFixed(3)}"></circle>`;
  }).join("");
}

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
#app-loading .arc-weave-loader {
  width: 64px;
  height: 64px;
  color: hsl(var(--foreground, 0 0% 6.7%));
}
#app-loading .arc-weave-trace {
  fill: none;
  stroke: currentColor;
  stroke-width: 5.5;
  stroke-linecap: round;
  stroke-linejoin: round;
  opacity: 0.1;
}
[data-theme="dark"] #app-loading .arc-weave-loader {
  color: hsl(var(--foreground, 0 0% 89.8%));
}
[data-motion="reduced"] #app-loading .arc-weave-particles {
  display: none;
}
[data-motion="reduced"] #app-loading .arc-weave-trace {
  opacity: 0.22;
}

@media (prefers-reduced-motion: reduce) {
  #app-loading {
    transition: opacity 0ms linear;
  }
  #app-loading .arc-weave-particles {
    display: none;
  }
  #app-loading .arc-weave-trace {
    opacity: 0.22;
  }
}
`.trim();

  const staticDetailScale = getDetailScale(0);
  const arcWeavePath = createArcWeavePath(staticDetailScale);
  const innerHtml = `
<svg
  class="arc-weave-loader"
  viewBox="0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}"
  role="status"
  aria-label="${escapeHtml(appName)}"
  aria-live="polite"
  focusable="false"
>
  <g id="app-loading-arc-weave-group">
    <path id="app-loading-arc-weave-path" class="arc-weave-trace" d="${arcWeavePath}"></path>
    <g class="arc-weave-particles">${createParticleMarkup(staticDetailScale)}</g>
  </g>
</svg>
`.trim();

  const script = `
(function () {
  try {
    // Record a "visible time" after the first paint so transitions always have a start state.
    var visibleAt = 0;
    var hiding = false;
    var animationFrame = 0;
    var startedAt = 0;

    var normalizeProgress = function (progress) {
      return ((progress % 1) + 1) % 1;
    };

    var getPoint = function (progress, detailScale) {
      var angle = normalizeProgress(progress) * Math.PI * 2;
      var x = ${BASE_RADIUS} * Math.cos(angle) - ${DETAIL_AMPLITUDE} * detailScale * Math.cos(${WEAVE_FREQUENCY} * angle);
      var y = ${BASE_RADIUS} * Math.sin(angle) - ${DETAIL_AMPLITUDE} * detailScale * Math.sin(${WEAVE_FREQUENCY} * angle);
      return { x: ${CURVE_CENTER} + x * ${CURVE_SCALE}, y: ${CURVE_CENTER} + y * ${CURVE_SCALE} };
    };

    var buildPath = function (detailScale) {
      var points = [];
      for (var index = 0; index <= ${CURVE_SAMPLE_COUNT}; index += 1) {
        var point = getPoint(index / ${CURVE_SAMPLE_COUNT}, detailScale);
        points.push((index === 0 ? "M" : "L") + " " + point.x.toFixed(2) + " " + point.y.toFixed(2));
      }
      return points.join(" ");
    };

    var getDetailScale = function (time) {
      var pulseAngle = ((time % ${PULSE_DURATION_MS}) / ${PULSE_DURATION_MS}) * Math.PI * 2;
      return 0.5 + ((Math.sin(pulseAngle + 0.55) + 1) / 2) * 0.45;
    };

    var renderFrame = function (time) {
      var group = document.getElementById("app-loading-arc-weave-group");
      var path = document.getElementById("app-loading-arc-weave-path");
      if (!group || !path) throw new Error("Arc Weave loading screen is unavailable");

      var particles = group.querySelectorAll("[data-arc-weave-particle]");
      if (particles.length !== ${PARTICLE_COUNT}) throw new Error("Arc Weave particle count mismatch");

      var progress = (time % ${LOOP_DURATION_MS}) / ${LOOP_DURATION_MS};
      var detailScale = getDetailScale(time);
      var rotation = -((time % ${ROTATION_DURATION_MS}) / ${ROTATION_DURATION_MS}) * 360;
      group.setAttribute("transform", "rotate(" + rotation + " ${CURVE_CENTER} ${CURVE_CENTER})");
      path.setAttribute("d", buildPath(detailScale));

      particles.forEach(function (node, index) {
        var tailOffset = index / (${PARTICLE_COUNT} - 1);
        var point = getPoint(progress - tailOffset * ${TRAIL_SPAN}, detailScale);
        var fade = Math.pow(1 - tailOffset, 0.58);
        node.setAttribute("cx", point.x.toFixed(2));
        node.setAttribute("cy", point.y.toFixed(2));
        node.setAttribute("r", (1.05 + fade * 2.75).toFixed(2));
        node.setAttribute("opacity", (0.08 + fade * 0.92).toFixed(3));
      });
    };

    var tick = function (now) {
      if (hiding) return;
      var mediaReduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      var userReduced = document.documentElement.dataset.motion === "reduced";
      if (mediaReduced || userReduced) {
        renderFrame(0);
        return;
      }
      renderFrame(now - startedAt);
      animationFrame = window.requestAnimationFrame(tick);
    };

    var markVisible = function () {
      try {
        visibleAt = Date.now();
      } catch (e) {}
    };

    // This runs before the first paint; the nested RAF runs after at least one paint.
    requestAnimationFrame(function () {
      requestAnimationFrame(markVisible);
    });
    requestAnimationFrame(function (now) {
      if (hiding) return;
      startedAt = now;
      renderFrame(0);
      animationFrame = window.requestAnimationFrame(tick);
    });

    window.__hideAppLoading = function () {
      try {
        var el = document.getElementById("app-loading");
        if (!el) return;
        if (hiding) return;
        hiding = true;
        window.cancelAnimationFrame(animationFrame);

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
          injectTo: "body",
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
