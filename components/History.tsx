"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { deleteWorkout } from "@/lib/db";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}
function fmtDuration(s: number | null) {
  if (!s) return null;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  return `${Math.floor(s / 3600)}h ${Math.round((s % 3600) / 60)}m`;
}

export function History({ onStart }: { onStart: () => void }) {
  const workouts = useStore((s) => s.workouts);
  const exercises = useStore((s) => s.exercises);
  const startEdit = useStore((s) => s.startEdit);
  const startFromWorkout = useStore((s) => s.startFromWorkout);
  const draft = useStore((s) => s.draft);

  const refreshWorkouts = useStore((s) => s.refreshWorkouts);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function removeWorkout(id: string, name: string) {
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
    setDeletingId(id);
    try {
      await deleteWorkout(id);
      await refreshWorkouts();
    } finally {
      setDeletingId(null);
    }
  }

  const allWorkouts = useMemo(() => {
    return [...workouts]
      .sort((a, b) => b.performed_at.localeCompare(a.performed_at))
      .map((w) => {
        const seen = new Set<string>();
        const exerciseNames: string[] = [];
        for (const s of w.sets) {
          if (!seen.has(s.exercise_id)) {
            seen.add(s.exercise_id);
            const ex = exercises.find((e) => e.id === s.exercise_id);
            if (ex) exerciseNames.push(ex.name);
          }
        }
        const workingSetCount = w.sets.filter((s) => !s.is_warmup && s.completed).length;
        return { ...w, exerciseNames, workingSetCount };
      });
  }, [workouts, exercises]);

  function editWorkout(w: (typeof allWorkouts)[number]) {
    if (draft && !window.confirm("Replace the workout in progress?")) return;
    startEdit(w);
    onStart();
  }

  function repeatWorkout(w: (typeof allWorkouts)[number]) {
    if (draft && !window.confirm("Replace the workout in progress?")) return;
    startFromWorkout(w);
    onStart();
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-sm font-medium text-ink-soft">
        Workout history{allWorkouts.length > 0 && ` (${allWorkouts.length})`}
      </h2>
      {allWorkouts.length === 0 ? (
        <p className="rounded-xl border border-line bg-surface/70 p-6 text-center text-sm text-ink-faint">
          No workouts logged yet.
        </p>
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
                    <button
                      onClick={() => removeWorkout(w.id, w.name)}
                      disabled={deletingId === w.id}
                      className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink-faint hover:text-ember-soft disabled:opacity-40"
                      title="Delete workout"
                    >
                      {deletingId === w.id ? "…" : "✕"}
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
