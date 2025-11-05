/**
 * Safe localStorage wrapper with error handling
 */

export function getItem(key: string, defaultValue: string | null = null): string | null {
  if (typeof window === 'undefined') {
    return defaultValue;
  }
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) {
      return defaultValue;
    }
    return raw;
  } catch {
    return defaultValue;
  }
}

export function setItem(key: string, value: string): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function removeItem(key: string): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  try {
    window.localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function getJSON<T = unknown>(key: string, defaultValue: T | null = null): T | null {
  const raw = getItem(key);
  if (raw === null) {
    return defaultValue;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return defaultValue;
  }
}

export function setJSON<T = unknown>(key: string, value: T): boolean {
  try {
    const serialized = JSON.stringify(value);
    return setItem(key, serialized);
  } catch {
    return false;
  }
}

export function getNumber(key: string, defaultValue: number | null = null): number | null {
  const raw = getItem(key);
  if (raw === null) {
    return defaultValue;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) {
    return defaultValue;
  }
  return parsed;
}

export function setNumber(key: string, value: number): boolean {
  if (!Number.isFinite(value)) {
    return false;
  }
  return setItem(key, String(value));
}

