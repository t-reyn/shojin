import { supabase } from "./supabase";
import type {
  BodyweightEntry,
  Exercise,
  Profile,
  Readiness,
  SetType,
  Template,
  TemplateSet,
  Unit,
  WorkoutWithSets,
} from "./types";

async function uid(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  const id = data.user?.id;
  if (!id) throw new Error("Not signed in");
  return id;
}

// --- Profile ---------------------------------------------------------------
const PROFILE_COLS =
  "id, unit, default_rest_seconds, display_name, goal, days_per_week, onboarded_at";

export async function getProfile(): Promise<Profile> {
  const id = await uid();
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_COLS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (data) return data as Profile;
  // Trigger should have made this, but create on demand if missing.
  const { data: created, error: e2 } = await supabase
    .from("profiles")
    .insert({ id })
    .select(PROFILE_COLS)
    .single();
  if (e2) throw e2;
  return created as Profile;
}

export async function updateProfile(
  patch: Partial<
    Pick<
      Profile,
      "unit" | "default_rest_seconds" | "display_name" | "goal" | "days_per_week" | "onboarded_at"
    >
  >,
): Promise<void> {
  const id = await uid();
  const { error } = await supabase.from("profiles").update(patch).eq("id", id);
  if (error) throw error;
}

// --- Exercises -------------------------------------------------------------
export async function listExercises(): Promise<Exercise[]> {
  const { data, error } = await supabase
    .from("exercises")
    .select("*")
    .order("name");
  if (error) throw error;
  return (data ?? []) as Exercise[];
}

export async function createCustomExercise(
  e: Pick<
    Exercise,
    "name" | "muscle_group" | "movement_pattern" | "equipment" | "exercise_type" | "secondary_muscles"
  >,
): Promise<Exercise> {
  const user_id = await uid();
  const { data, error } = await supabase
    .from("exercises")
    .insert({ ...e, user_id, is_custom: true })
    .select("*")
    .single();
  if (error) throw error;
  return data as Exercise;
}

export async function deleteCustomExercise(id: string): Promise<void> {
  const { error } = await supabase.from("exercises").delete().eq("id", id);
  if (error) throw error;
}

export async function deleteCustomExerciseAndSets(id: string): Promise<void> {
  const { error: e1 } = await supabase.from("workout_sets").delete().eq("exercise_id", id);
  if (e1) throw e1;
  const { error: e2 } = await supabase.from("template_sets").delete().eq("exercise_id", id);
  if (e2) throw e2;
  const { error: e3 } = await supabase.from("exercises").delete().eq("id", id);
  if (e3) throw e3;
}

export async function submitFeedback(
  message: string,
  customExercises: Pick<Exercise, "name" | "muscle_group" | "movement_pattern" | "equipment">[],
): Promise<void> {
  const user_id = await uid();
  const { error } = await supabase.from("feedback").insert({
    user_id,
    message: message.trim(),
    custom_exercises: customExercises.length > 0 ? customExercises : null,
  });
  if (error) throw error;
}

// --- Workouts --------------------------------------------------------------
export interface DraftSet {
  exercise_id: string;
  set_index: number;
  weight: number;
  reps: number;
  rpe?: number | null;
  set_type?: SetType;
  unit?: string;
  notes?: string | null;
  duration_seconds?: number | null;
  superset_group?: number | null;
}

function setRow(user_id: string, workout_id: string, s: DraftSet) {
  const set_type = s.set_type ?? "normal";
  return {
    user_id,
    workout_id,
    exercise_id: s.exercise_id,
    set_index: s.set_index,
    weight: s.weight,
    reps: s.reps,
    rpe: s.rpe ?? null,
    set_type,
    is_warmup: set_type === "warmup", // dual-write for rows/readers predating set_type
    completed: true,
    unit: s.unit ?? "kg",
    notes: s.notes ?? null,
    duration_seconds: s.duration_seconds ?? null,
    superset_group: s.superset_group ?? null,
  };
}

