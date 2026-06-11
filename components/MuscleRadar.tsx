"use client";

import { useMemo } from "react";
import {
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { useStore } from "@/lib/store";
import { ALL_MUSCLE_GROUPS } from "@/lib/types";
import { MUSCLE_LABELS } from "@/lib/muscles";
import { localDay, volumeByMuscleForRange } from "@/lib/stats";
import { useTodayKey } from "@/lib/useTodayKey";

function monthLabel(d: Date): string {
  return d.toLocaleString(undefined, { month: "short", year: "numeric" });
}

export function MuscleRadar() {
  const workouts = useStore((s) => s.workouts);
  const muscleOf = useStore((s) => s.muscleOf);
  const unit = useStore((s) => s.profile?.unit ?? "kg");
  const todayKey = useTodayKey();

  const { data, thisLabel, prevLabel } = useMemo(() => {
    const now = new Date(`${todayKey}T00:00:00`);
    const thisStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const thisFrom = localDay(thisStart);
    const prevFrom = localDay(prevStart);
    const prevTo = localDay(new Date(now.getFullYear(), now.getMonth(), 0));

    const cur = volumeByMuscleForRange(workouts, muscleOf, unit, thisFrom);
    const prev = volumeByMuscleForRange(workouts, muscleOf, unit, prevFrom, prevTo);

    const data = ALL_MUSCLE_GROUPS.map((g) => ({
      muscle: MUSCLE_LABELS[g],
      current: Math.round(cur[g]),
      previous: Math.round(prev[g]),
    }));
    return { data, thisLabel: monthLabel(thisStart), prevLabel: monthLabel(prevStart) };
  }, [workouts, muscleOf, unit, todayKey]);

  const hasData = data.some((d) => d.current > 0 || d.previous > 0);

  if (!hasData) {
    return (
      <p className="py-8 text-center text-sm text-ink-faint">
        Log workouts to see your muscle distribution.
      </p>
    );
  }

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} outerRadius="70%">
          <PolarGrid stroke="var(--color-line)" />
          <PolarAngleAxis
            dataKey="muscle"
            tick={{ fill: "var(--color-ink-soft)", fontSize: 12 }}
          />
          <Radar
            name={prevLabel}
            dataKey="previous"
            stroke="var(--color-iron)"
            fill="var(--color-iron)"
            fillOpacity={0.25}
          />
          <Radar
            name={thisLabel}
            dataKey="current"
            stroke="var(--color-ember)"
            fill="var(--color-ember)"
            fillOpacity={0.45}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: "var(--color-ink-soft)" }} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
