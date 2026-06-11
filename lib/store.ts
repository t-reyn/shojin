import { create } from "zustand";
import type {
  BodyweightEntry,
  Exercise,
  MuscleGroup,
  Profile,
  WorkoutWithSets,
} from "./types";
import * as db from "./db";
import type { TemplateWithSets } from "./db";

export interface DraftSetEntry {
  weight: number;
  reps: number;
  done: boolean;
  isWarmup: boolean;
  rpe: number | null;
}

export interface DraftExercise {
  exerciseId: string;
  unit: "kg" | "lb";
  sets: DraftSetEntry[];
  notes: string;
}

export interface Draft {
  name: string;
  startedAt: number;
  exercises: DraftExercise[];
  workoutId?: string; // present when editing an existing saved workout
}

interface RestState {
  endsAt: number | null;
  duration: number;
}

interface StoreState {
  // server data
  loaded: boolean;
  exercises: Exercise[];
  exercisesById: Map<string, Exercise>;
  workouts: WorkoutWithSets[];
  templates: TemplateWithSets[];
  bodyweight: BodyweightEntry[];
  profile: Profile | null;

  // active logging session
  draft: Draft | null;

  // rest timer (lives here so it survives tab switches)
  rest: RestState;

  hydrate: () => Promise<void>;
  reset: () => void;
  refreshWorkouts: () => Promise<void>;
  refreshTemplates: () => Promise<void>;
  refreshBodyweight: () => Promise<void>;
  refreshExercises: () => Promise<void>;

  // draft actions
  startBlank: () => void;
  startFromTemplate: (t: TemplateWithSets) => void;
  startFromWorkout: (w: WorkoutWithSets) => void;
  startEdit: (w: WorkoutWithSets) => void;
  setDraftName: (name: string) => void;
  addDraftExercise: (exerciseId: string) => void;
  replaceDraftExercise: (exIdx: number, exerciseId: string) => void;
  toggleDraftExerciseUnit: (exIdx: number) => void;
  setDraftExerciseNotes: (exIdx: number, notes: string) => void;
  removeDraftExercise: (exIdx: number) => void;
  insertDraftExercise: (exIdx: number, exercise: DraftExercise) => void;
  addDraftSet: (exIdx: number) => void;
  updateDraftSet: (exIdx: number, setIdx: number, patch: Partial<DraftSetEntry>) => void;
  removeDraftSet: (exIdx: number, setIdx: number) => void;
  // Identity-based so a delayed Undo lands in the right exercise even if the
  // draft has changed (e.g. another exercise above was removed) since the set
  // was removed. Returns false (no-op) if that exercise is no longer present.
  insertDraftSet: (exerciseId: string, setIdx: number, set: DraftSetEntry) => boolean;
  discardDraft: () => void;
  finishWorkout: () => Promise<void>;

  // timer
  startRest: (seconds: number) => void;
  adjustRest: (deltaSeconds: number) => void;
  stopRest: () => void;

  // helpers
  muscleOf: (exerciseId: string) => MuscleGroup | undefined;
  exerciseById: (id: string) => Exercise | undefined;
}

