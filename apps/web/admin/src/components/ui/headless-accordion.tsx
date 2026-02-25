import * as React from "react";
import { ChevronDownIcon } from "lucide-react";
import { motion } from "motion/react";

import {
  Disclosure as DisclosurePrimitive,
  DisclosureButton as DisclosureButtonPrimitive,
  DisclosurePanel as DisclosurePanelPrimitive,
  type DisclosureButtonProps as DisclosureButtonPrimitiveProps,
  type DisclosurePanelProps as DisclosurePanelPrimitiveProps,
  type DisclosureProps as DisclosurePrimitiveProps,
} from "@/components/ui/headless-disclosure";
import { cn } from "@/lib/utils";

type AccordionProps<TTag extends React.ElementType = "div"> = React.ComponentProps<TTag> & {
  children: React.ReactNode;
  as?: TTag;
};

function Accordion<TTag extends React.ElementType = "div">({
  as: Component = "div",
  ...props
}: AccordionProps<TTag>) {
  return <Component data-slot="accordion" {...props} />;
}

type AccordionItemProps<TTag extends React.ElementType = "div"> = DisclosurePrimitiveProps<TTag>;

function AccordionItem<TTag extends React.ElementType = "div">({
  className,
  children,
  ...props
}: AccordionItemProps<TTag>) {
  return (
    <DisclosurePrimitive {...props}>
      {(bag) => (
        <div className={cn("border-b last:border-b-0", className)}>
          {typeof children === "function" ? children(bag) : children}
        </div>
      )}
    </DisclosurePrimitive>
  );
}

type AccordionButtonProps = DisclosureButtonPrimitiveProps & {
  showArrow?: boolean;
};

function AccordionButton({
  className,
  children,
  showArrow = true,
  ...props
}: AccordionButtonProps) {
  return (
    <DisclosureButtonPrimitive
      className={cn(
        "focus-visible:border-ring focus-visible:ring-ring/50 flex flex-1 items-start justify-between gap-4 w-full rounded-md py-4 text-left text-footnote font-medium transition-colors outline-none hover:underline focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50 [&[data-open]>svg]:rotate-180",
        className,
      )}
      {...props}
    >
      {(bag) => (
        <>
          {typeof children === "function" ? children(bag) : children}
          {showArrow && (
            <ChevronDownIcon className="text-label-secondary pointer-events-none size-4 shrink-0 translate-y-0.5 transition-transform duration-200" />
          )}
        </>
      )}
    </DisclosureButtonPrimitive>
  );
}

type AccordionPanelProps = DisclosurePanelPrimitiveProps<typeof motion.div>;

function AccordionPanel({ className, children, ...props }: AccordionPanelProps) {
  return (
    <DisclosurePanelPrimitive {...props}>
      {(bag) => {
        const content =
          typeof children === "function"
            ? (children as (renderBag: typeof bag) => React.ReactNode)(bag)
            : children;
        return <div className={cn("text-footnote pt-0 pb-4", className)}>{content}</div>;
      }}
    </DisclosurePanelPrimitive>
  );
}

export {
  Accordion,
  AccordionButton,
  AccordionItem,
  AccordionPanel,
  type AccordionButtonProps,
  type AccordionItemProps,
  type AccordionPanelProps,
  type AccordionProps,
};
