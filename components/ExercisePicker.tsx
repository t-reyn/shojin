"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { createCustomExercise } from "@/lib/db";
import {
  MUSCLE_LABELS,
  MUSCLE_COLORS,
  PATTERN_LABELS,
} from "@/lib/muscles";
import { ALL_MUSCLE_GROUPS, type MovementPattern, type MuscleGroup } from "@/lib/types";
import { ExerciseFigure } from "./ExerciseFigure";

const PATTERNS: MovementPattern[] = [
  "squat", "hinge", "lunge", "horizontal_press", "vertical_press",
  "horizontal_pull", "vertical_pull", "curl", "triceps_extension", "core", "calf", "other",
];

export function ExercisePicker({
  onPick,
  onClose,
}: {
  onPick: (exerciseId: string) => void;
  onClose: () => void;
}) {
  const exercises = useStore((s) => s.exercises);
  const refreshExercises = useStore((s) => s.refreshExercises);
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);

  // new-exercise form state
  const [name, setName] = useState("");
  const [mg, setMg] = useState<MuscleGroup>("chest");
  const [pattern, setPattern] = useState<MovementPattern>("horizontal_press");
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return exercises;
    return exercises.filter((e) => e.name.toLowerCase().includes(term));
  }, [exercises, q]);

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const created = await createCustomExercise({
        name: name.trim(),
        muscle_group: mg,
        movement_pattern: pattern,
        equipment: "other",
      });
      await refreshExercises();
      onPick(created.id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-surface">
      {/* Search bar — always visible at top */}
      <div className="flex items-center gap-2 border-b border-line p-3 pt-safe">
        <input
          autoFocus
          value={q}
          onChange={(e) => { setQ(e.target.value); if (creating) setCreating(false); }}
          placeholder="Search exercises…"
          className="flex-1 rounded-lg border border-line bg-night px-3 py-2 text-ink outline-none focus:border-ember"
        />
        <button onClick={onClose} className="px-2 text-ink-faint hover:text-ink">
          ✕
        </button>
      </div>

      {creating ? (
        <div className="flex flex-col gap-3 overflow-y-auto p-4">
          <h3 className="font-medium">New custom exercise</h3>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Exercise name"
            className="rounded-lg border border-line bg-night px-3 py-2 outline-none focus:border-ember"
          />
          <label className="text-sm text-ink-soft">Muscle group</label>
          <select
            value={mg}
            onChange={(e) => setMg(e.target.value as MuscleGroup)}
            className="rounded-lg border border-line bg-night px-3 py-2"
          >
            {ALL_MUSCLE_GROUPS.map((g) => (
              <option key={g} value={g}>
                {MUSCLE_LABELS[g]}
              </option>
            ))}
          </select>
          <label className="text-sm text-ink-soft">Movement pattern</label>
          <select
            value={pattern}
            onChange={(e) => setPattern(e.target.value as MovementPattern)}
            className="rounded-lg border border-line bg-night px-3 py-2"
          >
            {PATTERNS.map((p) => (
              <option key={p} value={p}>
                {PATTERN_LABELS[p]}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <button
              onClick={create}
              disabled={busy}
              className="flex-1 rounded-lg bg-ember px-3 py-2 font-medium text-night disabled:opacity-60"
            >
              Add & use
            </button>
            <button
              onClick={() => setCreating(false)}
              className="rounded-lg border border-line px-3 py-2 text-ink-soft"
            >
              Back
            </button>
          </div>
        </div>
      ) : (
        <>
          <ul className="flex-1 overflow-y-auto p-2">
            {filtered.map((e) => (
              <li key={e.id}>
                <button
                  onClick={() => onPick(e.id)}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-surface-2"
                >
                  <span style={{ color: MUSCLE_COLORS[e.muscle_group] }}>
                    <ExerciseFigure pattern={e.movement_pattern} size={32} />
                  </span>
                  <span className="flex-1">
                    <span className="block text-ink">{e.name}</span>
                    <span className="block text-xs text-ink-faint">
                      {MUSCLE_LABELS[e.muscle_group]} · {e.equipment}
                      {e.is_custom ? " · custom" : ""}
                    </span>
                  </span>
                </button>
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="p-3 text-sm text-ink-faint">No matches.</li>
            )}
          </ul>
          <div className="border-t border-line p-3 pb-safe">
            <button
              onClick={() => {
                setName(q);
                setCreating(true);
              }}
              className="w-full rounded-lg border border-line py-2 text-sm text-ink-soft hover:text-ink"
            >
              + Create custom exercise
            </button>
          </div>
        </>
      )}
    </div>
  );
}
