import type { FieldErrors, FieldPath, FieldValues, UseFormReturn } from "react-hook-form";

type MutableErrorTree = Record<string, unknown>;

function readErrorValue(errors: FieldErrors, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => {
    if (!current || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[key];
  }, errors);
}

function setPathError(
  errors: MutableErrorTree,
  path: readonly (string | number)[],
  message: string,
) {
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

export function getFieldErrorMessage<TFieldValues extends FieldValues>(
  form: UseFormReturn<TFieldValues>,
  path: FieldPath<TFieldValues>,
): string | null {
  const value = readErrorValue(form.formState.errors, String(path));
  if (!value || typeof value !== "object") return null;
  const message = (value as { message?: unknown }).message;
  return typeof message === "string" && message.trim() ? message : null;
}

export async function validateFormFields<TFieldValues extends FieldValues>(
  form: UseFormReturn<TFieldValues>,
  names: readonly FieldPath<TFieldValues>[],
): Promise<TFieldValues> {
  const valid = await form.trigger([...names]);
  if (!valid) {
    throw new Error("FORM_VALIDATION_FAILED");
  }
  return form.getValues();
}

export function applyValidationError<TFieldValues extends FieldValues>(
  form: UseFormReturn<TFieldValues>,
  path: FieldPath<TFieldValues>,
  message: string,
) {
  form.setError(path, { type: "validate", message });
}

export { setPathError };
