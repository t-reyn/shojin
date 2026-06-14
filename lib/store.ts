import { create } from "zustand";
import { setTypeOf } from "./types";
import type {
  BodyweightEntry,
  Exercise,
  MuscleGroup,
  Profile,
  Readiness,
  SetType,
  WorkoutWithSets,
} from "./types";
import * as db from "./db";
import type { TemplateWithSets } from "./db";

export interface DraftSetEntry {
  weight: number;
  reps: number;
  seconds: number; // duration-type exercises log time instead of reps
  done: boolean;
  setType: SetType;
  rpe: number | null;
}

export interface DraftExercise {
  exerciseId: string;
  unit: "kg" | "lb";
  sets: DraftSetEntry[];
  notes: string;
  restSeconds: number | null; // per-exercise rest override (from templates)
  linkedWithPrev: boolean; // superset link with the exercise above
}

export interface Draft {
  name: string;
  startedAt: number;
  exercises: DraftExercise[];
  notes: string; // workout comment, saved to workouts.notes
  readiness: Readiness;
  workoutId?: string; // present when editing an existing saved workout
}

const EMPTY_READINESS: Readiness = { sleep: null, energy: null, soreness: null };

/** Backfill fields on drafts saved to localStorage before they existed. */
function normalizeDraft(d: Draft): Draft {
  return {
    ...d,
    notes: d.notes ?? "",
    readiness: d.readiness ?? EMPTY_READINESS,
    exercises: (d.exercises ?? []).map((ex) => ({
      ...ex,
      notes: ex.notes ?? "",
      restSeconds: ex.restSeconds ?? null,
      linkedWithPrev: ex.linkedWithPrev ?? false,
      sets: (ex.sets ?? []).map((s) => ({
        ...s,
        seconds: s.seconds ?? 0,
        setType:
          s.setType ??
          ((s as unknown as { isWarmup?: boolean }).isWarmup ? "warmup" : "normal"),
      })),
    })),
  };
}

interface RestState {
  endsAt: number | null;
  duration: number;
}

interface StoreState {
  // server data
  loaded: boolean;
  exercises: Exercise[];
  workouts: WorkoutWithSets[];
  templates: TemplateWithSets[];
  bodyweight: BodyweightEntry[];
  exerciseNotes: Record<string, string>; // pinned per-exercise notes by exercise_id
  profile: Profile | null;

  // active logging session
  draft: Draft | null;

  // rest timer (lives here so it survives tab switches)
  rest: RestState;

  hydrate: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  refreshWorkouts: () => Promise<void>;
  refreshTemplates: () => Promise<void>;
  refreshBodyweight: () => Promise<void>;
  refreshExercises: () => Promise<void>;

  // pinned exercise notes
  setPinnedNote: (exerciseId: string, note: string) => Promise<void>;

  // draft actions
  startBlank: () => void;
  startFromTemplate: (t: TemplateWithSets) => void;
  startFromWorkout: (w: WorkoutWithSets) => void;
  startEdit: (w: WorkoutWithSets) => void;
  setDraftName: (name: string) => void;
  setDraftNotes: (notes: string) => void;
  setDraftReadiness: (patch: Partial<Readiness>) => void;
  addDraftExercise: (exerciseId: string) => void;
  replaceDraftExercise: (exIdx: number, exerciseId: string) => void;
  toggleDraftExerciseUnit: (exIdx: number) => void;
  toggleDraftExerciseLink: (exIdx: number) => void;
  setDraftExerciseNotes: (exIdx: number, notes: string) => void;
  removeDraftExercise: (exIdx: number) => void;
  insertDraftExercise: (exIdx: number, exercise: DraftExercise) => void;
  addDraftSet: (exIdx: number) => void;
  updateDraftSet: (exIdx: number, setIdx: number, patch: Partial<DraftSetEntry>) => void;
  removeDraftSet: (exIdx: number, setIdx: number) => void;
  insertDraftSet: (exIdx: number, setIdx: number, set: DraftSetEntry) => void;
  discardDraft: () => void;
  finishWorkout: () => Promise<void>;

  // timer
  startRest: (seconds: number) => void;
  stopRest: () => void;

  // helpers
  muscleOf: (exerciseId: string) => MuscleGroup | undefined;
  exerciseById: (id: string) => Exercise | undefined;
}

/** Group sets of a saved workout into ordered draft exercises, preserving
 *  unit/notes/superset links. `repeat` resets done/rpe for a fresh session. */
