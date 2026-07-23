function parseLocalDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const parsed = new Date(year, month, day);

  if (parsed.getFullYear() !== year || parsed.getMonth() !== month || parsed.getDate() !== day) return null;
  return parsed;
}

export function isDateWithinDays(value: string, days: number, now = new Date()) {
  const candidate = parseLocalDate(value);
  if (!candidate || !Number.isInteger(days) || days < 0 || Number.isNaN(now.valueOf())) return false;

  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + days);

  return candidate >= start && candidate <= end;
}

export function dateAtEndOfWindow(days: number, now = new Date()) {
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  end.setDate(end.getDate() + days);
  return end;
}
