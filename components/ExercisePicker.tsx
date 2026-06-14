"use client";

import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { createCustomExercise } from "@/lib/db";
import {
  MUSCLE_LABELS,
  MUSCLE_COLORS,
  PATTERN_LABELS,
} from "@/lib/muscles";
import {
  ALL_MUSCLE_GROUPS,
  type ExerciseType,
  type MovementPattern,
  type MuscleGroup,
} from "@/lib/types";
import { ExerciseIcon } from "./ExerciseIcon";

const PATTERNS: MovementPattern[] = [
  "squat", "hinge", "lunge", "horizontal_press", "vertical_press",
  "horizontal_pull", "vertical_pull", "curl", "triceps_extension", "core", "calf", "other",
];

// Track the visual viewport so the overlay shrinks above the on-screen
// keyboard instead of being overlaid by it (iOS keeps `fixed` full-height).
function useViewportHeight() {
  const [height, setHeight] = useState<number | null>(() =>
    typeof window !== "undefined" && window.visualViewport
      ? window.visualViewport.height
      : null,
  );
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => setHeight(vv.height);
    vv.addEventListener("resize", onResize);
    return () => vv.removeEventListener("resize", onResize);
  }, []);
  return height;
}

function SearchGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0 text-ink-faint">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <path d="M16.5 16.5 21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function ExercisePicker({
  onPick,
  onClose,
}: {
  onPick: (exerciseId: string) => void;
  onClose: () => void;
}) {
  const exercises = useStore((s) => s.exercises);
  const refreshExercises = useStore((s) => s.refreshExercises);
  const viewportHeight = useViewportHeight();
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);

  // new-exercise form state
  const [name, setName] = useState("");
  const [mg, setMg] = useState<MuscleGroup>("chest");
  const [pattern, setPattern] = useState<MovementPattern>("horizontal_press");
  const [exType, setExType] = useState<ExerciseType>("weight_reps");
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = term
      ? exercises.filter((e) => e.name.toLowerCase().includes(term))
      : exercises;
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
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
        exercise_type: exType,
        secondary_muscles: [],
      });
      await refreshExercises();
      onPick(created.id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-x-0 top-0 z-50 flex flex-col bg-night"
      style={{ height: viewportHeight != null ? `${viewportHeight}px` : "100dvh" }}
    >
      {/* Search header — fixed, non-scrolling */}
      <div className="flex shrink-0 items-center gap-3 px-[18px] pb-3 pt-safe">
        <div className="flex h-12 flex-1 items-center gap-[11px] rounded-2xl border-[1.5px] border-amber bg-surface px-4">
          <SearchGlyph />
          <input
            autoFocus
            value={q}
            onChange={(e) => { setQ(e.target.value); if (creating) setCreating(false); }}
            placeholder="Search exercises…"
            className="min-w-0 flex-1 bg-transparent text-[16px] text-ink outline-none placeholder:text-ink-faint"
          />
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="flex h-[30px] w-[30px] items-center justify-center text-ink-faint hover:text-ink"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {creating ? (
        <div className="flex flex-col gap-3 overflow-y-auto p-4">
          <h3 className="font-medium">New custom exercise</h3>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Exercise name"
            className="rounded-lg border border-line bg-surface px-3 py-2 outline-none focus:border-ember"
          />
          <label className="text-sm text-ink-soft">Muscle group</label>
          <select
            value={mg}
            onChange={(e) => setMg(e.target.value as MuscleGroup)}
            className="rounded-lg border border-line bg-surface px-3 py-2"
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
            className="rounded-lg border border-line bg-surface px-3 py-2"
          >
            {PATTERNS.map((p) => (
              <option key={p} value={p}>
                {PATTERN_LABELS[p]}
              </option>
            ))}
          </select>
          <label className="text-sm text-ink-soft">Tracks</label>
          <select
            value={exType}
            onChange={(e) => setExType(e.target.value as ExerciseType)}
            className="rounded-lg border border-line bg-surface px-3 py-2"
          >
            <option value="weight_reps">Weight × reps</option>
            <option value="duration">Time (e.g. planks)</option>
          </select>
          <div className="flex gap-2">
            <button
              onClick={create}
              disabled={busy}
              className="flex-1 rounded-lg bg-ember px-3 py-2 font-medium text-on-accent disabled:opacity-60"
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
          <ul className="flex-1 divide-y divide-line-2 overflow-y-auto">
            {filtered.map((e) => (
              <li key={e.id}>
                <button
                  onClick={() => onPick(e.id)}
                  className="flex w-full items-center gap-[15px] px-5 py-2.5 text-left hover:bg-surface-2"
                >
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center"
                    style={{ color: MUSCLE_COLORS[e.muscle_group] }}
                  >
                    <ExerciseIcon name={e.name} pattern={e.movement_pattern} size={40} sw={2.3} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className="block truncate text-[16.5px] font-semibold leading-tight text-ink"
                      style={{ letterSpacing: "-0.01em" }}
                    >
                      {e.name}
                    </span>
                    <span className="mt-0.5 block text-[13px] text-ink-faint">
                      <span className="font-semibold" style={{ color: MUSCLE_COLORS[e.muscle_group] }}>
                        {MUSCLE_LABELS[e.muscle_group]}
                      </span>{" "}
                      · {e.equipment}
                      {e.is_custom ? " · custom" : ""}
                    </span>
                  </span>
                </button>
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="p-5 text-sm text-ink-faint">No matches.</li>
            )}
          </ul>
          <div className="shrink-0 border-t border-line pb-safe pt-[18px] text-center">
            <button
              onClick={() => {
                setName(q);
                setCreating(true);
              }}
              className="pb-4 text-[16px] font-semibold text-ink-soft hover:text-ink"
            >
              <span className="mr-1.5 font-bold text-amber">+</span>Create custom exercise
            </button>
          </div>
        </>
      )}
    </div>
  );
}
