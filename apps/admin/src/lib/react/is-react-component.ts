import type React from "react";

type AnyFn = (...args: unknown[]) => unknown;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFunction(value: unknown): value is AnyFn {
  return typeof value === "function";
}

export type ReactComponent = React.ComponentType<unknown>;

export function isFunctionComponent(
  component: unknown,
): component is React.FunctionComponent<unknown> {
  return isFunction(component);
}

export function isClassComponent(component: unknown): component is React.ComponentClass<unknown> {
  if (!isFunction(component)) return false;
  const proto = (component as { prototype?: unknown }).prototype;
  if (!isRecord(proto)) return false;
  return "isReactComponent" in proto || "render" in proto;
}

export function isForwardRefComponent(
  component: unknown,
): component is React.ForwardRefExoticComponent<unknown> {
  if (!isRecord(component)) return false;
  const $$typeof = component.$$typeof;
  return typeof $$typeof === "symbol" && $$typeof.toString() === "Symbol(react.forward_ref)";
}

export function isReactComponent(component: unknown): component is ReactComponent {
  return (
    isFunctionComponent(component) ||
    isForwardRefComponent(component) ||
    isClassComponent(component)
  );
}
