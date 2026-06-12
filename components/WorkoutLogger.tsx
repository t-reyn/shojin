"use client";

import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { saveTemplate } from "@/lib/db";
import { MUSCLE_COLORS } from "@/lib/muscles";
import { confirmDialog, promptDialog } from "@/lib/dialog";
import { toast } from "@/lib/toast";
import {
  lastSessionSummary,
  prevHintsFor,
  recentSessionsFor,
  suggestNextLoad,
  type Suggestion,
} from "@/lib/progression";
import type { Readiness } from "@/lib/types";
import { ExerciseIcon } from "./ExerciseIcon";
import { ExercisePicker } from "./ExercisePicker";
import { SetRow } from "./SetRow";
import { Icon } from "./ShojinUI";

const SUGGESTION_CLASS: Record<Suggestion["kind"], string> = {
  increase: "bg-green-soft text-green-ink",
  hold: "border border-line bg-surface text-ink-soft",
  deload: "bg-amber/15 text-amber",
};

const SUGGESTION_TITLE: Record<Suggestion["kind"], string> = {
  increase: "Top sets at RPE ≤8 last time — add load. Tap to fill working sets.",
  hold: "RPE hit 9–10 last time — consolidate at this weight. Tap to fill working sets.",
  deload: "Reps dropped at this weight — back off ~5%. Tap to fill working sets.",
};

function suggestionLabel(s: Suggestion, unit: string): string {
  const arrow = s.kind === "increase" ? "↑" : s.kind === "deload" ? "↓" : "=";
  if (s.seconds != null) return `${arrow} ${s.seconds}s`;
  if (s.addReps) return `${arrow} ${s.reps} reps`;
  return `${arrow} ${s.weight} ${unit} × ${s.reps}`;
}

const READINESS_ROWS: { key: keyof Readiness; label: string; hint: string }[] = [
  { key: "sleep", label: "Sleep", hint: "poor → great" },
  { key: "energy", label: "Energy", hint: "drained → fresh" },
  { key: "soreness", label: "Soreness", hint: "none → very sore" },
];

