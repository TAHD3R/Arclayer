import React, { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";

import type {
  GradualBlurPosition,
  GradualBlurProps,
  GradualBlurResolvedConfig,
} from "./gradual-blur.types";
import {
  CURVE_FUNCTIONS,
  DEFAULT_CONFIG,
  PRESETS,
  getGradientDirection,
} from "./gradual-blur.constants";

const PERCENT_MAX = 100;
const ROUND_TO_TENTHS = 10;
const RESPONSIVE_DEBOUNCE_MS = 100;
const INTERSECTION_THRESHOLD = 0.1;
const BLUR_REM_SCALE = 0.0625;
const EXPONENTIAL_BASE = 2;
const EXPONENTIAL_STRENGTH_MULTIPLIER = 4;
const SCROLL_ANIMATION_MS_PER_SECOND = 1000;
const PAGE_TARGET_Z_INDEX_OFFSET = 100;

const MOBILE_MAX_WIDTH_PX = 480;
const TABLET_MAX_WIDTH_PX = 768;
const DESKTOP_MAX_WIDTH_PX = 1024;

function mergeConfigs<T extends object>(...configs: Partial<T>[]): Partial<T> {
  const merged: Partial<T> = {};
  for (const config of configs) {
    Object.assign(merged, config);
  }
  return merged;
}

function debounce<TArgs extends readonly unknown[]>(
  fn: (...args: TArgs) => void,
  waitMs: number,
): (...args: TArgs) => void {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  return (...args: TArgs) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), waitMs);
  };
}

function resolveConfig(props: GradualBlurProps): GradualBlurResolvedConfig {
  const presetConfig = props.preset ? (PRESETS[props.preset] ?? {}) : {};
  const merged = mergeConfigs<GradualBlurResolvedConfig>(DEFAULT_CONFIG, presetConfig, props);
  return {
    ...merged,
    position: merged.position ?? "bottom",
    strength: merged.strength ?? DEFAULT_CONFIG.strength,
    height: merged.height ?? DEFAULT_CONFIG.height,
    divCount: merged.divCount ?? DEFAULT_CONFIG.divCount,
    exponential: merged.exponential ?? DEFAULT_CONFIG.exponential,
    zIndex: merged.zIndex ?? DEFAULT_CONFIG.zIndex,
    animated: merged.animated ?? DEFAULT_CONFIG.animated,
    duration: merged.duration ?? DEFAULT_CONFIG.duration,
    easing: merged.easing ?? DEFAULT_CONFIG.easing,
    opacity: merged.opacity ?? DEFAULT_CONFIG.opacity,
    curve: merged.curve ?? DEFAULT_CONFIG.curve,
    responsive: merged.responsive ?? DEFAULT_CONFIG.responsive,
    target: merged.target ?? DEFAULT_CONFIG.target,
    className: merged.className ?? DEFAULT_CONFIG.className,
    style: merged.style ?? DEFAULT_CONFIG.style,
    children: props.children,
  };
}

function resolveResponsiveValue(args: {
  base: string | undefined;
  mobile: string | undefined;
  tablet: string | undefined;
  desktop: string | undefined;
  viewportWidth: number;
}) {
  if (args.viewportWidth <= MOBILE_MAX_WIDTH_PX && args.mobile) return args.mobile;
  if (args.viewportWidth <= TABLET_MAX_WIDTH_PX && args.tablet) return args.tablet;
  if (args.viewportWidth <= DESKTOP_MAX_WIDTH_PX && args.desktop) return args.desktop;
  return args.base;
}

