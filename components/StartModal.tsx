"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { deleteTemplate, type TemplateWithSets } from "@/lib/db";
import { confirmDialog } from "@/lib/dialog";
import { toast } from "@/lib/toast";
import { MUSCLE_COLORS } from "@/lib/muscles";
import { ExerciseFigure } from "./ExerciseFigure";
import { TemplateBuilder } from "./TemplateBuilder";
import { TemplateEditor } from "./TemplateEditor";

type View = "home" | "repeat" | "template";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

export function StartModal({ onClose, onStart }: { onClose: () => void; onStart: () => void }) {
  const [view, setView] = useState<View>("home");
  const [editingTpl, setEditingTpl] = useState<TemplateWithSets | null>(null);
  const [building, setBuilding] = useState(false);
  const [busyTpl, setBusyTpl] = useState<string | null>(null);

  const workouts = useStore((s) => s.workouts);
  const exercises = useStore((s) => s.exercises);
  const templates = useStore((s) => s.templates);
  const startBlank = useStore((s) => s.startBlank);
  const startFromWorkout = useStore((s) => s.startFromWorkout);
  const startFromTemplate = useStore((s) => s.startFromTemplate);
  const exerciseById = useStore((s) => s.exerciseById);
  const refreshTemplates = useStore((s) => s.refreshTemplates);
  const draft = useStore((s) => s.draft);

  const recentWorkouts = useMemo(() => {
    const exMap = new Map(exercises.map((e) => [e.id, e]));
    return [...workouts]
      .sort((a, b) => b.performed_at.localeCompare(a.performed_at))
      .slice(0, 8)
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

  async function doStart(fn: () => void) {
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
    fn();
    onStart();
  }

  async function removeTpl(id: string, name: string) {
    const ok = await confirmDialog({
      title: "Delete template?",
      message: `“${name}” will be permanently removed.`,
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
      danger: true,
    });
    if (!ok) return;
    setBusyTpl(id);
    try {
      await deleteTemplate(id);
      await refreshTemplates();
      toast.success(`Deleted “${name}”.`);
    } catch {
      toast.error("Couldn't delete template.");
    } finally {
      setBusyTpl(null);
    }
  }

  const title =
    view === "home" ? "Start workout" : view === "repeat" ? "Repeat previous" : "Templates";

  return (
    <>
      <div
        className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 p-3 sm:items-center"
        onClick={onClose}
      >
        <div
          className="flex max-h-[85vh] w-full max-w-md flex-col rounded-xl border border-line bg-surface shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center border-b border-line p-4">
            <div className="w-10">
              {view !== "home" && (
                <button
                  onClick={() => setView("home")}
                  aria-label="Back"
                  className="text-ink-soft hover:text-ink"
                >
                  ←
                </button>
              )}
            </div>
            <h2 className="flex-1 text-center font-semibold">{title}</h2>
            <div className="w-10 text-right">
              <button onClick={onClose} aria-label="Close" className="text-ink-faint hover:text-ink">
                ✕
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {view === "home" && (
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => doStart(startBlank)}
                  className="rounded-xl border border-line bg-night p-4 text-left hover:border-ember/50"
                >
                  <div className="font-medium text-ink">Empty workout</div>
                  <div className="mt-0.5 text-sm text-ink-faint">Start from scratch</div>
                </button>

                {recentWorkouts.length > 0 && (
                  <button
                    onClick={() => setView("repeat")}
                    className="rounded-xl border border-line bg-night p-4 text-left hover:border-ember/50"
                  >
                    <div className="font-medium text-ink">Repeat previous</div>
                    <div className="mt-0.5 text-sm text-ink-faint">
                      Pick from your last {recentWorkouts.length} workout
                      {recentWorkouts.length !== 1 ? "s" : ""}
                    </div>
                  </button>
                )}

                <button
                  onClick={() => setView("template")}
                  className="rounded-xl border border-line bg-night p-4 text-left hover:border-ember/50"
                >
                  <div className="font-medium text-ink">Use a template</div>
                  <div className="mt-0.5 text-sm text-ink-faint">
                    {templates.length > 0
                      ? `${templates.length} template${templates.length !== 1 ? "s" : ""} saved`
                      : "Create your first template"}
                  </div>
                </button>
              </div>
            )}

            {view === "repeat" && (
              <ul className="flex flex-col gap-2">
                {recentWorkouts.map((w) => (
                  <li key={w.id}>
                    <button
                      onClick={() => doStart(() => startFromWorkout(w))}
                      className="w-full rounded-xl border border-line bg-night p-3 text-left hover:border-ember/50"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-medium text-ink">{w.name}</span>
                        <span className="shrink-0 text-xs text-ink-faint">
                          {fmtDate(w.performed_at)}
                        </span>
                      </div>
                      <div className="mt-0.5 text-xs text-ink-soft">{w.workingSetCount} sets</div>
                      {w.exerciseNames.length > 0 && (
                        <p className="mt-1 truncate text-xs text-ink-faint">
                          {w.exerciseNames.join(" · ")}
                        </p>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {view === "template" && (
              <>
                {templates.length === 0 ? (
                  <p className="mb-4 text-sm text-ink-faint">No templates yet. Create one below.</p>
                ) : (
                  <ul className="mb-3 flex flex-col gap-2">
                    {templates.map((t) => {
                      const ids = [...new Set(t.sets.map((s) => s.exercise_id))];
                      return (
                        <li key={t.id} className="rounded-xl border border-line bg-night p-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-ink">{t.name}</span>
                            <div className="flex shrink-0 gap-1.5">
                              <button
                                onClick={() => setEditingTpl(t)}
                                className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink-soft hover:text-ink"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => doStart(() => startFromTemplate(t))}
                                className="rounded-lg bg-ember px-3 py-1.5 text-sm font-medium text-night hover:bg-ember-soft"
                              >
                                Start
                              </button>
                              <button
                                onClick={() => removeTpl(t.id, t.name)}
                                disabled={busyTpl === t.id}
                                aria-label={`Delete template ${t.name}`}
                                className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-faint hover:bg-surface-2 hover:text-danger-soft disabled:opacity-40"
                                title="Delete template"
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                          {ids.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {ids.map((id) => {
                                const ex = exerciseById(id);
                                const count = t.sets.filter((s) => s.exercise_id === id).length;
                                return (
                                  <div key={id} className="flex items-center gap-1 text-xs text-ink-soft">
                                    <span style={{ color: MUSCLE_COLORS[ex?.muscle_group ?? "core"] }}>
                                      <ExerciseFigure
                                        pattern={ex?.movement_pattern ?? "other"}
                                        size={22}
                                      />
                                    </span>
                                    <span>
                                      {ex?.name ?? "?"}{" "}
                                      <span className="text-ink-faint">×{count}</span>
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
                <button
                  onClick={() => setBuilding(true)}
                  className="w-full rounded-xl border border-dashed border-line py-3 text-sm text-ink-soft hover:text-ink"
                >
                  + New template
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {building && <TemplateBuilder onClose={() => setBuilding(false)} />}

      {editingTpl && (
        <TemplateEditor
          template={editingTpl}
          onSave={async () => {
            await refreshTemplates();
            setEditingTpl(null);
          }}
          onClose={() => setEditingTpl(null)}
        />
      )}
    </>
  );
}
