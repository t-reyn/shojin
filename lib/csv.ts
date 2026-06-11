import Papa from "papaparse";
import type { Exercise, WorkoutWithSets } from "./types";
import { blendedOneRepMax, round1 } from "./oneRepMax";

// Prefix cells starting with =, +, -, @, tab, or CR with a quote so spreadsheet
// apps don't treat them as formulas. Cheap CSV-injection defence.
function escapeFormula(value: string): string {
  if (!value) return value;
  const c = value.charCodeAt(0);
  if ([0x3d, 0x2b, 0x2d, 0x40, 0x09, 0x0d].includes(c)) return "'" + value;
  return value;
}

const COLUMNS = [
  "Date",
  "Workout",
  "Exercise",
  "Muscle Group",
  "Set",
  "Warmup",
  "Weight",
  "Unit",
  "Reps",
  "RPE",
  "Est 1RM",
  "Notes",
] as const;

/** Flatten every set into one CSV row. Newest workouts first. */
export function exportWorkoutsToCsv(
  workouts: WorkoutWithSets[],
  exercises: Exercise[],
): string {
  const exById = new Map(exercises.map((e) => [e.id, e]));
  const rows: Record<string, string>[] = [];

  for (const w of workouts) {
    const date = w.performed_at.slice(0, 10);
    const sets = [...w.sets].sort((a, b) => a.set_index - b.set_index);
    // set_index is a single running counter across the whole workout (see
    // lib/store.ts), so the "Set" column re-numbers from 1 within each
    // contiguous run of the same exercise (e.g. each side of a superset).
    let runStart = 0;
    sets.forEach((s, i) => {
      if (i === 0 || sets[i - 1].exercise_id !== s.exercise_id) runStart = i;
      const ex = exById.get(s.exercise_id);
      rows.push({
        Date: date,
        Workout: escapeFormula(w.name),
        Exercise: escapeFormula(ex?.name ?? "Unknown"),
        "Muscle Group": ex?.muscle_group ?? "",
        Set: String(i - runStart + 1),
        Warmup: s.is_warmup ? "yes" : "",
        Weight: String(s.weight),
        Unit: s.unit ?? "kg",
        Reps: String(s.reps),
        RPE: s.rpe != null ? String(s.rpe) : "",
        "Est 1RM": s.is_warmup ? "" : String(round1(blendedOneRepMax(s.weight, s.reps))),
        Notes: escapeFormula(s.notes ?? ""),
      });
    });
  }

  return Papa.unparse(rows, { columns: COLUMNS as unknown as string[] });
}

/** Trigger a browser download of CSV text with a UTF-8 BOM (Excel-friendly). */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
