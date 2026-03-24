import type { ReactNode } from "react";

type DialogFieldProps = {
  label: string;
  htmlFor?: string;
  error?: string;
  className?: string;
  children: ReactNode;
};

export function DialogField(props: DialogFieldProps) {
  return (
    <div className={props.className ?? "grid gap-1.5"}>
      <label htmlFor={props.htmlFor} className="text-callout text-label-primary">
        {props.label}
      </label>
      {props.children}
      {props.error ? <p className="text-footnote text-destructive">{props.error}</p> : null}
    </div>
  );
}
