/**
 * Safe localStorage wrappers that silently handle storage errors
 * (e.g. quota exceeded, private browsing restrictions).
 */

export function readStorageItem(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStorageItem(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Silently ignore storage errors (quota exceeded, private browsing, etc.)
  }
}

export function removeStorageItem(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Silently ignore storage errors
  }
}

export function readStorageJson<T>(key: string): T | null {
  const raw = readStorageItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeStorageJson<T>(key: string, value: T): void {
  try {
    writeStorageItem(key, JSON.stringify(value));
  } catch {
    // Silently ignore serialization/storage errors
  }
}
