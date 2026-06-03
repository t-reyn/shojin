"use client";

import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { computeStreaks, dailyTotals, localDay } from "@/lib/stats";
import { StreakHeatmap } from "./StreakHeatmap";
import { BodyweightChart } from "./BodyweightChart";
import { MuscleRadar } from "./MuscleRadar";
import { estimateOneRepMax, round1 } from "@/lib/oneRepMax";

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-line bg-surface/70 p-3">
      <div className="text-xs text-ink-faint">{label}</div>
      <div className={accent ? "text-2xl font-bold text-ember" : "text-2xl font-bold"}>
        {value}
      </div>
    </div>
  );
}

const BIG5 = [
  "Back Squat",
  "Bench Press (Barbell)",
  "Deadlift",
  "Overhead Press (Barbell)",
  "Barbell Row",
] as const;
const BIG5_LABELS: Record<string, string> = {
  "Back Squat": "Squat",
  "Bench Press (Barbell)": "Bench",
  "Deadlift": "Deadlift",
  "Overhead Press (Barbell)": "OHP",
  "Barbell Row": "Row",
};

export function Dashboard({ onStart }: { onStart: () => void }) {
  const workouts = useStore((s) => s.workouts);
  const exercises = useStore((s) => s.exercises);
  const profile = useStore((s) => s.profile);
  const unit = profile?.unit ?? "kg";

  const { current, longest, total, thisWeek } = useMemo(() => {
    const totals = dailyTotals(workouts);
    const days = new Set(totals.keys());
    const { current, longest } = computeStreaks(days);
    let total = 0;
    totals.forEach((t) => (total += t.count));

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 6);
    weekAgo.setHours(0, 0, 0, 0);
    const wk = localDay(weekAgo);
    let thisWeek = 0;
    totals.forEach((t, day) => {
      if (day >= wk) thisWeek += t.count;
    });
    return { current, longest, total, thisWeek };
  }, [workouts]);

  const big4Orm = useMemo(() => {
    return BIG5.map((name) => {
      const ex = exercises.find((e) => e.name === name);
      if (!ex) return { name, label: BIG5_LABELS[name], orm: null };
      let bestOrm = 0;
      for (const w of workouts) {
        for (const s of w.sets) {
          if (s.exercise_id === ex.id && !s.is_warmup && s.completed && s.reps > 0) {
            const orm = estimateOneRepMax(s.weight, s.reps, "epley");
            if (orm > bestOrm) bestOrm = orm;
          }
        }
      }
      return { name, label: BIG5_LABELS[name], orm: bestOrm > 0 ? round1(bestOrm) : null };
    });
  }, [workouts, exercises]);

  if (workouts.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-xl border border-line bg-surface/70 p-8 text-center">
        <h2 className="text-lg font-semibold text-ink">Welcome to IronLog</h2>
        <p className="max-w-xs text-sm text-ink-soft">
          Log your first workout and your streaks, lifts, and progress charts will start filling in here.
        </p>
        <button
          onClick={onStart}
          className="rounded-xl bg-ember px-5 py-3 font-semibold text-night hover:bg-ember-soft"
        >
          Start your first workout
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Current streak" value={`${current}d`} accent />
        <Stat label="Longest streak" value={`${longest}d`} />
        <Stat label="Last 7 days" value={`${thisWeek}`} />
        <Stat label="Total sessions" value={`${total}`} />
      </div>

      {big4Orm.some(({ orm }) => orm !== null) && (
        <div className="grid grid-cols-5 gap-2">
          {big4Orm.map(({ label, orm }) => (
            <div key={label} className="rounded-xl border border-line bg-surface/70 p-3 text-center">
              <div className="text-xs text-ink-faint">{label}</div>
              <div className="text-2xl font-bold text-ember">{orm ?? "—"}</div>
              <div className="text-xs text-ink-faint">{orm ? unit : "no data"}</div>
            </div>
          ))}
        </div>
      )}

      <section className="rounded-xl border border-line bg-surface/70 p-4">
        <h2 className="mb-3 text-sm font-medium text-ink-soft">Activity</h2>
        <StreakHeatmap />
      </section>

      <section className="rounded-xl border border-line bg-surface/70 p-4">
        <h2 className="mb-1 text-sm font-medium text-ink-soft">Bodyweight</h2>
        <BodyweightChart />
      </section>

      <section className="rounded-xl border border-line bg-surface/70 p-4">
        <h2 className="mb-1 text-sm font-medium text-ink-soft">Muscle distribution</h2>
        <MuscleRadar />
      </section>
    </div>
  );
}
