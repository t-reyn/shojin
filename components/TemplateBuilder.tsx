"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { saveTemplate } from "@/lib/db";
import { toast } from "@/lib/toast";
import { MUSCLE_COLORS } from "@/lib/muscles";
import { ExerciseFigure } from "./ExerciseFigure";
import { ExercisePicker } from "./ExercisePicker";

export function TemplateBuilder({
  onClose,
  onSaved,
  className = "z-50",
}: {
  onClose: () => void;
  onSaved?: () => void;
  className?: string;
}) {
  const exerciseById = useStore((s) => s.exerciseById);
  const refreshTemplates = useStore((s) => s.refreshTemplates);

  const [tplName, setTplName] = useState("New Template");
  const [tplExs, setTplExs] = useState<string[]>([]);
  const [pickingForTpl, setPickingForTpl] = useState(false);
  const [savingTpl, setSavingTpl] = useState(false);

  async function saveNewTemplate() {
    if (!tplName.trim() || tplExs.length === 0) return;
    setSavingTpl(true);
    try {
      const sets = tplExs.flatMap((exercise_id) =>
        [0, 1, 2].map((set_index) => ({ exercise_id, set_index, weight: 0, reps: 0 })),
      );
      const name = tplName.trim();
      await saveTemplate({ name, sets });
      await refreshTemplates();
      toast.success(`Created template “${name}”.`);
      onSaved?.();
      onClose();
    } catch {
      toast.error("Couldn't save template.");
    } finally {
      setSavingTpl(false);
    }
  }

  return (
    <>
      <div
        className={`fixed inset-0 flex items-end justify-center bg-black/60 p-3 sm:items-center ${className}`}
      >
        <div className="flex max-h-[85vh] w-full max-w-md flex-col rounded-xl border border-line bg-surface shadow-2xl">
          <div className="flex items-center justify-between border-b border-line p-4">
            <h2 className="font-semibold">New template</h2>
            <button onClick={onClose} aria-label="Close" className="text-ink-faint hover:text-ink">
              ✕
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <input
              value={tplName}
              onChange={(e) => setTplName(e.target.value)}
              className="mb-4 w-full rounded-lg border border-line bg-night px-3 py-2 text-ink outline-none focus:border-ember"
              placeholder="Template name"
            />
            {tplExs.length > 0 && (
              <ul className="mb-3 flex flex-col gap-1.5">
                {tplExs.map((id, i) => {
                  const ex = exerciseById(id);
                  return (
                    <li
                      key={`${id}-${i}`}
                      className="flex items-center gap-2 rounded-lg border border-line bg-night px-3 py-2"
                    >
                      <span style={{ color: MUSCLE_COLORS[ex?.muscle_group ?? "core"] }}>
                        <ExerciseFigure pattern={ex?.movement_pattern ?? "other"} size={24} />
                      </span>
                      <span className="flex-1 text-sm text-ink">{ex?.name ?? "?"}</span>
                      <button
                        onClick={() => setTplExs((prev) => prev.filter((_, j) => j !== i))}
                        aria-label={`Remove ${ex?.name ?? "exercise"}`}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-faint hover:text-danger-soft"
                      >
                        ✕
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <button
              onClick={() => setPickingForTpl(true)}
              className="w-full rounded-lg border border-dashed border-line py-2 text-sm text-ink-soft hover:text-ink"
            >
              + Add exercise
            </button>
          </div>
          <div className="border-t border-line p-4">
            <button
              onClick={saveNewTemplate}
              disabled={savingTpl || tplExs.length === 0 || !tplName.trim()}
              className="w-full rounded-lg bg-ember py-2.5 font-medium text-night hover:bg-ember-soft disabled:opacity-50"
            >
              {savingTpl ? "Saving…" : "Save template"}
            </button>
          </div>
        </div>
      </div>

      {pickingForTpl && (
        <ExercisePicker
          onPick={(id) => {
            setTplExs((prev) => [...prev, id]);
            setPickingForTpl(false);
          }}
          onClose={() => setPickingForTpl(false)}
        />
      )}
    </>
  );
}
