"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { supabase } from "@/lib/supabase";
import {
  createCustomExercise,
  deleteCustomExercise,
  deleteCustomExerciseAndSets,
  deleteTemplate,
  saveTemplate,
  submitFeedback,
  updateProfile,
  type TemplateWithSets,
} from "@/lib/db";
import { exportWorkoutsToCsv, downloadCsv } from "@/lib/csv";
import { estimateOneRepMax, round1 } from "@/lib/oneRepMax";
import { MUSCLE_COLORS } from "@/lib/muscles";
import { ExerciseFigure } from "./ExerciseFigure";
import { ExercisePicker } from "./ExercisePicker";
import { TemplateEditor } from "./TemplateEditor";
import {
  ALL_MOVEMENT_PATTERNS,
  ALL_MUSCLE_GROUPS,
  type MuscleGroup,
  type MovementPattern,
  type Unit,
} from "@/lib/types";

export function Tools() {
  const workouts = useStore((s) => s.workouts);
  const exercises = useStore((s) => s.exercises);
  const profile = useStore((s) => s.profile);
  const templates = useStore((s) => s.templates);
  const exerciseById = useStore((s) => s.exerciseById);
  const refreshTemplates = useStore((s) => s.refreshTemplates);
  const refreshExercises = useStore((s) => s.refreshExercises);
  const refreshWorkouts = useStore((s) => s.refreshWorkouts);

  const unit = profile?.unit ?? "kg";
  const rest = profile?.default_rest_seconds ?? 90;

  const [weight, setWeight] = useState(100);
  const [reps, setReps] = useState(5);

  const [editingTpl, setEditingTpl] = useState<TemplateWithSets | null>(null);
  const [tplsOpen, setTplsOpen] = useState(true);
  const [building, setBuilding] = useState(false);
  const [tplName, setTplName] = useState("New Template");
  const [tplExs, setTplExs] = useState<string[]>([]);
  const [pickingForTpl, setPickingForTpl] = useState(false);
  const [savingTpl, setSavingTpl] = useState(false);
  const [busyTpl, setBusyTpl] = useState<string | null>(null);

  // custom exercises
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customMuscle, setCustomMuscle] = useState<MuscleGroup>("chest");
  const [customPattern, setCustomPattern] = useState<MovementPattern>("other");
  const [customEquipment, setCustomEquipment] = useState("barbell");
  const [savingCustom, setSavingCustom] = useState(false);
  const [deletingCustom, setDeletingCustom] = useState<string | null>(null);

  // feedback
  const [feedbackMsg, setFeedbackMsg] = useState("");
  const [feedbackStatus, setFeedbackStatus] = useState<"idle" | "busy" | "sent" | "error">("idle");

  const customExercises = useMemo(
    () => exercises.filter((e) => e.is_custom),
    [exercises],
  );

  const customExercisesUsed = useMemo(() => {
    if (customExercises.length === 0) return [];
    const customIds = new Set(customExercises.map((e) => e.id));
    const usedIds = new Set(
      workouts
        .flatMap((w) => w.sets.map((s) => s.exercise_id))
        .filter((id) => customIds.has(id)),
    );
    return customExercises.filter((e) => usedIds.has(e.id));
  }, [customExercises, workouts]);

  const usedCustomIds = useMemo(
    () => new Set(customExercisesUsed.map((e) => e.id)),
    [customExercisesUsed],
  );

  async function saveCustomExercise() {
    if (!customName.trim()) return;
    setSavingCustom(true);
    try {
      await createCustomExercise({
        name: customName.trim(),
        muscle_group: customMuscle,
        movement_pattern: customPattern,
        equipment: customEquipment,
      });
      await refreshExercises();
      setCustomName("");
      setShowCustomForm(false);
    } finally {
      setSavingCustom(false);
    }
  }

  async function removeCustomExercise(id: string) {
    const isUsed = usedCustomIds.has(id);
    const confirmed = window.confirm(
      isUsed
        ? "This exercise has been logged in workouts. Deleting it will remove those sets from your history. Continue?"
        : "Delete this custom exercise?",
    );
    if (!confirmed) return;
    setDeletingCustom(id);
    try {
      if (isUsed) {
        await deleteCustomExerciseAndSets(id);
        await refreshWorkouts();
      } else {
        await deleteCustomExercise(id);
      }
      await refreshExercises();
    } finally {
      setDeletingCustom(null);
    }
  }

  async function sendFeedback() {
    if (!feedbackMsg.trim()) return;
    setFeedbackStatus("busy");
    try {
      await submitFeedback(
        feedbackMsg,
        customExercisesUsed.map((e) => ({
          name: e.name,
          muscle_group: e.muscle_group,
          movement_pattern: e.movement_pattern,
          equipment: e.equipment,
        })),
      );
      setFeedbackMsg("");
      setFeedbackStatus("sent");
    } catch {
      setFeedbackStatus("error");
    }
  }

  async function setUnit(u: Unit) {
    await updateProfile({ unit: u });
    useStore.setState((s) => ({ profile: s.profile ? { ...s.profile, unit: u } : s.profile }));
  }

  async function setRest(seconds: number) {
    await updateProfile({ default_rest_seconds: seconds });
    useStore.setState((s) => ({
      profile: s.profile ? { ...s.profile, default_rest_seconds: seconds } : s.profile,
      rest: { ...s.rest, duration: seconds },
    }));
  }

  function exportCsv() {
    const csv = exportWorkoutsToCsv(workouts, exercises);
    downloadCsv(`ironlog-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  async function removeTpl(id: string) {
    if (!window.confirm("Delete this template?")) return;
    setBusyTpl(id);
    try {
      await deleteTemplate(id);
      await refreshTemplates();
    } finally {
      setBusyTpl(null);
    }
  }

  async function saveNewTemplate() {
    if (!tplName.trim() || tplExs.length === 0) return;
    setSavingTpl(true);
    try {
      const sets = tplExs.flatMap((exercise_id) =>
        [0, 1, 2].map((set_index) => ({ exercise_id, set_index, weight: 0, reps: 0 })),
      );
      await saveTemplate({ name: tplName.trim(), sets });
      await refreshTemplates();
      setBuilding(false);
      setTplName("New Template");
      setTplExs([]);
    } finally {
      setSavingTpl(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Templates */}
      <section className="rounded-xl border border-line bg-surface/70 p-4">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setTplsOpen((v) => !v)}
            className="flex items-center gap-2 font-medium"
          >
            <span
              className="text-xs text-ink-faint transition-transform duration-150"
              style={{ display: "inline-block", transform: tplsOpen ? "rotate(90deg)" : "rotate(0deg)" }}
            >
              ▶
            </span>
            Templates
            {templates.length > 0 && (
              <span className="text-sm font-normal text-ink-faint">{templates.length}</span>
            )}
          </button>
          <button
            onClick={() => setBuilding(true)}
            className="rounded-lg bg-ember px-3 py-1.5 text-sm font-medium text-night hover:bg-ember-soft"
          >
            + New
          </button>
        </div>

        {tplsOpen && (
          <div className="mt-3">
            {templates.length === 0 ? (
              <p className="text-sm text-ink-faint">No templates yet.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {templates.map((t) => {
              const ids = [...new Set(t.sets.map((s) => s.exercise_id))];
              return (
                <li key={t.id} className="rounded-lg border border-line bg-night p-3">
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
                        onClick={() => removeTpl(t.id)}
                        disabled={busyTpl === t.id}
                        className="text-ink-faint hover:text-ember-soft disabled:opacity-40"
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
                                <ExerciseFigure pattern={ex?.movement_pattern ?? "other"} size={20} />
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
          </div>
        )}
      </section>

      {/* 1RM calculator */}
      <section className="rounded-xl border border-line bg-surface/70 p-4">
        <h3 className="mb-3 font-medium">
          One-rep max estimator{" "}
          <span className="font-normal text-ink-faint">(Epley)</span>
        </h3>

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col text-sm text-ink-soft">
            Weight ({unit})
            <input
              type="number"
              value={weight || ""}
              onChange={(e) => setWeight(parseFloat(e.target.value) || 0)}
              className="mt-1 w-24 rounded-md border border-line bg-night px-2 py-1 text-ink outline-none focus:border-ember"
            />
          </label>
          <label className="flex flex-col text-sm text-ink-soft">
            Reps
            <input
              type="number"
              value={reps || ""}
              onChange={(e) => setReps(parseInt(e.target.value) || 0)}
              className="mt-1 w-20 rounded-md border border-line bg-night px-2 py-1 text-ink outline-none focus:border-ember"
            />
          </label>
          <div className="rounded-lg border border-line bg-night px-5 py-2 text-center">
            <div className="text-xs text-ink-faint">Estimated 1RM</div>
            <div className="text-2xl font-semibold text-ember">
              {round1(estimateOneRepMax(weight, reps, "epley"))}
            </div>
            <div className="text-xs text-ink-faint">{unit}</div>
          </div>
        </div>
      </section>

      {/* Preferences */}
      <section className="rounded-xl border border-line bg-surface/70 p-4">
        <h3 className="mb-3 font-medium">Preferences</h3>
        <div className="flex items-center justify-between py-2">
          <span className="text-ink-soft">Units</span>
          <div className="flex gap-1 rounded-lg border border-line p-1">
            {(["kg", "lb"] as Unit[]).map((u) => (
              <button
                key={u}
                onClick={() => setUnit(u)}
                className={[
                  "rounded-md px-3 py-1 text-sm",
                  unit === u ? "bg-ember text-night" : "text-ink-soft hover:text-ink",
                ].join(" ")}
              >
                {u}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between py-2">
          <span className="text-ink-soft">Default rest timer</span>
          <div className="flex gap-1 rounded-lg border border-line p-1">
            {[30, 60, 90, 120, 180].map((s) => (
              <button
                key={s}
                onClick={() => setRest(s)}
                className={[
                  "rounded-md px-2.5 py-1 text-sm",
                  rest === s ? "bg-ember text-night" : "text-ink-soft hover:text-ink",
                ].join(" ")}
              >
                {s}s
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Data */}
      <section className="rounded-xl border border-line bg-surface/70 p-4">
        <h3 className="mb-3 font-medium">Data</h3>
        <button
          onClick={exportCsv}
          disabled={workouts.length === 0}
          className="w-full rounded-lg border border-line py-2.5 text-ink-soft hover:text-ink disabled:opacity-50"
        >
          Export workouts to CSV
        </button>
      </section>

      {/* Account */}
      <section className="rounded-xl border border-line bg-surface/70 p-4">
        <h3 className="mb-3 font-medium">Account</h3>
        <ChangePassword />
        <div className="mt-3 border-t border-line pt-3">
          <button
            onClick={() => supabase.auth.signOut()}
            className="text-sm text-ink-faint hover:text-ember-soft"
          >
            Sign out
          </button>
        </div>
      </section>

      {/* Custom exercises */}
      <section className="rounded-xl border border-line bg-surface/70 p-4">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <h3 className="font-medium">Custom exercises</h3>
            <p className="mt-0.5 text-xs text-ink-faint">
              Add exercises not in the list. Ones you log are included when you send feedback.
            </p>
          </div>
          <button
            onClick={() => setShowCustomForm((v) => !v)}
            className="shrink-0 rounded-lg bg-ember px-3 py-1.5 text-sm font-medium text-night hover:bg-ember-soft"
          >
            + New
          </button>
        </div>

        {showCustomForm && (
          <div className="mb-4 flex flex-col gap-2 rounded-lg border border-line bg-night p-3">
            <input
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="Exercise name"
              className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-ember"
            />
            <div className="grid grid-cols-2 gap-2">
              <select
                value={customMuscle}
                onChange={(e) => setCustomMuscle(e.target.value as MuscleGroup)}
                className="rounded-md border border-line bg-surface px-2 py-2 text-sm text-ink outline-none focus:border-ember"
              >
                {ALL_MUSCLE_GROUPS.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
              <select
                value={customEquipment}
                onChange={(e) => setCustomEquipment(e.target.value)}
                className="rounded-md border border-line bg-surface px-2 py-2 text-sm text-ink outline-none focus:border-ember"
              >
                {["barbell", "dumbbell", "cable", "machine", "bodyweight", "other"].map((eq) => (
                  <option key={eq} value={eq}>{eq}</option>
                ))}
              </select>
            </div>
            <select
              value={customPattern}
              onChange={(e) => setCustomPattern(e.target.value as MovementPattern)}
              className="rounded-md border border-line bg-surface px-2 py-2 text-sm text-ink outline-none focus:border-ember"
            >
              {ALL_MOVEMENT_PATTERNS.map((p) => (
                <option key={p} value={p}>{p.replace(/_/g, " ")}</option>
              ))}
            </select>
            <div className="flex gap-2">
              <button
                onClick={saveCustomExercise}
                disabled={savingCustom || !customName.trim()}
                className="flex-1 rounded-lg bg-ember py-2 text-sm font-medium text-night hover:bg-ember-soft disabled:opacity-50"
              >
                {savingCustom ? "Saving…" : "Save exercise"}
              </button>
              <button
                onClick={() => { setShowCustomForm(false); setCustomName(""); }}
                className="rounded-lg border border-line px-3 py-2 text-sm text-ink-faint hover:text-ink"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {customExercises.length === 0 ? (
          <p className="text-sm text-ink-faint">No custom exercises yet.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {customExercises.map((ex) => (
              <li
                key={ex.id}
                className="flex items-center justify-between rounded-lg border border-line bg-night px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <span style={{ color: MUSCLE_COLORS[ex.muscle_group] }}>
                    <ExerciseFigure pattern={ex.movement_pattern} size={20} />
                  </span>
                  <div>
                    <span className="text-sm text-ink">{ex.name}</span>
                    <span className="ml-2 text-xs text-ink-faint">
                      {ex.muscle_group} · {ex.equipment}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => removeCustomExercise(ex.id)}
                  disabled={deletingCustom === ex.id}
                  className="text-ink-faint hover:text-ember-soft disabled:opacity-40"
                  title="Delete"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Feedback */}
      <section className="rounded-xl border border-line bg-surface/70 p-4">
        <h3 className="mb-1 font-medium">Feedback</h3>
        <p className="mb-3 text-xs text-ink-faint">
          Suggest exercises or features — your input shapes the app.
        </p>
        <textarea
          value={feedbackMsg}
          onChange={(e) => { setFeedbackMsg(e.target.value); if (feedbackStatus !== "idle") setFeedbackStatus("idle"); }}
          placeholder="e.g. Add cable crunch to the exercise list, or add superset support…"
          rows={3}
          className="mb-3 w-full resize-none rounded-lg border border-line bg-night px-3 py-2 text-sm text-ink outline-none focus:border-ember"
        />
        {customExercisesUsed.length > 0 && (
          <div className="mb-3 rounded-lg border border-line bg-night px-3 py-2 text-xs text-ink-soft">
            <span className="text-ink-faint">Also sending your logged custom exercises:</span>
            <ul className="mt-1 flex flex-col gap-0.5">
              {customExercisesUsed.map((ex) => (
                <li key={ex.id}>
                  · {ex.name}{" "}
                  <span className="text-ink-faint">({ex.muscle_group} · {ex.equipment})</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {feedbackStatus === "sent" ? (
          <p className="text-center text-sm text-ember">Sent — thanks!</p>
        ) : (
          <button
            onClick={sendFeedback}
            disabled={feedbackStatus === "busy" || !feedbackMsg.trim()}
            className="w-full rounded-lg bg-ember py-2.5 text-sm font-medium text-night hover:bg-ember-soft disabled:opacity-50"
          >
            {feedbackStatus === "busy" ? "Sending…" : "Send feedback"}
          </button>
        )}
        {feedbackStatus === "error" && (
          <p className="mt-2 text-center text-xs text-ember-soft">Something went wrong — try again.</p>
        )}
      </section>

      {/* New template builder */}
      {building && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 p-3 sm:items-center">
          <div className="flex max-h-[85vh] w-full max-w-md flex-col rounded-xl border border-line bg-surface shadow-2xl">
            <div className="flex items-center justify-between border-b border-line p-4">
              <h2 className="font-semibold">New template</h2>
              <button
                onClick={() => { setBuilding(false); setTplExs([]); setTplName("New Template"); }}
                className="text-ink-faint hover:text-ink"
              >
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
                          className="text-ink-faint hover:text-ember-soft"
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
      )}

      {pickingForTpl && (
        <ExercisePicker
          onPick={(id) => { setTplExs((prev) => [...prev, id]); setPickingForTpl(false); }}
          onClose={() => setPickingForTpl(false)}
        />
      )}

      {editingTpl && (
        <TemplateEditor
          template={editingTpl}
          onSave={async () => { await refreshTemplates(); setEditingTpl(null); }}
          onClose={() => setEditingTpl(null)}
        />
      )}
    </div>
  );
}

function ChangePassword() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setError("Passwords don't match."); return; }
    if (password.length < 6) { setError("At least 6 characters."); return; }
    setStatus("busy");
    setError("");
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError(error.message);
      setStatus("error");
    } else {
      setStatus("done");
      setPassword("");
      setConfirm("");
      setTimeout(() => { setOpen(false); setStatus("idle"); }, 1500);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-sm text-ink-soft hover:text-ink">
        Change password
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <input
        type="password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="New password"
        className="rounded-lg border border-line bg-night px-3 py-2 text-sm text-ink outline-none focus:border-ember"
      />
      <input
        type="password"
        required
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        placeholder="Confirm password"
        className="rounded-lg border border-line bg-night px-3 py-2 text-sm text-ink outline-none focus:border-ember"
      />
      {error && <p className="text-xs text-ember-soft">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={status === "busy"}
          className="flex-1 rounded-lg bg-ember py-2 text-sm font-medium text-night hover:bg-ember-soft disabled:opacity-60"
        >
          {status === "busy" ? "Saving…" : status === "done" ? "Saved ✓" : "Save password"}
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setError(""); setPassword(""); setConfirm(""); }}
          className="rounded-lg border border-line px-3 py-2 text-sm text-ink-faint hover:text-ink"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
