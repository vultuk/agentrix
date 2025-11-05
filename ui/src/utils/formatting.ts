export function formatLogTimestamp(value: string | Date | null | undefined): string {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function formatDateTime(value: string | null | undefined): string | null {
  if (!value || typeof value !== 'string') {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatIssueDate(value: string | null | undefined): string {
  if (!value) {
    return 'Opened date unavailable';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Opened date unavailable';
  }
  return `Opened ${date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })}`;
}

export function formatCount(value: number): string {
  if (!Number.isFinite(value)) {
    return '0';
  }
  if (value > 999) {
    return '999+';
  }
  return String(value);
}

export function formatTimestamp(value: string | Date | number | null | undefined): string | null {
  if (!value) {
    return null;
  }
  try {
    const date = new Date(value);
    if (Number.isNaN(date.valueOf())) {
      return null;
    }
    return new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    }).format(date);
  } catch {
    return null;
  }
}

export function classNames(...values: (string | false | null | undefined)[]): string {
  return values.filter(Boolean).join(' ');
}

