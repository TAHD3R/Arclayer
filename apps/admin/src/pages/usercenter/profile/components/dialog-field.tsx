import type { ReactNode } from "react";

import { SettingDialogField } from "@arclayer/ui/setting-dialog-field";

type DialogFieldProps = {
  label: string;
  description?: string;
  htmlFor?: string;
  error?: string;
  className?: string;
  children: ReactNode;
};

export function DialogField(props: DialogFieldProps) {
  return (
    <SettingDialogField
      title={props.htmlFor ? <label htmlFor={props.htmlFor}>{props.label}</label> : props.label}
      description={props.description}
      error={props.error}
      className={props.className}
    >
      {props.children}
    </SettingDialogField>
  );
}
