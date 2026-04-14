import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { cn } from "@arclayer/lib/utils";
import { usePreferencesStore } from "@/stores/use-preference-store";
import type { ThemeMode } from "@arclayer/ui/theme-mode";

const LOGO_LAYER_CLASSNAME = "absolute inset-0 inline-flex items-center justify-center";

function getFullLogoSrc(themeMode: ThemeMode) {
  return themeMode === "dark" ? "/logo-full-dark.svg" : "/logo-full.svg";
}

export function AdminLogo(props: { to?: string; ariaLabel: string; size?: number }) {
  const to = props.to ?? "/";
  const size = props.size ?? 48;

  return (
    <Link
      to={to}
      aria-label={props.ariaLabel}
      className="inline-flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <img
        src="/logo.svg"
        width={size}
        height={size}
        className="block object-contain"
        style={{ width: size, height: size }}
        alt=""
      />
    </Link>
  );
}

export function AdminBrandMark(props: { size?: number; productName?: string }) {
  const size = props.size ?? 80;
  const productName = props.productName;

  return (
    <div className="flex flex-col items-center gap-1.5">
      <img
        src="/logo.svg"
        width={size}
        height={size}
        className="block object-contain"
        style={{ width: size, height: size }}
        alt={productName}
      />
      {productName ? <span className="text-body font-medium">{productName}</span> : null}
    </div>
  );
}

export function AdminFullLogo(props: {
  to?: string;
  ariaLabel: string;
  width?: number;
  className?: string;
  imgClassName?: string;
  hoverLabel?: ReactNode;
  hoverIcon?: ReactNode;
}) {
  const to = props.to ?? "/";
  const width = props.width ?? 180;
  const themeMode = usePreferencesStore((state) => state.themeMode);
  const showHoverAffordance = Boolean(props.hoverLabel);

  return (
    <Link
      to={to}
      aria-label={props.ariaLabel}
      className={cn(
        "group relative inline-flex items-center justify-center overflow-hidden cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        props.className,
      )}
      style={{ width: width }}
    >
      <span
        className={
          showHoverAffordance ? LOGO_LAYER_CLASSNAME : "inline-flex items-center justify-center"
        }
      >
        <img
          src={getFullLogoSrc(themeMode)}
          width={width}
          className={cn(
            "block h-full w-full object-contain transition-opacity duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
            showHoverAffordance && "group-hover:opacity-0 group-focus-visible:opacity-0",
            props.imgClassName,
          )}
          style={{ width: width }}
          alt=""
        />
      </span>
      {showHoverAffordance ? (
        <span
          className={cn(
            LOGO_LAYER_CLASSNAME,
            "pointer-events-none opacity-0 transition-opacity duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
            "group-hover:opacity-100 group-focus-visible:opacity-100",
          )}
        >
          <span className="inline-flex items-center gap-1.5 text-headline text-label-primary">
            {props.hoverIcon}
            <span className="truncate whitespace-nowrap">{props.hoverLabel}</span>
          </span>
        </span>
      ) : null}
    </Link>
  );
}