function useResponsiveDimension(args: {
  enabled: boolean;
  base: string | undefined;
  mobile: string | undefined;
  tablet: string | undefined;
  desktop: string | undefined;
}) {
  const [value, setValue] = useState<string | undefined>(() => args.base);

  useEffect(() => {
    if (!args.enabled) return;

    const calc = () =>
      setValue(
        resolveResponsiveValue({
          base: args.base,
          mobile: args.mobile,
          tablet: args.tablet,
          desktop: args.desktop,
          viewportWidth: window.innerWidth,
        }),
      );
    const onResize = debounce(calc, RESPONSIVE_DEBOUNCE_MS);

    calc();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [args.enabled, args.base, args.mobile, args.tablet, args.desktop]);

  return args.enabled ? value : args.base;
}

function useIntersectionVisible(
  ref: React.RefObject<HTMLDivElement | null>,
  shouldObserve: boolean,
) {
  const [isVisible, setIsVisible] = useState(!shouldObserve);

  useEffect(() => {
    const el = ref.current;
    if (!shouldObserve || !el) return;

    const observer = new IntersectionObserver(([entry]) => setIsVisible(entry.isIntersecting), {
      threshold: INTERSECTION_THRESHOLD,
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, shouldObserve]);

  return isVisible;
}

function isVertical(position: GradualBlurPosition) {
  return position === "top" || position === "bottom";
}

function buildDivGradient(i: number, count: number) {
  const increment = PERCENT_MAX / count;
  const p1 = Math.round((increment * i - increment) * ROUND_TO_TENTHS) / ROUND_TO_TENTHS;
  const p2 = Math.round(increment * i * ROUND_TO_TENTHS) / ROUND_TO_TENTHS;
  const p3 = Math.round((increment * i + increment) * ROUND_TO_TENTHS) / ROUND_TO_TENTHS;
  const p4 = Math.round((increment * i + increment * 2) * ROUND_TO_TENTHS) / ROUND_TO_TENTHS;

  let gradient = `transparent ${p1}%, black ${p2}%`;
  if (p3 <= PERCENT_MAX) gradient += `, black ${p3}%`;
  if (p4 <= PERCENT_MAX) gradient += `, transparent ${p4}%`;

  return gradient;
}

function buildBlurDivs(config: GradualBlurResolvedConfig, isHovered: boolean) {
  const curveFunc = CURVE_FUNCTIONS[config.curve] ?? CURVE_FUNCTIONS.linear;
  const strength =
    isHovered && config.hoverIntensity ? config.strength * config.hoverIntensity : config.strength;

  const direction = getGradientDirection(config.position);

  const divs: React.ReactNode[] = [];
  for (let i = 1; i <= config.divCount; i++) {
    const progress = curveFunc(i / config.divCount);
    const blurValue = config.exponential
      ? Math.pow(EXPONENTIAL_BASE, progress * EXPONENTIAL_STRENGTH_MULTIPLIER) *
        BLUR_REM_SCALE *
        strength
      : BLUR_REM_SCALE * (progress * config.divCount + 1) * strength;
    const gradient = buildDivGradient(i, config.divCount);

    const divStyle: CSSProperties = {
      maskImage: `linear-gradient(${direction}, ${gradient})`,
      WebkitMaskImage: `linear-gradient(${direction}, ${gradient})`,
      backdropFilter: `blur(${blurValue.toFixed(3)}rem)`,
      opacity: config.opacity,
      transition:
        config.animated && config.animated !== "scroll"
          ? `backdrop-filter ${config.duration} ${config.easing}`
          : undefined,
    };

    divs.push(<div key={i} className="absolute inset-0" style={divStyle} />);
  }
  return divs;
}

function buildContainerStyle(args: {
  config: GradualBlurResolvedConfig;
  isVisible: boolean;
  responsiveHeight: string | undefined;
  responsiveWidth: string | undefined;
}): CSSProperties {
  const { config } = args;
  const isPageTarget = config.target === "page";
  const style: CSSProperties = {
    position: isPageTarget ? "fixed" : "absolute",
    pointerEvents: config.hoverIntensity ? "auto" : "none",
    opacity: args.isVisible ? 1 : 0,
    transition: config.animated ? `opacity ${config.duration} ${config.easing}` : undefined,
    zIndex: isPageTarget ? config.zIndex + PAGE_TARGET_Z_INDEX_OFFSET : config.zIndex,
  };

  if (isVertical(config.position)) {
    style.height = args.responsiveHeight;
    style.width = args.responsiveWidth || "100%";
    style[config.position] = 0;
    style.left = 0;
    style.right = 0;
  } else {
    style.width = args.responsiveWidth || args.responsiveHeight;
    style.height = "100%";
    style[config.position] = 0;
    style.top = 0;
    style.bottom = 0;
  }

  return { ...style, ...config.style };
}

function useScrollAnimationComplete(config: GradualBlurResolvedConfig, isVisible: boolean) {
  useEffect(() => {
    if (!isVisible || config.animated !== "scroll" || !config.onAnimationComplete) return;

    const ms = Number.parseFloat(config.duration) * SCROLL_ANIMATION_MS_PER_SECOND;
    const timer = window.setTimeout(() => config.onAnimationComplete?.(), ms);
    return () => window.clearTimeout(timer);
  }, [config, isVisible]);
}

function injectStylesOnce() {
  if (typeof document === "undefined") return;
  const id = "gradual-blur-styles";
  if (document.getElementById(id)) return;

  const el = document.createElement("style");
  el.id = id;
  el.textContent =
    ".gradual-blur{pointer-events:none;transition:opacity .3s ease-out}.gradual-blur-inner{pointer-events:none}";
  document.head.appendChild(el);
}

injectStylesOnce();

function GradualBlur(props: GradualBlurProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isHovered, setIsHovered] = useState(false);

  const config = useMemo(() => resolveConfig(props), [props]);
  const responsiveHeight = useResponsiveDimension({
    enabled: config.responsive,
    base: config.height,
    mobile: config.mobileHeight,
    tablet: config.tabletHeight,
    desktop: config.desktopHeight,
  });
  const responsiveWidth = useResponsiveDimension({
    enabled: config.responsive,
    base: config.width,
    mobile: config.mobileWidth,
    tablet: config.tabletWidth,
    desktop: config.desktopWidth,
  });
  const isVisible = useIntersectionVisible(containerRef, config.animated === "scroll");

  useScrollAnimationComplete(config, isVisible);

  const blurDivs = useMemo(() => buildBlurDivs(config, isHovered), [config, isHovered]);
  const containerStyle = useMemo(
    () => buildContainerStyle({ config, isVisible, responsiveHeight, responsiveWidth }),
    [config, isVisible, responsiveHeight, responsiveWidth],
  );

  return (
    <div
      ref={containerRef}
      className={`gradual-blur relative isolate ${config.target === "page" ? "gradual-blur-page" : "gradual-blur-parent"} ${config.className}`}
      style={containerStyle}
      onMouseEnter={config.hoverIntensity ? () => setIsHovered(true) : undefined}
      onMouseLeave={config.hoverIntensity ? () => setIsHovered(false) : undefined}
    >
      <div className="relative w-full h-full">{blurDivs}</div>
      {props.children ? <div className="relative">{props.children}</div> : null}
    </div>
  );
}

type GradualBlurComponent = React.MemoExoticComponent<typeof GradualBlur> & {
  PRESETS: typeof PRESETS;
  CURVE_FUNCTIONS: typeof CURVE_FUNCTIONS;
};

const GradualBlurMemo = React.memo(GradualBlur) as GradualBlurComponent;
GradualBlurMemo.displayName = "GradualBlur";
GradualBlurMemo.PRESETS = PRESETS;
GradualBlurMemo.CURVE_FUNCTIONS = CURVE_FUNCTIONS;

export type { GradualBlurProps };
export default GradualBlurMemo;
