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

export function getWeekWindow(weekOffset = 0, now = new Date()) {
  if (!Number.isInteger(weekOffset) || Number.isNaN(now.valueOf())) return null;

  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const daysSinceMonday = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - daysSinceMonday + (weekOffset * 7));

  const end = new Date(start);
  end.setDate(end.getDate() + 6);

  return { start, end };
}

export function isDateInWeek(value: string, weekOffset = 0, now = new Date()) {
  const candidate = parseLocalDate(value);
  const window = getWeekWindow(weekOffset, now);
  return Boolean(candidate && window && candidate >= window.start && candidate <= window.end);
}