export async function saveWorkout(input: {
  name: string;
  performed_at?: string;
  duration_seconds?: number | null;
  notes?: string | null;
  readiness?: Readiness | null;
  sets: DraftSet[];
}): Promise<string> {
  const user_id = await uid();
  const { data: w, error } = await supabase
    .from("workouts")
    .insert({
      user_id,
      name: input.name,
      performed_at: input.performed_at ?? new Date().toISOString(),
      duration_seconds: input.duration_seconds ?? null,
      notes: input.notes ?? null,
      readiness_sleep: input.readiness?.sleep ?? null,
      readiness_energy: input.readiness?.energy ?? null,
      readiness_soreness: input.readiness?.soreness ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;
  const workout_id = (w as { id: string }).id;

  if (input.sets.length) {
    const rows = input.sets.map((s) => setRow(user_id, workout_id, s));
    const { error: e2 } = await supabase.from("workout_sets").insert(rows);
    if (e2) {
      // Don't leave an orphan workout with no sets behind.
      await supabase.from("workouts").delete().eq("id", workout_id);
      throw e2;
    }
  }
  return workout_id;
}

export async function listWorkouts(): Promise<WorkoutWithSets[]> {
  const { data, error } = await supabase
    .from("workouts")
    .select(
      "id, user_id, name, performed_at, duration_seconds, notes, readiness_sleep, readiness_energy, readiness_soreness, sets:workout_sets(*)",
    )
    .order("performed_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as WorkoutWithSets[];
}

export async function updateWorkout(
  id: string,
  name: string,
  sets: DraftSet[],
  notes?: string | null,
): Promise<void> {
  const user_id = await uid();
  // Capture the existing set IDs so we can remove them only AFTER the new ones
  // land — otherwise a failed insert would wipe the workout's history.
  const { data: existing, error: e0 } = await supabase
    .from("workout_sets")
    .select("id")
    .eq("workout_id", id);
  if (e0) throw e0;
  const oldIds = (existing ?? []).map((r) => (r as { id: string }).id);

  const { error: e1 } = await supabase
    .from("workouts")
    .update({ name, notes: notes ?? null })
    .eq("id", id);
  if (e1) throw e1;

  if (sets.length) {
    const rows = sets.map((s) => setRow(user_id, id, s));
    const { error: e3 } = await supabase.from("workout_sets").insert(rows);
    if (e3) throw e3; // old sets are still intact — nothing lost
  }

  if (oldIds.length) {
    const { error: e2 } = await supabase.from("workout_sets").delete().in("id", oldIds);
    if (e2) throw e2;
  }
}

export async function deleteWorkout(id: string): Promise<void> {
  const { error } = await supabase.from("workouts").delete().eq("id", id);
  if (error) throw error;
}

// --- Templates -------------------------------------------------------------
export interface TemplateWithSets extends Template {
  sets: TemplateSet[];
}

export async function listTemplates(): Promise<TemplateWithSets[]> {
  const { data, error } = await supabase
    .from("templates")
    .select("id, user_id, name, created_at, sets:template_sets(*)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as TemplateWithSets[];
}

export interface TemplateSetInput {
  exercise_id: string;
  set_index: number;
  weight: number;
  reps: number;
  rest_seconds?: number | null;
}

export async function saveTemplate(input: {
  name: string;
  sets: TemplateSetInput[];
}): Promise<string> {
  const user_id = await uid();
  const { data: t, error } = await supabase
    .from("templates")
    .insert({ user_id, name: input.name })
    .select("id")
    .single();
  if (error) throw error;
  const template_id = (t as { id: string }).id;
  if (input.sets.length) {
    const rows = input.sets.map((s) => ({ ...s, user_id, template_id }));
    const { error: e2 } = await supabase.from("template_sets").insert(rows);
    if (e2) throw e2;
  }
  return template_id;
}

export async function updateTemplate(
  id: string,
  name: string,
  sets: TemplateSetInput[],
): Promise<void> {
  const user_id = await uid();
  const { error: e1 } = await supabase.from("templates").update({ name }).eq("id", id);
  if (e1) throw e1;
  const { error: e2 } = await supabase.from("template_sets").delete().eq("template_id", id);
  if (e2) throw e2;
  if (sets.length) {
    const rows = sets.map((s) => ({ ...s, user_id, template_id: id }));
    const { error: e3 } = await supabase.from("template_sets").insert(rows);
    if (e3) throw e3;
  }
}

export async function deleteTemplate(id: string): Promise<void> {
  const { error } = await supabase.from("templates").delete().eq("id", id);
  if (error) throw error;
}

// --- Exercise notes (persistent, per-user, work for built-ins too) ----------
export async function listExerciseNotes(): Promise<Record<string, string>> {
  const { data, error } = await supabase
    .from("exercise_notes")
    .select("exercise_id, note");
  if (error) throw error;
  const map: Record<string, string> = {};
  for (const r of (data ?? []) as { exercise_id: string; note: string }[]) {
    map[r.exercise_id] = r.note;
  }
  return map;
}

export async function upsertExerciseNote(exercise_id: string, note: string): Promise<void> {
  const user_id = await uid();
  const trimmed = note.trim();
  if (!trimmed) {
    const { error } = await supabase
      .from("exercise_notes")
      .delete()
      .eq("user_id", user_id)
      .eq("exercise_id", exercise_id);
    if (error) throw error;
    return;
  }
  const { error } = await supabase
    .from("exercise_notes")
    .upsert(
      { user_id, exercise_id, note: trimmed, updated_at: new Date().toISOString() },
      { onConflict: "user_id,exercise_id" },
    );
  if (error) throw error;
}

// --- Bodyweight ------------------------------------------------------------
export async function listBodyweight(): Promise<BodyweightEntry[]> {
  const { data, error } = await supabase
    .from("bodyweight_entries")
    .select("id, logged_on, weight, unit, body_fat_pct")
    .order("logged_on");
  if (error) throw error;
  return (data ?? []) as BodyweightEntry[];
}

export async function deleteBodyweight(id: string): Promise<void> {
  const { error } = await supabase.from("bodyweight_entries").delete().eq("id", id);
  if (error) throw error;
}

export async function upsertBodyweight(
  weight: number,
  unit: Unit,
  bodyFatPct?: number | null,
  logged_on?: string,
): Promise<void> {
  const user_id = await uid();
  const row: Record<string, unknown> = {
    user_id,
    weight,
    unit,
    logged_on: logged_on ?? new Date().toISOString().slice(0, 10),
  };
  // Only touch body_fat_pct when provided, so re-logging weight alone
  // doesn't null out an earlier body-fat reading for the same day.
  if (bodyFatPct != null) row.body_fat_pct = bodyFatPct;
  const { error } = await supabase
    .from("bodyweight_entries")
    .upsert(row, { onConflict: "user_id,logged_on" });
  if (error) throw error;
}
