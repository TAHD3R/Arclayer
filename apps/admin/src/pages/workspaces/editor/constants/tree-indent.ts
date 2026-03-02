const INDENT_CLASSES = [
  "pl-2",
  "pl-6",
  "pl-10",
  "pl-14",
  "pl-18",
  "pl-22",
  "pl-26",
  "pl-30",
] as const;

export function getTreeIndentClass(depth: number): string {
  return INDENT_CLASSES[Math.min(depth, INDENT_CLASSES.length - 1)];
}