function draftExercisesFromWorkout(
  w: WorkoutWithSets,
  defaultUnit: "kg" | "lb",
  mode: "repeat" | "edit",
): DraftExercise[] {
  const sets = [...w.sets]
    .filter((s) => mode === "edit" || s.completed)
    .sort((a, b) => a.set_index - b.set_index);
  const byExercise = new Map<
    string,
    { unit: "kg" | "lb"; notes: string; group: number | null; sets: DraftSetEntry[] }
  >();
  const order: string[] = [];
  for (const s of sets) {
    if (!byExercise.has(s.exercise_id)) {
      byExercise.set(s.exercise_id, {
        unit: s.unit ?? defaultUnit,
        notes: s.notes ?? "",
        group: s.superset_group ?? null,
        sets: [],
      });
      order.push(s.exercise_id);
    }
    byExercise.get(s.exercise_id)!.sets.push({
      weight: s.weight,
      reps: s.reps,
      seconds: s.duration_seconds ?? 0,
      done: mode === "edit" ? s.completed : false,
      setType: setTypeOf(s),
      rpe: mode === "edit" ? (s.rpe ?? null) : null,
    });
  }
  return order.map((exerciseId, i) => {
    const e = byExercise.get(exerciseId)!;
    const prev = i > 0 ? byExercise.get(order[i - 1])! : null;
    return {
      exerciseId,
      unit: e.unit,
      sets: e.sets,
      notes: e.notes,
      restSeconds: null,
      linkedWithPrev: e.group !== null && prev?.group === e.group,
    };
  });
}

