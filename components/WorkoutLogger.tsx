"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useStore, type DraftExercise } from "@/lib/store";
import { saveTemplate } from "@/lib/db";
import { MUSCLE_COLORS, MUSCLE_LABELS } from "@/lib/muscles";
import { confirmDialog, promptDialog } from "@/lib/dialog";
import { toast } from "@/lib/toast";
import {
  prevHintsFor,
  recentSessionsFor,
  suggestNextLoad,
  type PrevHint,
  type Suggestion,
} from "@/lib/progression";
import type { Exercise } from "@/lib/types";
import { ExerciseIcon } from "./ExerciseIcon";
import { ExercisePicker } from "./ExercisePicker";
import { KeypadSheet } from "./KeypadSheet";
import { RestDock } from "./RestDock";
import { SetRow, SET_GRID_COLS, effectiveValues, type ValueField } from "./SetRow";
import { Icon } from "./ShojinUI";

const SUGGESTION_CLASS: Record<Suggestion["kind"], string> = {
  increase: "bg-amber-soft text-amber-ink",
  hold: "border border-line bg-surface text-ink-soft",
  deload: "bg-amber-soft text-amber-ink",
};

const SUGGESTION_TITLE: Record<Suggestion["kind"], string> = {
  increase: "Top sets at RPE ≤8 last time — add load. Tap to fill working sets.",
  hold: "RPE hit 9–10 last time — consolidate at this weight. Tap to fill working sets.",
  deload: "Reps dropped at this weight — back off ~5%. Tap to fill working sets.",
};

function suggestionLabel(s: Suggestion, unit: string): string {
  const arrow = s.kind === "increase" ? "↑" : s.kind === "deload" ? "↓" : "=";
  if (s.seconds != null) return `${arrow} ${s.seconds}S`;
  if (s.addReps) return `${arrow} ${s.reps} REPS`;
  return `${arrow} ${s.weight} ${unit.toUpperCase()}`;
}

