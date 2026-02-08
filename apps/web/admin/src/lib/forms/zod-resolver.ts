import type { FieldErrors, FieldValues, Resolver } from "react-hook-form";
import type { z } from "zod";

type MutableErrorTree = Record<string, unknown>;

function setPathError(errors: MutableErrorTree, path: readonly (string | number)[], message: string) {
  if (!path.length) return;

  const [head, ...rest] = path;
  const key = String(head);

  if (!rest.length) {
    errors[key] = { type: "zod", message };
    return;
  }

  const next = errors[key];
  if (!next || typeof next !== "object") {
    errors[key] = {};
  }

  setPathError(errors[key] as MutableErrorTree, rest, message);
}

/**
 * Minimal zod -> react-hook-form resolver.
 *
 * We keep this in-repo to avoid adding `@hookform/resolvers` as a dependency.
 */
export function zodResolver<TSchema extends z.ZodType<FieldValues>>(
  schema: TSchema,
): Resolver<z.infer<TSchema>> {
  return async (values) => {
    const parsed = schema.safeParse(values);
    if (parsed.success) {
      return { values: parsed.data, errors: {} };
    }

    const errors: FieldErrors<z.infer<TSchema>> = {};
    const mutableErrors = errors as MutableErrorTree;

    for (const issue of parsed.error.issues) {
      // zod issue.path can technically contain symbols; react-hook-form paths only accept string/number.
      const path = issue.path.filter(
        (key): key is string | number => typeof key === "string" || typeof key === "number",
      );
      setPathError(mutableErrors, path, issue.message);
    }

    return {
      values: {} as Record<string, never>,
      errors,
    };
  };
}