export const useStore = create<StoreState>((set, get) => ({
  loaded: false,
  exercises: [],
  workouts: [],
  templates: [],
  bodyweight: [],
  exerciseNotes: {},
  profile: null,
  draft: null,
  rest: { endsAt: null, duration: 90 },

  hydrate: async () => {
    const [profile, exercises, workouts, templates, bodyweight, exerciseNotes] =
      await Promise.all([
        db.getProfile(),
        db.listExercises(),
        db.listWorkouts(),
        db.listTemplates(),
        db.listBodyweight(),
        db.listExerciseNotes(),
      ]);

    let savedDraft: Draft | null = null;
    try {
      const raw = localStorage.getItem("ironlog-draft");
      if (raw) savedDraft = normalizeDraft(JSON.parse(raw) as Draft);
    } catch {}

    set({
      profile,
      exercises,
      workouts,
      templates,
      bodyweight,
      exerciseNotes,
      rest: { endsAt: null, duration: profile.default_rest_seconds },
      loaded: true,
      ...(savedDraft ? { draft: savedDraft } : {}),
    });
  },

  refreshProfile: async () => set({ profile: await db.getProfile() }),
  refreshWorkouts: async () => set({ workouts: await db.listWorkouts() }),
  refreshTemplates: async () => set({ templates: await db.listTemplates() }),
  refreshBodyweight: async () => set({ bodyweight: await db.listBodyweight() }),
  refreshExercises: async () => set({ exercises: await db.listExercises() }),

  setPinnedNote: async (exerciseId, note) => {
    await db.upsertExerciseNote(exerciseId, note);
    set((s) => {
      const next = { ...s.exerciseNotes };
      const trimmed = note.trim();
      if (trimmed) next[exerciseId] = trimmed;
      else delete next[exerciseId];
      return { exerciseNotes: next };
    });
  },

  startBlank: () =>
    set({
      draft: {
        name: "Workout",
        startedAt: Date.now(),
        exercises: [],
        notes: "",
        readiness: EMPTY_READINESS,
      },
    }),

  startFromTemplate: (t) => {
    const defaultUnit = get().profile?.unit ?? "kg";
    const byExercise = new Map<string, { rest: number | null; sets: DraftSetEntry[] }>();
    const order: string[] = [];
    for (const s of [...t.sets].sort((a, b) => a.set_index - b.set_index)) {
      if (!byExercise.has(s.exercise_id)) {
        byExercise.set(s.exercise_id, { rest: s.rest_seconds ?? null, sets: [] });
        order.push(s.exercise_id);
      }
      byExercise.get(s.exercise_id)!.sets.push({
        weight: s.weight,
        reps: s.reps,
        seconds: 0,
        done: false,
        setType: "normal",
        rpe: null,
      });
    }
    set({
      draft: {
        name: t.name,
        startedAt: Date.now(),
        notes: "",
        readiness: EMPTY_READINESS,
        exercises: order.map((exerciseId) => ({
          exerciseId,
          unit: defaultUnit,
          sets: byExercise.get(exerciseId)!.sets,
          notes: "",
          restSeconds: byExercise.get(exerciseId)!.rest,
          linkedWithPrev: false,
        })),
      },
    });
  },

  startFromWorkout: (w) => {
    const defaultUnit = get().profile?.unit ?? "kg";
    set({
      draft: {
        name: w.name,
        startedAt: Date.now(),
        notes: "",
        readiness: EMPTY_READINESS,
        exercises: draftExercisesFromWorkout(w, defaultUnit, "repeat"),
      },
    });
  },

  startEdit: (w) => {
    const defaultUnit = get().profile?.unit ?? "kg";
    set({
      draft: {
        name: w.name,
        startedAt: Date.now(),
        workoutId: w.id,
        notes: w.notes ?? "",
        readiness: {
          sleep: w.readiness_sleep ?? null,
          energy: w.readiness_energy ?? null,
          soreness: w.readiness_soreness ?? null,
        },
        exercises: draftExercisesFromWorkout(w, defaultUnit, "edit"),
      },
    });
  },

  setDraftName: (name) => {
    const draft = get().draft;
    if (draft) set({ draft: { ...draft, name } });
  },

  setDraftNotes: (notes) => {
    const draft = get().draft;
    if (draft) set({ draft: { ...draft, notes } });
  },

  setDraftReadiness: (patch) => {
    const draft = get().draft;
    if (draft) set({ draft: { ...draft, readiness: { ...draft.readiness, ...patch } } });
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
          {
            exerciseId,
            unit,
            notes: "",
            restSeconds: null,
            linkedWithPrev: false,
            sets: [{ weight: 0, reps: 0, seconds: 0, done: false, setType: "normal", rpe: null }],
          },
        ],
      },
    });
  },

  toggleDraftExerciseLink: (exIdx) => {
    const draft = get().draft;
    if (!draft || exIdx === 0) return;
    set({
      draft: {
        ...draft,
        exercises: draft.exercises.map((ex, i) =>
          i === exIdx ? { ...ex, linkedWithPrev: !ex.linkedWithPrev } : ex,
        ),
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
            seconds: last?.seconds ?? 0,
            done: false,
            setType: "normal" as SetType,
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

  insertDraftSet: (exIdx, setIdx, setEntry) => {
    const draft = get().draft;
    if (!draft) return;
    const exercises = draft.exercises.map((ex, i) => {
      if (i !== exIdx) return ex;
      const sets = [...ex.sets];
      sets.splice(setIdx, 0, setEntry);
      return { ...ex, sets };
    });
    set({ draft: { ...draft, exercises } });
  },

  discardDraft: () => set({ draft: null, rest: { ...get().rest, endsAt: null } }),

  finishWorkout: async () => {
    const draft = get().draft;
    if (!draft) return;
    // Adjacent exercises linked via linkedWithPrev share a superset group;
    // groups with a single member persist as null (not a superset).
    let groupCounter = 0;
    const groupOf = draft.exercises.map((ex, i) => {
      if (i === 0 || !ex.linkedWithPrev) groupCounter += 1;
      return groupCounter;
    });
    const groupSizes = new Map<number, number>();
    for (const g of groupOf) groupSizes.set(g, (groupSizes.get(g) ?? 0) + 1);

    const sets: db.DraftSet[] = [];
    draft.exercises.forEach((ex, exIdx) => {
      const note = ex.notes?.trim() || null;
      const group = (groupSizes.get(groupOf[exIdx]) ?? 0) > 1 ? groupOf[exIdx] : null;
      ex.sets.forEach((s, idx) => {
        if (!s.done) return;
        sets.push({
          exercise_id: ex.exerciseId,
          set_index: idx,
          weight: s.weight,
          reps: s.reps,
          rpe: s.rpe ?? null,
          set_type: s.setType,
          unit: ex.unit,
          notes: note,
          duration_seconds: s.seconds > 0 ? s.seconds : null,
          superset_group: group,
        });
      });
    });
    const workoutNotes = draft.notes.trim() || null;
    if (draft.workoutId) {
      await db.updateWorkout(draft.workoutId, draft.name, sets, workoutNotes);
    } else {
      await db.saveWorkout({
        name: draft.name,
        performed_at: new Date(draft.startedAt).toISOString(),
        duration_seconds: Math.round((Date.now() - draft.startedAt) / 1000),
        notes: workoutNotes,
        readiness: draft.readiness,
        sets,
      });
    }
    set({ draft: null, rest: { ...get().rest, endsAt: null } });
    await get().refreshWorkouts();
  },

  startRest: (seconds) =>
    set({ rest: { endsAt: Date.now() + seconds * 1000, duration: seconds } }),
  stopRest: () => set({ rest: { ...get().rest, endsAt: null } }),

  muscleOf: (exerciseId) =>
    get().exercises.find((e) => e.id === exerciseId)?.muscle_group,
  exerciseById: (id) => get().exercises.find((e) => e.id === id),
}));

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
