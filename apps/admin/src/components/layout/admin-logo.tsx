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
