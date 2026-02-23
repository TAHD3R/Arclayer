import { Link } from "@tanstack/react-router";

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

export function AdminFullLogo(props: { to?: string; ariaLabel: string; width?: number }) {
  const to = props.to ?? "/";
  const width = props.width ?? 180;

  return (
    <Link
      to={to}
      aria-label={props.ariaLabel}
      className="inline-flex items-center justify-center"
      style={{ width: width }}
    >
      <img
        src="/logo-full.svg"
        width={width}
        className="block object-contain"
        style={{ width: width }}
        alt=""
      />
    </Link>
  );
}
