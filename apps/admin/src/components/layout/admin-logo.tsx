import { Link } from "@tanstack/react-router";
import { cn } from "@arclayer/lib/utils";
import { usePreferencesStore } from "@/stores/use-preference-store";
import type { ThemeMode } from "@arclayer/ui/theme-mode";

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
}) {
  const to = props.to ?? "/";
  const width = props.width ?? 180;
  const themeMode = usePreferencesStore((state) => state.themeMode);

  return (
    <Link
      to={to}
      aria-label={props.ariaLabel}
      className={cn("inline-flex items-center justify-center", props.className)}
      style={{ width: width }}
    >
      <img
        src={getFullLogoSrc(themeMode)}
        width={width}
        className={cn("block object-contain", props.imgClassName)}
        style={{ width: width }}
        alt=""
      />
    </Link>
  );
}