function fmtClock(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

function fmtRest(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

interface ExerciseView {
  ex: DraftExercise;
  meta: Exercise | undefined;
  exUnit: "kg" | "lb";
  isDuration: boolean;
  isBodyweight: boolean;
  suggestion: Suggestion | null;
  prevHints: (PrevHint | null)[];
  doneCount: number;
  activeSetIdx: number; // first undone set, -1 when complete
}

/** One-line summary under a collapsed exercise name. */
function collapsedMeta(v: ExerciseView): string {
  const { ex, doneCount, isDuration, exUnit } = v;
  const total = ex.sets.length;
  if (total > 0 && doneCount === total) {
    const done = ex.sets.filter((s) => s.done);
    if (isDuration) {
      const best = Math.max(...done.map((s) => s.seconds));
      return `${total} SETS · TOP ${best}s`;
    }
    const top = done.reduce((a, b) => (b.weight > a.weight ? b : a), done[0]);
    return `${total} SETS · TOP ${top.weight > 0 ? `${top.weight} × ${top.reps}` : `${top.reps} REPS`}`;
  }
  const progress = doneCount > 0 ? `${doneCount}/${total} SETS` : `${total} SETS`;
  const lastTop = v.prevHints.find((p) => p !== null);
  if (!lastTop) return progress;
  const last = isDuration
    ? `${lastTop.seconds}s`
    : lastTop.weight > 0
      ? `${lastTop.weight} ${exUnit.toUpperCase()}`
      : `${lastTop.reps} REPS`;
  return `${progress} · LAST ${last}`;
}

function SheetRow({
  label,
  detail,
  danger,
  icon,
  onTap,
}: {
  label: string;
  detail?: string;
  danger?: boolean;
  icon: ReactNode;
  onTap: () => void;
}) {
  return (
    <button
      onClick={onTap}
      className={[
        "flex w-full items-center gap-3 border-t border-line-2 px-1 py-3 text-left first:border-t-0",
        danger ? "text-danger-soft" : "text-ink",
      ].join(" ")}
    >
      <span className={danger ? "text-danger-soft" : "text-ink-soft"}>{icon}</span>
      <span className="flex-1 text-[15px] font-semibold tracking-[-0.01em]">{label}</span>
      {detail && (
        <span className="max-w-[40%] truncate font-mono text-[11px] uppercase text-ink-faint">{detail}</span>
      )}
    </button>
  );
}

export function WorkoutLogger({ onClose }: { onClose: () => void }) {
  const draft = useStore((s) => s.draft);
  const setName = useStore((s) => s.setDraftName);
  const setNotes = useStore((s) => s.setDraftNotes);
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
  const startRest = useStore((s) => s.startRest);
  const restDuration = useStore((s) => s.rest.duration);
  const restActive = useStore((s) => s.rest.endsAt !== null);

  const [expandedIdx, setExpandedIdx] = useState(() => {
    const d = useStore.getState().draft;
    const i = d?.exercises.findIndex((ex) => ex.sets.some((s) => !s.done)) ?? -1;
    return i >= 0 ? i : 0;
  });
  const [keypad, setKeypad] = useState<{ exIdx: number; setIdx: number; field: ValueField } | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const [swappingIdx, setSwappingIdx] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const scrollRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const [footerH, setFooterH] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Measure the sticky footer (log button or rest dock) so the scroll content
  // is padded by its real height — the dock + safe-area inset varies per device,
  // so a fixed pad value leaves the last card hidden behind it.
  useEffect(() => {
    const el = footerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setFooterH(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [keypad, restActive]);

  const unit = profile?.unit ?? "kg";

  if (!draft) return null;

  const views: ExerciseView[] = draft.exercises.map((ex) => {
    const meta = exerciseById(ex.exerciseId);
    const exUnit = ex.unit ?? unit;
    const sessions = draft.workoutId || !meta ? [] : recentSessionsFor(workouts, ex.exerciseId);
    return {
      ex,
      meta,
      exUnit,
      isDuration: meta?.exercise_type === "duration",
      isBodyweight: meta?.equipment === "bodyweight",
      suggestion: sessions.length && meta ? suggestNextLoad(meta, sessions, exUnit) : null,
      prevHints: prevHintsFor(sessions[0] ?? [], ex.sets.map((s) => s.setType), exUnit),
      doneCount: ex.sets.filter((s) => s.done).length,
      activeSetIdx: ex.sets.findIndex((s) => !s.done),
    };
  });

  const totalSets = views.reduce((n, v) => n + v.ex.sets.length, 0);
  const completedSets = views.reduce((n, v) => n + v.doneCount, 0);
  const expanded = views[expandedIdx] as ExerciseView | undefined;
  const activeSet =
    expanded && expanded.activeSetIdx >= 0
      ? { exIdx: expandedIdx, setIdx: expanded.activeSetIdx }
      : null;

  const elapsedStr = fmtClock(Math.max(0, Math.floor((now - draft.startedAt) / 1000)));

  function scrollToCard(idx: number) {
    requestAnimationFrame(() => {
      const container = scrollRef.current;
      const card = container?.querySelector<HTMLElement>(`[data-ex-card="${idx}"]`);
      if (!container || !card) return;
      const top =
        card.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop - 10;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      container.scrollTo({ top, behavior: reduce ? "auto" : "smooth" });
    });
  }

  function expandExercise(idx: number) {
    setExpandedIdx(idx);
    setKeypad(null);
    scrollToCard(idx);
  }

  // Keep the row being edited visible above the keypad sheet. Runs a beat
  // after setKeypad so the mounted sheet's real height can be measured.
  function scrollRowVisible(exIdx: number, setIdx: number) {
    setTimeout(() => {
      const container = scrollRef.current;
      const row = container?.querySelector<HTMLElement>(`[data-set-row="${exIdx}-${setIdx}"]`);
      if (!container || !row) return;
      // Height, not top — the slide-up animation translates the sheet, so its
      // top is mid-flight when this runs; its height is already final.
      const sheet = document.querySelector('[role="dialog"][aria-label^="Keypad"]');
      const sheetH = sheet ? sheet.getBoundingClientRect().height : 480;
      const limit = window.innerHeight - sheetH - 10;
      const containerTop = container.getBoundingClientRect().top;
      const r = row.getBoundingClientRect();
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (r.bottom > limit) {
        container.scrollBy({ top: r.bottom - limit, behavior: reduce ? "auto" : "smooth" });
      } else if (r.top < containerTop) {
        container.scrollBy({ top: r.top - containerTop - 10, behavior: reduce ? "auto" : "smooth" });
      }
    }, 60);
  }

  function openKeypad(exIdx: number, setIdx: number, field: ValueField) {
    setKeypad({ exIdx, setIdx, field });
    scrollRowVisible(exIdx, setIdx);
  }

  /** Commit a set with its effective (entered or ghost-prefilled) values. */
  function commitSet(exIdx: number, setIdx: number, viaKeypad: boolean) {
    if (!draft) return;
    const v = views[exIdx];
    const set = v.ex.sets[setIdx];
    const eff = effectiveValues(set, v.prevHints[setIdx]);
    updateSet(exIdx, setIdx, { ...eff, done: true });
    // Re-logging an already-done set (editing its values) shouldn't restart rest.
    if (!set.done && set.setType === "normal") startRest(v.ex.restSeconds ?? restDuration);

    const nextSetIdx = v.ex.sets.findIndex((s, i) => i !== setIdx && !s.done);
    if (nextSetIdx === -1) {
      // Exercise complete — collapse it and expand the next unfinished one,
      // preferring exercises below before wrapping back up.
      setKeypad(null);
      const incomplete = (i: number) => i !== exIdx && views[i].ex.sets.some((s) => !s.done);
      let nextEx = -1;
      for (let i = exIdx + 1; i < views.length; i++) if (incomplete(i)) { nextEx = i; break; }
      if (nextEx === -1) for (let i = 0; i < exIdx; i++) if (incomplete(i)) { nextEx = i; break; }
      if (nextEx >= 0) {
        setExpandedIdx(nextEx);
        scrollToCard(nextEx);
      }
    } else if (viaKeypad) {
      setKeypad({ exIdx, setIdx: nextSetIdx, field: "weight" });
      scrollRowVisible(exIdx, nextSetIdx);
    }
  }

  function toggleDone(exIdx: number, setIdx: number) {
    if (!draft) return;
    const set = draft.exercises[exIdx].sets[setIdx];
    if (set.done) updateSet(exIdx, setIdx, { done: false });
    else commitSet(exIdx, setIdx, false);
  }

  async function renameWorkout() {
    if (!draft) return;
    const name = await promptDialog({
      title: "Rename workout",
      defaultValue: draft.name,
      confirmLabel: "Rename",
    });
    if (name) setName(name);
  }

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
      if (s.setType !== "normal" || s.done) return;
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

  async function editSessionNote(exIdx: number, exerciseName: string) {
    if (!draft) return;
    const next = await promptDialog({
      title: "Session note",
      message: `Saved with today's ${exerciseName} sets.`,
      placeholder: "e.g. Felt heavy, slow eccentric",
      defaultValue: draft.exercises[exIdx]?.notes ?? "",
      confirmLabel: "Save",
    });
    if (next !== null) setExerciseNotes(exIdx, next);
  }

  async function editWorkoutComment() {
    if (!draft) return;
    const next = await promptDialog({
      title: "Workout comment",
      message: "How did it go? Shows in History.",
      placeholder: "(optional)",
      defaultValue: draft.notes,
      confirmLabel: "Save",
    });
    if (next !== null) setNotes(next);
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
    setKeypad(null);
    if (expandedIdx >= draft.exercises.length - 1) setExpandedIdx(Math.max(0, expandedIdx - 1));
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

  // Footer "Log set 3 — 62.5 kg × 8" + rest-dock "NEXT · SET 4 — 62.5 × 8".
  let activeSummary: { n: string; what: string } | null = null;
  if (activeSet && expanded) {
    const set = expanded.ex.sets[activeSet.setIdx];
    const eff = effectiveValues(set, expanded.prevHints[activeSet.setIdx]);
    const what = expanded.isDuration
      ? `${eff.seconds}s`
      : eff.weight > 0 || expanded.isBodyweight
        ? `${expanded.isBodyweight ? "+" : ""}${eff.weight} ${expanded.exUnit} × ${eff.reps}`
        : `${eff.reps} reps`;
    activeSummary = { n: set.setType === "warmup" ? "W" : `${activeSet.setIdx + 1}`, what };
  }

  const keypadView = keypad ? views[keypad.exIdx] : null;
  const keypadSet = keypad && keypadView ? keypadView.ex.sets[keypad.setIdx] : null;

  // When the expanded exercise is finished but others aren't, offer the jump
  // instead of a misleading Finish.
  const nextIncompleteIdx = activeSummary ? -1 : views.findIndex((v) => v.activeSetIdx >= 0);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-night">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button
          onClick={onClose}
          aria-label="Close workout"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-ink-soft hover:text-ink"
        >
          <Icon name="chevron" size={18} color="currentColor" style={{ transform: "rotate(180deg)" }} />
        </button>
        <button onClick={renameWorkout} className="min-w-0 flex-1 text-left" title="Tap to rename">
          <div className="truncate text-[17px] font-bold tracking-[-0.015em] text-ink">{draft.name}</div>
          <div className="mt-px font-mono text-[11.5px] text-ink-faint">
            <span className="font-semibold text-amber">{elapsedStr}</span> · {completedSets}/{totalSets} SETS
          </div>
        </button>
        <button
          onClick={onFinish}
          disabled={saving}
          className="shrink-0 rounded-full bg-green px-[18px] py-2.5 text-sm font-bold text-on-green disabled:opacity-60"
        >
          {saving ? "Saving…" : draft.workoutId ? "Save" : "Finish"}
        </button>
      </div>

      {/* Per-set progress */}
      {totalSets > 0 && (
        <div className="flex shrink-0 gap-[3px] px-4 pb-3">
          {views.flatMap((v, exIdx) =>
            v.ex.sets.map((s, setIdx) => {
              const cur = activeSet && activeSet.exIdx === exIdx && activeSet.setIdx === setIdx;
              return (
                <div
                  key={`${exIdx}-${setIdx}`}
                  className={[
                    "h-1 flex-1 rounded-full",
                    s.done ? "bg-green" : cur ? "bg-amber" : "bg-line",
                  ].join(" ")}
                />
              );
            }),
          )}
        </div>
      )}

      {/* Exercise list */}
      <div ref={scrollRef} className="relative flex-1 overflow-y-auto">
        <div
          className="mx-auto flex max-w-3xl flex-col gap-2 px-4 pt-1"
          style={{ paddingBottom: keypad ? 460 : footerH + 20 }}
        >
          {views.map((v, exIdx) => {
            const { ex, meta } = v;
            const color = MUSCLE_COLORS[meta?.muscle_group ?? "core"];
            const pinned = exerciseNotes[ex.exerciseId];
            const isExpanded = exIdx === expandedIdx;
            const complete = ex.sets.length > 0 && v.doneCount === ex.sets.length;
            const inSuperset = ex.linkedWithPrev || (draft.exercises[exIdx + 1]?.linkedWithPrev ?? false);

            if (!isExpanded) {
              return (
                <button
                  key={`${ex.exerciseId}-${exIdx}`}
                  data-ex-card={exIdx}
                  onClick={() => expandExercise(exIdx)}
                  className={[
                    "flex items-center gap-3 rounded-[20px] border bg-surface px-3.5 py-2.5 text-left shadow-[var(--rp-shadow-sm)]",
                    inSuperset ? "border-amber/40" : "border-line-2",
                  ].join(" ")}
                >
                  <span style={{ color }}>
                    <ExerciseIcon name={meta?.name} pattern={meta?.movement_pattern ?? "other"} size={30} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-bold tracking-[-0.01em] text-ink">
                      {meta?.name ?? "Exercise"}
                    </span>
                    <span className="mt-px block font-mono text-[10.5px] uppercase text-ink-faint">
                      {collapsedMeta(v)}
                    </span>
                  </span>
                  {complete ? (
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green">
                      <Icon name="check" size={13} color="var(--color-on-green)" sw={2.6} />
                    </span>
                  ) : (
                    <span className="shrink-0 text-ink-faint">
                      <Icon name="chevron" size={16} color="currentColor" style={{ transform: "rotate(90deg)" }} />
                    </span>
                  )}
                </button>
              );
            }

            return (
              <div
                key={`${ex.exerciseId}-${exIdx}`}
                data-ex-card={exIdx}
                className={[
                  "rounded-[24px] border bg-surface px-3.5 pb-1.5 pt-4 shadow-[var(--rp-shadow-sm)]",
                  inSuperset ? "border-amber/40" : "border-line-2",
                ].join(" ")}
              >
                <div className="mb-1 flex items-center gap-3">
                  <span style={{ color }}>
                    <ExerciseIcon name={meta?.name} pattern={meta?.movement_pattern ?? "other"} size={38} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[21px] font-bold tracking-[-0.02em] text-ink">
                      {meta?.name ?? "Exercise"}
                    </div>
                    <div className="mt-0.5 truncate whitespace-nowrap font-mono text-[11px] uppercase text-ink-faint">
                      {[
                        meta?.equipment,
                        meta ? MUSCLE_LABELS[meta.muscle_group] : null,
                        ex.sets.length > 0 ? `TARGET ${ex.sets.length} × ${effectiveValues(ex.sets[0], v.prevHints[0]).reps || "?"}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </div>
                  {v.suggestion && (
                    <button
                      onClick={() => applySuggestion(exIdx, v.suggestion!, v.isDuration)}
                      title={SUGGESTION_TITLE[v.suggestion.kind]}
                      aria-label={`Apply suggested load for ${meta?.name ?? "exercise"}`}
                      className={`shrink-0 rounded-full px-2.5 py-1.5 font-mono text-[11px] font-semibold ${SUGGESTION_CLASS[v.suggestion.kind]}`}
                    >
                      {suggestionLabel(v.suggestion, v.exUnit)}
                    </button>
                  )}
                </div>

                {pinned && (
                  <button
                    onClick={() => editPinnedNote(ex.exerciseId, meta?.name ?? "this exercise")}
                    className="flex w-full items-center gap-1.5 px-1 pb-2 pt-1 text-left"
                    title="Edit pinned note"
                  >
                    <span className="shrink-0 text-amber">
                      <Icon name="pin" size={13} color="currentColor" />
                    </span>
                    <span className="truncate text-[12.5px] text-ink-soft">{pinned}</span>
                  </button>
                )}

                <div
                  className="grid items-center gap-2 px-1 pb-1.5"
                  style={{ gridTemplateColumns: SET_GRID_COLS }}
                >
                  {["SET", "PREVIOUS", v.isBodyweight ? `+${v.exUnit}` : v.exUnit, v.isDuration ? "SEC" : "REPS", ""].map((h, i) => (
                    <span key={i} className="rp-eyebrow" style={{ fontSize: 9.5, textAlign: i >= 2 ? "center" : "left" }}>
                      {h}
                    </span>
                  ))}
                </div>

                {ex.sets.map((set, setIdx) => (
                  <SetRow
                    key={setIdx}
                    exIdx={exIdx}
                    setIdx={setIdx}
                    set={set}
                    unit={v.exUnit}
                    exerciseType={v.isDuration ? "duration" : "weight_reps"}
                    isBodyweight={v.isBodyweight}
                    prev={v.prevHints[setIdx]}
                    active={setIdx === v.activeSetIdx}
                    focusField={
                      keypad && keypad.exIdx === exIdx && keypad.setIdx === setIdx ? keypad.field : null
                    }
                    onTapValue={(field) => openKeypad(exIdx, setIdx, field)}
                    onToggleDone={() => toggleDone(exIdx, setIdx)}
                  />
                ))}

                <div className="mt-1.5 flex items-center justify-between border-t border-line-2 px-1 py-2.5">
                  <button
                    onClick={() => addSet(exIdx)}
                    className="flex items-center gap-1.5 text-[14px] font-semibold text-green-ink"
                  >
                    <Icon name="plus" size={16} color="currentColor" sw={2.2} />
                    Add set
                  </button>
                  <span className="flex items-center gap-1.5 font-mono text-[11.5px] uppercase text-ink-faint">
                    <Icon name="timer" size={14} color="currentColor" />
                    REST {fmtRest(ex.restSeconds ?? restDuration)}
                  </span>
                </div>
              </div>
            );
          })}

          <button
            onClick={() => setPicking(true)}
            className="flex items-center justify-center gap-1.5 rounded-[20px] border border-dashed border-line py-3 font-semibold text-ink-soft hover:text-ink"
          >
            <Icon name="plus" size={17} color="currentColor" sw={2.2} />
            Add exercise
          </button>
        </div>
      </div>

      {/* Sticky footer: log action / rest dock (keypad overlays both) */}
      {!keypad && (
        <div
          ref={footerRef}
          className={[
            "fixed inset-x-0 bottom-0 mx-auto w-full max-w-3xl px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3",
            restActive ? "" : "border-t border-line-2",
          ].join(" ")}
          style={{
            background: "color-mix(in srgb, var(--color-bg) 86%, transparent)",
            backdropFilter: "blur(16px)",
          }}
        >
          {restActive && (
            <div className="mb-2.5">
              <RestDock nextHint={activeSummary ? `NEXT · SET ${activeSummary.n} — ${activeSummary.what}` : null} />
            </div>
          )}
          <div className="flex items-center gap-2.5">
            {activeSummary && activeSet ? (
              <button
                onClick={() => commitSet(activeSet.exIdx, activeSet.setIdx, false)}
                className="flex h-[50px] flex-1 items-center justify-center gap-2 rounded-full bg-amber text-[15.5px] font-bold text-on-amber"
              >
                <Icon name="check" size={17} color="currentColor" sw={2.6} />
                Log set {activeSummary.n} — {activeSummary.what}
              </button>
            ) : nextIncompleteIdx >= 0 ? (
              <button
                onClick={() => expandExercise(nextIncompleteIdx)}
                className="flex h-[50px] flex-1 items-center justify-center gap-2 rounded-full bg-green text-[15.5px] font-bold text-on-green"
              >
                Next: {views[nextIncompleteIdx].meta?.name ?? "exercise"}
                <Icon name="chevron" size={16} color="currentColor" />
              </button>
            ) : (
              <button
                onClick={onFinish}
                disabled={saving}
                className="flex h-[50px] flex-1 items-center justify-center gap-2 rounded-full bg-green text-[15.5px] font-bold text-on-green disabled:opacity-60"
              >
                {saving ? "Saving…" : draft.workoutId ? `Save changes (${completedSets} sets)` : `Finish (${completedSets} sets)`}
              </button>
            )}
            <button
              onClick={() => setActionsOpen(true)}
              aria-label="Workout actions"
              className="flex h-[50px] w-[50px] shrink-0 items-center justify-center rounded-full border border-line bg-surface text-ink-soft"
            >
              <Icon name="dots" size={18} color="currentColor" />
            </button>
          </div>
        </div>
      )}

      {/* Keypad sheet */}
      {keypad && keypadView && keypadSet && (
        <KeypadSheet
          setKey={`${keypad.exIdx}:${keypad.setIdx}`}
          exerciseName={keypadView.meta?.name ?? "Exercise"}
          setNumber={keypad.setIdx + 1}
          totalSets={keypadView.ex.sets.length}
          prev={keypadView.prevHints[keypad.setIdx]}
          field={keypad.field}
          values={effectiveValues(keypadSet, keypadView.prevHints[keypad.setIdx])}
          rpe={keypadSet.rpe}
          unit={keypadView.exUnit}
          isBodyweight={keypadView.isBodyweight}
          isDuration={keypadView.isDuration}
          equipment={keypadView.meta?.equipment ?? "other"}
          onField={(field) => setKeypad({ ...keypad, field })}
          onInput={(field, value) => updateSet(keypad.exIdx, keypad.setIdx, { [field]: value })}
          onRpe={(rpe) => updateSet(keypad.exIdx, keypad.setIdx, { rpe })}
          onLog={() => commitSet(keypad.exIdx, keypad.setIdx, true)}
          onClose={() => setKeypad(null)}
        />
      )}

      {/* ⋯ actions sheet */}
      {actionsOpen && (
        <div className="fixed inset-0 z-20 flex items-end" onClick={() => setActionsOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="sheet-up relative mx-auto w-full max-w-3xl rounded-t-[28px] bg-bg px-5 pb-[max(1.75rem,env(safe-area-inset-bottom))] pt-2.5"
            style={{ boxShadow: "0 -12px 40px rgba(43,39,37,0.25)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1 w-[38px] rounded-full bg-line" />
            {expanded && (
              <>
                <div className="rp-eyebrow mb-1 px-1">{expanded.meta?.name ?? "Exercise"}</div>
                <SheetRow
                  label="Change exercise"
                  icon={<Icon name="edit" size={17} color="currentColor" />}
                  onTap={() => {
                    setActionsOpen(false);
                    setSwappingIdx(expandedIdx);
                  }}
                />
                {expandedIdx > 0 && (
                  <SheetRow
                    label={expanded.ex.linkedWithPrev ? "Unlink superset" : "Superset with previous"}
                    icon={<Icon name="link" size={17} color="currentColor" />}
                    detail={expanded.ex.linkedWithPrev ? "LINKED" : undefined}
                    onTap={() => {
                      toggleLink(expandedIdx);
                      setActionsOpen(false);
                    }}
                  />
                )}
                <SheetRow
                  label="Switch units"
                  detail={expanded.exUnit.toUpperCase()}
                  icon={<Icon name="filter" size={17} color="currentColor" />}
                  onTap={() => toggleUnit(expandedIdx)}
                />
                <SheetRow
                  label="Pinned note"
                  detail={exerciseNotes[expanded.ex.exerciseId] ? "SET" : undefined}
                  icon={<Icon name="pin" size={17} color="currentColor" />}
                  onTap={() => {
                    setActionsOpen(false);
                    editPinnedNote(expanded.ex.exerciseId, expanded.meta?.name ?? "this exercise");
                  }}
                />
                <SheetRow
                  label="Session note"
                  detail={expanded.ex.notes ? "SET" : undefined}
                  icon={<Icon name="edit" size={17} color="currentColor" />}
                  onTap={() => {
                    setActionsOpen(false);
                    editSessionNote(expandedIdx, expanded.meta?.name ?? "this exercise");
                  }}
                />
                <SheetRow
                  label="Remove exercise"
                  danger
                  icon={<Icon name="trash" size={17} color="currentColor" />}
                  onTap={() => {
                    setActionsOpen(false);
                    removeExerciseWithUndo(expandedIdx);
                  }}
                />
                <div className="my-2 h-px bg-line" />
              </>
            )}
            <div className="rp-eyebrow mb-1 px-1">Workout</div>
            <SheetRow
              label="Workout comment"
              detail={draft.notes ? "SET" : undefined}
              icon={<Icon name="edit" size={17} color="currentColor" />}
              onTap={() => {
                setActionsOpen(false);
                editWorkoutComment();
              }}
            />
            {!draft.workoutId && (
              <SheetRow
                label="Save as template"
                icon={<Icon name="target" size={17} color="currentColor" />}
                onTap={() => {
                  setActionsOpen(false);
                  saveAsTemplate();
                }}
              />
            )}
            <SheetRow
              label={draft.workoutId ? "Discard changes" : "Discard workout"}
              danger
              icon={<Icon name="trash" size={17} color="currentColor" />}
              onTap={() => {
                setActionsOpen(false);
                onDiscard();
              }}
            />
          </div>
        </div>
      )}

      {picking && (
        <ExercisePicker
          onPick={(id) => {
            addExercise(id);
            setPicking(false);
            const idx = draft.exercises.length; // appended at the end
            setExpandedIdx(idx);
            setKeypad(null);
            scrollToCard(idx);
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
