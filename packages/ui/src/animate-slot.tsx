"use client";

import * as React from "react";
import { motion, isMotionComponent, type HTMLMotionProps } from "motion/react";
import { cn } from "@arclayer/lib/utils";

type AnyProps = Record<string, unknown>;

type DOMMotionProps<T extends HTMLElement = HTMLElement> = Omit<
  HTMLMotionProps<keyof HTMLElementTagNameMap>,
  "ref"
> & { ref?: React.Ref<T> };

type WithAsChild<Base extends object> =
  | (Base & { asChild: true; children: React.ReactElement })
  | (Base & { asChild?: false | undefined });

type SlotProps<T extends HTMLElement = HTMLElement> = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  children?: any;
} & DOMMotionProps<T>;

function setRef<T>(ref: React.Ref<T> | undefined, node: T | null) {
  if (!ref) return undefined;
  if (typeof ref === "function") {
    return ref(node);
  }
  (ref as React.RefObject<T | null>).current = node;
  return undefined;
}

function useMergedRefs<T>(...refs: (React.Ref<T> | undefined)[]) {
  return React.useMemo<React.RefCallback<T>>(() => {
    return (node) => {
      let hasCleanup = false;
      const cleanups = refs.map((currentRef) => {
        const cleanup = setRef(currentRef, node);
        if (!hasCleanup && typeof cleanup === "function") {
          hasCleanup = true;
        }
        return cleanup;
      });

      if (hasCleanup) {
        return () => {
          cleanups.forEach((cleanup, index) => {
            if (typeof cleanup === "function") {
              cleanup();
              return;
            }
            setRef(refs[index], null);
          });
        };
      }

      return undefined;
    };
  }, refs);
}

function mergeProps<T extends HTMLElement>(
  childProps: AnyProps,
  slotProps: DOMMotionProps<T>,
): AnyProps {
  const merged: AnyProps = { ...childProps, ...slotProps };

  if (childProps.className || slotProps.className) {
    merged.className = cn(childProps.className as string, slotProps.className as string);
  }

  if (childProps.style || slotProps.style) {
    merged.style = {
      ...(childProps.style as React.CSSProperties),
      ...(slotProps.style as React.CSSProperties),
    };
  }

  return merged;
}

function Slot<T extends HTMLElement = HTMLElement>({ children, ref, ...props }: SlotProps<T>) {
  const isAlreadyMotion =
    typeof children.type === "object" && children.type !== null && isMotionComponent(children.type);

  const Base = React.useMemo(
    () =>
      isAlreadyMotion
        ? (children.type as React.ElementType)
        : motion.create(children.type as React.ElementType),
    [isAlreadyMotion, children.type],
  );

  if (!React.isValidElement(children)) return null;

  const { ref: childRef, ...childProps } = children.props as AnyProps;
  const mergedRef = useMergedRefs(childRef as React.Ref<T>, ref);

  const mergedProps = mergeProps(childProps, props);

  return <Base {...mergedProps} ref={mergedRef} />;
}

export { Slot, type SlotProps, type WithAsChild, type DOMMotionProps, type AnyProps };
