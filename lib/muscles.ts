import type { MuscleGroup, MovementPattern, Unit, WorkoutWithSets } from "./types";
import { convertWeight } from "./units";

export const MUSCLE_LABELS: Record<MuscleGroup, string> = {
  chest: "Chest",
  back: "Back",
  legs: "Legs",
  shoulders: "Shoulders",
  arms: "Arms",
  core: "Core",
};

export const MUSCLE_COLORS: Record<MuscleGroup, string> = {
  chest: "var(--color-mg-chest)",
  back: "var(--color-mg-back)",
  legs: "var(--color-mg-legs)",
  shoulders: "var(--color-mg-shoulders)",
  arms: "var(--color-mg-arms)",
  core: "var(--color-mg-core)",
};

export const PATTERN_LABELS: Record<MovementPattern, string> = {
  squat: "Squat",
  hinge: "Hinge",
  lunge: "Lunge",
  horizontal_press: "Horizontal Press",
  vertical_press: "Vertical Press",
  horizontal_pull: "Horizontal Pull",
  vertical_pull: "Vertical Pull",
  curl: "Curl",
  triceps_extension: "Triceps Extension",
  core: "Core",
  calf: "Calf",
  other: "Other",
};

/** Volume (weight x reps, in `toUnit`) summed by muscle group over the given
 *  workouts. Needs a lookup from exercise_id to its muscle group. */
export function volumeByMuscle(
  workouts: WorkoutWithSets[],
  muscleOf: (exerciseId: string) => MuscleGroup | undefined,
  toUnit: Unit,
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
    for (const s of w.sets) {
      const mg = muscleOf(s.exercise_id);
      if (!mg || s.is_warmup) continue;
      totals[mg] += convertWeight(s.weight, s.unit ?? "kg", toUnit) * s.reps;
    }
  }
  return totals;
}
