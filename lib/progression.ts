import { setTypeOf, KG_PER_LB } from "./types";
import type { Exercise, SetType, Unit, WorkoutSet, WorkoutWithSets } from "./types";

/** A recommended next load for an exercise, in the requested unit. */
export interface Suggestion {
  kind: "increase" | "hold" | "deload";
  weight: number; // added weight for bodyweight-equipment exercises
  reps: number;
  seconds: number | null; // set for duration-type exercises (weight/reps are 0)
  addReps: boolean; // true when progressing an unweighted bodyweight move by reps
}

// Smallest sensible jump per equipment. Dumbbells usually step in 2s (kg racks);
// everything barbell/stack-loaded steps in 2.5 kg / 5 lb.
const INCREMENTS_KG: Record<string, number> = {
  barbell: 2.5,
  dumbbell: 2,
  cable: 2.5,
  machine: 2.5,
  bodyweight: 2.5,
  other: 2.5,
};

export function incrementFor(equipment: string, unit: Unit): number {
  return unit === "lb" ? 5 : (INCREMENTS_KG[equipment] ?? 2.5);
}

function convert(w: number, from: Unit | undefined, to: Unit): number {
  const f = from ?? "kg";
  if (f === to) return w;
  return to === "kg" ? w * KG_PER_LB : w / KG_PER_LB;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function roundToIncrement(w: number, inc: number): number {
  return round2(Math.round(w / inc) * inc);
}

/** Up to `count` most recent sessions (completed sets ordered by set_index)
 *  containing the exercise. Skips the workout currently being edited. */
export function recentSessionsFor(
  workouts: WorkoutWithSets[],
  exerciseId: string,
  excludeWorkoutId?: string,
  count = 2,
): WorkoutSet[][] {
  const sessions: WorkoutSet[][] = [];
  const sorted = [...workouts].sort((a, b) => b.performed_at.localeCompare(a.performed_at));
  for (const w of sorted) {
    if (excludeWorkoutId && w.id === excludeWorkoutId) continue;
    const sets = w.sets
      .filter((s) => s.exercise_id === exerciseId && s.completed)
      .sort((a, b) => a.set_index - b.set_index);
    if (sets.length) {
      sessions.push(sets);
      if (sessions.length >= count) break;
    }
  }
  return sessions;
}

function workingSets(sets: WorkoutSet[]): WorkoutSet[] {
  return sets.filter((s) => setTypeOf(s) === "normal");
}

/** RPE-aware progressive-overload recommendation.
 *
 *  Baseline = the heaviest working (normal-type) sets of the last session —
 *  warm-ups and drop sets never drive progression. Unlogged RPE counts as
 *  "had more in the tank":
 *  - top-set RPE ≤ 8 (or none logged) → add one equipment increment
 *  - top-set RPE 9–10               → hold the weight
 *  - reps regressed at the same top weight vs the session before, at RPE ≥ 9
 *    → deload ~5% (rounded down to an increment)
 */
export function suggestNextLoad(
  exercise: Pick<Exercise, "equipment" | "exercise_type">,
  sessions: WorkoutSet[][],
  targetUnit: Unit,
): Suggestion | null {
  const last = sessions[0] ? workingSets(sessions[0]) : [];
  if (!last.length) return null;

  if (exercise.exercise_type === "duration") {
    const best = Math.max(...last.map((s) => s.duration_seconds ?? 0));
    if (best <= 0) return null;
    const maxRpe = Math.max(...last.map((s) => s.rpe ?? 0));
    return maxRpe <= 8
      ? { kind: "increase", weight: 0, reps: 0, seconds: best + 10, addReps: false }
      : { kind: "hold", weight: 0, reps: 0, seconds: best, addReps: false };
  }

  const inc = incrementFor(exercise.equipment, targetUnit);
  const weights = last.map((s) => convert(s.weight, s.unit, targetUnit));
  const top = round2(Math.max(...weights));
  const topSets = last.filter((_, i) => Math.abs(weights[i] - top) < inc / 2);
  const reps = Math.max(...topSets.map((s) => s.reps));
  const topRpe = Math.max(...topSets.map((s) => s.rpe ?? 0));

  // Unweighted bodyweight work progresses by reps, not load.
  if (exercise.equipment === "bodyweight" && top <= 0) {
    return topRpe <= 8
      ? { kind: "increase", weight: 0, reps: reps + 1, seconds: null, addReps: true }
      : { kind: "hold", weight: 0, reps, seconds: null, addReps: false };
  }

  if (topRpe >= 9) {
    // Regressed at this weight two sessions running → back off.
    const prev = sessions[1] ? workingSets(sessions[1]) : [];
    if (prev.length) {
      const prevWeights = prev.map((s) => convert(s.weight, s.unit, targetUnit));
      const prevTopSets = prev.filter((_, i) => Math.abs(prevWeights[i] - top) < inc / 2);
      if (prevTopSets.length) {
        const prevReps = Math.max(...prevTopSets.map((s) => s.reps));
        if (reps < prevReps) {
          let deloaded = roundToIncrement(top * 0.95, inc);
          if (deloaded >= top) deloaded = round2(top - inc);
          if (deloaded > 0) {
            return { kind: "deload", weight: deloaded, reps: prevReps, seconds: null, addReps: false };
          }
        }
      }
    }
    return { kind: "hold", weight: top, reps, seconds: null, addReps: false };
  }

  let next = roundToIncrement(top + inc, inc);
  if (next <= top) next = round2(top + inc);
  return { kind: "increase", weight: next, reps, seconds: null, addReps: false };
}

/** Compact "what you did last time" line, e.g. "80×5 · 80×5 · 80×4" or
 *  "60s", converted into the draft's unit. */
export function lastSessionSummary(
  sets: WorkoutSet[],
  targetUnit: Unit,
  maxItems = 3,
): string {
  const work = workingSets(sets);
  const items = work.slice(0, maxItems).map((s) => {
    if (s.duration_seconds) return `${s.duration_seconds}s`;
    const w = round2(convert(s.weight, s.unit, targetUnit));
    return w > 0 ? `${w}×${s.reps}` : `${s.reps} reps`;
  });
  const extra = work.length - items.length;
  return items.join(" · ") + (extra > 0 ? ` +${extra}` : "");
}

export interface PrevHint {
  weight: number;
  reps: number;
  seconds: number;
}

/** Last session's values converted into the draft's unit, aligned to the
 *  draft's sets — warm-ups match warm-ups, working/drop sets match the rest,
 *  each by ordinal. Used for faint "previous" placeholders in set rows. */
export function prevHintsFor(
  lastSets: WorkoutSet[],
  draftTypes: SetType[],
  targetUnit: Unit,
): (PrevHint | null)[] {
  const warm = lastSets.filter((s) => setTypeOf(s) === "warmup");
  const work = lastSets.filter((s) => setTypeOf(s) !== "warmup");
  let wi = 0;
  let ni = 0;
  return draftTypes.map((t) => {
    const s = t === "warmup" ? warm[wi++] : work[ni++];
    if (!s) return null;
    return {
      weight: round2(convert(s.weight, s.unit, targetUnit)),
      reps: s.reps,
      seconds: s.duration_seconds ?? 0,
    };
  });
}
