import clsx from "clsx";
import type { HTMLAttributes } from "react";

export type MicrosoftIconProps = HTMLAttributes<HTMLSpanElement> & {
  size?: number;
};

export default function MicrosoftIcon({
  size = 18,
  className,
  style,
  ...props
}: MicrosoftIconProps) {
  return (
    <span
      {...props}
      className={clsx("inline-flex items-center justify-center", className)}
      style={{ width: size, height: size, ...style }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 256 256" preserveAspectRatio="xMidYMid">
        <path fill="#F1511B" d="M121.666 121.666H0V0h121.666z" />
        <path fill="#80CC28" d="M256 121.666H134.335V0H256z" />
        <path fill="#00ADEF" d="M121.663 256.002H0V134.336h121.663z" />
        <path fill="#FBBC09" d="M256 256.002H134.335V134.336H256z" />
      </svg>
    </span>
  );
}
