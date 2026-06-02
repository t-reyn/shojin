import { supabase } from "./supabase";
import type {
  BodyweightEntry,
  Exercise,
  Profile,
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
export async function getProfile(): Promise<Profile> {
  const id = await uid();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, unit, default_rest_seconds")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (data) return data as Profile;
  // Trigger should have made this, but create on demand if missing.
  const { data: created, error: e2 } = await supabase
    .from("profiles")
    .insert({ id })
    .select("id, unit, default_rest_seconds")
    .single();
  if (e2) throw e2;
  return created as Profile;
}

export async function updateProfile(
  patch: Partial<Pick<Profile, "unit" | "default_rest_seconds">>,
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
  e: Pick<Exercise, "name" | "muscle_group" | "movement_pattern" | "equipment">,
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
  is_warmup?: boolean;
  unit?: string;
}

export async function saveWorkout(input: {
  name: string;
  performed_at?: string;
  duration_seconds?: number | null;
  notes?: string | null;
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
    })
    .select("id")
    .single();
  if (error) throw error;
  const workout_id = (w as { id: string }).id;

  if (input.sets.length) {
    const rows = input.sets.map((s) => ({
      user_id,
      workout_id,
      exercise_id: s.exercise_id,
      set_index: s.set_index,
      weight: s.weight,
      reps: s.reps,
      rpe: s.rpe ?? null,
      is_warmup: s.is_warmup ?? false,
      completed: true,
      unit: s.unit ?? "kg",
    }));
    const { error: e2 } = await supabase.from("workout_sets").insert(rows);
    if (e2) throw e2;
  }
  return workout_id;
}

export async function listWorkouts(): Promise<WorkoutWithSets[]> {
  const { data, error } = await supabase
    .from("workouts")
    .select(
      "id, user_id, name, performed_at, duration_seconds, notes, sets:workout_sets(*)",
    )
    .order("performed_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as WorkoutWithSets[];
}

export async function updateWorkout(
  id: string,
  name: string,
  sets: DraftSet[],
): Promise<void> {
  const user_id = await uid();
  const { error: e1 } = await supabase.from("workouts").update({ name }).eq("id", id);
  if (e1) throw e1;
  const { error: e2 } = await supabase.from("workout_sets").delete().eq("workout_id", id);
  if (e2) throw e2;
  if (sets.length) {
    const rows = sets.map((s) => ({
      user_id,
      workout_id: id,
      exercise_id: s.exercise_id,
      set_index: s.set_index,
      weight: s.weight,
      reps: s.reps,
      rpe: s.rpe ?? null,
      is_warmup: s.is_warmup ?? false,
      completed: true,
      unit: s.unit ?? "kg",
    }));
    const { error: e3 } = await supabase.from("workout_sets").insert(rows);
    if (e3) throw e3;
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

export async function saveTemplate(input: {
  name: string;
  sets: { exercise_id: string; set_index: number; weight: number; reps: number }[];
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
  sets: { exercise_id: string; set_index: number; weight: number; reps: number }[],
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

// --- Bodyweight ------------------------------------------------------------
export async function listBodyweight(): Promise<BodyweightEntry[]> {
  const { data, error } = await supabase
    .from("bodyweight_entries")
    .select("id, logged_on, weight, unit")
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
  logged_on?: string,
): Promise<void> {
  const user_id = await uid();
  const { error } = await supabase.from("bodyweight_entries").upsert(
    {
      user_id,
      weight,
      unit,
      logged_on: logged_on ?? new Date().toISOString().slice(0, 10),
    },
    { onConflict: "user_id,logged_on" },
  );
  if (error) throw error;
}
