const dateFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
});

export function formatDate(value: number | Date): string {
  return dateFormatter.format(value);
}

export function formatTime(value: number | Date): string {
  return timeFormatter.format(value);
}

export function formatDateTime(value: number | Date): string {
  return `${formatDate(value)} · ${formatTime(value)}`;
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
