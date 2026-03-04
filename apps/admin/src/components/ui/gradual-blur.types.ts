import type { CSSProperties, PropsWithChildren } from "react";

export type GradualBlurPosition = "top" | "bottom" | "left" | "right";
export type GradualBlurCurve = "linear" | "bezier" | "ease-in" | "ease-out" | "ease-in-out";

export type GradualBlurPreset =
  | "top"
  | "bottom"
  | "left"
  | "right"
  | "subtle"
  | "intense"
  | "smooth"
  | "sharp"
  | "header"
  | "footer"
  | "sidebar"
  | "page-header"
  | "page-footer";

export type GradualBlurProps = PropsWithChildren<{
  position?: GradualBlurPosition;
  strength?: number;
  height?: string;
  width?: string;
  divCount?: number;
  exponential?: boolean;
  zIndex?: number;
  animated?: boolean | "scroll";
  duration?: string;
  easing?: string;
  opacity?: number;
  curve?: GradualBlurCurve;
  responsive?: boolean;
  mobileHeight?: string;
  tabletHeight?: string;
  desktopHeight?: string;
  mobileWidth?: string;
  tabletWidth?: string;
  desktopWidth?: string;
  preset?: GradualBlurPreset;
  gpuOptimized?: boolean;
  hoverIntensity?: number;
  target?: "parent" | "page";

  onAnimationComplete?: () => void;
  className?: string;
  style?: CSSProperties;
}>;

export type GradualBlurResolvedConfig = GradualBlurProps & {
  position: GradualBlurPosition;
  strength: number;
  height: string;
  divCount: number;
  exponential: boolean;
  zIndex: number;
  animated: boolean | "scroll";
  duration: string;
  easing: string;
  opacity: number;
  curve: GradualBlurCurve;
  responsive: boolean;
  target: "parent" | "page";
  className: string;
  style: CSSProperties;
};
