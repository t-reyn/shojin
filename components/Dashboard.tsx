"use client";

import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { computeStreaks, dailyTotals, localDay } from "@/lib/stats";
import { convertWeight } from "@/lib/units";
import { useTodayKey } from "@/lib/useTodayKey";
import { StreakHeatmap } from "./StreakHeatmap";
import { BodyweightChart } from "./BodyweightChart";
import { MuscleRadar } from "./MuscleRadar";
import { estimateOneRepMax, round1 } from "@/lib/oneRepMax";
import { Eyebrow, Icon, Delta, Pill, WeekStrip, type WeekDay } from "./ShojinUI";
import { ShojinIcon, ShojinWordmark } from "./ShojinLogo";

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

function nameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "";
  const first = local.split(/[._-]/)[0] || local;
  return first ? first.charAt(0).toUpperCase() + first.slice(1) : "there";
}
function initials(email: string): string {
  const n = nameFromEmail(email);
  return n.slice(0, 2).toUpperCase();
}
function fmtK(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(1)}`;
  return `${Math.round(v)}`;
}

export function Dashboard({
  onStart,
  onContinue,
  onOpenProfile,
  userEmail,
}: {
  onStart: () => void;
  onContinue: () => void;
  onOpenProfile: () => void;
  userEmail: string;
}) {
  const workouts = useStore((s) => s.workouts);
  const exercises = useStore((s) => s.exercises);
  const profile = useStore((s) => s.profile);
  const draft = useStore((s) => s.draft);
  const unit = profile?.unit ?? "kg";
  const todayKeyTick = useTodayKey();

  const view = useMemo(() => {
    const now = new Date();
    const dateLabel = now
      .toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
      .replace(",", " ·")
      .toUpperCase();
    const hr = now.getHours();
    const greeting = hr < 12 ? "Morning" : hr < 18 ? "Afternoon" : "Evening";

    const totals = dailyTotals(workouts, unit);
    const days = new Set(totals.keys());
    const { current, longest } = computeStreaks(days);

    let total = 0;
    totals.forEach((t) => (total += t.count));

    const startOfDay = (d: Date) => {
      const x = new Date(d);
      x.setHours(0, 0, 0, 0);
      return x;
    };
    const today0 = startOfDay(now);
    const wkAgo = new Date(today0);
    wkAgo.setDate(wkAgo.getDate() - 6);
    const prevStart = new Date(today0);
    prevStart.setDate(prevStart.getDate() - 13);
    const wkKey = localDay(wkAgo);
    const prevKey = localDay(prevStart);

    let weekVol = 0;
    let prevVol = 0;
    let weekSessions = 0;
    totals.forEach((t, day) => {
      if (day >= wkKey) {
        weekVol += t.volume;
        weekSessions += t.count;
      } else if (day >= prevKey) {
        prevVol += t.volume;
      }
    });
    const deltaPct = prevVol > 0 ? Math.round(((weekVol - prevVol) / prevVol) * 100) : null;

    const dow = (today0.getDay() + 6) % 7; // 0 = Monday
    const monday = new Date(today0);
    monday.setDate(monday.getDate() - dow);
    const labels = ["M", "T", "W", "T", "F", "S", "S"];
    const todayKey = todayKeyTick;
    const weekDays: WeekDay[] = labels.map((l, i) => {
      const d = new Date(monday);
      d.setDate(d.getDate() + i);
      const key = localDay(d);
      return {
        l,
        label: String(d.getDate()),
        done: days.has(key) && d <= today0,
        today: key === todayKey,
      };
    });

    return { dateLabel, greeting, current, longest, total, weekVol, weekSessions, deltaPct, weekDays };
  }, [workouts, unit, todayKeyTick]);

  const big5Orm = useMemo(() => {
    return BIG5.map((name) => {
      const ex = exercises.find((e) => e.name === name);
      if (!ex) return { name, label: BIG5_LABELS[name], orm: null as number | null };
      let bestOrm = 0;
      for (const w of workouts) {
        for (const s of w.sets) {
          if (s.exercise_id === ex.id && !s.is_warmup && s.completed && s.reps > 0) {
            const weight = convertWeight(s.weight, s.unit ?? "kg", unit);
            const orm = estimateOneRepMax(weight, s.reps, "epley");
            if (orm > bestOrm) bestOrm = orm;
          }
        }
      }
      return { name, label: BIG5_LABELS[name], orm: bestOrm > 0 ? round1(bestOrm) : null };
    });
  }, [workouts, exercises, unit]);

  const Header = (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShojinIcon size={30} radius={9} shadow={false} />
          <ShojinWordmark size={20} color="var(--color-ink)" />
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-faint">(beta)</span>
        </div>
        <button
          onClick={onOpenProfile}
          aria-label="Open profile"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-green text-sm font-extrabold text-on-green transition-transform active:scale-95"
        >
          {initials(userEmail)}
        </button>
      </div>
      <div>
        <Eyebrow style={{ marginBottom: 7 }}>{view.dateLabel}</Eyebrow>
        <h1 className="text-[30px] font-extrabold leading-tight tracking-[-0.025em]">
          {view.greeting}, {nameFromEmail(userEmail)}
        </h1>
      </div>
    </div>
  );

  if (workouts.length === 0 && !draft) {
    return (
      <div className="flex flex-col gap-5">
        {Header}
        <div className="relative overflow-hidden rounded-[28px] bg-green px-5 pb-5 pt-5 text-on-green">
          <div className="pointer-events-none absolute -right-7 -top-7 opacity-[0.12]">
            <Icon name="dumbbell" size={150} color="var(--color-on-green)" />
          </div>
          <div className="rp-eyebrow mb-3" style={{ color: "var(--color-amber)" }}>
            WELCOME TO SHŌJIN
          </div>
          <div className="text-2xl font-extrabold tracking-[-0.02em]">Log your first lift</div>
          <p className="mt-1.5 max-w-xs text-[13px] text-on-green/75">
            Your streaks, PRs, and progress charts start filling in as soon as you train.
          </p>
          <button
            onClick={onStart}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-amber py-3.5 font-bold text-on-amber"
          >
            <Icon name="play" size={17} color="var(--color-on-amber)" />
            Start your first workout
          </button>
        </div>
      </div>
    );
  }

  const bestStreak = view.current > 0 && view.current >= view.longest;

  return (
    <div className="flex flex-col gap-4">
      {Header}

      {/* hero — start / continue training */}
      <div className="relative overflow-hidden rounded-[28px] bg-green px-5 pb-[18px] pt-5 text-on-green">
        <div className="pointer-events-none absolute -right-7 -top-7 opacity-[0.12]">
          <Icon name="dumbbell" size={150} color="var(--color-on-green)" />
        </div>
        <div className="rp-eyebrow mb-3" style={{ color: "var(--color-amber)" }}>
          {draft ? (draft.workoutId ? "EDITING" : "IN PROGRESS") : "READY TO LIFT"}
        </div>
        <div className="text-[27px] font-extrabold tracking-[-0.025em]">
          {draft ? draft.name : "Start training"}
        </div>
        <div className="mt-1.5 font-mono text-[12.5px] text-on-green/70">
          {draft
            ? `${draft.exercises.length} exercise${draft.exercises.length !== 1 ? "s" : ""} logged`
            : "Pick a template or build it as you go"}
        </div>
        <button
          onClick={draft ? onContinue : onStart}
          className="mt-[18px] flex w-full items-center justify-center gap-2 rounded-full bg-amber py-3.5 font-bold text-on-amber"
        >
          <Icon name="play" size={17} color="var(--color-on-amber)" />
          {draft ? (draft.workoutId ? "Continue editing" : "Continue workout") : "Start workout"}
        </button>
      </div>

      {/* stat duo */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-[28px] border border-line-2 bg-surface p-4 shadow-[var(--rp-shadow-sm)]">
          <Eyebrow>VOLUME · WK</Eyebrow>
          <div className="mt-2.5 flex items-baseline gap-1">
            <span className="text-[28px] font-extrabold leading-none tracking-[-0.03em]">
              {fmtK(view.weekVol)}
            </span>
            <span className="font-mono text-[13px] text-ink-faint">
              {view.weekVol >= 1000 ? `k ${unit}` : unit}
            </span>
          </div>
          <div className="mt-2.5">
            {view.deltaPct !== null ? (
              <Delta value={`${Math.abs(view.deltaPct)}%`} up={view.deltaPct >= 0} />
            ) : (
              <Pill tone="green">{view.weekSessions} sessions</Pill>
            )}
          </div>
        </div>
        <div className="rounded-[28px] border border-line-2 bg-surface p-4 shadow-[var(--rp-shadow-sm)]">
          <Eyebrow>STREAK</Eyebrow>
          <div className="mt-2.5 flex items-baseline gap-1.5">
            <span className="text-[28px] font-extrabold leading-none tracking-[-0.03em]">{view.current}</span>
            <span className="font-mono text-[13px] text-ink-faint">days</span>
          </div>
          <div className="mt-2.5">
            <Pill tone="amber">
              <Icon name="flame" size={12} sw={2} />
              {bestStreak ? "best yet" : `best ${view.longest}`}
            </Pill>
          </div>
        </div>
      </div>

      {/* week strip */}
      <div className="rounded-[28px] border border-line-2 bg-surface px-3.5 py-4 shadow-[var(--rp-shadow-sm)]">
        <WeekStrip days={view.weekDays} />
      </div>

      {/* big lifts */}
      {big5Orm.some(({ orm }) => orm !== null) && (
        <div>
          <Eyebrow className="mb-3 ml-0.5">ESTIMATED 1RM</Eyebrow>
          <div className="grid grid-cols-5 gap-2">
            {big5Orm.map(({ label, orm }) => (
              <div
                key={label}
                className="rounded-2xl border border-line-2 bg-surface p-3 text-center shadow-[var(--rp-shadow-sm)]"
              >
                <div className="rp-eyebrow" style={{ fontSize: 9 }}>{label}</div>
                <div className="mt-1.5 text-xl font-extrabold tracking-[-0.03em] text-green-ink">
                  {orm ?? "—"}
                </div>
                <div className="rp-eyebrow" style={{ fontSize: 8 }}>{orm ? unit : "—"}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <section className="rounded-[28px] border border-line-2 bg-surface p-4 shadow-[var(--rp-shadow-sm)]">
        <Eyebrow className="mb-2">BODYWEIGHT</Eyebrow>
        <BodyweightChart />
      </section>

      <section className="rounded-[28px] border border-line-2 bg-surface p-4 shadow-[var(--rp-shadow-sm)]">
        <Eyebrow className="mb-2">MUSCLE DISTRIBUTION</Eyebrow>
        <MuscleRadar />
      </section>

      <section className="rounded-[28px] border border-line-2 bg-surface p-4 shadow-[var(--rp-shadow-sm)]">
        <Eyebrow className="mb-3">ACTIVITY</Eyebrow>
        <StreakHeatmap />
      </section>
    </div>
  );
}