export const useStore = create<StoreState>((set, get) => ({
  loaded: false,
  exercises: [],
  exercisesById: new Map(),
  workouts: [],
  templates: [],
  bodyweight: [],
  profile: null,
  draft: null,
  rest: { endsAt: null, duration: 90 },

  hydrate: async () => {
    const [profile, exercises, workouts, templates, bodyweight] =
      await Promise.all([
        db.getProfile(),
        db.listExercises(),
        db.listWorkouts(),
        db.listTemplates(),
        db.listBodyweight(),
      ]);

    let savedDraft: Draft | null = null;
    try {
      const raw = localStorage.getItem("ironlog-draft");
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        savedDraft = isValidDraft(parsed) ? parsed : null;
      }
    } catch {}
    // A draft that failed validation (corrupt / wrong shape) would crash the app
    // on every launch — drop it so we recover instead of bricking.
    if (!savedDraft) {
      try { localStorage.removeItem("ironlog-draft"); } catch {}
    }

    set({
      profile,
      exercises,
      exercisesById: new Map(exercises.map((e) => [e.id, e])),
      workouts,
      templates,
      bodyweight,
      rest: { endsAt: null, duration: profile.default_rest_seconds },
      loaded: true,
      ...(savedDraft ? { draft: savedDraft } : {}),
    });
  },

  // Wipe all in-memory state and any persisted draft. Called on sign-out so the
  // next user never sees the previous user's data (or inherits their draft).
  reset: () => {
    try { localStorage.removeItem("ironlog-draft"); } catch {}
    set({
      loaded: false,
      exercises: [],
      exercisesById: new Map(),
      workouts: [],
      templates: [],
      bodyweight: [],
      profile: null,
      draft: null,
      rest: { endsAt: null, duration: 90 },
    });
  },

  refreshWorkouts: async () => set({ workouts: await db.listWorkouts() }),
  refreshTemplates: async () => set({ templates: await db.listTemplates() }),
  refreshBodyweight: async () => set({ bodyweight: await db.listBodyweight() }),
  refreshExercises: async () => {
    const exercises = await db.listExercises();
    set({ exercises, exercisesById: new Map(exercises.map((e) => [e.id, e])) });
  },

  startBlank: () =>
    set({ draft: { name: "Workout", startedAt: Date.now(), exercises: [] } }),

  // Group by *contiguous runs* of matching exercise_id (after sorting by
  // set_index), not by a Map keyed on exercise_id — the same exercise can
  // appear in separate, non-adjacent groups (e.g. supersets), and merging all
  // of its sets into one group would scramble the original order.
  startFromTemplate: (t) => {
    const defaultUnit = get().profile?.unit ?? "kg";
    const sorted = [...t.sets].sort((a, b) => a.set_index - b.set_index);
    const exercises: DraftExercise[] = [];
    for (const s of sorted) {
      const last = exercises[exercises.length - 1];
      const setEntry: DraftSetEntry = {
        weight: s.weight,
        reps: s.reps,
        done: false,
        isWarmup: false,
        rpe: null,
      };
      if (last && last.exerciseId === s.exercise_id) {
        last.sets.push(setEntry);
      } else {
        exercises.push({ exerciseId: s.exercise_id, unit: defaultUnit, notes: "", sets: [setEntry] });
      }
    }
    set({ draft: { name: t.name, startedAt: Date.now(), exercises } });
  },

  startFromWorkout: (w) => {
    const defaultUnit = get().profile?.unit ?? "kg";
    const sorted = [...w.sets].filter((s) => s.completed).sort((a, b) => a.set_index - b.set_index);
    const exercises: DraftExercise[] = [];
    for (const s of sorted) {
      const last = exercises[exercises.length - 1];
      const setEntry: DraftSetEntry = {
        weight: s.weight,
        reps: s.reps,
        done: false,
        isWarmup: s.is_warmup,
        rpe: null,
      };
      if (last && last.exerciseId === s.exercise_id) {
        last.sets.push(setEntry);
      } else {
        exercises.push({
          exerciseId: s.exercise_id,
          unit: s.unit ?? defaultUnit,
          notes: s.notes ?? "",
          sets: [setEntry],
        });
      }
    }
    set({ draft: { name: w.name, startedAt: Date.now(), exercises } });
  },

  startEdit: (w) => {
    const defaultUnit = get().profile?.unit ?? "kg";
    const sorted = [...w.sets].sort((a, b) => a.set_index - b.set_index);
    const exercises: DraftExercise[] = [];
    for (const s of sorted) {
      const last = exercises[exercises.length - 1];
      const setEntry: DraftSetEntry = {
        weight: s.weight,
        reps: s.reps,
        done: s.completed,
        isWarmup: s.is_warmup,
        rpe: normalizeRpe(s.rpe),
      };
      if (last && last.exerciseId === s.exercise_id) {
        last.sets.push(setEntry);
      } else {
        exercises.push({
          exerciseId: s.exercise_id,
          unit: s.unit ?? defaultUnit,
          notes: s.notes ?? "",
          sets: [setEntry],
        });
      }
    }
    set({ draft: { name: w.name, startedAt: Date.now(), workoutId: w.id, exercises } });
  },

  setDraftName: (name) => {
    const draft = get().draft;
    if (draft) set({ draft: { ...draft, name } });
  },

  addDraftExercise: (exerciseId) => {
    const draft = get().draft;
    if (!draft) return;
    const unit = get().profile?.unit ?? "kg";
    set({
      draft: {
        ...draft,
        exercises: [
          ...draft.exercises,
          { exerciseId, unit, notes: "", sets: [{ weight: 0, reps: 0, done: false, isWarmup: false, rpe: null }] },
        ],
      },
    });
  },

  setDraftExerciseNotes: (exIdx, notes) => {
    const draft = get().draft;
    if (!draft) return;
    set({
      draft: {
        ...draft,
        exercises: draft.exercises.map((ex, i) => (i === exIdx ? { ...ex, notes } : ex)),
      },
    });
  },

  toggleDraftExerciseUnit: (exIdx) => {
    const draft = get().draft;
    if (!draft) return;
    set({
      draft: {
        ...draft,
        exercises: draft.exercises.map((ex, i) =>
          i === exIdx ? { ...ex, unit: ex.unit === "kg" ? "lb" : "kg" } : ex,
        ),
      },
    });
  },

  replaceDraftExercise: (exIdx, exerciseId) => {
    const draft = get().draft;
    if (!draft) return;
    set({
      draft: {
        ...draft,
        exercises: draft.exercises.map((ex, i) =>
          i === exIdx ? { ...ex, exerciseId } : ex,
        ),
      },
    });
  },

  removeDraftExercise: (exIdx) => {
    const draft = get().draft;
    if (!draft) return;
    set({
      draft: {
        ...draft,
        exercises: draft.exercises.filter((_, i) => i !== exIdx),
      },
    });
  },

  insertDraftExercise: (exIdx, exercise) => {
    const draft = get().draft;
    if (!draft) return;
    const exercises = [...draft.exercises];
    exercises.splice(exIdx, 0, exercise);
    set({ draft: { ...draft, exercises } });
  },

  addDraftSet: (exIdx) => {
    const draft = get().draft;
    if (!draft) return;
    const exercises = draft.exercises.map((ex, i) => {
      if (i !== exIdx) return ex;
      const last = ex.sets[ex.sets.length - 1];
      return {
        ...ex,
        sets: [
          ...ex.sets,
          {
            weight: last?.weight ?? 0,
            reps: last?.reps ?? 0,
            done: false,
            isWarmup: false,
            rpe: null,
          },
        ],
      };
    });
    set({ draft: { ...draft, exercises } });
  },

  updateDraftSet: (exIdx, setIdx, patch) => {
    const draft = get().draft;
    if (!draft) return;
    const exercises = draft.exercises.map((ex, i) => {
      if (i !== exIdx) return ex;
      return {
        ...ex,
        sets: ex.sets.map((s, j) => (j === setIdx ? { ...s, ...patch } : s)),
      };
    });
    set({ draft: { ...draft, exercises } });
  },

  removeDraftSet: (exIdx, setIdx) => {
    const draft = get().draft;
    if (!draft) return;
    const exercises = draft.exercises.map((ex, i) => {
      if (i !== exIdx) return ex;
      return { ...ex, sets: ex.sets.filter((_, j) => j !== setIdx) };
    });
    set({ draft: { ...draft, exercises } });
  },

  insertDraftSet: (exerciseId, setIdx, setEntry) => {
    const draft = get().draft;
    if (!draft) return false;
    const exIdx = draft.exercises.findIndex((ex) => ex.exerciseId === exerciseId);
    if (exIdx === -1) return false;
    const exercises = draft.exercises.map((ex, i) => {
      if (i !== exIdx) return ex;
      const sets = [...ex.sets];
      sets.splice(Math.min(setIdx, sets.length), 0, setEntry);
      return { ...ex, sets };
    });
    set({ draft: { ...draft, exercises } });
    return true;
  },

  discardDraft: () => set({ draft: null, rest: { ...get().rest, endsAt: null } }),

  finishWorkout: async () => {
    const draft = get().draft;
    if (!draft) return;
    // set_index is a single running counter across the whole workout (not
    // per-exercise) so the same exercise can appear in multiple, separately
    // ordered groups (e.g. supersets) without their sets colliding on reload.
    const sets: db.DraftSet[] = draft.exercises
      .flatMap((ex) => {
        const note = ex.notes?.trim() || null;
        return ex.sets
          .filter((s) => s.done)
          .map((s) => ({
            exercise_id: ex.exerciseId,
            weight: s.weight,
            reps: s.reps,
            rpe: s.rpe ?? null,
            is_warmup: s.isWarmup,
            unit: ex.unit,
            notes: note,
          }));
      })
      .map((s, set_index) => ({ ...s, set_index }));
    if (draft.workoutId) {
      await db.updateWorkout(draft.workoutId, draft.name, sets);
    } else {
      await db.saveWorkout({
        name: draft.name,
        performed_at: new Date(draft.startedAt).toISOString(),
        duration_seconds: Math.round((Date.now() - draft.startedAt) / 1000),
        sets,
      });
    }
    set({ draft: null, rest: { ...get().rest, endsAt: null } });
    await get().refreshWorkouts();
  },

  startRest: (seconds) =>
    set({ rest: { endsAt: Date.now() + seconds * 1000, duration: seconds } }),
  // Nudge only the end time (min 5s remaining); the session default `duration`
  // is left untouched so the ±15s buttons don't reset future rest lengths.
  adjustRest: (deltaSeconds) => {
    const { rest } = get();
    if (rest.endsAt === null) return;
    const endsAt = Math.max(Date.now() + 5000, rest.endsAt + deltaSeconds * 1000);
    set({ rest: { ...rest, endsAt } });
  },
  stopRest: () => set({ rest: { ...get().rest, endsAt: null } }),

  muscleOf: (exerciseId) => get().exercisesById.get(exerciseId)?.muscle_group,
  exerciseById: (id) => get().exercisesById.get(id),
}));

