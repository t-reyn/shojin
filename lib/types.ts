export type MuscleGroup =
  | "chest"
  | "back"
  | "legs"
  | "shoulders"
  | "arms"
  | "core";

export type MovementPattern =
  | "squat"
  | "hinge"
  | "lunge"
  | "horizontal_press"
  | "vertical_press"
  | "horizontal_pull"
  | "vertical_pull"
  | "curl"
  | "triceps_extension"
  | "core"
  | "calf"
  | "other";

export type Unit = "kg" | "lb";

export type ExerciseType = "weight_reps" | "duration";

export type SetType = "normal" | "warmup" | "drop";

export const KG_PER_LB = 0.45359237;

export function toKg(weight: number, unit: Unit | undefined): number {
  return unit === "lb" ? weight * KG_PER_LB : weight;
}

export type Goal = "muscle" | "strength" | "fat" | "consistent";

export interface Profile {
  id: string;
  unit: Unit;
  default_rest_seconds: number;
  display_name: string | null;
  goal: Goal | null;
  days_per_week: number | null;
  onboarded_at: string | null;
}

export interface Exercise {
  id: string;
  user_id: string | null;
  name: string;
  muscle_group: MuscleGroup;
  movement_pattern: MovementPattern;
  equipment: string;
  is_custom: boolean;
  exercise_type: ExerciseType;
  secondary_muscles: MuscleGroup[];
}

export interface Workout {
  id: string;
  user_id: string;
  name: string;
  performed_at: string;
  duration_seconds: number | null;
  notes: string | null;
  readiness_sleep: number | null;
  readiness_energy: number | null;
  readiness_soreness: number | null;
}

export interface WorkoutSet {
  id: string;
  workout_id: string;
  exercise_id: string;
  set_index: number;
  weight: number;
  reps: number;
  rpe: number | null;
  is_warmup: boolean;
  completed: boolean;
  unit?: Unit;
  notes?: string | null;
  set_type?: SetType;
  duration_seconds?: number | null;
  superset_group?: number | null;
}

/** set_type with fallback for rows written before the column existed. */
export function setTypeOf(s: Pick<WorkoutSet, "set_type" | "is_warmup">): SetType {
  return s.set_type ?? (s.is_warmup ? "warmup" : "normal");
}

export interface Template {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
}

export interface TemplateSet {
  id: string;
  template_id: string;
  exercise_id: string;
  set_index: number;
  weight: number;
  reps: number;
  rest_seconds?: number | null;
}

export interface BodyweightEntry {
  id: string;
  logged_on: string;
  weight: number;
  unit: Unit;
  body_fat_pct?: number | null;
}

/** Pre-session readiness check-in, 1-5 each (null = not answered). */
export interface Readiness {
  sleep: number | null;
  energy: number | null;
  soreness: number | null;
}

/** A workout joined with its sets — convenient shape for charts/CSV/dashboard. */
export interface WorkoutWithSets extends Workout {
  sets: WorkoutSet[];
}

export const ALL_MUSCLE_GROUPS: MuscleGroup[] = [
  "chest",
  "back",
  "legs",
  "shoulders",
  "arms",
  "core",
];

export const ALL_MOVEMENT_PATTERNS: MovementPattern[] = [
  "squat",
  "hinge",
  "lunge",
  "horizontal_press",
  "vertical_press",
  "horizontal_pull",
  "vertical_pull",
  "curl",
  "triceps_extension",
  "core",
  "calf",
  "other",
];
