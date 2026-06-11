import type { MuscleGroup, Unit, WorkoutWithSets } from "./types";
import { convertWeight } from "./units";

/** Local YYYY-MM-DD for a Date (heatmap/streaks work in the user's timezone). */
export function localDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Sets can carry their own unit (the unit the exercise was logged in at the
// time), independent of the profile's current unit — convert each set to
// `toUnit` before summing so totals aren't a meaningless mix of kg and lb.
function setVolume(w: WorkoutWithSets, toUnit: Unit): number {
  return w.sets.reduce(
    (sum, s) => sum + (s.is_warmup ? 0 : convertWeight(s.weight, s.unit ?? "kg", toUnit) * s.reps),
    0,
  );
}

/** Map of local day -> { count, volume } for days that had a workout.
 *  `volume` is expressed in `toUnit`. */
export function dailyTotals(
  workouts: WorkoutWithSets[],
  toUnit: Unit,
): Map<string, { count: number; volume: number }> {
  const map = new Map<string, { count: number; volume: number }>();
  for (const w of workouts) {
    const key = localDay(new Date(w.performed_at));
    const cur = map.get(key) ?? { count: 0, volume: 0 };
    cur.count += 1;
    cur.volume += setVolume(w, toUnit);
    map.set(key, cur);
  }
  return map;
}

/** Current and longest consecutive-day streaks (a day counts if it had >=1
 *  workout). Current streak counts back from today (or yesterday, so a rest
 *  day today doesn't immediately zero a streak until tomorrow). */
export function computeStreaks(days: Set<string>): {
  current: number;
  longest: number;
} {
  if (days.size === 0) return { current: 0, longest: 0 };

  const sorted = [...days].sort();
  let longest = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1] + "T00:00:00");
    const cur = new Date(sorted[i] + "T00:00:00");
    const diff = Math.round((cur.getTime() - prev.getTime()) / 86_400_000);
    run = diff === 1 ? run + 1 : 1;
    if (run > longest) longest = run;
  }

  // Current streak: walk back from today while days exist.
  let current = 0;
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  if (!days.has(localDay(cursor))) cursor.setDate(cursor.getDate() - 1); // grace for today
  while (days.has(localDay(cursor))) {
    current += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return { current, longest };
}

export interface HeatCell {
  date: string; // local YYYY-MM-DD
  count: number;
  volume: number;
  level: 0 | 1 | 2 | 3 | 4;
  inFuture: boolean;
}

/** Build a GitHub/Claude-style grid: weeks as columns (oldest left), days as
 *  rows (Mon..Sun). Level is a 0-4 intensity by that day's volume. */
export function buildHeatmap(
  workouts: WorkoutWithSets[],
  numWeeks = 26,
  now: Date = new Date(),
  toUnit: Unit = "kg",
): { weeks: HeatCell[][]; totalSessions: number } {
  const totals = dailyTotals(workouts, toUnit);
  const maxVol = Math.max(1, ...[...totals.values()].map((t) => t.volume));

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  // Start at the Monday of the week (numWeeks-1) weeks ago.
  const start = new Date(today);
  const dow = (start.getDay() + 6) % 7; // 0 = Monday
  start.setDate(start.getDate() - dow - (numWeeks - 1) * 7);

  const weeks: HeatCell[][] = [];
  const cursor = new Date(start);
  for (let w = 0; w < numWeeks; w++) {
    const col: HeatCell[] = [];
    for (let d = 0; d < 7; d++) {
      const key = localDay(cursor);
      const t = totals.get(key);
      const volume = t?.volume ?? 0;
      let level: HeatCell["level"] = 0;
      if (volume > 0) {
        const r = volume / maxVol;
        level = r > 0.75 ? 4 : r > 0.5 ? 3 : r > 0.25 ? 2 : 1;
      }
      col.push({
        date: key,
        count: t?.count ?? 0,
        volume,
        level,
        inFuture: cursor.getTime() > today.getTime(),
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(col);
  }

  let totalSessions = 0;
  for (const t of totals.values()) totalSessions += t.count;
  return { weeks, totalSessions };
}

/** Working-set volume by muscle group (in `toUnit`) for workouts whose local
 *  day falls in [from, to] (inclusive). Omit `to` for "from .. today". Dates
 *  are YYYY-MM-DD. */
export function volumeByMuscleForRange(
  workouts: WorkoutWithSets[],
  muscleOf: (exerciseId: string) => MuscleGroup | undefined,
  toUnit: Unit,
  from: string,
  to?: string,
): Record<MuscleGroup, number> {
  const totals: Record<MuscleGroup, number> = {
    chest: 0,
    back: 0,
    legs: 0,
    shoulders: 0,
    arms: 0,
    core: 0,
  };
  for (const w of workouts) {
    const day = localDay(new Date(w.performed_at));
    if (day < from) continue;
    if (to && day > to) continue;
    for (const s of w.sets) {
      if (s.is_warmup) continue;
      const mg = muscleOf(s.exercise_id);
      if (!mg) continue;
      totals[mg] += convertWeight(s.weight, s.unit ?? "kg", toUnit) * s.reps;
    }
  }
  return totals;
}
