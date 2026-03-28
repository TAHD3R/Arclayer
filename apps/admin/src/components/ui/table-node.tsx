import type { PlateElementProps } from "platejs/react";

import { PlateElement } from "platejs/react";

export function TableElement(props: PlateElementProps) {
  return (
    <div className="my-6 overflow-x-auto">
      <PlateElement
        {...props}
        as="table"
        className="min-w-full border-collapse overflow-hidden rounded-2xl border border-border/70 bg-card"
      >
        <tbody>{props.children}</tbody>
      </PlateElement>
    </div>
  );
}

export function TableRowElement(props: PlateElementProps) {
  return <PlateElement {...props} as="tr" className="border-b border-border/70" />;
}

export function TableCellElement(props: PlateElementProps) {
  return (
    <PlateElement
      {...props}
      as="td"
      className="min-w-[8rem] border-r border-border/70 px-3 py-2 align-top last:border-r-0"
    />
  );
}

export function TableHeaderCellElement(props: PlateElementProps) {
  return (
    <PlateElement
      {...props}
      as="th"
      className="min-w-[8rem] border-r border-border/70 bg-muted/35 px-3 py-2 text-left font-semibold text-foreground last:border-r-0"
    />
  );
}
