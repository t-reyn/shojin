"use client";

import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useStore } from "@/lib/store";
import { upsertBodyweight, deleteBodyweight } from "@/lib/db";
import { toast } from "@/lib/toast";
import { convertWeight } from "@/lib/units";
import { round1 } from "@/lib/oneRepMax";

export function BodyweightChart() {
  const entries = useStore((s) => s.bodyweight);
  const refresh = useStore((s) => s.refreshBodyweight);
  const unit = useStore((s) => s.profile?.unit ?? "kg");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function remove(id: string) {
    setDeleting(id);
    try {
      await deleteBodyweight(id);
      await refresh();
    } catch {
      toast.error("Couldn't delete entry. Try again.");
    } finally {
      setDeleting(null);
    }
  }

  // Each entry carries the unit it was logged in; convert to the profile's
  // current unit so a unit change doesn't relabel old values in place.
  const data = entries.map((e) => ({
    date: e.logged_on,
    weight: round1(convertWeight(e.weight, e.unit, unit)),
  }));
  const latest = data[data.length - 1]?.weight;

  async function add() {
    const w = parseFloat(value);
    if (!w || w <= 0) return;
    setBusy(true);
    try {
      await upsertBodyweight(w, unit);
      await refresh();
      setValue("");
    } catch {
      toast.error("Couldn't log weight. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <span className="text-sm text-ink-soft">
          {latest != null ? (
            <>
              Latest: <span className="text-ink">{latest} {unit}</span>
            </>
          ) : (
            "No entries yet"
          )}
        </span>
        <form
          className="ml-auto flex gap-2"
          onSubmit={(e) => { e.preventDefault(); add(); }}
        >
          <input
            type="number"
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={`Today (${unit})`}
            aria-label={`Today's bodyweight in ${unit}`}
            className="w-28 rounded-md border border-line bg-night px-2 py-1 text-right outline-none focus:border-ember"
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-ember px-3 py-1 text-sm font-medium text-on-accent disabled:opacity-60"
          >
            Log
          </button>
        </form>
      </div>

      {data.length > 0 ? (
        <div className="h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
              <CartesianGrid stroke="var(--color-line)" strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tick={{ fill: "var(--color-ink-faint)", fontSize: 11 }}
                tickFormatter={(d: string) => d.slice(5)}
              />
              <YAxis
                domain={["dataMin - 1", "dataMax + 1"]}
                tick={{ fill: "var(--color-ink-faint)", fontSize: 11 }}
                width={40}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--color-surface-2)",
                  border: "1px solid var(--color-line)",
                  borderRadius: 8,
                  color: "var(--color-ink)",
                }}
              />
              <Line
                type="monotone"
                dataKey="weight"
                stroke="var(--color-steel)"
                strokeWidth={2}
                dot={{ r: 3, fill: "var(--color-steel)" }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="py-6 text-center text-sm text-ink-faint">
          Log your weight to see the trend.
        </p>
      )}

      {entries.length > 0 && (
        <ul className="mt-3 max-h-40 overflow-y-auto">
          {[...entries].reverse().map((e) => (
            <li key={e.id} className="flex items-center justify-between border-t border-line py-1.5 text-sm">
              <span className="text-ink-faint">{e.logged_on}</span>
              <span className="text-ink">{round1(convertWeight(e.weight, e.unit, unit))} {unit}</span>
              <button
                onClick={() => remove(e.id)}
                disabled={deleting === e.id}
                aria-label={`Delete entry for ${e.logged_on}`}
                className="ml-4 text-ink-faint hover:text-ember-soft disabled:opacity-40"
                title="Delete entry"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
