function parseTimeToMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function isWeekend(date) {
  const day = date.getDay(); // 0 = Sunday, 6 = Saturday
  return day === 0 || day === 6;
}

/**
 * Whether `date` (local time) falls inside the active window for its day
 * type. Supports overnight windows (start > end, e.g. 22:00-06:00) by
 * wrapping across midnight.
 */
export function isWithinSchedule(schedule, date = new Date()) {
  if (!schedule) return true;
  const window = isWeekend(date) ? schedule.weekend : schedule.weekday;
  if (!window) return true;

  const nowMin = date.getHours() * 60 + date.getMinutes();
  const startMin = parseTimeToMinutes(window.start);
  const endMin = parseTimeToMinutes(window.end);

  if (startMin === endMin) return true; // zero-width window == whole day, not zero
  if (startMin < endMin) return nowMin >= startMin && nowMin < endMin;
  return nowMin >= startMin || nowMin < endMin; // overnight wrap
}
