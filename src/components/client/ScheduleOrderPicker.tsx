import { useState, useMemo, useCallback } from "react";
import { Clock, CalendarDays } from "lucide-react";
import { normalizeOpeningHours } from "@/lib/openingHours";

interface ScheduleOrderPickerProps {
  scheduledAt: string | null;
  onScheduleChange: (isoString: string | null) => void;
  openingHours?: unknown;
  orderType?: string;
  schedulingMode?: string;
  isRestaurantClosed?: boolean;
}

const DAYS_FR = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const DAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function localDateAt(offset: number): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}-${d.getDate().toString().padStart(2, "0")}`;
}

function weekdayKey(d: Date): string {
  return DAY_KEYS[d.getDay()];
}

function labelForDate(d: Date): string {
  const tk = toDateKey(localDateAt(0));
  const tmk = toDateKey(localDateAt(1));
  const dk = toDateKey(d);
  if (dk === tk) return "Aujourd'hui";
  if (dk === tmk) return "Demain";
  return DAYS_FR[d.getDay()];
}

interface DayEntry { date: Date; key: string; label: string; closed: boolean }

/**
 * A day is closed if openingHours explicitly says { closed: true }.
 * If openingHours is undefined (not loaded yet), we can't determine — treat as closed to avoid showing wrong slots.
 * If openingHours exists but has no entry for a day, treat as closed (restaurant didn't configure that day).
 */
function isDayClosed(
  d: Date,
  oh?: unknown,
): boolean {
  const normalized = normalizeOpeningHours(oh);
  if (Object.keys(normalized).length === 0) return true;
  const entry = normalized[weekdayKey(d)];
  if (!entry) return true; // no entry for this day = treat as closed
  return !!entry.closed || entry.intervals.length === 0;
}

function buildDays(
  mode: string,
  oh?: unknown,
  count = 7,
): DayEntry[] {
  const entries: DayEntry[] = [];
  const start = mode === "future_only" ? 1 : 0;
  const max = mode === "today_only" ? 1 : count;
  for (let i = start; entries.length < max && i < start + 14; i++) {
    const d = localDateAt(i);
    entries.push({ date: d, key: toDateKey(d), label: labelForDate(d), closed: isDayClosed(d, oh) });
  }
  return entries;
}

function generateSlots(
  selectedDate: Date,
  oh?: unknown,
  prepMin = 30,
): string[] {
  if (isDayClosed(selectedDate, oh)) return [];

  const intervals = normalizeOpeningHours(oh)[weekdayKey(selectedDate)]?.intervals || [];
  const slots = [...new Set(intervals.flatMap(({ open, close }) => {
    const [openH, openM] = open.split(":").map(Number);
    const [closeH, closeM] = close.split(":").map(Number);
    const start = openH * 60 + openM;
    let end = closeH * 60 + closeM;
    if (end <= start) end += 24 * 60;
    const segment: string[] = [];
    for (let t = start; t < end; t += 15) {
      const minute = t % (24 * 60);
      segment.push(`${Math.floor(minute / 60).toString().padStart(2, "0")}:${(minute % 60).toString().padStart(2, "0")}`);
    }
    return segment;
  }))].sort();

  // Filter past slots if today
  const now = new Date();
  if (toDateKey(selectedDate) === toDateKey(now)) {
    const minTime = now.getHours() * 60 + now.getMinutes() + prepMin;
    const minStr = `${Math.floor(minTime / 60).toString().padStart(2, "0")}:${(minTime % 60).toString().padStart(2, "0")}`;
    return slots.filter((t) => t >= minStr);
  }

  return slots;
}

/* ── Component ───────────────────────────────────────── */

const ScheduleOrderPicker = ({
  scheduledAt,
  onScheduleChange,
  openingHours,
  orderType,
  schedulingMode = "all",
  isRestaurantClosed = false,
}: ScheduleOrderPickerProps) => {
  const schedulingRequired = schedulingMode === "future_only";
  const forcedSchedule = schedulingRequired || (isRestaurantClosed && schedulingMode !== "disabled");

  const days = useMemo(() => buildDays(schedulingMode, openingHours), [schedulingMode, openingHours]);
  const firstOpenDay = useMemo(() => days.find((d) => !d.closed) ?? days[0], [days]);

  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    if (scheduledAt) {
      const [y, m, d] = scheduledAt.slice(0, 10).split("-").map(Number);
      return new Date(y, m - 1, d);
    }
    return firstOpenDay?.date ?? localDateAt(0);
  });

  const [selectedTime, setSelectedTime] = useState<string>(() => {
    if (scheduledAt) {
      const d = new Date(scheduledAt);
      return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
    }
    return "";
  });

  const [mode, setMode] = useState<"asap" | "scheduled">(
    scheduledAt ? "scheduled" : forcedSchedule ? "scheduled" : "asap",
  );

  const selectedKey = toDateKey(selectedDate);
  const timeSlots = useMemo(() => generateSlots(selectedDate, openingHours), [selectedDate, openingHours]);
  const dayIsClosed = isDayClosed(selectedDate, openingHours);

  // No auto-select: let the client choose

  const handleModeChange = useCallback((newMode: "asap" | "scheduled") => {
    setMode(newMode);
    if (newMode === "asap") onScheduleChange(null);
  }, [onScheduleChange]);

  const handleDaySelect = useCallback((day: DayEntry) => {
    if (day.closed) return;
    setSelectedDate(day.date);
    setSelectedTime("");
    onScheduleChange(null);
  }, [onScheduleChange]);

  const handleTimeSelect = useCallback((time: string) => {
    setSelectedTime(time);
    const [h, m] = time.split(":").map(Number);
    const dt = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), h, m);
    onScheduleChange(dt.toISOString());
  }, [selectedDate, onScheduleChange]);

  // ── Early returns after hooks ──
  if (orderType === "dine_in") return null;
  if (schedulingMode === "disabled") {
    if (isRestaurantClosed) {
      return (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm font-semibold text-destructive">🔒 Restaurant fermé</p>
          <p className="text-xs text-muted-foreground mt-1">
            Les commandes programmées ne sont pas disponibles.
          </p>
        </div>
      );
    }
    return null;
  }

  // ── Collapsed summary ──
  if (mode === "asap" && scheduledAt) {
    const sd = new Date(scheduledAt);
    const timeStr = `${sd.getHours().toString().padStart(2, "0")}:${sd.getMinutes().toString().padStart(2, "0")}`;
    const sdLabel = days.find((d) => d.key === scheduledAt.slice(0, 10))?.label || sd.toLocaleDateString("fr-FR");
    return (
      <div className="rounded-xl border bg-card p-3 shadow-card flex flex-wrap items-center gap-2">
        <p className="text-xs font-semibold text-card-foreground flex items-center gap-1.5 min-w-0">
          <Clock className="h-4 w-4 text-primary shrink-0" />
          <span className="truncate">
            Programmée : <span className="text-primary">{timeStr}</span> — {sdLabel}
          </span>
        </p>
        <div className="flex gap-2 ml-auto shrink-0">
          <button onClick={() => setMode("scheduled")} className="rounded-lg bg-secondary/50 px-2.5 py-1.5 text-[11px] font-semibold text-foreground hover:bg-secondary">
            Modifier
          </button>
          {!forcedSchedule && (
            <button onClick={() => { onScheduleChange(null); setSelectedTime(""); }} className="rounded-lg bg-destructive/10 px-2.5 py-1.5 text-[11px] font-semibold text-destructive hover:bg-destructive/20">
              Annuler
            </button>
          )}
        </div>
      </div>
    );
  }

  const title = forcedSchedule ? "Programmez votre commande" : "Quand souhaitez-vous commander ?";

  return (
    <div className="rounded-xl border bg-card p-4 shadow-card">
      <h3 className="mb-3 text-sm font-bold text-card-foreground flex items-center gap-2">
        <Clock className="h-4 w-4 text-primary" />
        {title}
      </h3>

      {!forcedSchedule && (
        <div className="flex gap-2 mb-3">
          <button
            onClick={() => handleModeChange("asap")}
            className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-colors ${
              mode === "asap" ? "bg-primary text-primary-foreground" : "bg-secondary/50 text-foreground hover:bg-secondary"
            }`}
          >
            Dès que possible
          </button>
          <button
            onClick={() => handleModeChange("scheduled")}
            className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 ${
              mode === "scheduled" ? "bg-primary text-primary-foreground" : "bg-secondary/50 text-foreground hover:bg-secondary"
            }`}
          >
            <CalendarDays className="h-3.5 w-3.5" />
            Programmer
          </button>
        </div>
      )}

      {(mode === "scheduled" || forcedSchedule) && (
        <div className="space-y-3 animate-fade-in">
          {/* Day pills */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
            {days.map((day) => (
              <button
                key={day.key}
                onClick={() => handleDaySelect(day)}
                disabled={day.closed}
                className={`flex-shrink-0 rounded-lg py-1.5 px-2.5 text-[11px] font-semibold transition-colors ${
                  day.closed
                    ? "bg-muted/30 text-muted-foreground/50 cursor-not-allowed line-through"
                    : selectedKey === day.key
                      ? "bg-primary/10 border border-primary text-primary"
                      : "bg-secondary/50 border border-transparent text-foreground hover:bg-secondary"
                }`}
              >
                {day.label}
                {day.closed && <span className="block text-[9px] font-normal no-underline">Fermé</span>}
              </button>
            ))}
          </div>

          {/* Time slots grid */}
          {dayIsClosed ? (
            <p className="text-xs text-muted-foreground text-center py-2">Fermé ce jour.</p>
          ) : timeSlots.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-2">Aucun créneau disponible.</p>
          ) : (
            <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
              {timeSlots.map((time) => (
                <button
                  key={time}
                  onClick={() => handleTimeSelect(time)}
                  className={`flex-shrink-0 rounded-lg py-1.5 px-3 text-xs font-semibold transition-colors ${
                    selectedTime === time
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary/30 text-foreground hover:bg-secondary"
                  }`}
                >
                  {time}
                </button>
              ))}
            </div>
          )}

          {selectedTime && (
            <p className="text-xs text-muted-foreground text-center">
              👉 Commande prévue à <span className="font-semibold text-primary">{selectedTime}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default ScheduleOrderPicker;
