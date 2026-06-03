"use client";

import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { confirmDialog } from "@/lib/dialog";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}
function fmtDuration(s: number | null) {
  if (!s) return null;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  return `${Math.floor(s / 3600)}h ${Math.round((s % 3600) / 60)}m`;
}

export function History({ onStart, onNew }: { onStart: () => void; onNew: () => void }) {
  const workouts = useStore((s) => s.workouts);
  const exercises = useStore((s) => s.exercises);
  const startEdit = useStore((s) => s.startEdit);
  const startFromWorkout = useStore((s) => s.startFromWorkout);
  const draft = useStore((s) => s.draft);

  const allWorkouts = useMemo(() => {
    const exMap = new Map(exercises.map((e) => [e.id, e]));
    return [...workouts]
      .sort((a, b) => b.performed_at.localeCompare(a.performed_at))
      .map((w) => {
        const seen = new Set<string>();
        const exerciseNames: string[] = [];
        for (const s of w.sets) {
          if (!seen.has(s.exercise_id)) {
            seen.add(s.exercise_id);
            const ex = exMap.get(s.exercise_id);
            if (ex) exerciseNames.push(ex.name);
          }
        }
        const workingSetCount = w.sets.filter((s) => !s.is_warmup && s.completed).length;
        return { ...w, exerciseNames, workingSetCount };
      });
  }, [workouts, exercises]);

  async function withReplaceGuard(action: () => void) {
    if (draft) {
      const ok = await confirmDialog({
        title: "Replace workout in progress?",
        message: "You have an unfinished workout. Starting this one will discard it.",
        confirmLabel: "Replace",
        cancelLabel: "Keep current",
        danger: true,
      });
      if (!ok) return;
    }
    action();
    onStart();
  }

  function editWorkout(w: (typeof allWorkouts)[number]) {
    withReplaceGuard(() => startEdit(w));
  }

  function repeatWorkout(w: (typeof allWorkouts)[number]) {
    withReplaceGuard(() => startFromWorkout(w));
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-sm font-medium text-ink-soft">
        Workout history{allWorkouts.length > 0 && ` (${allWorkouts.length})`}
      </h2>
      {allWorkouts.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-line bg-surface/70 p-8 text-center">
          <p className="text-sm text-ink-soft">No workouts logged yet.</p>
          <button
            onClick={onNew}
            className="rounded-lg bg-ember px-4 py-2.5 text-sm font-semibold text-night hover:bg-ember-soft"
          >
            Start a workout
          </button>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {allWorkouts.map((w) => {
            const dur = fmtDuration(w.duration_seconds);
            return (
              <li key={w.id} className="rounded-xl border border-line bg-surface/70 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="font-medium text-ink">{w.name}</span>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-soft">
                      <span>{fmtDate(w.performed_at)}</span>
                      <span className="text-ink-faint">·</span>
                      <span>{w.workingSetCount} sets</span>
                      {dur && (
                        <>
                          <span className="text-ink-faint">·</span>
                          <span>{dur}</span>
                        </>
                      )}
                    </div>
                    {w.exerciseNames.length > 0 && (
                      <p className="mt-1.5 truncate text-xs text-ink-faint">
                        {w.exerciseNames.join(" · ")}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <button
                      onClick={() => editWorkout(w)}
                      className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink-soft hover:text-ink"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => repeatWorkout(w)}
                      className="rounded-lg bg-ember px-3 py-1.5 text-sm font-medium text-night hover:bg-ember-soft"
                    >
                      Repeat
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
