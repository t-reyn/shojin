"use client";

import { useMemo, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { supabase } from "@/lib/supabase";
import {
  createCustomExercise,
  deleteCustomExercise,
  deleteCustomExerciseAndSets,
  deleteTemplate,
  submitFeedback,
  updateProfile,
  type TemplateWithSets,
} from "@/lib/db";
import { confirmDialog } from "@/lib/dialog";
import { toast } from "@/lib/toast";
import { exportWorkoutsToCsv, downloadCsv } from "@/lib/csv";
import { parseCsv, ImportError, type ParseResult } from "@/lib/import";
import { estimateOneRepMax, round1 } from "@/lib/oneRepMax";
import { MUSCLE_COLORS } from "@/lib/muscles";
import { ExerciseIcon } from "./ExerciseIcon";
import { TemplateBuilder } from "./TemplateBuilder";
import { TemplateEditor } from "./TemplateEditor";
import { Icon } from "./ShojinUI";
import { isStandalone, OPEN_INSTALL_EVENT } from "./InstallPrompt";
import { useThemePref, setThemePref, type ThemePref } from "@/lib/theme";
import {
  ALL_MOVEMENT_PATTERNS,
  ALL_MUSCLE_GROUPS,
  type ExerciseType,
  type Goal,
  type MuscleGroup,
  type MovementPattern,
  type Unit,
} from "@/lib/types";

const GOAL_OPTIONS: { id: Goal; label: string }[] = [
  { id: "muscle", label: "Build muscle" },
  { id: "strength", label: "Get stronger" },
  { id: "fat", label: "Lose fat" },
  { id: "consistent", label: "Stay consistent" },
];

export function Tools({ userEmail }: { userEmail: string }) {
  const theme = useThemePref();
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
  const goal = profile?.goal ?? null;
  const days = profile?.days_per_week ?? null;

  const [nameInput, setNameInput] = useState(profile?.display_name ?? "");

  const [weight, setWeight] = useState(100);
  const [reps, setReps] = useState(5);

  const [editingTpl, setEditingTpl] = useState<TemplateWithSets | null>(null);
  const [tplsOpen, setTplsOpen] = useState(true);
  const [building, setBuilding] = useState(false);
  const [busyTpl, setBusyTpl] = useState<string | null>(null);

  // custom exercises
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customMuscle, setCustomMuscle] = useState<MuscleGroup>("chest");
  const [customPattern, setCustomPattern] = useState<MovementPattern>("other");
  const [customEquipment, setCustomEquipment] = useState("barbell");
  const [customType, setCustomType] = useState<ExerciseType>("weight_reps");
  const [customSecondary, setCustomSecondary] = useState<MuscleGroup[]>([]);
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
        exercise_type: customType,
        secondary_muscles: customSecondary.filter((m) => m !== customMuscle),
      });
      await refreshExercises();
      setCustomName("");
      setCustomSecondary([]);
      setCustomType("weight_reps");
      setShowCustomForm(false);
    } finally {
      setSavingCustom(false);
    }
  }

  async function removeCustomExercise(id: string, name: string) {
    const isUsed = usedCustomIds.has(id);
    const ok = await confirmDialog({
      title: "Delete custom exercise?",
      message: isUsed
        ? `“${name}” has been logged in workouts. Deleting it will also remove those sets from your history.`
        : `“${name}” will be permanently removed.`,
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
      danger: true,
    });
    if (!ok) return;
    setDeletingCustom(id);
    try {
      if (isUsed) {
        await deleteCustomExerciseAndSets(id);
        await refreshWorkouts();
      } else {
        await deleteCustomExercise(id);
      }
      await refreshExercises();
      toast.success(`Deleted “${name}”.`);
    } catch {
      toast.error("Couldn't delete exercise.");
    } finally {
      setDeletingCustom(null);
    }
  }

  async function sendFeedback() {
    if (!feedbackMsg.trim()) return;
    setFeedbackStatus("busy");
    try {
      await submitFeedback(feedbackMsg, []);
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

  async function saveName() {
    const next = nameInput.trim() || null;
    if (next === (profile?.display_name ?? null)) return;
    await updateProfile({ display_name: next });
    useStore.setState((s) => ({ profile: s.profile ? { ...s.profile, display_name: next } : s.profile }));
  }

  async function setGoal(g: Goal | null) {
    await updateProfile({ goal: g });
    useStore.setState((s) => ({ profile: s.profile ? { ...s.profile, goal: g } : s.profile }));
  }

  async function setDays(d: number | null) {
    await updateProfile({ days_per_week: d });
    useStore.setState((s) => ({ profile: s.profile ? { ...s.profile, days_per_week: d } : s.profile }));
  }

  function showInstallGuide() {
    if (isStandalone()) {
      toast.success("Shojin is already installed on this device.");
      return;
    }
    window.dispatchEvent(new Event(OPEN_INSTALL_EVENT));
  }

  function exportCsv() {
    const csv = exportWorkoutsToCsv(workouts, exercises);
    downloadCsv(`shojin-${new Date().toISOString().slice(0, 10)}.csv`, csv);
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

  const displayName = profile?.display_name?.trim() || "";
  const initials = (displayName || userEmail.split("@")[0] || "U").slice(0, 2).toUpperCase();

  return (
    <div className="flex flex-col gap-4">
      {/* Profile header */}
      <div className="flex items-center gap-3.5">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green text-base font-extrabold text-on-green">
          {initials}
        </div>
        <div className="min-w-0">
          <h1 className="text-[26px] font-extrabold leading-none tracking-[-0.025em]">
            {displayName || "Profile"}
          </h1>
          <div className="mt-1 truncate font-mono text-xs text-ink-faint">{userEmail}</div>
        </div>
      </div>

      {/* You — baseline collected at onboarding, editable here */}
      <section className="rounded-[28px] border border-line-2 bg-surface p-4 shadow-[var(--rp-shadow-sm)]">
        <h3 className="mb-3 font-medium">You</h3>
        <div className="flex items-center justify-between gap-3 py-1">
          <span className="shrink-0 text-ink-soft">Name</span>
          <input
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onBlur={saveName}
            placeholder="Your name"
            maxLength={40}
            className="min-w-0 flex-1 rounded-lg border border-line bg-night px-3 py-1.5 text-right text-ink outline-none focus:border-ember"
          />
        </div>
        <div className="flex items-center justify-between gap-2 py-2">
          <span className="shrink-0 text-ink-soft">Goal</span>
          <div className="flex flex-wrap justify-end gap-1.5">
            {GOAL_OPTIONS.map((g) => (
              <button
                key={g.id}
                onClick={() => setGoal(goal === g.id ? null : g.id)}
                aria-pressed={goal === g.id}
                className={[
                  "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                  goal === g.id ? "bg-ink text-bg" : "border border-line text-ink-soft hover:text-ink",
                ].join(" ")}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 py-2">
          <span className="shrink-0 text-ink-soft">Days / week</span>
          <div className="flex gap-1 rounded-lg border border-line p-1">
            {[1, 2, 3, 4, 5, 6, 7].map((d) => (
              <button
                key={d}
                onClick={() => setDays(days === d ? null : d)}
                aria-pressed={days === d}
                className={[
                  "h-7 w-7 rounded-md font-mono text-sm",
                  days === d ? "bg-ember text-on-accent" : "text-ink-soft hover:text-ink",
                ].join(" ")}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Appearance */}
      <section className="rounded-[28px] border border-line-2 bg-surface p-4 shadow-[var(--rp-shadow-sm)]">
        <h3 className="mb-3 font-bold tracking-[-0.015em]">Appearance</h3>
        <div className="flex items-center justify-between py-1">
          <span className="text-ink-soft">Theme</span>
          <div className="flex gap-1 rounded-full border border-line p-1">
            {(["system", "light", "dark"] as ThemePref[]).map((t) => (
              <button
                key={t}
                onClick={() => setThemePref(t)}
                className={[
                  "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold capitalize transition-colors",
                  theme === t ? "bg-ink text-bg" : "text-ink-soft hover:text-ink",
                ].join(" ")}
              >
                {t === "light" && <Icon name="sun" size={14} color="currentColor" />}
                {t === "dark" && <Icon name="moon" size={14} color="currentColor" />}
                {t}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-1 flex items-center justify-between py-1">
          <span className="text-ink-soft">Install app</span>
          <button
            onClick={showInstallGuide}
            className="rounded-full border border-line px-4 py-1.5 text-sm font-semibold text-ink-soft hover:text-ink"
          >
            How to install
          </button>
        </div>
      </section>

      {/* Templates */}
      <section className="rounded-[28px] border border-line-2 bg-surface p-4 shadow-[var(--rp-shadow-sm)]">
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
            className="rounded-lg bg-ember px-3 py-1.5 text-sm font-medium text-on-accent hover:bg-ember-soft"
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
                                  <ExerciseIcon name={ex?.name} pattern={ex?.movement_pattern ?? "other"} size={20} />
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
      <section className="rounded-[28px] border border-line-2 bg-surface p-4 shadow-[var(--rp-shadow-sm)]">
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
      <section className="rounded-[28px] border border-line-2 bg-surface p-4 shadow-[var(--rp-shadow-sm)]">
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
                  unit === u ? "bg-ember text-on-accent" : "text-ink-soft hover:text-ink",
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
                  rest === s ? "bg-ember text-on-accent" : "text-ink-soft hover:text-ink",
                ].join(" ")}
              >
                {s}s
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Data */}
      <section className="rounded-[28px] border border-line-2 bg-surface p-4 shadow-[var(--rp-shadow-sm)]">
        <h3 className="mb-3 font-medium">Data</h3>
        <button
          onClick={exportCsv}
          disabled={workouts.length === 0}
          className="w-full rounded-lg border border-line py-2.5 text-ink-soft hover:text-ink disabled:opacity-50"
        >
          Export workouts to CSV
        </button>
        <ImportWorkouts />
      </section>

      {/* Account */}
      <section className="rounded-[28px] border border-line-2 bg-surface p-4 shadow-[var(--rp-shadow-sm)]">
        <h3 className="mb-3 font-medium">Account</h3>
        <ChangePassword />
        <div className="mt-3 border-t border-line pt-3">
          <button
            onClick={() => supabase.auth.signOut()}
            className="text-sm text-ink-faint hover:text-danger-soft"
          >
            Sign out
          </button>
        </div>
      </section>

      {/* Custom exercises */}
      <section className="rounded-[28px] border border-line-2 bg-surface p-4 shadow-[var(--rp-shadow-sm)]">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <h3 className="font-medium">Custom exercises</h3>
            <p className="mt-0.5 text-xs text-ink-faint">
              Add exercises that aren’t in the list.
            </p>
          </div>
          <button
            onClick={() => setShowCustomForm((v) => !v)}
            className="shrink-0 rounded-lg bg-ember px-3 py-1.5 text-sm font-medium text-on-accent hover:bg-ember-soft"
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
            <div className="flex items-center justify-between py-1">
              <span className="text-xs text-ink-faint">Tracks</span>
              <div className="flex gap-1 rounded-lg border border-line p-1">
                {([
                  { id: "weight_reps", label: "Weight × reps" },
                  { id: "duration", label: "Time" },
                ] as { id: ExerciseType; label: string }[]).map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setCustomType(t.id)}
                    className={[
                      "rounded-md px-2.5 py-1 text-xs",
                      customType === t.id ? "bg-ember text-on-accent" : "text-ink-soft hover:text-ink",
                    ].join(" ")}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className="text-xs text-ink-faint">Secondary muscles (count at half weight)</span>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {ALL_MUSCLE_GROUPS.filter((g) => g !== customMuscle).map((g) => {
                  const on = customSecondary.includes(g);
                  return (
                    <button
                      key={g}
                      onClick={() =>
                        setCustomSecondary((prev) =>
                          on ? prev.filter((m) => m !== g) : [...prev, g],
                        )
                      }
                      aria-pressed={on}
                      className={[
                        "rounded-full px-2.5 py-1 text-xs capitalize transition-colors",
                        on
                          ? "bg-ink text-bg"
                          : "border border-line text-ink-soft hover:text-ink",
                      ].join(" ")}
                    >
                      {g}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={saveCustomExercise}
                disabled={savingCustom || !customName.trim()}
                className="flex-1 rounded-lg bg-ember py-2 text-sm font-medium text-on-accent hover:bg-ember-soft disabled:opacity-50"
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
                    <ExerciseIcon name={ex.name} pattern={ex.movement_pattern} size={20} />
                  </span>
                  <div>
                    <span className="text-sm text-ink">{ex.name}</span>
                    <span className="ml-2 text-xs text-ink-faint">
                      {ex.muscle_group} · {ex.equipment}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => removeCustomExercise(ex.id, ex.name)}
                  disabled={deletingCustom === ex.id}
                  aria-label={`Delete ${ex.name}`}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-faint hover:bg-surface-2 hover:text-danger-soft disabled:opacity-40"
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
      <section className="rounded-[28px] border border-line-2 bg-surface p-4 shadow-[var(--rp-shadow-sm)]">
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
        {feedbackStatus === "sent" ? (
          <p className="text-center text-sm text-ember">Sent — thanks!</p>
        ) : (
          <button
            onClick={sendFeedback}
            disabled={feedbackStatus === "busy" || !feedbackMsg.trim()}
            className="w-full rounded-lg bg-ember py-2.5 text-sm font-medium text-on-accent hover:bg-ember-soft disabled:opacity-50"
          >
            {feedbackStatus === "busy" ? "Sending…" : "Send feedback"}
          </button>
        )}
        {feedbackStatus === "error" && (
          <p className="mt-2 text-center text-xs text-danger-soft">Something went wrong — try again.</p>
        )}
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

const FORMAT_LABEL: Record<ParseResult["format"], string> = {
  hevy: "Hevy",
  strong: "Strong",
  shojin: "Shojin",
  generic: "generic CSV",
};

function ImportWorkouts() {
  const profile = useStore((s) => s.profile);
  const exercises = useStore((s) => s.exercises);
  const importWorkouts = useStore((s) => s.importWorkouts);
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{ text: string; result: ParseResult } | null>(null);
  const [unit, setUnit] = useState<Unit>(profile?.unit ?? "kg");
  const [busy, setBusy] = useState(false);

  // Estimate how many exercises the import will create (unknown names).
  const newExerciseCount = useMemo(() => {
    if (!preview) return 0;
    const have = new Set(exercises.map((e) => e.name.trim().toLowerCase()));
    return preview.result.exerciseNames.filter((n) => !have.has(n.trim().toLowerCase())).length;
  }, [preview, exercises]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // let the same file be re-picked later
    if (!file) return;
    try {
      const text = await file.text();
      const result = parseCsv(text, profile?.unit ?? "kg");
      if (result.workouts.length === 0) {
        toast.error("No workouts found in that file.");
        return;
      }
      setUnit(profile?.unit ?? "kg");
      setPreview({ text, result });
    } catch (err) {
      toast.error(err instanceof ImportError ? err.message : "Couldn't read that CSV.");
    }
  }

  async function commit() {
    if (!preview) return;
    setBusy(true);
    try {
      // Re-parse with the chosen unit so ambiguous-unit sources land correctly.
      const final = parseCsv(preview.text, unit);
      const res = await importWorkouts(final.workouts);
      const parts = [`Imported ${res.workouts} workout${res.workouts !== 1 ? "s" : ""}`];
      if (res.newExercises.length)
        parts.push(`${res.newExercises.length} new exercise${res.newExercises.length !== 1 ? "s" : ""}`);
      if (res.skippedDuplicates)
        parts.push(`${res.skippedDuplicates} duplicate${res.skippedDuplicates !== 1 ? "s" : ""} skipped`);
      toast.success(parts.join(" · ") + ".");
      setPreview(null);
    } catch {
      toast.error("Import failed — some workouts may not have been saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={() => fileRef.current?.click()}
        className="mt-2 w-full rounded-lg border border-line py-2.5 text-ink-soft hover:text-ink"
      >
        Import workouts from CSV
      </button>
      <p className="mt-2 px-1 text-center text-[11px] text-ink-faint">
        From Strong, Hevy, a Shojin export, or another CSV.
      </p>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        onChange={onFile}
        className="sr-only"
        aria-hidden
      />

      {preview && (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/50"
          onClick={() => !busy && setPreview(null)}
        >
          <div
            className="sheet-up w-full max-w-md rounded-t-[28px] bg-bg px-5 pb-[max(1.75rem,env(safe-area-inset-bottom))] pt-5"
            style={{ boxShadow: "0 -12px 40px rgba(43,39,37,0.25)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[18px] font-bold text-ink">Import preview</h3>
            <p className="mt-1 text-sm text-ink-soft">
              Detected a{" "}
              <span className="font-semibold text-ink">{FORMAT_LABEL[preview.result.format]}</span>{" "}
              export.
            </p>
            <ul className="mt-3 flex flex-col gap-1 text-sm text-ink-soft">
              <li>
                {preview.result.workouts.length} workouts · {preview.result.setCount} sets
              </li>
              {newExerciseCount > 0 && (
                <li>{newExerciseCount} new exercises will be created (set as “chest” — recategorise below)</li>
              )}
              {preview.result.skippedRows > 0 && (
                <li>{preview.result.skippedRows} unreadable rows skipped</li>
              )}
            </ul>
            {preview.result.ambiguousUnit && (
              <div className="mt-4">
                <div className="rp-eyebrow mb-1.5">WEIGHT UNIT</div>
                <p className="mb-2 text-[12px] text-ink-faint">
                  This export doesn’t record its unit — pick the one you trained in.
                </p>
                <div className="flex gap-2">
                  {(["kg", "lb"] as Unit[]).map((u) => (
                    <button
                      key={u}
                      onClick={() => setUnit(u)}
                      aria-pressed={unit === u}
                      className={[
                        "h-10 flex-1 rounded-lg text-sm font-semibold",
                        unit === u ? "bg-ink text-bg" : "border border-line bg-surface-2 text-ink-soft",
                      ].join(" ")}
                    >
                      {u}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setPreview(null)}
                disabled={busy}
                className="h-11 flex-1 rounded-xl border border-line text-sm font-semibold text-ink-soft disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={commit}
                disabled={busy}
                className="h-11 flex-1 rounded-xl bg-green text-sm font-bold text-on-green disabled:opacity-60"
              >
                {busy ? "Importing…" : "Import"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
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
      {error && <p className="text-xs text-danger-soft">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={status === "busy"}
          className="flex-1 rounded-lg bg-ember py-2 text-sm font-medium text-on-accent hover:bg-ember-soft disabled:opacity-60"
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
