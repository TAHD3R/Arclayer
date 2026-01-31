import type { FieldErrors, FieldValues, Resolver } from "react-hook-form";
import type { z } from "zod";

function setPathError(errors: FieldErrors, path: readonly (string | number)[], message: string) {
  if (!path.length) return;

  const [head, ...rest] = path;
  const key = String(head);

  if (!rest.length) {
    // `type` is required by react-hook-form; keep it stable for custom errors.
    (errors as any)[key] = { type: "zod", message };
    return;
  }

  const next = ((errors as any)[key] ??= {});
  setPathError(next, rest, message);
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
    for (const issue of parsed.error.issues) {
      // zod's issue.path can technically contain symbols; react-hook-form paths only accept string/number.
      const path = issue.path.filter(
        (k): k is string | number => typeof k === "string" || typeof k === "number",
      );
      setPathError(errors, path, issue.message);
    }

    return {
      values: {} as any,
      errors,
    };
  };
}
