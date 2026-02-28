export function makeStorageKey(scope: string, name: string): string {
  const s = scope.trim();
  const n = name.trim();
  if (!s) return n;
  if (!n) return s;
  return `${s}:${n}`;
}