// SetRow's RPE picker only offers "<5" (stored as 5) through 10. Older sets
// saved with 1-4 or half-steps (e.g. 7.5) match no option and would render as
// blank; snap them into the current scale on read so editing always shows a
// value (this doesn't touch the stored row unless the set is re-saved).
function normalizeRpe(rpe: number | null | undefined): number | null {
  if (rpe == null) return null;
  if (rpe < 5) return 5;
  return Math.min(10, Math.round(rpe));
}

// Guard a persisted value before adopting it as the active draft. A parseable
// but wrong-shaped value (truncated write, schema drift) would otherwise crash
// render on every launch. Edit drafts (workoutId) are never persisted, so a
// stored one is stale and rejected.
function isValidDraft(v: unknown): v is Draft {
  if (typeof v !== "object" || v === null) return false;
  const d = v as Record<string, unknown>;
  return (
    typeof d.name === "string" &&
    typeof d.startedAt === "number" &&
    Array.isArray(d.exercises) &&
    d.workoutId === undefined
  );
}

// Persist new-workout drafts across app close/reopen.
// Edit drafts (workoutId present) are never persisted — they are ephemeral.
if (typeof window !== "undefined") {
  useStore.subscribe((state, prev) => {
    if (state.draft === prev.draft) return;
    try {
      if (state.draft && !state.draft.workoutId) {
        localStorage.setItem("ironlog-draft", JSON.stringify(state.draft));
      } else {
        localStorage.removeItem("ironlog-draft");
      }
    } catch {}
  });
}
