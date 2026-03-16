"use client";

import * as React from "react";
import { QRCodeSVG, type QRPropsSVG } from "@rc-component/qrcode";

import { cn } from "@arclayer/lib/utils";

type QRCodeProps = QRPropsSVG & {
  className?: string;
};

const QRCode = React.forwardRef<SVGSVGElement, QRCodeProps>(function QRCode(
  {
    className,
    size = 160,
    level = "M",
    marginSize = 1,
    bgColor = "transparent",
    fgColor = "currentColor",
    ...props
  },
  ref,
) {
  return (
    <QRCodeSVG
      ref={ref}
      size={size}
      level={level}
      marginSize={marginSize}
      bgColor={bgColor}
      fgColor={fgColor}
      className={cn("shrink-0 text-foreground", className)}
      {...props}
    />
  );
});

QRCode.displayName = "QRCode";

export { QRCode, type QRCodeProps };