function ReadinessCard({
  readiness,
  isEdit,
  onChange,
}: {
  readiness: Readiness;
  isEdit: boolean;
  onChange: (patch: Partial<Readiness>) => void;
}) {
  const answered = READINESS_ROWS.filter((r) => readiness[r.key] !== null);
  const [open, setOpen] = useState(() => !isEdit && answered.length === 0);

  return (
    <div className="rounded-[24px] border border-line-2 bg-surface p-4 shadow-[var(--rp-shadow-sm)]">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2"
        aria-expanded={open}
      >
        <span className="rp-eyebrow">Readiness check-in</span>
        {!open && answered.length > 0 && (
          <span className="font-mono text-xs text-ink-soft">
            {READINESS_ROWS.map((r) => readiness[r.key] ?? "–").join(" · ")}
          </span>
        )}
        <span
          className="ml-auto text-ink-faint transition-transform duration-150"
          style={{ display: "inline-block", transform: open ? "rotate(-90deg)" : "rotate(90deg)" }}
        >
          <Icon name="chevron" size={15} color="currentColor" />
        </span>
      </button>

      {open && (
        <div className="mt-3 flex flex-col gap-2.5">
          {READINESS_ROWS.map(({ key, label, hint }) => (
            <div key={key} className="flex items-center gap-2">
              <span className="w-[72px] shrink-0 text-[13px] font-semibold text-ink-soft" title={hint}>
                {label}
              </span>
              <div className="flex flex-1 gap-1.5">
                {[1, 2, 3, 4, 5].map((v) => {
                  const on = readiness[key] === v;
                  return (
                    <button
                      key={v}
                      onClick={() => onChange({ [key]: on ? null : v })}
                      aria-pressed={on}
                      aria-label={`${label} ${v} of 5`}
                      className={[
                        "h-9 flex-1 rounded-lg text-sm font-semibold transition-colors",
                        on
                          ? "bg-ink text-bg"
                          : "border border-line bg-surface-2 text-ink-faint hover:text-ink-soft",
                      ].join(" ")}
                    >
                      {v}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function WorkoutLogger({ onClose }: { onClose: () => void }) {
  const draft = useStore((s) => s.draft);
  const setName = useStore((s) => s.setDraftName);
  const setNotes = useStore((s) => s.setDraftNotes);
  const setReadiness = useStore((s) => s.setDraftReadiness);
  const addExercise = useStore((s) => s.addDraftExercise);
  const replaceExercise = useStore((s) => s.replaceDraftExercise);
  const removeExercise = useStore((s) => s.removeDraftExercise);
  const insertExercise = useStore((s) => s.insertDraftExercise);
  const addSet = useStore((s) => s.addDraftSet);
  const updateSet = useStore((s) => s.updateDraftSet);
  const workouts = useStore((s) => s.workouts);
  const toggleUnit = useStore((s) => s.toggleDraftExerciseUnit);
  const toggleLink = useStore((s) => s.toggleDraftExerciseLink);
  const setExerciseNotes = useStore((s) => s.setDraftExerciseNotes);
  const exerciseNotes = useStore((s) => s.exerciseNotes);
  const setPinnedNote = useStore((s) => s.setPinnedNote);
  const discard = useStore((s) => s.discardDraft);
  const finish = useStore((s) => s.finishWorkout);
  const exerciseById = useStore((s) => s.exerciseById);
  const profile = useStore((s) => s.profile);
  const refreshTemplates = useStore((s) => s.refreshTemplates);
  const restActive = useStore((s) => s.rest.endsAt !== null);

  const [picking, setPicking] = useState(false);
  const [swappingIdx, setSwappingIdx] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const unit = profile?.unit ?? "kg";

  if (!draft) return null;

  const elapsedSec = Math.floor((now - draft.startedAt) / 1000);
  const elapsedStr =
    elapsedSec < 3600
      ? `${Math.floor(elapsedSec / 60)}m ${String(elapsedSec % 60).padStart(2, "0")}s`
      : `${Math.floor(elapsedSec / 3600)}h ${Math.floor((elapsedSec % 3600) / 60)}m`;

  const completedSets = draft.exercises.reduce(
    (n, ex) => n + ex.sets.filter((s) => s.done).length,
    0,
  );

  async function saveAsTemplate() {
    if (!draft) return;
    const name = await promptDialog({
      title: "Save as template",
      placeholder: "Template name",
      defaultValue: draft.name,
      confirmLabel: "Save template",
    });
    if (!name) return;
    const sets = draft.exercises.flatMap((ex) =>
      ex.sets.map((s, idx) => ({
        exercise_id: ex.exerciseId,
        set_index: idx,
        weight: s.weight,
        reps: s.reps,
        rest_seconds: ex.restSeconds,
      })),
    );
    setSaving(true);
    try {
      await saveTemplate({ name, sets });
      await refreshTemplates();
      toast.success(`Saved “${name}” as a template.`);
    } catch {
      toast.error("Couldn't save template. Try again.");
    } finally {
      setSaving(false);
    }
  }

  function applySuggestion(exIdx: number, sugg: Suggestion, isDuration: boolean) {
    if (!draft) return;
    draft.exercises[exIdx].sets.forEach((s, i) => {
      if (s.setType !== "normal") return;
      if (isDuration) updateSet(exIdx, i, { seconds: sugg.seconds ?? 0 });
      else if (sugg.addReps) updateSet(exIdx, i, { reps: sugg.reps });
      else updateSet(exIdx, i, { weight: sugg.weight, reps: sugg.reps });
    });
  }

  async function editPinnedNote(exerciseId: string, exerciseName: string) {
    const next = await promptDialog({
      title: "Pinned note",
      message: `Shows on ${exerciseName} in every workout (setup cues, seat heights…). Clear the text to unpin.`,
      placeholder: "e.g. Seat height 4, narrow grip",
      defaultValue: exerciseNotes[exerciseId] ?? "",
      confirmLabel: "Save",
    });
    if (next === null) return;
    try {
      await setPinnedNote(exerciseId, next);
    } catch {
      toast.error("Couldn't save the pinned note.");
    }
  }

  async function removeExerciseWithUndo(exIdx: number) {
    if (!draft) return;
    const meta = exerciseById(draft.exercises[exIdx].exerciseId);
    const snapshot = draft.exercises[exIdx];
    const setCount = snapshot.sets.length;
    const ok = await confirmDialog({
      title: "Remove exercise?",
      message: `Remove ${meta?.name ?? "this exercise"}${
        setCount > 0 ? ` and its ${setCount} set${setCount !== 1 ? "s" : ""}` : ""
      } from this workout?`,
      confirmLabel: "Remove",
      cancelLabel: "Cancel",
      danger: true,
    });
    if (!ok) return;
    removeExercise(exIdx);
    toast.show(`Removed ${meta?.name ?? "exercise"}.`, {
      action: { label: "Undo", onClick: () => insertExercise(exIdx, snapshot) },
    });
  }

  async function onFinish() {
    if (!draft) return;
    const isEdit = !!draft.workoutId;
    if (completedSets === 0) {
      const ok = await confirmDialog({
        title: "Nothing logged yet",
        message: isEdit
          ? "No sets are marked complete. Discard your changes?"
          : "No sets are marked complete. Discard this workout?",
        confirmLabel: "Discard",
        cancelLabel: "Keep editing",
        danger: true,
      });
      if (!ok) return;
      discard();
      onClose();
      return;
    }
    setSaving(true);
    try {
      await finish();
      toast.success(isEdit ? "Workout updated." : "Workout saved.");
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Couldn't save — your sets are safe, nothing was lost. ${msg}`);
    } finally {
      setSaving(false);
    }
  }

  async function onDiscard() {
    if (!draft) return;
    const ok = await confirmDialog({
      title: draft.workoutId ? "Discard changes?" : "Discard workout?",
      message: draft.workoutId
        ? "Your edits to this workout won't be saved."
        : "This workout won't be saved.",
      confirmLabel: "Discard",
      cancelLabel: "Keep editing",
      danger: true,
    });
    if (!ok) return;
    discard();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-night">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-line-2 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button
          onClick={onClose}
          aria-label="Close workout"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-ink-soft hover:text-ink"
        >
          <Icon name="chevron" size={18} color="currentColor" style={{ transform: "rotate(90deg)" }} />
        </button>
        <input
          value={draft.name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Workout name"
          className="flex-1 bg-transparent text-lg font-bold tracking-[-0.015em] text-ink outline-none"
          placeholder="Workout name"
        />
        <span className="shrink-0 font-mono text-sm font-semibold tabular-nums text-amber">
          {elapsedStr}
        </span>
      </div>

      {/* Scrollable exercises */}
      <div className="flex-1 overflow-y-auto">
        <div className={`mx-auto flex max-w-3xl flex-col p-4 ${restActive ? "pb-32" : ""}`}>
          <ReadinessCard
            readiness={draft.readiness}
            isEdit={!!draft.workoutId}
            onChange={setReadiness}
          />

          {draft.exercises.map((ex, exIdx) => {
            const meta = exerciseById(ex.exerciseId);
            const exUnit = ex.unit ?? unit;
            const exType = meta?.exercise_type ?? "weight_reps";
            const isBodyweight = meta?.equipment === "bodyweight";
            const pinned = exerciseNotes[ex.exerciseId];
            const sessions =
              draft.workoutId || !meta ? [] : recentSessionsFor(workouts, ex.exerciseId);
            const suggestion =
              sessions.length && meta ? suggestNextLoad(meta, sessions, exUnit) : null;
            const lastSets = sessions[0] ?? [];
            const prevHints = prevHintsFor(lastSets, ex.sets.map((s) => s.setType), exUnit);
            const nextLinked = draft.exercises[exIdx + 1]?.linkedWithPrev ?? false;
            const inSuperset = ex.linkedWithPrev || nextLinked;
            return (
              <div key={`${ex.exerciseId}-${exIdx}`}>
                {/* Superset link toggle between adjacent cards */}
                {exIdx > 0 ? (
                  <div className="flex justify-center py-1.5">
                    <button
                      onClick={() => toggleLink(exIdx)}
                      aria-pressed={ex.linkedWithPrev}
                      title="Superset with the exercise above"
                      className={[
                        "flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide transition-colors",
                        ex.linkedWithPrev
                          ? "bg-amber/15 text-amber"
                          : "border border-line text-ink-faint hover:text-ink-soft",
                      ].join(" ")}
                    >
                      <Icon name="link" size={13} color="currentColor" />
                      {ex.linkedWithPrev ? "Superset" : "Link"}
                    </button>
                  </div>
                ) : (
                  <div className="pt-4" />
                )}

                <div
                  className={[
                    "rounded-[24px] border bg-surface p-4 shadow-[var(--rp-shadow-sm)]",
                    inSuperset ? "border-amber/50" : "border-line-2",
                  ].join(" ")}
                >
                  <div className="mb-2 flex items-center gap-3">
                    <span style={{ color: MUSCLE_COLORS[meta?.muscle_group ?? "core"] }}>
                      <ExerciseIcon name={meta?.name} pattern={meta?.movement_pattern ?? "other"} size={34} />
                    </span>
                    <button
                      onClick={() => setSwappingIdx(exIdx)}
                      className="flex-1 text-left text-lg font-bold tracking-[-0.015em] text-ink hover:text-green-ink"
                      title="Change exercise"
                    >
                      {meta?.name ?? "Exercise"}
                    </button>
                    <button
                      onClick={() => toggleUnit(exIdx)}
                      aria-label={`Toggle units (currently ${exUnit})`}
                      className="rounded border border-line px-1.5 py-0.5 text-xs text-ink-soft hover:text-ink"
                      title="Toggle kg / lb"
                    >
                      {exUnit}
                    </button>
                    <button
                      onClick={() => removeExerciseWithUndo(exIdx)}
                      aria-label={`Remove ${meta?.name ?? "exercise"}`}
                      title="Remove exercise"
                      className="flex h-9 w-9 items-center justify-center rounded-lg border border-line text-ink-faint hover:border-danger/50 hover:bg-surface-2 hover:text-danger-soft"
                    >
                      <Icon name="trash" size={17} color="currentColor" />
                    </button>
                  </div>

                  {pinned && (
                    <button
                      onClick={() => editPinnedNote(ex.exerciseId, meta?.name ?? "this exercise")}
                      className="mb-2 flex w-full items-start gap-1.5 rounded-lg bg-surface-2 px-2.5 py-1.5 text-left"
                      title="Edit pinned note"
                    >
                      <span className="mt-0.5 shrink-0 text-amber">
                        <Icon name="pin" size={13} color="currentColor" />
                      </span>
                      <span className="text-[13px] text-ink-soft">{pinned}</span>
                    </button>
                  )}

                  {suggestion && (
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate font-mono text-[11px] text-ink-faint">
                        Last {lastSessionSummary(lastSets, exUnit)}
                      </span>
                      <button
                        onClick={() => applySuggestion(exIdx, suggestion, exType === "duration")}
                        title={SUGGESTION_TITLE[suggestion.kind]}
                        aria-label={`Apply suggested load for ${meta?.name ?? "exercise"}`}
                        className={`shrink-0 rounded-full px-3 py-1 font-mono text-xs font-bold ${SUGGESTION_CLASS[suggestion.kind]}`}
                      >
                        {suggestionLabel(suggestion, exUnit)}
                      </button>
                    </div>
                  )}

                  <div className="mb-1 flex items-center gap-2 text-[10px] font-medium uppercase tracking-wide text-ink-faint">
                    <span className="w-6 text-center">#</span>
                    <span className="w-12 text-center">Type</span>
                    <span className="flex-1 text-center">
                      {isBodyweight ? `+ Weight (${exUnit})` : `Weight (${exUnit})`}
                    </span>
                    <span className="flex-1 text-center">{exType === "duration" ? "Time (s)" : "Reps"}</span>
                    <span className="w-14 text-center">RPE</span>
                    <span className="w-9 shrink-0" aria-hidden="true" />
                    <span className="w-7 shrink-0" aria-hidden="true" />
                  </div>

                  {ex.sets.map((set, setIdx) => (
                    <SetRow
                      key={setIdx}
                      exIdx={exIdx}
                      setIdx={setIdx}
                      set={set}
                      unit={exUnit}
                      exerciseType={exType}
                      isBodyweight={isBodyweight}
                      restSeconds={ex.restSeconds}
                      prev={prevHints[setIdx]}
                    />
                  ))}

                  <button
                    onClick={() => addSet(exIdx)}
                    className="mt-2 flex w-full items-center justify-center gap-1.5 border-t border-line-2 pt-3 text-sm font-semibold text-green-ink"
                  >
                    <Icon name="plus" size={16} color="currentColor" sw={2.2} />
                    Add set
                  </button>

                  <div className="mt-2 flex items-start gap-2 border-t border-line-2 pt-3">
                    <span className="mt-1.5 shrink-0 text-ink-faint">
                      <Icon name="edit" size={15} color="currentColor" />
                    </span>
                    <textarea
                      value={ex.notes ?? ""}
                      onChange={(e) => setExerciseNotes(exIdx, e.target.value)}
                      rows={1}
                      aria-label={`Notes for ${meta?.name ?? "exercise"}`}
                      placeholder="Add a note…"
                      className="min-h-[2rem] w-full resize-y bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint"
                    />
                    {!pinned && (
                      <button
                        onClick={() => editPinnedNote(ex.exerciseId, meta?.name ?? "this exercise")}
                        aria-label={`Pin a note for ${meta?.name ?? "exercise"}`}
                        title="Pin a note that shows every workout"
                        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-faint hover:text-amber"
                      >
                        <Icon name="pin" size={15} color="currentColor" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          <button
            onClick={() => setPicking(true)}
            className="mt-4 flex items-center justify-center gap-1.5 rounded-full border border-line bg-surface py-3 font-semibold text-ink-soft hover:text-ink"
          >
            <Icon name="plus" size={17} color="currentColor" sw={2.2} />
            Add exercise
          </button>

          {/* Workout comment — saved to workouts.notes */}
          <div className="mt-4 rounded-[24px] border border-line-2 bg-surface p-4 shadow-[var(--rp-shadow-sm)]">
            <span className="rp-eyebrow">Workout comment</span>
            <textarea
              value={draft.notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              aria-label="Workout comment"
              placeholder="How did it go? (optional)"
              className="mt-2 min-h-[2.5rem] w-full resize-y bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint"
            />
          </div>
        </div>
      </div>

      {/* Bottom action bar */}
      <div
        className="shrink-0 border-t border-line-2 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
        style={{ background: "color-mix(in srgb, var(--color-bg) 86%, transparent)", backdropFilter: "blur(16px)" }}
      >
        <div className="mx-auto flex max-w-3xl gap-2">
          <button
            onClick={onFinish}
            disabled={saving}
            className="flex-1 rounded-full bg-green py-3 font-bold text-on-green hover:opacity-95 disabled:opacity-60"
          >
            {saving
              ? "Saving…"
              : draft.workoutId
                ? `Save changes (${completedSets} sets)`
                : `Finish (${completedSets} sets)`}
          </button>
          {!draft.workoutId && (
            <button
              onClick={saveAsTemplate}
              disabled={saving || draft.exercises.length === 0}
              className="rounded-full border border-line bg-surface-2 px-3 py-3 text-sm text-ink-soft hover:text-ink disabled:opacity-50"
            >
              Template
            </button>
          )}
          <button
            onClick={onDiscard}
            className="rounded-full border border-line px-3 py-3 text-sm text-ink-faint hover:border-danger/50 hover:text-danger-soft"
          >
            Discard
          </button>
        </div>
      </div>

      {picking && (
        <ExercisePicker
          onPick={(id) => {
            addExercise(id);
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      )}

      {swappingIdx !== null && (
        <ExercisePicker
          onPick={(id) => {
            replaceExercise(swappingIdx, id);
            setSwappingIdx(null);
          }}
          onClose={() => setSwappingIdx(null)}
        />
      )}
    </div>
  );
}
