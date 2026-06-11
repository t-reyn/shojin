"use client";

import { useMemo, useState } from "react";
import {
  Area,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useStore } from "@/lib/store";
import { blendedOneRepMax, estimateOneRepMax, round1 } from "@/lib/oneRepMax";
import { localDay } from "@/lib/stats";
import { convertWeight } from "@/lib/units";
import { volumeByMuscle, MUSCLE_LABELS } from "@/lib/muscles";
import type { MuscleGroup } from "@/lib/types";
import { Eyebrow, Delta, Pill } from "./ShojinUI";

// Exact lifts only — no variants (e.g. not "Iso-Lateral … Bench Press").
const PR_LIFTS: { label: string; names: string[] }[] = [
  { label: "Bench", names: ["Bench Press (Barbell)"] },
  { label: "Squat", names: ["Back Squat"] },
  { label: "Deadlift", names: ["Deadlift", "Sumo Deadlift"] },
];

type Metric = "e1rm" | "top" | "volume";

const METRICS: { id: Metric; label: string }[] = [
  { id: "e1rm", label: "Est. 1RM" },
  { id: "top", label: "Top set" },
  { id: "volume", label: "Volume" },
];

export function Progress() {
  const workouts = useStore((s) => s.workouts);
  const exercises = useStore((s) => s.exercises);
  const unit = useStore((s) => s.profile?.unit ?? "kg");

  const logged = useMemo(() => {
    const ids = new Set<string>();
    workouts.forEach((w) => w.sets.forEach((s) => ids.add(s.exercise_id)));
    return exercises
      .filter((e) => ids.has(e.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [workouts, exercises]);

  const [exerciseId, setExerciseId] = useState<string>("");
  const [metric, setMetric] = useState<Metric>("e1rm");

  const selected = exerciseId || logged[0]?.id || "";
  const selectedName = logged.find((e) => e.id === selected)?.name ?? "";

  const data = useMemo(() => {
    if (!selected) return [];
    const points: { date: string; value: number }[] = [];
    const asc = [...workouts].sort(
      (a, b) =>
        new Date(a.performed_at).getTime() - new Date(b.performed_at).getTime(),
    );
    for (const w of asc) {
      const sets = w.sets
        .filter((s) => s.exercise_id === selected && !s.is_warmup)
        .map((s) => ({ ...s, weight: convertWeight(s.weight, s.unit ?? "kg", unit) }));
      if (!sets.length) continue;
      let value = 0;
      if (metric === "e1rm") {
        value = Math.max(...sets.map((s) => blendedOneRepMax(s.weight, s.reps)));
      } else if (metric === "top") {
        value = Math.max(...sets.map((s) => s.weight));
      } else {
        value = sets.reduce((sum, s) => sum + s.weight * s.reps, 0);
      }
      points.push({ date: localDay(new Date(w.performed_at)), value: round1(value) });
    }
    return points;
  }, [workouts, selected, metric, unit]);

  const exerciseById = useStore((s) => s.exerciseById);

  const muscleSplit = useMemo(() => {
    const totals = volumeByMuscle(workouts, (id) => exerciseById(id)?.muscle_group, unit);
    const entries = (Object.keys(totals) as MuscleGroup[])
      .map((mg) => ({ mg, vol: totals[mg] }))
      .filter((e) => e.vol > 0)
      .sort((a, b) => b.vol - a.vol);
    const sum = entries.reduce((s, e) => s + e.vol, 0) || 1;
    const max = entries[0]?.vol || 1;
    return entries.map((e, i) => ({
      mg: e.mg,
      label: MUSCLE_LABELS[e.mg],
      pct: Math.round((e.vol / sum) * 100),
      barW: Math.round((e.vol / max) * 100),
      top: i === 0,
    }));
  }, [workouts, exerciseById, unit]);

  const prs = useMemo(() => {
    return PR_LIFTS.map(({ label, names }) => {
      const ids = new Set(exercises.filter((e) => names.includes(e.name)).map((e) => e.id));
      let best = 0;
      if (ids.size > 0) {
        for (const w of workouts) {
          for (const s of w.sets) {
            if (!ids.has(s.exercise_id) || s.is_warmup || !s.completed || s.reps <= 0) continue;
            const weight = convertWeight(s.weight, s.unit ?? "kg", unit);
            const orm = estimateOneRepMax(weight, s.reps, "epley");
            if (orm > best) best = orm;
          }
        }
      }
      return { label, value: best > 0 ? round1(best) : null };
    });
  }, [workouts, exercises, unit]);

  if (logged.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-[32px] font-extrabold tracking-[-0.025em]">Progress</h1>
        <div className="rounded-[28px] border border-line-2 bg-surface p-10 text-center text-ink-soft shadow-[var(--rp-shadow-sm)]">
          Log a few workouts and your progress charts will appear here.
        </div>
      </div>
    );
  }

  const unitLabel = metric === "volume" ? `${unit}·reps` : unit;
  const latest = data.length ? data[data.length - 1].value : 0;
  const first = data.length ? data[0].value : 0;
  const diff = round1(latest - first);
  const metricLabel = METRICS.find((m) => m.id === metric)?.label ?? "";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-[32px] font-extrabold tracking-[-0.025em]">Progress</h1>
        <Pill tone="green">{data.length} POINTS</Pill>
      </div>

      {/* exercise selector */}
      <select
        value={selected}
        onChange={(e) => setExerciseId(e.target.value)}
        aria-label="Exercise"
        className="rounded-full border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-ink outline-none focus:border-green-ink"
      >
        {logged.map((e) => (
          <option key={e.id} value={e.id}>
            {e.name}
          </option>
        ))}
      </select>

      {/* metric chips */}
      <div className="flex gap-2">
        {METRICS.map((m) => {
          const on = metric === m.id;
          return (
            <button
              key={m.id}
              onClick={() => setMetric(m.id)}
              className={[
                "rounded-full px-4 py-2 text-[13px] font-semibold tracking-[-0.01em] transition-colors",
                on ? "border border-ink bg-ink text-bg" : "border border-line bg-surface text-ink-soft",
              ].join(" ")}
            >
              {m.label}
            </button>
          );
        })}
      </div>

      {/* hero chart card */}
      <div className="rounded-[28px] border border-line-2 bg-surface p-[18px] shadow-[var(--rp-shadow-sm)]">
        <Eyebrow>{selectedName ? `${selectedName.toUpperCase()} · ${metricLabel.toUpperCase()}` : metricLabel.toUpperCase()}</Eyebrow>
        <div className="mt-2 flex items-baseline gap-2.5">
          <span className="text-[36px] font-extrabold leading-none tracking-[-0.03em]">{latest}</span>
          <span className="font-mono text-[15px] text-ink-faint">{unitLabel}</span>
          {data.length > 1 && diff !== 0 && (
            <span className="ml-auto">
              <Delta value={`${Math.abs(diff)}${metric === "volume" ? "" : unit}`} up={diff >= 0} />
            </span>
          )}
        </div>

        <div className="mt-3.5 h-[150px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 6, bottom: 0, left: -18 }}>
              <defs>
                <linearGradient id="rpArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="var(--color-green)" stopOpacity={0.22} />
                  <stop offset="1" stopColor="var(--color-green)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                tick={{ fill: "var(--color-ink-faint)", fontSize: 10 }}
                tickFormatter={(d: string) => d.slice(5)}
                tickLine={false}
                axisLine={false}
                minTickGap={24}
              />
              <YAxis
                tick={{ fill: "var(--color-ink-faint)", fontSize: 10 }}
                width={44}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--color-surface-2)",
                  border: "1px solid var(--color-line)",
                  borderRadius: 12,
                  color: "var(--color-ink)",
                  fontSize: 12,
                }}
              />
              <Area type="monotone" dataKey="value" stroke="none" fill="url(#rpArea)" tooltipType="none" />
              <Line
                type="monotone"
                dataKey="value"
                name={metricLabel}
                stroke="var(--color-green)"
                strokeWidth={2.6}
                dot={{ r: 3, fill: "var(--color-surface)", stroke: "var(--color-green)", strokeWidth: 2.4 }}
                activeDot={{ r: 5, fill: "var(--color-amber)", stroke: "var(--color-amber)" }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* volume by muscle */}
      {muscleSplit.length > 0 && (
        <div className="mt-1">
          <Eyebrow className="mb-3.5 ml-0.5">VOLUME BY MUSCLE</Eyebrow>
          <div className="flex flex-col gap-3">
            {muscleSplit.map((m) => (
              <div key={m.mg} className="flex items-center gap-3">
                <span className="w-[72px] text-[13.5px] font-semibold">{m.label}</span>
                <div className="h-[9px] flex-1 overflow-hidden rounded-full bg-line">
                  <div
                    className={`h-full rounded-full ${m.top ? "bg-amber" : "bg-green"}`}
                    style={{ width: `${m.barW}%` }}
                  />
                </div>
                <span className="w-[34px] text-right font-mono text-xs text-ink-soft">{m.pct}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* personal records */}
      <div className="mt-3">
        <Eyebrow className="mb-3 ml-0.5">PERSONAL RECORDS</Eyebrow>
        <div className="grid grid-cols-3 gap-2.5">
          {prs.map((p) => (
            <div
              key={p.label}
              className="rounded-[22px] border border-line-2 bg-surface p-3.5 text-center shadow-[var(--rp-shadow-sm)]"
            >
              <div className="rp-eyebrow" style={{ fontSize: 9 }}>{p.label.toUpperCase()}</div>
              <div className="mt-2 flex items-baseline justify-center gap-0.5">
                <span className="text-[21px] font-extrabold tracking-[-0.03em]">{p.value ?? "—"}</span>
                {p.value !== null && <span className="font-mono text-[10px] text-ink-faint">{unit}</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
