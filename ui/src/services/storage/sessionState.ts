/**
 * Session state management for URL params and UI state
 */

/**
 * Get query parameter from URL
 */
export function getQueryParam(name: string): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const url = new URL(window.location.href);
    return url.searchParams.get(name);
  } catch {
    return null;
  }
}

/**
 * Set query parameter in URL without page reload
 */
export function setQueryParam(name: string, value: string | null | undefined): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  try {
    const url = new URL(window.location.href);
    if (value === null || value === undefined || value === '') {
      url.searchParams.delete(name);
    } else {
      url.searchParams.set(name, String(value));
    }
    const nextUrl = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState(window.history.state, '', nextUrl);
    return true;
  } catch {
    return false;
  }
}

/**
 * Remove query parameter from URL
 */
export function removeQueryParam(name: string): boolean {
  return setQueryParam(name, null);
}

/**
 * Get numeric query parameter
 */
export function getNumericQueryParam(name: string, defaultValue: number | null = null): number | null {
  const value = getQueryParam(name);
  if (!value) {
    return defaultValue;
  }
  const parsed = Number.parseInt(value, 10);
  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed;
  }
  return defaultValue;
}

/**
 * Read collapsed organizations from storage
 */
export function getCollapsedOrganizations(storageKey: string): Set<string> {
  if (typeof window === 'undefined') {
    return new Set();
  }
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return new Set();
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return new Set();
    }
    return new Set(parsed);
  } catch {
    return new Set();
  }
}

/**
 * Save collapsed organizations to storage
 */
export function setCollapsedOrganizations(storageKey: string, collapsed: Set<string>): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  try {
    const array = Array.from(collapsed);
    const serialized = JSON.stringify(array);
    window.localStorage.setItem(storageKey, serialized);
    return true;
  } catch {
    return false;
  }
}

