import { Link } from "@tanstack/react-router";
import { useTheme } from "next-themes";

function getFullLogoSrc(resolvedTheme?: string) {
  if (resolvedTheme === "dark") return "/logo-full-dark.svg";
  if (resolvedTheme === "light") return "/logo-full.svg";
  if (typeof document !== "undefined" && document.documentElement.dataset.theme === "dark") {
    return "/logo-full-dark.svg";
  }
  return "/logo-full.svg";
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

export function AdminFullLogo(props: { to?: string; ariaLabel: string; width?: number }) {
  const to = props.to ?? "/";
  const width = props.width ?? 180;
  const { resolvedTheme } = useTheme();

  return (
    <Link
      to={to}
      aria-label={props.ariaLabel}
      className="inline-flex items-center justify-center"
      style={{ width: width }}
    >
      <img
        src={getFullLogoSrc(resolvedTheme)}
        width={width}
        className="block object-contain"
        style={{ width: width }}
        alt=""
      />
    </Link>
  );
}
