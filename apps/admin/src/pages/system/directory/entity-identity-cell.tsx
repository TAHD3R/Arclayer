import type { ReactNode } from "react";

import { TruncatedCellTooltip } from "./truncated-cell-tooltip";

export function DirectoryEntityIdentityCell(props: {
  avatar: ReactNode;
  name: string;
  className?: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      {props.avatar}
      <TruncatedCellTooltip
        text={props.name}
        className={props.className ?? "text-footnote font-medium text-label-primary"}
        tooltipClassName="max-w-72 break-normal"
      />
    </div>
  );
}
