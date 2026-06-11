"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { updateTemplate, type TemplateWithSets } from "@/lib/db";
import { toast } from "@/lib/toast";
import { MUSCLE_COLORS } from "@/lib/muscles";
import { ExerciseIcon } from "./ExerciseIcon";
import { ExercisePicker } from "./ExercisePicker";

interface EditSet { weight: number; reps: number; }
interface EditEx { exerciseId: string; sets: EditSet[]; }

// Group by *contiguous runs* of matching exercise_id (after sorting by
// set_index), not by exercise_id alone — the same exercise can appear in
// separate, non-adjacent groups (e.g. supersets).
function buildExercises(t: TemplateWithSets): EditEx[] {
  const sorted = [...t.sets].sort((a, b) => a.set_index - b.set_index);
  const exercises: EditEx[] = [];
  for (const s of sorted) {
    const last = exercises[exercises.length - 1];
    const setEntry: EditSet = { weight: s.weight, reps: s.reps };
    if (last && last.exerciseId === s.exercise_id) {
      last.sets.push(setEntry);
    } else {
      exercises.push({ exerciseId: s.exercise_id, sets: [setEntry] });
    }
  }
  return exercises;
}

export function TemplateEditor({
  template,
  onSave,
  onClose,
}: {
  template: TemplateWithSets;
  onSave: () => void;
  onClose: () => void;
}) {
  const exerciseById = useStore((s) => s.exerciseById);

  const [name, setName] = useState(template.name);
  const [exs, setExs] = useState<EditEx[]>(() => buildExercises(template));
  const [picking, setPicking] = useState(false);
  const [swappingIdx, setSwappingIdx] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  function addSet(exIdx: number) {
    setExs((prev) =>
      prev.map((ex, i) => {
        if (i !== exIdx) return ex;
        const last = ex.sets[ex.sets.length - 1];
        return { ...ex, sets: [...ex.sets, { weight: last?.weight ?? 0, reps: last?.reps ?? 0 }] };
      }),
    );
  }

  function removeSet(exIdx: number, setIdx: number) {
    setExs((prev) =>
      prev.map((ex, i) => {
        if (i !== exIdx) return ex;
        const sets = ex.sets.filter((_, j) => j !== setIdx);
        return { ...ex, sets: sets.length ? sets : ex.sets };
      }),
    );
  }

  function updateSet(exIdx: number, setIdx: number, patch: Partial<EditSet>) {
    setExs((prev) =>
      prev.map((ex, i) => {
        if (i !== exIdx) return ex;
        return { ...ex, sets: ex.sets.map((s, j) => (j === setIdx ? { ...s, ...patch } : s)) };
      }),
    );
  }

  function removeEx(exIdx: number) {
    setExs((prev) => prev.filter((_, i) => i !== exIdx));
  }

  function swapEx(exIdx: number, exerciseId: string) {
    setExs((prev) => prev.map((ex, i) => (i === exIdx ? { ...ex, exerciseId } : ex)));
    setSwappingIdx(null);
  }

  async function save() {
    if (!name.trim() || exs.length === 0) return;
    setSaving(true);
    try {
      const sets = exs
        .flatMap(({ exerciseId, sets }) =>
          sets.map((s) => ({ exercise_id: exerciseId, weight: s.weight, reps: s.reps })),
        )
        .map((s, set_index) => ({ ...s, set_index }));
      await updateTemplate(template.id, name.trim(), sets);
      onSave();
    } catch {
      toast.error("Couldn't save template. Try again.");
    } finally {
      setSaving(false);
    }
  }

  const unit = useStore((s) => s.profile?.unit ?? "kg");

  return (
    <>
      <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 p-3 sm:items-center">
        <div className="flex max-h-[90vh] w-full max-w-md flex-col rounded-xl border border-line bg-surface shadow-2xl">
          <div className="flex items-center justify-between border-b border-line p-4">
            <h2 className="font-semibold">Edit template</h2>
            <button onClick={onClose} className="text-ink-faint hover:text-ink">✕</button>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mb-4 w-full rounded-lg border border-line bg-night px-3 py-2 text-ink outline-none focus:border-ember"
              placeholder="Template name"
            />

            {exs.map((ex, exIdx) => {
              const meta = exerciseById(ex.exerciseId);
              return (
                <div key={`${ex.exerciseId}-${exIdx}`} className="mb-3 rounded-xl border border-line bg-night/60 p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <span style={{ color: MUSCLE_COLORS[meta?.muscle_group ?? "core"] }}>
                      <ExerciseIcon name={meta?.name} pattern={meta?.movement_pattern ?? "other"} size={28} />
                    </span>
                    <button
                      onClick={() => setSwappingIdx(exIdx)}
                      className="flex-1 text-left text-sm font-medium text-ink hover:text-ember"
                    >
                      {meta?.name ?? "Exercise"}
                    </button>
                    <button
                      onClick={() => removeEx(exIdx)}
                      className="text-ink-faint hover:text-ember-soft"
                    >
                      ✕
                    </button>
                  </div>

                  {ex.sets.map((s, setIdx) => (
                    <div key={setIdx} className="flex items-center gap-2 py-1">
                      <span className="w-5 text-center text-xs text-ink-faint">{setIdx + 1}</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        value={s.weight || ""}
                        onChange={(e) => updateSet(exIdx, setIdx, { weight: parseFloat(e.target.value) || 0 })}
                        placeholder="0"
                        className="w-16 rounded-md border border-line bg-surface px-2 py-1 text-right text-sm text-ink outline-none focus:border-ember"
                      />
                      <span className="text-xs text-ink-faint">{unit}</span>
                      <span className="text-ink-faint">×</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={s.reps || ""}
                        onChange={(e) => updateSet(exIdx, setIdx, { reps: parseInt(e.target.value) || 0 })}
                        placeholder="0"
                        className="w-14 rounded-md border border-line bg-surface px-2 py-1 text-right text-sm text-ink outline-none focus:border-ember"
                      />
                      <span className="text-xs text-ink-faint">reps</span>
                      <button
                        onClick={() => removeSet(exIdx, setIdx)}
                        className="ml-auto text-ink-faint hover:text-ember-soft"
                        title="Remove set"
                      >
                        ✕
                      </button>
                    </div>
                  ))}

                  <button
                    onClick={() => addSet(exIdx)}
                    className="mt-1.5 w-full rounded-lg border border-dashed border-line py-1 text-xs text-ink-faint hover:text-ink-soft"
                  >
                    + Add set
                  </button>
                </div>
              );
            })}

            <button
              onClick={() => setPicking(true)}
              className="w-full rounded-lg border border-dashed border-line py-2 text-sm text-ink-soft hover:text-ink"
            >
              + Add exercise
            </button>
          </div>

          <div className="border-t border-line p-4">
            <button
              onClick={save}
              disabled={saving || exs.length === 0 || !name.trim()}
              className="w-full rounded-lg bg-ember py-2.5 font-medium text-on-accent hover:bg-ember-soft disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      </div>

      {picking && (
        <ExercisePicker
          onPick={(id) => {
            setExs((prev) => [...prev, { exerciseId: id, sets: [{ weight: 0, reps: 0 }, { weight: 0, reps: 0 }, { weight: 0, reps: 0 }] }]);
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      )}

      {swappingIdx !== null && (
        <ExercisePicker
          onPick={(id) => swapEx(swappingIdx, id)}
          onClose={() => setSwappingIdx(null)}
        />
      )}
    </>
  );
}
