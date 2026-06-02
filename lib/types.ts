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

export interface Profile {
  id: string;
  unit: Unit;
  default_rest_seconds: number;
}

export interface Exercise {
  id: string;
  user_id: string | null;
  name: string;
  muscle_group: MuscleGroup;
  movement_pattern: MovementPattern;
  equipment: string;
  is_custom: boolean;
}

export interface Workout {
  id: string;
  user_id: string;
  name: string;
  performed_at: string;
  duration_seconds: number | null;
  notes: string | null;
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
}

export interface BodyweightEntry {
  id: string;
  logged_on: string;
  weight: number;
  unit: Unit;
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
