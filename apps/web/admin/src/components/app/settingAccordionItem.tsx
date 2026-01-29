import { Button } from "antd";
import { type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/animate-ui/components/radix/accordion";
import { cn } from "@/lib/utils";

export type SettingAccordionItemProps = {
  value: string;
  title: ReactNode;
  description?: ReactNode;

  /**
   * Optional summary shown in the trigger area so users can see current value
   * without expanding the accordion.
   */
  showSummary?: boolean;
  summary?: ReactNode;
  summaryPrefix?: ReactNode;

  /**
   * Main content (inputs/selectors/custom UI). Keep it generic for future field types.
   */
  children: ReactNode;

  /**
   * Confirm/save action. If onConfirm is not provided, no action buttons are rendered.
   */
  confirmText?: ReactNode;
  onConfirm?: () => void | Promise<void>;
  confirmLoading?: boolean;

  /**
   * Optional reset action.
   */
  resetText?: ReactNode;
  onReset?: () => void | Promise<void>;
  resetLoading?: boolean;

  /**
   * When disabled or busy, block interactions inside content.
   */
  disabled?: boolean;

  /**
   * Content container width control. Defaults to a left-aligned, non-stretch layout.
   */
  contentClassName?: string;

  /**
   * 是否在折叠时仍保持内容渲染（用于表单字段保持挂载，避免 validateFields 找不到字段）。
   */
  keepRendered?: boolean;
};

export function SettingAccordionItem(props: SettingAccordionItemProps) {
  const { t } = useTranslation();
  const hasActions = Boolean(props.onConfirm || props.onReset);
  const busy = Boolean(props.disabled || props.confirmLoading || props.resetLoading);
  const summaryPrefix = props.summaryPrefix ?? t("settings:SETTINGS_CURRENT");
  const resetText = props.resetText ?? t("settings:SETTINGS_RESET");
  const shouldShowSummary = Boolean(props.showSummary);
  const hasDescription = props.description !== undefined && props.description !== null;

  return (
    <AccordionItem value={props.value}>
      {/* Override default trigger hover underline: only underline the title, not the whole block. */}
      <AccordionTrigger className="group hover:no-underline">
        <div className="flex flex-col gap-1">
          <div className="text-[20px] font-bold leading-tight">
            <span className="group-hover:underline underline-offset-4">{props.title}</span>
          </div>
          {hasDescription || shouldShowSummary ? (
            <div className="text-[16px] text-muted-foreground leading-snug no-underline">
              {hasDescription ? props.description : null}
              {shouldShowSummary ? (
                <>
                  <span className={cn(hasDescription ? "ml-2" : undefined, "mr-1")}>
                    {summaryPrefix}
                  </span>
                  <span>{props.summary ?? "-"}</span>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </AccordionTrigger>
      <AccordionContent keepRendered={props.keepRendered}>
        <div className={cn("flex flex-col gap-3", "max-w-130", props.contentClassName)}>
          <fieldset
            disabled={busy}
            className={cn("m-0 min-w-0 border-0 p-0", busy ? "opacity-60" : undefined)}
          >
            {props.children}
          </fieldset>

          {hasActions ? (
            <div className="flex items-center justify-start gap-2">
              {props.onConfirm ? (
                <Button
                  type="primary"
                  disabled={props.disabled || props.resetLoading}
                  loading={props.confirmLoading}
                  onClick={() => void props.onConfirm?.()}
                >
                  {props.confirmText ?? t("settings:SETTINGS_SAVE")}
                </Button>
              ) : null}
              {props.onReset ? (
                <Button
                  disabled={props.disabled || props.confirmLoading}
                  loading={props.resetLoading}
                  onClick={() => void props.onReset?.()}
                >
                  {resetText}
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
