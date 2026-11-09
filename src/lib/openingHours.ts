export const RESTAURANT_TIME_ZONE = "Europe/Brussels";
export const DAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;

export interface OpeningInterval { open: string; close: string }
export interface DayOpeningHours { closed: boolean; intervals: OpeningInterval[] }
export type OpeningHours = Record<string, DayOpeningHours>;

const validTime = (value: unknown): value is string => typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

export function normalizeOpeningHours(value: unknown): OpeningHours {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: OpeningHours = {};
  for (const [day, raw] of Object.entries(value)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const entry = raw as Record<string, unknown>;
    const intervals = Array.isArray(entry.intervals)
      ? entry.intervals.flatMap((item) => {
          if (!item || typeof item !== "object") return [];
          const interval = item as Record<string, unknown>;
          return validTime(interval.open) && validTime(interval.close) ? [{ open: interval.open, close: interval.close }] : [];
        })
      : validTime(entry.open) && validTime(entry.close) ? [{ open: entry.open, close: entry.close }] : [];
    result[day] = { closed: entry.closed === true || intervals.length === 0, intervals };
  }
  return result;
}

export function defaultOpeningHours(): OpeningHours {
  return Object.fromEntries(DAY_KEYS.map((day) => [day, { closed: true, intervals: [] }])) as OpeningHours;
}

function timeMinutes(value: string): number { const [h, m] = value.split(":").map(Number); return h * 60 + m; }

export function isOpenAt(openingHours: unknown, date = new Date()): boolean {
  const hours = normalizeOpeningHours(openingHours);
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: RESTAURANT_TIME_ZONE, weekday: "long", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  const today = get("weekday").toLowerCase();
  const dayIndex = DAY_KEYS.indexOf(today as typeof DAY_KEYS[number]);
  const now = Number(get("hour")) * 60 + Number(get("minute"));
  const todayIntervals = hours[today]?.closed ? [] : hours[today]?.intervals || [];
  if (todayIntervals.some(({ open, close }) => {
    const start = timeMinutes(open), end = timeMinutes(close);
    return end > start ? now >= start && now < end : now >= start || now < end;
  })) return true;
  const previous = DAY_KEYS[(dayIndex + 6) % 7];
  const previousIntervals = hours[previous]?.closed ? [] : hours[previous]?.intervals || [];
  return previousIntervals.some(({ open, close }) => timeMinutes(close) <= timeMinutes(open) && now < timeMinutes(close));
}

export function formatOpeningIntervals(intervals: OpeningInterval[]): string {
  return intervals.map(({ open, close }) => `${open}–${close}`).join(", ");
}
