export function getDateKeyInTimeZone(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(date);
}

function parseDateKey(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const [, year, month, day] = match;
  return {
    day: Number(day),
    month: Number(month),
    year: Number(year),
  };
}

export function zonedDateKeyToIso(dateKey: string, timeZone: string) {
  const parts = parseDateKey(dateKey);
  if (!parts) return undefined;

  const desiredUtcValue = Date.UTC(parts.year, parts.month - 1, parts.day, 0, 0, 0);
  let guess = new Date(desiredUtcValue);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const zonedKey = getDateKeyInTimeZone(guess, timeZone);
    const zonedParts = parseDateKey(zonedKey);
    if (!zonedParts) break;

    const zonedUtcValue = Date.UTC(zonedParts.year, zonedParts.month - 1, zonedParts.day, 0, 0, 0);
    const delta = zonedUtcValue - desiredUtcValue;
    if (delta === 0) break;

    guess = new Date(guess.getTime() - delta);
  }

  return guess.toISOString();
}
