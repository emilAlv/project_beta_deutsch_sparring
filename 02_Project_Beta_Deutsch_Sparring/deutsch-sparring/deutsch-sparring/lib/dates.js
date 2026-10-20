// Showing days like "2026-11-30" (browser side). Days have no time zone, so they are formatted as UTC.
import { LOCALE } from './ui-text';

const fmt = (opts) => {
  try {
    return new Intl.DateTimeFormat(LOCALE, { ...opts, timeZone: 'UTC' });
  } catch {
    return null;
  }
};
const DAY = fmt({ day: 'numeric', month: 'short' });
const DAY_YEAR = fmt({ day: 'numeric', month: 'short', year: 'numeric' });
const DAY_WEEK = fmt({ weekday: 'short', day: 'numeric', month: 'short' });
const MONTH = fmt({ month: 'short' });
const at = (day) => new Date(`${day}T00:00:00Z`);

export const fmtDay = (day, year = false) => ((year ? DAY_YEAR : DAY)?.format(at(day))) || day;
// "Fri 6 Nov"
export const fmtWeekday = (day) => DAY_WEEK?.format(at(day)) || day;
// month tick: "Nov"; January (and the first tick) also show the year
export const fmtMonth = (day) => {
  const d = at(day);
  const m = MONTH?.format(d) || day.slice(0, 7);
  return d.getUTCMonth() === 0 ? `${m} ’${String(d.getUTCFullYear()).slice(2)}` : m;
};
