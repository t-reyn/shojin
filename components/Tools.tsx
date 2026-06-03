"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { supabase } from "@/lib/supabase";
import { deleteTemplate, updateProfile, type TemplateWithSets } from "@/lib/db";
import { confirmDialog } from "@/lib/dialog";
import { toast } from "@/lib/toast";
import { exportWorkoutsToCsv, downloadCsv } from "@/lib/csv";
import { estimateOneRepMax, round1 } from "@/lib/oneRepMax";
import { MUSCLE_COLORS } from "@/lib/muscles";
import { ExerciseFigure } from "./ExerciseFigure";
import { TemplateBuilder } from "./TemplateBuilder";
import { TemplateEditor } from "./TemplateEditor";
import type { Unit } from "@/lib/types";

export function Tools() {
  const workouts = useStore((s) => s.workouts);
  const exercises = useStore((s) => s.exercises);
  const profile = useStore((s) => s.profile);
  const templates = useStore((s) => s.templates);
  const exerciseById = useStore((s) => s.exerciseById);
  const refreshTemplates = useStore((s) => s.refreshTemplates);

  const unit = profile?.unit ?? "kg";
  const rest = profile?.default_rest_seconds ?? 90;

  const [weight, setWeight] = useState(100);
  const [reps, setReps] = useState(5);

  const [editingTpl, setEditingTpl] = useState<TemplateWithSets | null>(null);
  const [building, setBuilding] = useState(false);
  const [busyTpl, setBusyTpl] = useState<string | null>(null);

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
    toast.success(`Exported ${workouts.length} workout${workouts.length !== 1 ? "s" : ""} to CSV.`);
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

  return (
    <div className="flex flex-col gap-4">
      {/* Templates */}
      <section className="rounded-xl border border-line bg-surface/70 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-medium">Templates</h3>
          <button
            onClick={() => setBuilding(true)}
            className="rounded-lg bg-ember px-3 py-1.5 text-sm font-medium text-night hover:bg-ember-soft"
          >
            + New
          </button>
        </div>

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

      {building && <TemplateBuilder onClose={() => setBuilding(false)} />}

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
